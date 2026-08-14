const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require("../utils/tenancy");
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { UPLOADS_ROOT, resolveUploadDiskPath } = require('../config/paths');

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param("id", companyTableParamGuard("petty_cash"));

// Receipt uploads land in <UPLOADS_ROOT>/petty-cash/ (persistent).
const RECEIPT_DIR = path.join(UPLOADS_ROOT, 'petty-cash');
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    cb(null, RECEIPT_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `receipt-pc-${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const receiptUpload = multer({
  storage: receiptStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only image or PDF files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Petty cash is a SHARED company fund, so every authenticated user of the
// company sees the whole ledger and the same balance (unlike per-creator
// scoping elsewhere). Editing is limited to the creator or an admin; deleting
// is admin-only, to keep the cash book trustworthy.

// GET /api/petty-cash?company_id=&from=&to=&type=&category=&q=
router.get('/', async (req, res) => {
  try {
    const { company_id, from, to, type, category, q } = req.query;
    const conditions = [];
    const params = [];
    if (company_id) { conditions.push('pc.company_id = ?'); params.push(company_id); }
    if (from)       { conditions.push('pc.date >= ?');      params.push(from); }
    if (to)         { conditions.push('pc.date <= ?');      params.push(to); }
    if (type === 'in' || type === 'out') { conditions.push('pc.type = ?'); params.push(type); }
    if (category)   { conditions.push('pc.category = ?');   params.push(category); }
    if (q) {
      conditions.push('(pc.entry_number LIKE ? OR pc.description LIKE ? OR pc.category LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `SELECT pc.id, pc.company_id, pc.created_by, pc.entry_number, pc.type, pc.category,
              pc.description, pc.amount, pc.date, pc.reference, pc.receipt_url, pc.notes,
              pc.created_at, u.name AS created_by_name
         FROM petty_cash pc
         LEFT JOIN users u ON pc.created_by = u.id
         ${whereSql}
        ORDER BY pc.date DESC, pc.id DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching petty cash:', error);
    res.status(500).json({ error: 'Failed to fetch petty cash' });
  }
});

// GET /api/petty-cash/summary?company_id=  — balance over ALL entries (never
// affected by list filters) so the fund balance is always accurate.
router.get('/summary', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id is required' });
    const [[row]] = await db.execute(
      `SELECT
         IFNULL(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS total_in,
         IFNULL(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS total_out,
         COUNT(*) AS count
       FROM petty_cash WHERE company_id = ?`,
      [company_id]
    );
    const totalIn = Number(row.total_in || 0);
    const totalOut = Number(row.total_out || 0);
    res.json({
      total_in: totalIn,
      total_out: totalOut,
      balance: Math.round((totalIn - totalOut) * 100) / 100,
      count: Number(row.count || 0),
    });
  } catch (error) {
    console.error('Error computing petty cash summary:', error);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

// GET /api/petty-cash/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT pc.*, u.name AS created_by_name
         FROM petty_cash pc LEFT JOIN users u ON pc.created_by = u.id
        WHERE pc.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching petty cash entry:', error);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
});

// POST /api/petty-cash — record a top-up ('in') or payout ('out').
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { company_id, type, category, description, amount, date, reference, notes } = req.body;
    if (!company_id) { await connection.rollback(); return res.status(400).json({ error: 'company_id is required' }); }
    const kind = type === 'in' ? 'in' : 'out';
    const amt = Number(amount);
    if (!amt || amt <= 0) { await connection.rollback(); return res.status(400).json({ error: 'A positive amount is required.' }); }

    const [companies] = await connection.execute('SELECT name FROM companies WHERE id = ?', [company_id]);
    const companyName = companies.length ? companies[0].name : '';
    const prefix = `${getCompanyPrefix(companyName)}-PC`;
    const [maxRow] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(entry_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM petty_cash WHERE company_id = ? AND entry_number LIKE ?`,
      [company_id, `${prefix}-%`]
    );
    const nextNumber = (maxRow[0].max_num || 0) + 1;
    const entryNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    const [result] = await connection.execute(
      `INSERT INTO petty_cash
        (company_id, created_by, entry_number, type, category, description, amount, date, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, req.user.id, entryNumber, kind, category || null, description || null,
        amt, date || new Date().toISOString().split('T')[0], reference || null, notes || null,
      ]
    );
    await connection.commit();
    const [created] = await db.execute('SELECT * FROM petty_cash WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An entry with that number already exists for this company.' });
    }
    console.error('Error creating petty cash entry:', error);
    res.status(500).json({ error: 'Failed to create entry' });
  } finally {
    connection.release();
  }
});

// PUT /api/petty-cash/:id — creator or admin.
router.put('/:id', async (req, res) => {
  try {
    const [check] = await db.execute('SELECT created_by FROM petty_cash WHERE id = ?', [req.params.id]);
    if (check.length === 0) return res.status(404).json({ error: 'Entry not found' });
    if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own entries.' });
    }
    const { type, category, description, amount, date, reference, notes } = req.body;
    const fields = [];
    const values = [];
    if (type === 'in' || type === 'out') { fields.push('type = ?'); values.push(type); }
    if (category !== undefined)    { fields.push('category = ?');    values.push(category || null); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
    if (amount !== undefined)      { fields.push('amount = ?');      values.push(Number(amount) || 0); }
    if (date !== undefined)        { fields.push('date = ?');        values.push(date); }
    if (reference !== undefined)   { fields.push('reference = ?');   values.push(reference || null); }
    if (notes !== undefined)       { fields.push('notes = ?');       values.push(notes || null); }
    if (fields.length === 0) return res.status(400).json({ message: 'No changes provided.' });
    values.push(req.params.id);
    await db.execute(`UPDATE petty_cash SET ${fields.join(', ')} WHERE id = ?`, values);
    const [updated] = await db.execute('SELECT * FROM petty_cash WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating petty cash entry:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// DELETE /api/petty-cash/:id — admin only. Removes any attached receipt.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT receipt_url FROM petty_cash WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }
    await db.execute('DELETE FROM petty_cash WHERE id = ?', [req.params.id]);
    res.json({ message: 'Entry deleted.' });
  } catch (error) {
    console.error('Error deleting petty cash entry:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// POST /api/petty-cash/:id/receipt — upload/replace receipt (creator or admin).
router.post('/:id/receipt', receiptUpload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const [rows] = await db.execute('SELECT created_by, receipt_url FROM petty_cash WHERE id = ?', [id]);
    if (rows.length === 0) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(404).json({ error: 'Entry not found' }); }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'You do not have access to this entry' });
    }
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }
    const publicUrl = `/uploads/petty-cash/${req.file.filename}`;
    await db.execute('UPDATE petty_cash SET receipt_url = ? WHERE id = ?', [publicUrl, id]);
    const [updated] = await db.execute('SELECT * FROM petty_cash WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch {} }
    console.error('Error uploading petty cash receipt:', error);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
});

// DELETE /api/petty-cash/:id/receipt — creator or admin.
router.delete('/:id/receipt', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT created_by, receipt_url FROM petty_cash WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this entry' });
    }
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }
    await db.execute('UPDATE petty_cash SET receipt_url = NULL WHERE id = ?', [req.params.id]);
    res.json({ message: 'Receipt removed.' });
  } catch (error) {
    console.error('Error deleting petty cash receipt:', error);
    res.status(500).json({ error: 'Failed to remove receipt' });
  }
});

module.exports = router;
