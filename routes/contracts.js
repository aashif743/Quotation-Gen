const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const { resolveClientId } = require('../utils/clientResolver');
const { UPLOADS_ROOT, resolveUploadDiskPath } = require('../config/paths');

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('contracts'));

// Signature images land in <UPLOADS_ROOT>/signatures/ and are served at
// /uploads/signatures/<filename>.
const SIGN_DIR = path.join(UPLOADS_ROOT, 'signatures');
const signStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(SIGN_DIR)) fs.mkdirSync(SIGN_DIR, { recursive: true });
    cb(null, SIGN_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.png';
    cb(null, `sign-ct-${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const signUpload = multer({
  storage: signStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed for signatures'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Persist the caller's clause template so their next new contract starts from it.
async function saveUserTemplate(companyId, userId, title, sectionsJson) {
  await db.execute(
    `INSERT INTO contract_templates (company_id, user_id, title, sections)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), sections = VALUES(sections)`,
    [companyId, userId, title || null, sectionsJson]
  );
}

// Next contract number for a company, e.g. CT-0001. Sequential per company.
async function nextContractNumber(companyId) {
  const [rows] = await db.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(contract_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM contracts WHERE company_id = ? AND contract_number LIKE 'CT-%'`,
    [companyId]
  );
  const n = (rows[0].max_num || 0) + 1;
  return 'CT-' + String(n).padStart(4, '0');
}

// Store the clause sections as JSON text; always hand back a parsed array.
const serializeSections = (sections) => {
  if (!Array.isArray(sections)) return '[]';
  const clean = sections
    .filter((s) => s && (s.heading || s.body))
    .map((s) => ({ heading: String(s.heading || '').trim(), body: String(s.body || '') }));
  return JSON.stringify(clean);
};
const parseSections = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

// GET /api/contracts/next-number?company_id=..
router.get('/next-number', async (req, res) => {
  try {
    res.json({ contractNumber: await nextContractNumber(req.query.company_id) });
  } catch (e) {
    console.error('Error getting next contract number:', e);
    res.status(500).json({ error: 'Failed to get next contract number' });
  }
});

// GET /api/contracts/template?company_id=.. — the caller's saved default clauses.
router.get('/template', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT title, sections FROM contract_templates WHERE company_id = ? AND user_id = ?',
      [req.query.company_id, req.user.id]
    );
    if (!rows.length) return res.json({ title: null, sections: null });
    res.json({ title: rows[0].title, sections: parseSections(rows[0].sections) });
  } catch (e) {
    console.error('Error fetching contract template:', e);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// PUT /api/contracts/template — save the caller's default clauses explicitly.
router.put('/template', async (req, res) => {
  try {
    await saveUserTemplate(req.body.company_id, req.user.id, req.body.title, serializeSections(req.body.sections));
    res.json({ message: 'Template saved.' });
  } catch (e) {
    console.error('Error saving contract template:', e);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// GET /api/contracts — staff see only their own; admins see everything.
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    const conditions = [];
    const params = [];
    if (company_id) { conditions.push('ct.company_id = ?'); params.push(company_id); }
    if (req.user.role !== 'admin') { conditions.push('ct.created_by = ?'); params.push(req.user.id); }

    let query = `
      SELECT ct.id, ct.company_id, ct.created_by, ct.contract_number, ct.title,
             ct.client_name, ct.site, ct.amount, ct.currency, ct.payment_frequency,
             ct.payment_amount, ct.effective_date, ct.start_date, ct.end_date,
             ct.contract_period, ct.status, ct.created_at, ct.updated_at,
             c.name AS company_name, u.name AS created_by_name
        FROM contracts ct
        JOIN companies c ON ct.company_id = c.id
        LEFT JOIN users u ON ct.created_by = u.id`;
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY ct.created_at DESC';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (e) {
    console.error('Error fetching contracts:', e);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// GET /api/contracts/:id — full record + company branding for the PDF/view.
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT ct.*, c.name AS company_name, c.address AS company_address,
             c.tpin AS company_tpin, c.bank_details AS company_bank_details,
             c.logo_url AS company_logo, c.quote_logo_url AS company_quote_logo,
             c.primary_color, c.secondary_color, c.currency AS company_currency,
             u.name AS created_by_name
        FROM contracts ct
        JOIN companies c ON ct.company_id = c.id
        LEFT JOIN users u ON ct.created_by = u.id
       WHERE ct.id = ?`, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this contract' });
    }
    const contract = { ...rows[0], sections: parseSections(rows[0].sections) };
    res.json(contract);
  } catch (e) {
    console.error('Error fetching contract:', e);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// POST /api/contracts
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const b = req.body;
    const company_id = b.company_id;

    const resolvedClientId = await resolveClientId(connection, {
      company_id, client_id: b.client_id, client_name: b.client_name,
      client_address: b.client_address, client_email: b.client_email, client_phone: b.client_phone,
      created_by: req.user.id,
    });

    const contractNumber = (b.contract_number && String(b.contract_number).trim())
      ? String(b.contract_number).trim()
      : await nextContractNumber(company_id);

    const sectionsJson = serializeSections(b.sections);
    const [result] = await connection.execute(`
      INSERT INTO contracts
        (company_id, created_by, client_id, contract_number, title,
         client_name, client_address, client_email, client_phone,
         site, amount, currency, payment_frequency, payment_amount,
         effective_date, start_date, end_date, contract_period,
         termination_rules, comments, insurance, printing_charges, sections, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, req.user.id, resolvedClientId, contractNumber, b.title || 'Service Contract',
        b.client_name, b.client_address || null, b.client_email || null, b.client_phone || null,
        b.site || null, b.amount || 0, b.currency || null, b.payment_frequency || null, b.payment_amount || 0,
        b.effective_date || null, b.start_date || null, b.end_date || null, b.contract_period || null,
        b.termination_rules || null, b.comments || null, b.insurance || 0, b.printing_charges || 0,
        sectionsJson, b.status || 'draft',
      ]);

    // Remember these clauses as this user's personal default for next time.
    await saveUserTemplate(company_id, req.user.id, b.title, sectionsJson);

    await connection.commit();
    const [rows] = await db.execute('SELECT * FROM contracts WHERE id = ?', [result.insertId]);
    res.status(201).json({ ...rows[0], sections: parseSections(rows[0].sections) });
  } catch (e) {
    await connection.rollback();
    console.error('Error creating contract:', e);
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A contract with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create contract' });
  } finally {
    connection.release();
  }
});

// PUT /api/contracts/:id — staff may edit their own; admins may edit any.
router.put('/:id', async (req, res) => {
  try {
    const [check] = await db.execute('SELECT created_by FROM contracts WHERE id = ?', [req.params.id]);
    if (check.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own contracts.' });
    }

    const b = req.body;
    const map = {
      contract_number: b.contract_number, title: b.title,
      client_name: b.client_name, client_address: b.client_address,
      client_email: b.client_email, client_phone: b.client_phone,
      site: b.site, amount: b.amount, currency: b.currency,
      payment_frequency: b.payment_frequency, payment_amount: b.payment_amount,
      effective_date: b.effective_date, start_date: b.start_date, end_date: b.end_date,
      contract_period: b.contract_period, termination_rules: b.termination_rules,
      comments: b.comments, insurance: b.insurance, printing_charges: b.printing_charges,
      status: b.status,
    };
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) { fields.push(`${k} = ?`); values.push(v === '' ? null : v); }
    }
    if (b.sections !== undefined) { fields.push('sections = ?'); values.push(serializeSections(b.sections)); }
    if (!fields.length) return res.status(400).json({ error: 'No changes provided.' });
    values.push(req.params.id);

    await db.execute(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`, values);

    // Editing a contract's clauses updates this user's personal default too.
    if (b.sections !== undefined) {
      const [own] = await db.execute('SELECT company_id FROM contracts WHERE id = ?', [req.params.id]);
      if (own.length) await saveUserTemplate(own[0].company_id, req.user.id, b.title, serializeSections(b.sections));
    }

    const [rows] = await db.execute('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    res.json({ ...rows[0], sections: parseSections(rows[0].sections) });
  } catch (e) {
    console.error('Error updating contract:', e);
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A contract with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// POST /api/contracts/:id/signature — upload/replace the signature image.
router.post('/:id/signature', signUpload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const [rows] = await db.execute('SELECT created_by, signature_url FROM contracts WHERE id = ?', [id]);
    if (rows.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: 'Contract not found' });
    }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'You do not have access to this contract' });
    }
    if (rows[0].signature_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].signature_url)); } catch { /* already gone */ }
    }
    const publicUrl = `/uploads/signatures/${req.file.filename}`;
    await db.execute('UPDATE contracts SET signature_url = ? WHERE id = ?', [publicUrl, id]);
    res.json({ signature_url: publicUrl });
  } catch (error) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch {} }
    console.error('Error uploading signature:', error);
    res.status(500).json({ error: 'Failed to upload signature' });
  }
});

// DELETE /api/contracts/:id/signature — remove the signature (owner or admin).
router.delete('/:id/signature', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT created_by, signature_url FROM contracts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this contract' });
    }
    if (rows[0].signature_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].signature_url)); } catch { /* already gone */ }
    }
    await db.execute('UPDATE contracts SET signature_url = NULL WHERE id = ?', [req.params.id]);
    res.json({ message: 'Signature removed.' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    res.status(500).json({ error: 'Failed to remove signature' });
  }
});

// DELETE /api/contracts/:id — admin only (mirrors quotations).
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM contracts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ message: 'Contract deleted successfully' });
  } catch (e) {
    console.error('Error deleting contract:', e);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

module.exports = router;
