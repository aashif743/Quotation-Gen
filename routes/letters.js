const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { moveToRecycleBin } = require('../utils/recycleBin');
const { requireCompanyAccess, companyTableParamGuard, companyInOrg } = require('../utils/tenancy');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { UPLOADS_ROOT } = require('../config/paths');
const { aiEnabled, draftLetter, LetterAiError } = require('../utils/letterAi');

// Business letters on the company letterhead.
//
// Signatures: each user uploads theirs once (My Profile → users.signature_url).
// A letter stores its own copy of the signer's name, title and signature path
// when it is saved, so changing a signature later never changes old letters.
// Staff sign with their own signature only; admins may choose any user's in
// their organization (e.g. a letter prepared for the director to sign).
// Signature files are never deleted (old letters may still show them).

const router = express.Router();
router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('letters'));

const SIGN_DIR = path.join(UPLOADS_ROOT, 'signatures');
const signUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(SIGN_DIR)) fs.mkdirSync(SIGN_DIR, { recursive: true });
      cb(null, SIGN_DIR);
    },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `sign-user-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.png'}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Upload the signature as an image (PNG or JPG).'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('file');

const opt = (v, n = 255) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, n) : null;
};

class LetterError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const sendError = (res, error, fallback) => {
  if (error instanceof LetterError || error instanceof LetterAiError) return res.status(error.status).json({ error: error.message });
  if (error && error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That letter number is already used. Choose another number.' });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

async function nextLetterNumber(companyId) {
  const [[co]] = await db.execute('SELECT name FROM companies WHERE id = ?', [companyId]);
  if (!co) return null;
  const prefix = `${getCompanyPrefix(co.name)}-LTR`;
  const [[r]] = await db.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(letter_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM letters WHERE company_id = ? AND letter_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  return `${prefix}-${String((Number(r.max_num) || 0) + 1).padStart(4, '0')}`;
}

/** The signer's details for a letter (checked: staff may only sign as themselves). */
async function signerFor(req, rawId) {
  const wanted = rawId == null || rawId === '' ? req.user.id : Number(rawId);
  if (wanted !== req.user.id && req.user.role !== 'admin') {
    throw new LetterError('You can only sign letters with your own signature.', 403);
  }
  const [[u]] = await db.execute(
    'SELECT id, name, job_title, signature_url FROM users WHERE id = ? AND organization_id = ?',
    [wanted, req.user.organization_id]
  );
  if (!u) throw new LetterError('That person is not in your organization.');
  return u;
}

const LETTER_SELECT = `
  SELECT l.*, DATE_FORMAT(l.date, '%Y-%m-%d') AS letter_date, u.name AS created_by_name,
         c.name AS company_name, c.address AS company_address, c.tpin AS company_tpin,
         c.logo_url AS company_logo, c.quote_logo_url AS company_quote_logo,
         c.primary_color, c.secondary_color, c.template AS company_template,
         c.letterhead AS company_letterhead, c.letter_details AS company_letter_details
    FROM letters l
    JOIN companies c ON c.id = l.company_id
    LEFT JOIN users u ON u.id = l.created_by`;

/** Fields a letter is saved with, from a request body. */
async function letterFields(req, current) {
  const b = req.body || {};
  const date = b.date ? String(b.date).slice(0, 10) : (current ? current.letter_date : null);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new LetterError('Choose a valid date.');
  const body = b.body != null ? String(b.body).replace(/\r\n/g, '\n').trim() : '';
  if (!body) throw new LetterError('Write the letter first (the body is empty).');
  if (body.length > 60000) throw new LetterError('The letter is too long.');

  // Signer: keep the saved one unless another person was chosen.
  let signer;
  if (current && !b.refresh_signature && (b.signer_user_id === undefined || Number(b.signer_user_id) === current.signer_user_id)) {
    signer = { id: current.signer_user_id, name: current.signer_name, job_title: current.signer_title, signature_url: current.signature_url };
    // Signer's name / title can still be edited on the letter.
  } else {
    signer = await signerFor(req, b.signer_user_id);
  }
  return {
    date,
    reference: opt(b.reference, 150),
    recipient_name: opt(b.recipient_name),
    recipient_title: opt(b.recipient_title),
    recipient_company: opt(b.recipient_company),
    recipient_address: opt(b.recipient_address, 2000),
    subject: opt(b.subject, 500),
    salutation: opt(b.salutation) || 'Dear Sir/Madam,',
    body,
    closing: opt(b.closing) || 'Yours faithfully,',
    signer_user_id: signer.id || null,
    signer_name: opt(b.signer_name) || signer.name || null,
    signer_title: b.signer_title !== undefined ? opt(b.signer_title) : signer.job_title || null,
    signature_url: signer.signature_url || null,
    show_signature: b.show_signature === false || b.show_signature === 0 || b.show_signature === '0' ? 0 : 1,
    cc: opt(b.cc, 2000),
    enclosures: opt(b.enclosures, 2000),
  };
}

// ---------------------------------------------------------------------------
// Signer profile (My Profile): job title + signature image
// ---------------------------------------------------------------------------

// GET /api/letters/me/signature
router.get('/me/signature', async (req, res) => {
  const [[u]] = await db.execute('SELECT name, job_title, signature_url FROM users WHERE id = ?', [req.user.id]);
  res.json(u || {});
});

// PUT /api/letters/me/signature — { job_title }
router.put('/me/signature', async (req, res) => {
  try {
    await db.execute('UPDATE users SET job_title = ? WHERE id = ?', [opt(req.body && req.body.job_title, 150), req.user.id]);
    const [[u]] = await db.execute('SELECT name, job_title, signature_url FROM users WHERE id = ?', [req.user.id]);
    res.json(u);
  } catch (error) {
    sendError(res, error, 'Could not save your details');
  }
});

// POST /api/letters/me/signature/file — upload (or replace) the signature image.
router.post('/me/signature/file', (req, res) => {
  signUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The image is too large (max 5 MB).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      // The previous image is kept on disk: letters already signed with it still use it.
      const url = `/uploads/signatures/${req.file.filename}`;
      await db.execute('UPDATE users SET signature_url = ? WHERE id = ?', [url, req.user.id]);
      const [[u]] = await db.execute('SELECT name, job_title, signature_url FROM users WHERE id = ?', [req.user.id]);
      res.json(u);
    } catch (error) {
      sendError(res, error, 'Could not save the signature');
    }
  });
});

// DELETE /api/letters/me/signature/file — stop using a signature (the file stays for old letters).
router.delete('/me/signature/file', async (req, res) => {
  await db.execute('UPDATE users SET signature_url = NULL WHERE id = ?', [req.user.id]);
  res.json({ message: 'Signature removed from your profile.' });
});

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------

// GET /api/letters/options?company_id=X — next number, signers and AI status.
router.get('/options', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const [signers] = req.user.role === 'admin'
      ? await db.execute(
        `SELECT id, name, job_title, signature_url FROM users
          WHERE organization_id = ? AND (signature_url IS NOT NULL OR id = ?)
          ORDER BY id = ? DESC, name`,
        [req.user.organization_id, req.user.id, req.user.id]
      )
      : await db.execute('SELECT id, name, job_title, signature_url FROM users WHERE id = ?', [req.user.id]);
    res.json({ next_number: await nextLetterNumber(companyId), signers, ai_enabled: aiEnabled() });
  } catch (error) {
    sendError(res, error, 'Could not load letter options');
  }
});

// POST /api/letters/draft — write (or improve) a letter with AI.
const recentDrafts = new Map(); // user id → timestamps (simple limit: 30 per hour)
router.post('/draft', async (req, res) => {
  try {
    const now = Date.now();
    const times = (recentDrafts.get(req.user.id) || []).filter((t) => now - t < 3600_000);
    if (times.length >= 30) throw new LetterError('You have used AI writing many times in the last hour. Please try again later.', 429);
    const b = req.body || {};
    let companyName = '';
    if (b.company_id) {
      if (!(await companyInOrg(b.company_id, req.user.organization_id))) throw new LetterError('That company is not in your organization.', 403);
      const [[co]] = await db.execute('SELECT name FROM companies WHERE id = ?', [b.company_id]);
      companyName = co ? co.name : '';
    }
    times.push(now);
    recentDrafts.set(req.user.id, times);
    const letter = await draftLetter({
      context: b.context, tone: b.tone,
      recipient_name: b.recipient_name, recipient_title: b.recipient_title, recipient_company: b.recipient_company,
      company_name: companyName, sender_name: b.signer_name || req.user.name, sender_title: b.signer_title,
      current: b.improve ? { subject: b.subject, body: b.body } : null,
    });
    res.json(letter);
  } catch (error) {
    sendError(res, error, 'Could not write the letter');
  }
});

// GET /api/letters?company_id=X — newest first. Staff see their own letters.
router.get('/', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const where = ['l.company_id = ?'];
    const args = [companyId];
    if (req.user.role !== 'admin') { where.push('l.created_by = ?'); args.push(req.user.id); }
    const [rows] = await db.execute(
      `SELECT l.id, l.letter_number, DATE_FORMAT(l.date, '%Y-%m-%d') AS letter_date, l.reference, l.recipient_name,
              l.recipient_company, l.subject, l.signer_name, l.created_by, l.created_at, l.updated_at,
              u.name AS created_by_name
         FROM letters l LEFT JOIN users u ON u.id = l.created_by
        WHERE ${where.join(' AND ')}
        ORDER BY l.date DESC, l.id DESC`,
      args
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error, 'Could not load letters');
  }
});

async function loadLetter(id) {
  const [rows] = await db.execute(`${LETTER_SELECT} WHERE l.id = ?`, [id]);
  return rows[0] || null;
}

// GET /api/letters/:id
router.get('/:id', async (req, res) => {
  try {
    const letter = await loadLetter(req.params.id);
    if (!letter) return res.status(404).json({ error: 'Letter not found' });
    if (req.user.role !== 'admin' && letter.created_by !== req.user.id) return res.status(403).json({ error: 'You do not have access to this letter' });
    res.json(letter);
  } catch (error) {
    sendError(res, error, 'Could not load the letter');
  }
});

// POST /api/letters
router.post('/', async (req, res) => {
  try {
    const companyId = req.body && req.body.company_id;
    if (!companyId) throw new LetterError('company_id is required.');
    const f = await letterFields(req, null);
    const number = opt(req.body.letter_number, 50) || await nextLetterNumber(companyId);
    const cols = Object.keys(f);
    const [r] = await db.execute(
      `INSERT INTO letters (company_id, created_by, letter_number, ${cols.join(', ')})
       VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`,
      [companyId, req.user.id, number, ...cols.map((k) => f[k])]
    );
    res.status(201).json(await loadLetter(r.insertId));
  } catch (error) {
    sendError(res, error, 'Could not save the letter');
  }
});

// PUT /api/letters/:id — the author or an admin.
router.put('/:id', async (req, res) => {
  try {
    const current = await loadLetter(req.params.id);
    if (!current) return res.status(404).json({ error: 'Letter not found' });
    if (req.user.role !== 'admin' && current.created_by !== req.user.id) return res.status(403).json({ error: 'You can only edit letters you wrote.' });
    const f = await letterFields(req, current);
    const number = opt(req.body.letter_number, 50) || current.letter_number;
    const cols = Object.keys(f);
    await db.execute(
      `UPDATE letters SET letter_number = ?, ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [number, ...cols.map((k) => f[k]), current.id]
    );
    res.json(await loadLetter(current.id));
  } catch (error) {
    sendError(res, error, 'Could not save the letter');
  }
});

// POST /api/letters/:id/duplicate — a copy dated today with the next number.
router.post('/:id/duplicate', async (req, res) => {
  try {
    const src = await loadLetter(req.params.id);
    if (!src) return res.status(404).json({ error: 'Letter not found' });
    if (req.user.role !== 'admin' && src.created_by !== req.user.id) return res.status(403).json({ error: 'You can only copy letters you wrote.' });
    const me = await signerFor(req, null);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const keepSigner = req.user.role === 'admin' || src.signer_user_id === req.user.id;
    const [r] = await db.execute(
      `INSERT INTO letters (company_id, created_by, letter_number, date, reference, recipient_name, recipient_title,
         recipient_company, recipient_address, subject, salutation, body, closing, signer_user_id, signer_name,
         signer_title, signature_url, show_signature, cc, enclosures)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        src.company_id, req.user.id, await nextLetterNumber(src.company_id), today,
        src.recipient_name, src.recipient_title, src.recipient_company, src.recipient_address, src.subject,
        src.salutation, src.body, src.closing,
        keepSigner ? src.signer_user_id : me.id, keepSigner ? src.signer_name : me.name,
        keepSigner ? src.signer_title : me.job_title, keepSigner ? src.signature_url : me.signature_url,
        src.show_signature, src.cc, src.enclosures,
      ]
    );
    res.status(201).json(await loadLetter(r.insertId));
  } catch (error) {
    sendError(res, error, 'Could not copy the letter');
  }
});

// DELETE /api/letters/:id — admins; goes to Recently Deleted.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const result = await moveToRecycleBin('letter', req.params.id, req);
    if (!result.affectedRows) return res.status(404).json({ error: 'Letter not found' });
    res.json({ message: 'Letter deleted.' });
  } catch (error) {
    sendError(res, error, 'Could not delete the letter');
  }
});

module.exports = router;
