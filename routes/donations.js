const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { UPLOADS_ROOT, resolveUploadDiskPath } = require('../config/paths');

// Donations the company GIVES to others (cash, goods, services, sponsorship).
// Flow: planned → approved → given (or cancelled). Anyone can record a planned
// donation; only admins approve, mark as given, cancel or delete. Staff see
// and edit only their own, and only while still planned.

const router = express.Router();
router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('donations'));

const STATUSES = ['planned', 'approved', 'given', 'cancelled'];
const CATEGORIES = ['cash', 'goods', 'services', 'sponsorship'];
const RECIPIENT_TYPES = ['individual', 'school', 'religious', 'health', 'community', 'ngo', 'government', 'sports', 'other'];

const orNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateOnly = (v) => {
  const s = orNull(v);
  if (s == null) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isAdminUser = (req) => req.user.role === 'admin';

// Proof (receipt, signed acknowledgement, photo of the handover).
const PROOF_DIR = path.join(UPLOADS_ROOT, 'donations');
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
      cb(null, PROOF_DIR);
    },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '.bin').toLowerCase();
      cb(null, `donation-${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only image or PDF files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
const acceptProof = (req, res, next) => proofUpload.single('file')(req, res, (err) => {
  if (!err) return next();
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB).' : (err.message || 'Upload failed') });
});
const discard = (req) => { if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } } };

// Normalise items and the amount: goods/services with items take their value
// from the items; otherwise the typed amount is used.
function normalise(body) {
  const items = Array.isArray(body.items)
    ? body.items
        .filter((it) => it && String(it.description || '').trim())
        .map((it, i) => ({
          description: String(it.description).trim(),
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          unit_value: Number(it.unit_value) >= 0 ? Number(it.unit_value) : 0,
          sort_order: i,
        }))
    : [];
  const itemsTotal = items.reduce((s, it) => s + it.quantity * it.unit_value, 0);
  const amount = items.length && itemsTotal > 0 ? itemsTotal : Number(body.amount) || 0;
  return { items, amount: Math.round(amount * 100) / 100 };
}

async function saveItems(conn, donationId, items) {
  await conn.execute('DELETE FROM donation_items WHERE donation_id = ?', [donationId]);
  for (const it of items) {
    await conn.execute(
      'INSERT INTO donation_items (donation_id, description, quantity, unit_value, sort_order) VALUES (?, ?, ?, ?, ?)',
      [donationId, it.description, it.quantity, it.unit_value, it.sort_order]
    );
  }
}

async function nextNumber(conn, companyId) {
  const [co] = await conn.execute('SELECT name FROM companies WHERE id = ?', [companyId]);
  const prefix = `${getCompanyPrefix(co.length ? co[0].name : '')}-DON`;
  const [mx] = await conn.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(donation_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM donations WHERE company_id = ? AND donation_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  return `${prefix}-${String((mx[0].max_num || 0) + 1).padStart(4, '0')}`;
}

const DETAIL_SQL = `
  SELECT d.*, u.name AS created_by_name, ap.name AS approved_by_name,
         c.name AS company_name, c.address AS company_address, c.tpin AS company_tpin,
         c.logo_url AS company_logo, c.quote_logo_url AS company_quote_logo,
         c.primary_color, c.secondary_color, c.currency AS company_currency
    FROM donations d
    JOIN companies c ON c.id = d.company_id
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users ap ON ap.id = d.approved_by
   WHERE d.id = ?`;

async function loadFull(id) {
  const [rows] = await db.execute(DETAIL_SQL, [id]);
  if (!rows.length) return null;
  const [items] = await db.execute('SELECT * FROM donation_items WHERE donation_id = ? ORDER BY sort_order, id', [id]);
  return { ...rows[0], items };
}

// GET /api/donations?company_id=&status=&category=&from=&to=&q=
router.get('/', async (req, res) => {
  try {
    const { company_id, status, category, from, to, q } = req.query;
    const where = ['d.company_id IN (SELECT id FROM companies WHERE organization_id = ?)'];
    const params = [req.user.organization_id];
    if (company_id) { where.push('d.company_id = ?'); params.push(company_id); }
    if (status && STATUSES.includes(status)) { where.push('d.status = ?'); params.push(status); }
    if (category && CATEGORIES.includes(category)) { where.push('d.category = ?'); params.push(category); }
    if (from) { where.push('d.date >= ?'); params.push(dateOnly(from)); }
    if (to) { where.push('d.date <= ?'); params.push(dateOnly(to)); }
    if (q) {
      where.push('(d.donation_number LIKE ? OR d.recipient_name LIKE ? OR d.purpose LIKE ? OR d.description LIKE ?)');
      const like = `%${String(q).slice(0, 100)}%`;
      params.push(like, like, like, like);
    }
    if (!isAdminUser(req)) { where.push('d.created_by = ?'); params.push(req.user.id); }
    const [rows] = await db.execute(
      `SELECT d.id, d.company_id, d.created_by, d.donation_number, d.date, d.recipient_name, d.recipient_type,
              d.category, d.purpose, d.amount, d.status, d.approved_by, d.approved_at, d.proof_url, d.created_at,
              u.name AS created_by_name, ap.name AS approved_by_name,
              (SELECT COUNT(*) FROM donation_items i WHERE i.donation_id = d.id) AS item_count
         FROM donations d
         LEFT JOIN users u ON u.id = d.created_by
         LEFT JOIN users ap ON ap.id = d.approved_by
        WHERE ${where.join(' AND ')}
        ORDER BY d.date DESC, d.id DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('Error fetching donations:', e);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

// GET /api/donations/summary?company_id=&year=
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const own = isAdminUser(req) ? '' : ' AND created_by = ?';
    const args = (extra = []) => [companyId, ...extra, ...(isAdminUser(req) ? [] : [req.user.id])];
    const [[tot]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'given' THEN amount END), 0) AS given_total,
              COALESCE(SUM(status = 'given'), 0) AS given_count,
              COALESCE(SUM(CASE WHEN status IN ('planned','approved') THEN amount END), 0) AS pending_total,
              COALESCE(SUM(status = 'planned'), 0) AS awaiting_approval,
              COALESCE(SUM(status = 'approved'), 0) AS approved_not_given,
              COUNT(DISTINCT CASE WHEN status = 'given' THEN recipient_name END) AS recipients
         FROM donations WHERE company_id = ? AND YEAR(date) = ?${own}`,
      args([year])
    );
    const [byCategory] = await db.execute(
      `SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM donations WHERE company_id = ? AND YEAR(date) = ? AND status = 'given'${own}
        GROUP BY category ORDER BY total DESC`,
      args([year])
    );
    const [byMonth] = await db.execute(
      `SELECT MONTH(date) AS month, COALESCE(SUM(amount), 0) AS total
         FROM donations WHERE company_id = ? AND YEAR(date) = ? AND status = 'given'${own}
        GROUP BY MONTH(date) ORDER BY month`,
      args([year])
    );
    res.json({
      year,
      given_total: Number(tot.given_total), given_count: Number(tot.given_count),
      pending_total: Number(tot.pending_total), awaiting_approval: Number(tot.awaiting_approval),
      approved_not_given: Number(tot.approved_not_given), recipients: Number(tot.recipients),
      by_category: byCategory.map((r) => ({ category: r.category, count: Number(r.count), total: Number(r.total) })),
      by_month: byMonth.map((r) => ({ month: Number(r.month), total: Number(r.total) })),
    });
  } catch (e) {
    console.error('Error fetching donation summary:', e);
    res.status(500).json({ error: 'Failed to fetch donation summary' });
  }
});

// GET /api/donations/:id
router.get('/:id', async (req, res) => {
  try {
    const d = await loadFull(req.params.id);
    if (!d) return res.status(404).json({ error: 'Donation not found' });
    if (!isAdminUser(req) && d.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this donation' });
    }
    res.json(d);
  } catch (e) {
    console.error('Error fetching donation:', e);
    res.status(500).json({ error: 'Failed to fetch donation' });
  }
});

function validate(body) {
  if (!String(body.recipient_name || '').trim()) return 'Recipient name is required.';
  if (body.category && !CATEGORIES.includes(body.category)) return 'Invalid donation type.';
  if (body.recipient_type && !RECIPIENT_TYPES.includes(body.recipient_type)) return 'Invalid recipient type.';
  if (body.date && !dateOnly(body.date)) return 'Invalid date.';
  return null;
}

// POST /api/donations
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.company_id) return res.status(400).json({ error: 'company_id is required' });
  const err = validate(b);
  if (err) return res.status(400).json({ error: err });
  const { items, amount } = normalise(b);
  if (!(amount > 0) && !items.length) return res.status(400).json({ error: 'Enter an amount or at least one item.' });

  // Staff can only record a planned donation; admins may record one that is
  // already approved / given (e.g. entering past donations).
  let status = STATUSES.includes(b.status) ? b.status : 'planned';
  if (!isAdminUser(req)) status = 'planned';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const number = orNull(b.donation_number) ? String(b.donation_number).trim() : await nextNumber(conn, b.company_id);
    const approved = status === 'approved' || status === 'given';
    const [r] = await conn.execute(
      `INSERT INTO donations
         (company_id, created_by, donation_number, date, recipient_name, recipient_type, recipient_contact,
          recipient_address, category, purpose, description, amount, payment_method, reference, status,
          approved_by, approved_at, received_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.company_id, req.user.id, number, dateOnly(b.date) || localToday(), String(b.recipient_name).trim(),
        orNull(b.recipient_type), orNull(b.recipient_contact), orNull(b.recipient_address),
        b.category || 'cash', orNull(b.purpose), orNull(b.description), amount,
        orNull(b.payment_method), orNull(b.reference), status,
        approved ? req.user.id : null, approved ? new Date() : null, orNull(b.received_by), orNull(b.notes),
      ]
    );
    await saveItems(conn, r.insertId, items);
    await conn.commit();
    res.status(201).json(await loadFull(r.insertId));
  } catch (e) {
    await conn.rollback();
    console.error('Error creating donation:', e);
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A donation with that number already exists.' });
    res.status(500).json({ error: 'Failed to create donation' });
  } finally {
    conn.release();
  }
});

// PUT /api/donations/:id — edit details (not the status; see PATCH /status).
router.put('/:id', async (req, res) => {
  const b = req.body || {};
  const [rows] = await db.execute('SELECT created_by, status FROM donations WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Donation not found' });
  if (!isAdminUser(req)) {
    if (rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'You can only edit your own donations.' });
    if (rows[0].status !== 'planned') return res.status(403).json({ error: 'This donation has been approved — only an admin can change it.' });
  }
  const err = validate(b);
  if (err) return res.status(400).json({ error: err });
  const { items, amount } = normalise(b);
  if (!(amount > 0) && !items.length) return res.status(400).json({ error: 'Enter an amount or at least one item.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE donations SET
         donation_number = COALESCE(?, donation_number), date = COALESCE(?, date), recipient_name = ?,
         recipient_type = ?, recipient_contact = ?, recipient_address = ?, category = ?, purpose = ?,
         description = ?, amount = ?, payment_method = ?, reference = ?, received_by = ?, notes = ?
       WHERE id = ?`,
      [
        orNull(b.donation_number) ? String(b.donation_number).trim() : null, dateOnly(b.date),
        String(b.recipient_name).trim(), orNull(b.recipient_type), orNull(b.recipient_contact),
        orNull(b.recipient_address), b.category || 'cash', orNull(b.purpose), orNull(b.description), amount,
        orNull(b.payment_method), orNull(b.reference), orNull(b.received_by), orNull(b.notes), req.params.id,
      ]
    );
    await saveItems(conn, req.params.id, items);
    await conn.commit();
    res.json(await loadFull(req.params.id));
  } catch (e) {
    await conn.rollback();
    console.error('Error updating donation:', e);
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A donation with that number already exists.' });
    res.status(500).json({ error: 'Failed to update donation' });
  } finally {
    conn.release();
  }
});

// PATCH /api/donations/:id/status { status, received_by?, date? } — admin only.
router.patch('/:id/status', isAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    const fields = ['status = ?'];
    const values = [status];
    if (status === 'approved' || status === 'given') {
      // Keep the first approver; approving a planned donation records who/when.
      fields.push('approved_by = COALESCE(approved_by, ?)', 'approved_at = COALESCE(approved_at, NOW())');
      values.push(req.user.id);
    }
    if (status === 'planned') fields.push('approved_by = NULL', 'approved_at = NULL');
    if (status === 'given') {
      if (orNull(req.body.received_by)) { fields.push('received_by = ?'); values.push(String(req.body.received_by).trim()); }
      if (dateOnly(req.body.date)) { fields.push('date = ?'); values.push(dateOnly(req.body.date)); }
    }
    values.push(req.params.id);
    await db.execute(`UPDATE donations SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json(await loadFull(req.params.id));
  } catch (e) {
    console.error('Error changing donation status:', e);
    res.status(500).json({ error: 'Failed to change status' });
  }
});

// POST /api/donations/:id/proof — upload / replace the proof document.
router.post('/:id/proof', acceptProof, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const [rows] = await db.execute('SELECT created_by, proof_url FROM donations WHERE id = ?', [req.params.id]);
    if (!rows.length) { discard(req); return res.status(404).json({ error: 'Donation not found' }); }
    if (!isAdminUser(req) && rows[0].created_by !== req.user.id) {
      discard(req); return res.status(403).json({ error: 'You do not have access to this donation' });
    }
    if (rows[0].proof_url && !isAdminUser(req)) {
      discard(req); return res.status(403).json({ error: 'A proof is already attached. Only an admin can replace it.' });
    }
    if (rows[0].proof_url) {
      const old = resolveUploadDiskPath(rows[0].proof_url);
      if (old) { try { fs.unlinkSync(old); } catch { /* already gone */ } }
    }
    const url = `/uploads/donations/${req.file.filename}`;
    await db.execute('UPDATE donations SET proof_url = ?, proof_name = ? WHERE id = ?',
      [url, String(req.file.originalname || '').slice(0, 255) || null, req.params.id]);
    res.json(await loadFull(req.params.id));
  } catch (e) {
    discard(req);
    console.error('Error uploading donation proof:', e);
    res.status(500).json({ error: 'Failed to upload proof' });
  }
});

// DELETE /api/donations/:id/proof — admin only.
router.delete('/:id/proof', isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT proof_url FROM donations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Donation not found' });
    if (rows[0].proof_url) {
      const p = resolveUploadDiskPath(rows[0].proof_url);
      if (p) { try { fs.unlinkSync(p); } catch { /* already gone */ } }
    }
    await db.execute('UPDATE donations SET proof_url = NULL, proof_name = NULL WHERE id = ?', [req.params.id]);
    res.json(await loadFull(req.params.id));
  } catch (e) {
    console.error('Error removing donation proof:', e);
    res.status(500).json({ error: 'Failed to remove proof' });
  }
});

// DELETE /api/donations/:id — admin only. The proof file is kept on disk.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [r] = await db.execute('DELETE FROM donations WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Donation not found' });
    res.json({ message: 'Donation deleted' });
  } catch (e) {
    console.error('Error deleting donation:', e);
    res.status(500).json({ error: 'Failed to delete donation' });
  }
});

module.exports = router;
