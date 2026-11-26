const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { moveToRecycleBin } = require('../utils/recycleBin');
const { requireCompanyAccess, companyInOrg, orgParamGuard } = require('../utils/tenancy');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { UPLOADS_ROOT } = require('../config/paths');
const { aiStatus, AiError } = require('../utils/ai');
const { readTender, DOC_TYPES } = require('../utils/tenderAi');
const { docxToText } = require('../utils/docxText');

// Tenders & RFQs.
//   /api/bids/profile     the company's Bid Profile (facts every bid asks for)
//   /api/bids/documents   the company's document vault (certificates etc.)
//   /api/bids             bids: upload a tender → AI reads it → workspace
// Admins manage the profile and the vault; everyone can read them and
// prepare bids (staff see the bids they created, admins see all).
// Uploaded files are never deleted automatically.

const router = express.Router();
router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', orgParamGuard('SELECT 1 FROM bids t JOIN companies c ON t.company_id = c.id WHERE t.id = ? AND c.organization_id = ? LIMIT 1'));
router.param('docId', orgParamGuard('SELECT 1 FROM bid_documents t JOIN companies c ON t.company_id = c.id WHERE t.id = ? AND c.organization_id = ? LIMIT 1'));

class BidError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const sendError = (res, error, fallback) => {
  if (error instanceof BidError || error instanceof AiError) return res.status(error.status).json({ error: error.message });
  if (error && error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'The file is too large.' });
  if (error && error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That bid number is already used.' });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const parse = (s) => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ymd = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v).slice(0, 10)) && !Number.isNaN(Date.parse(String(v).slice(0, 10))) ? String(v).slice(0, 10) : null);

async function assertCompany(req, companyId) {
  if (!companyId || !(await companyInOrg(companyId, req.user.organization_id))) throw new BidError('That company is not in your organization.', 403);
}

function uploader(folder, prefix, maxMb, allow) {
  const dir = path.join(UPLOADS_ROOT, folder);
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
      filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname || '') || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
        cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => (allow(file) ? cb(null, true) : cb(new BidError('This type of file is not supported here.'))),
  }).single('file');
}
const isPdfOrImage = (f) => f.mimetype === 'application/pdf' || /^image\/(jpeg|png|webp)$/.test(f.mimetype);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isTenderFile = (f) => f.mimetype === 'application/pdf' || f.mimetype === DOCX || /\.docx$/i.test(f.originalname || '');
const vaultUpload = uploader('bid-docs', 'bid-doc', 15, isPdfOrImage);
const tenderUpload = uploader('tenders', 'tender', 25, isTenderFile);

const run = (mw, req, res) => new Promise((resolve, reject) => mw(req, res, (e) => (e ? reject(e) : resolve())));

/* ------------------------------- Bid Profile ------------------------------ */

// GET /api/bids/profile?company_id=X — with sensible defaults from the company.
router.get('/profile', async (req, res) => {
  try {
    await assertCompany(req, req.query.company_id);
    const [[co]] = await db.execute('SELECT name, address, tpin, bank_details FROM companies WHERE id = ?', [req.query.company_id]);
    const [[row]] = await db.execute('SELECT data, updated_at FROM bid_profiles WHERE company_id = ?', [req.query.company_id]);
    const saved = row ? parse(row.data) : null;
    res.json({
      saved: !!saved,
      updated_at: row ? row.updated_at : null,
      profile: saved || {
        legal_name: co.name, physical_address: co.address || '', tpin: co.tpin || '', nationality: 'Malawian',
        bank_details: co.bank_details || '', validity_days: 120, payment_terms: 'Within 30 days of receipt of invoice',
        warranty: '', delivery: '', directors: [], beneficial_owners: [], experience: [],
      },
    });
  } catch (error) {
    sendError(res, error, 'Could not load the bid profile');
  }
});

// PUT /api/bids/profile — { company_id, profile } (admins)
router.put('/profile', isAdmin, async (req, res) => {
  try {
    await assertCompany(req, req.body.company_id);
    const json = JSON.stringify(req.body.profile || {});
    if (json.length > 500_000) throw new BidError('The profile is too large.');
    await db.execute(
      `INSERT INTO bid_profiles (company_id, data, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_by = VALUES(updated_by)`,
      [req.body.company_id, json, req.user.id]
    );
    res.json({ saved: true, profile: req.body.profile || {} });
  } catch (error) {
    sendError(res, error, 'Could not save the bid profile');
  }
});

/* ----------------------------- Document vault ----------------------------- */

const DOC_SELECT = `SELECT d.*, DATE_FORMAT(d.issued_on, '%Y-%m-%d') AS issued, DATE_FORMAT(d.expires_on, '%Y-%m-%d') AS expires,
                           DATEDIFF(d.expires_on, CURRENT_DATE) AS days_left, u.name AS uploaded_by_name
                      FROM bid_documents d LEFT JOIN users u ON u.id = d.uploaded_by`;

// GET /api/bids/documents?company_id=X
router.get('/documents', async (req, res) => {
  try {
    await assertCompany(req, req.query.company_id);
    const [rows] = await db.execute(`${DOC_SELECT} WHERE d.company_id = ? ORDER BY d.doc_type, d.expires_on DESC, d.id DESC`, [req.query.company_id]);
    res.json(rows);
  } catch (error) {
    sendError(res, error, 'Could not load the documents');
  }
});

// POST /api/bids/documents — multipart: file + company_id, doc_type, title, issued_on, expires_on, notes (admins)
router.post('/documents', isAdmin, async (req, res) => {
  try {
    await run(vaultUpload, req, res);
    if (!req.file) throw new BidError('Choose a file (PDF or photo).');
    const b = req.body || {};
    await assertCompany(req, b.company_id);
    const type = DOC_TYPES.includes(b.doc_type) ? b.doc_type : 'other';
    const [r] = await db.execute(
      `INSERT INTO bid_documents (company_id, doc_type, title, file_url, file_name, mime, issued_on, expires_on, notes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.company_id, type, String(b.title || req.file.originalname || 'Document').slice(0, 255),
        `/uploads/bid-docs/${req.file.filename}`, String(req.file.originalname || '').slice(0, 255), req.file.mimetype,
        ymd(b.issued_on), ymd(b.expires_on), b.notes ? String(b.notes).slice(0, 2000) : null, req.user.id]
    );
    const [[doc]] = await db.execute(`${DOC_SELECT} WHERE d.id = ?`, [r.insertId]);
    res.status(201).json(doc);
  } catch (error) {
    sendError(res, error, 'Could not upload the document');
  }
});

// PUT /api/bids/documents/:docId — { title, doc_type, issued_on, expires_on, notes } (admins)
router.put('/documents/:docId', isAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    await db.execute(
      'UPDATE bid_documents SET title = ?, doc_type = ?, issued_on = ?, expires_on = ?, notes = ? WHERE id = ?',
      [String(b.title || 'Document').slice(0, 255), DOC_TYPES.includes(b.doc_type) ? b.doc_type : 'other',
        ymd(b.issued_on), ymd(b.expires_on), b.notes ? String(b.notes).slice(0, 2000) : null, req.params.docId]
    );
    const [[doc]] = await db.execute(`${DOC_SELECT} WHERE d.id = ?`, [req.params.docId]);
    res.json(doc);
  } catch (error) {
    sendError(res, error, 'Could not save the document');
  }
});

// DELETE /api/bids/documents/:docId — to Recently Deleted (the file is kept).
router.delete('/documents/:docId', isAdmin, async (req, res) => {
  try {
    const r = await moveToRecycleBin('bid_document', req.params.docId, req);
    if (!r.affectedRows) return res.status(404).json({ error: 'Document not found' });
    res.json({ message: 'Document removed.' });
  } catch (error) {
    sendError(res, error, 'Could not remove the document');
  }
});

/* ---------------------------------- Bids ---------------------------------- */

const BID_SELECT = `
  SELECT b.*, DATE_FORMAT(b.deadline_at, '%Y-%m-%d %H:%i') AS deadline, u.name AS created_by_name, a.name AS approved_by_name,
         TIMESTAMPDIFF(MINUTE, NOW(), b.deadline_at) AS minutes_left
    FROM bids b LEFT JOIN users u ON u.id = b.created_by LEFT JOIN users a ON a.id = b.approved_by`;

const shape = (row) => (row ? { ...row, data: parse(row.data) } : null);
async function loadBid(id) {
  // A read that never finished (e.g. the server restarted) is marked failed after 10 minutes.
  await db.execute(
    "UPDATE bids SET ai_status = 'failed', ai_error = 'Reading did not finish. Please try again.' WHERE id = ? AND ai_status = 'reading' AND updated_at < NOW() - INTERVAL 10 MINUTE",
    [id]
  );
  const [[row]] = await db.execute(`${BID_SELECT} WHERE b.id = ?`, [id]);
  return shape(row);
}
async function accessibleBid(req, id) {
  const bid = await loadBid(id);
  if (!bid) throw new BidError('Bid not found', 404);
  if (req.user.role !== 'admin' && bid.created_by !== req.user.id) throw new BidError('You do not have access to this bid', 403);
  return bid;
}

async function nextBidNumber(companyId) {
  const [[co]] = await db.execute('SELECT name FROM companies WHERE id = ?', [companyId]);
  const prefix = `${getCompanyPrefix(co ? co.name : '')}-BID`;
  const [[r]] = await db.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(bid_number, '-', -1) AS UNSIGNED)) AS n FROM bids WHERE company_id = ? AND bid_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  return `${prefix}-${String((Number(r.n) || 0) + 1).padStart(4, '0')}`;
}

/** "2026-08-25 14:00" / "2026-08-25" → MySQL DATETIME, or null. */
const toDeadline = (s) => {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m || Number.isNaN(Date.parse(m[1]))) return null;
  return `${m[1]} ${m[2] || '23'}:${m[3] || '59'}:00`;
};

const DEFAULT_FORMS = {
  tender: ['cover_letter', 'bid_submission_sheet', 'price_schedule', 'bid_securing_declaration', 'beneficial_ownership', 'anti_corruption', 'eshs_declaration', 'eligible_countries', 'technical_compliance'],
  rfq: ['cover_letter', 'quotation'],
};

/** Turn what the AI read into the bid's working data (keeping anything the user already entered). */
function applyTender(data, t) {
  const kind = t.kind === 'rfq' ? 'rfq' : 'tender';
  const keptPrices = data._prices || {}; // prices typed before "read again"
  const items = (t.items || []).map((it, i) => ({
    item_no: String(it.item_no || i + 1), description: String(it.description || ''), quantity: Number(it.quantity) || 1,
    unit: String(it.unit || 'Each'), lot: String(it.lot || ''), unit_price: keptPrices[String(it.description || '')] ?? null, origin: '',
  }));
  const specs = (t.specs || []).map((s, i) => ({
    item_no: String(s.item_no || i + 1), section: String(s.section || ''), requirement: String(s.requirement || ''),
    mandatory: s.mandatory !== false, offered: String(s.requirement || ''), compliance: 'Comply',
  }));
  const checklist = (t.mandatory_documents || []).map((d) => ({
    label: String(d.label || ''), doc_type: d.doc_type || 'other', mandatory: d.mandatory !== false, done: false, document_id: null,
  }));
  const forms = (t.forms_required || []).length ? t.forms_required : DEFAULT_FORMS[kind];
  const { _prices, ...rest } = data;
  return {
    ...rest,
    kind,
    tender: {
      title: t.title || '', procuring_entity: t.procuring_entity || '', addressee: t.addressee || '',
      reference_number: t.reference_number || '', procurement_method: t.procurement_method || '', lots: t.lots || [],
      deadline: t.deadline || '', submission_place: t.submission_place || '', opening: t.opening || '',
      validity_days: Number(t.validity_days) || 0, currency: t.currency || 'Malawi Kwacha', copies_required: t.copies_required || '',
      bid_security: t.bid_security || '', performance_security: t.performance_security || '',
      performance_security_percent: Number(t.performance_security_percent) || 0, delivery_period: t.delivery_period || '',
      delivery_place: t.delivery_place || '', payment_terms: t.payment_terms || '', warranty_required: t.warranty_required || '',
      price_basis: t.price_basis || '', clarification_contact: t.clarification_contact || '',
      summary: t.summary || '', warnings: t.warnings || [],
    },
    items: (data.items && data.items.length) ? data.items : items,
    specs: (data.specs && data.specs.length) ? data.specs : specs,
    checklist: (data.checklist && data.checklist.length) ? data.checklist : checklist,
    forms: (data.forms && data.forms.length) ? data.forms : forms,
  };
}

/** Read the uploaded tender with AI in the background and store the result. */
async function readInBackground(req, bidId) {
  try {
    const bid = await loadBid(bidId);
    const file = path.join(UPLOADS_ROOT, 'tenders', path.basename(bid.source_file_url || ''));
    const buf = fs.readFileSync(file);
    const isPdf = /\.pdf$/i.test(file);
    const [[co]] = await db.execute('SELECT name FROM companies WHERE id = ?', [bid.company_id]);
    const t = await readTender(req, isPdf ? { pdf: buf } : { text: docxToText(buf) }, { companyId: bid.company_id, companyName: co.name, today: today() });
    const data = applyTender(bid.data, t || {});
    await db.execute(
      `UPDATE bids SET data = ?, kind = ?, title = ?, procuring_entity = ?, reference_number = ?, deadline_at = ?,
              ai_status = 'done', ai_error = NULL WHERE id = ?`,
      [JSON.stringify(data), data.kind, (data.tender.title || bid.title || '').slice(0, 500), (data.tender.procuring_entity || '').slice(0, 255),
        (data.tender.reference_number || '').slice(0, 150), toDeadline(data.tender.deadline), bidId]
    );
  } catch (e) {
    console.error('Tender reading failed:', e.message);
    await db.execute("UPDATE bids SET ai_status = 'failed', ai_error = ? WHERE id = ?",
      [String(e instanceof AiError || e instanceof BidError ? e.message : 'Could not read the document.').slice(0, 255), bidId]).catch(() => {});
  }
}

// GET /api/bids?company_id=X
router.get('/', async (req, res) => {
  try {
    await assertCompany(req, req.query.company_id);
    const where = ['b.company_id = ?'];
    const args = [req.query.company_id];
    if (req.user.role !== 'admin') { where.push('b.created_by = ?'); args.push(req.user.id); }
    const [rows] = await db.execute(`${BID_SELECT} WHERE ${where.join(' AND ')} ORDER BY (b.deadline_at IS NULL), b.deadline_at DESC, b.id DESC`, args);
    res.json(rows.map((r) => {
      const d = parse(r.data);
      const sub = (d.items || []).reduce((s, it) => s + Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100, 0);
      const o = d.options || {};
      // Same rule as the forms: VAT and the levy are added only when shown separately.
      const total = o.tax_mode === 'separate'
        ? sub + Math.round(sub * (Number(o.vat_rate ?? 0.165) || 0) * 100) / 100 + Math.round(sub * (Number(o.levy_rate ?? 0.01) || 0) * 100) / 100
        : sub;
      return { ...r, data: undefined, total, item_count: (d.items || []).length };
    }));
  } catch (error) {
    sendError(res, error, 'Could not load bids');
  }
});

// GET /api/bids/:id
router.get('/:id', async (req, res) => {
  try {
    res.json(await accessibleBid(req, req.params.id));
  } catch (error) {
    sendError(res, error, 'Could not load the bid');
  }
});

// POST /api/bids/upload — multipart: file (Word .docx or PDF) + company_id → new bid, read by AI.
router.post('/upload', async (req, res) => {
  try {
    await run(tenderUpload, req, res);
    if (!req.file) throw new BidError('Choose the tender document (Word .docx or PDF).');
    const companyId = req.body && req.body.company_id;
    await assertCompany(req, companyId);
    const ai = await aiStatus(req.user);
    const name = String(req.file.originalname || 'Tender').slice(0, 255);
    const [r] = await db.execute(
      `INSERT INTO bids (company_id, created_by, bid_number, kind, status, title, data, source_file_url, source_file_name, ai_status)
       VALUES (?, ?, ?, 'tender', 'draft', ?, ?, ?, ?, ?)`,
      [companyId, req.user.id, await nextBidNumber(companyId), name.replace(/\.(docx|pdf)$/i, '').slice(0, 500),
        JSON.stringify({ forms: [], items: [], specs: [], checklist: [] }),
        `/uploads/tenders/${req.file.filename}`, name, ai.available ? 'reading' : 'unavailable']
    );
    if (ai.available) readInBackground(req, r.insertId); // not awaited: the page polls
    res.status(201).json(await loadBid(r.insertId));
  } catch (error) {
    sendError(res, error, 'Could not upload the tender');
  }
});

// POST /api/bids — { company_id, kind, title } (typed in, no document)
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    await assertCompany(req, b.company_id);
    const kind = b.kind === 'rfq' ? 'rfq' : 'tender';
    const data = { kind, tender: { title: b.title || '', procuring_entity: b.procuring_entity || '', validity_days: 0, currency: 'Malawi Kwacha', warnings: [] }, items: [], specs: [], checklist: [], forms: DEFAULT_FORMS[kind] };
    const [r] = await db.execute(
      `INSERT INTO bids (company_id, created_by, bid_number, kind, status, title, procuring_entity, data) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [b.company_id, req.user.id, await nextBidNumber(b.company_id), kind, String(b.title || 'New bid').slice(0, 500), String(b.procuring_entity || '').slice(0, 255), JSON.stringify(data)]
    );
    res.status(201).json(await loadBid(r.insertId));
  } catch (error) {
    sendError(res, error, 'Could not create the bid');
  }
});

// POST /api/bids/:id/read — read the uploaded document again with AI.
router.post('/:id/read', async (req, res) => {
  try {
    const bid = await accessibleBid(req, req.params.id);
    if (!bid.source_file_url) throw new BidError('This bid has no uploaded document.');
    const ai = await aiStatus(req.user);
    if (!ai.available) throw new BidError('AI is not available right now.', 503);
    if (bid.ai_status === 'reading') throw new BidError('The document is already being read.');
    // Start fresh from the document (the user's prices are kept by item description).
    const prices = new Map((bid.data.items || []).map((it) => [it.description, it.unit_price]));
    await db.execute("UPDATE bids SET ai_status = 'reading', ai_error = NULL, data = ? WHERE id = ?",
      [JSON.stringify({ ...bid.data, items: [], specs: [], checklist: [], forms: [], _prices: Object.fromEntries(prices) }), bid.id]);
    readInBackground(req, bid.id);
    res.json(await loadBid(bid.id));
  } catch (error) {
    sendError(res, error, 'Could not start reading');
  }
});

// PUT /api/bids/:id — { data, title?, kind? } (the workspace saves here)
router.put('/:id', async (req, res) => {
  try {
    const bid = await accessibleBid(req, req.params.id);
    if (bid.ai_status === 'reading') throw new BidError('Please wait until the document has been read.');
    const data = req.body && req.body.data ? req.body.data : bid.data;
    const json = JSON.stringify(data);
    if (json.length > 3_000_000) throw new BidError('This bid is too large to save.');
    const t = data.tender || {};
    await db.execute(
      `UPDATE bids SET data = ?, kind = ?, title = ?, procuring_entity = ?, reference_number = ?, deadline_at = ? WHERE id = ?`,
      [json, data.kind === 'rfq' ? 'rfq' : 'tender', String(t.title || bid.title || '').slice(0, 500),
        String(t.procuring_entity || '').slice(0, 255), String(t.reference_number || '').slice(0, 150), toDeadline(t.deadline), bid.id]
    );
    res.json(await loadBid(bid.id));
  } catch (error) {
    sendError(res, error, 'Could not save the bid');
  }
});

// POST /api/bids/:id/status — { status } draft | review | approved | submitted | won | lost | cancelled
const STATUSES = ['draft', 'review', 'approved', 'submitted', 'won', 'lost', 'cancelled'];
router.post('/:id/status', async (req, res) => {
  try {
    const bid = await accessibleBid(req, req.params.id);
    const status = String((req.body && req.body.status) || '');
    if (!STATUSES.includes(status)) throw new BidError('Unknown status.');
    if (status === 'approved' && req.user.role !== 'admin') throw new BidError('Only an admin can approve a bid.', 403);
    await db.execute(
      `UPDATE bids SET status = ?,
              approved_by = IF(? = 'approved', ?, IF(? IN ('draft', 'review'), NULL, approved_by)),
              approved_at = IF(? = 'approved', NOW(), IF(? IN ('draft', 'review'), NULL, approved_at)),
              submitted_at = IF(? = 'submitted', NOW(), IF(? IN ('draft', 'review', 'approved'), NULL, submitted_at))
        WHERE id = ?`,
      [status, status, req.user.id, status, status, status, status, status, bid.id]
    );
    res.json(await loadBid(bid.id));
  } catch (error) {
    sendError(res, error, 'Could not change the status');
  }
});

// POST /api/bids/:id/duplicate — start a similar bid from this one.
router.post('/:id/duplicate', async (req, res) => {
  try {
    const bid = await accessibleBid(req, req.params.id);
    const data = { ...bid.data, tender: { ...(bid.data.tender || {}), deadline: '', reference_number: '' } };
    const [r] = await db.execute(
      `INSERT INTO bids (company_id, created_by, bid_number, kind, status, title, procuring_entity, data)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [bid.company_id, req.user.id, await nextBidNumber(bid.company_id), bid.kind, `${bid.title || 'Bid'} (copy)`.slice(0, 500), bid.procuring_entity, JSON.stringify(data)]
    );
    res.status(201).json(await loadBid(r.insertId));
  } catch (error) {
    sendError(res, error, 'Could not copy the bid');
  }
});

// DELETE /api/bids/:id — admins; to Recently Deleted.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const r = await moveToRecycleBin('bid', req.params.id, req);
    if (!r.affectedRows) return res.status(404).json({ error: 'Bid not found' });
    res.json({ message: 'Bid deleted.' });
  } catch (error) {
    sendError(res, error, 'Could not delete the bid');
  }
});

module.exports = router;
module.exports.applyTender = applyTender;
