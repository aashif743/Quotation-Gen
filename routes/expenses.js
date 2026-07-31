const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { UPLOADS_ROOT, resolveUploadDiskPath } = require('../config/paths');

const router = express.Router();

router.use(isAuthenticated);

// Receipt uploads land in <UPLOADS_ROOT>/expenses/ (persistent, outside the
// deployed app dir) and are served by the static middleware at
// /uploads/expenses/<filename>.
const RECEIPT_DIR = path.join(UPLOADS_ROOT, 'expenses');
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    cb(null, RECEIPT_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `receipt-exp-${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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

// GET /api/expenses?company_id=&from=&to=&category=&q=
// Company- and role-scoped list. Staff see only their own expenses.
router.get('/', async (req, res) => {
  try {
    const { company_id, from, to, category, q } = req.query;
    const conditions = [];
    const params = [];
    if (company_id) { conditions.push('e.company_id = ?'); params.push(company_id); }
    if (from)       { conditions.push('e.date >= ?');       params.push(from); }
    if (to)         { conditions.push('e.date <= ?');       params.push(to); }
    if (category)   { conditions.push('e.category = ?');    params.push(category); }
    if (q) {
      conditions.push('(e.expense_number LIKE ? OR e.description LIKE ? OR e.category LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (req.user.role !== 'admin') { conditions.push('e.created_by = ?'); params.push(req.user.id); }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `
      SELECT e.id, e.company_id, e.created_by, e.vendor_id, e.expense_number,
             e.category, e.description, e.amount, e.date, e.payment_method,
             e.reference, e.receipt_url, e.notes, e.created_at,
             u.name AS created_by_name, v.name AS vendor_name
        FROM expenses e
        LEFT JOIN users u   ON e.created_by = u.id
        LEFT JOIN vendors v ON e.vendor_id = v.id
        ${whereSql}
       ORDER BY e.date DESC, e.id DESC
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, u.name AS created_by_name, v.name AS vendor_name
         FROM expenses e
         LEFT JOIN users u   ON e.created_by = u.id
         LEFT JOIN vendors v ON e.vendor_id = v.id
        WHERE e.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this expense' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// POST /api/expenses — create. Any staff can add.
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const {
      company_id, vendor_id, category, description, amount, date,
      payment_method, reference, notes,
    } = req.body;

    if (!company_id) { await connection.rollback(); return res.status(400).json({ error: 'company_id is required' }); }
    const amt = Number(amount);
    if (!amt || amt <= 0) { await connection.rollback(); return res.status(400).json({ error: 'A positive amount is required.' }); }

    const [companies] = await connection.execute('SELECT name FROM companies WHERE id = ?', [company_id]);
    const companyName = companies.length ? companies[0].name : '';
    const prefix = `${getCompanyPrefix(companyName)}-EXP`;
    const [maxRow] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(expense_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM expenses WHERE company_id = ? AND expense_number LIKE ?`,
      [company_id, `${prefix}-%`]
    );
    const nextNumber = (maxRow[0].max_num || 0) + 1;
    const expenseNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    const [result] = await connection.execute(
      `INSERT INTO expenses
        (company_id, created_by, vendor_id, expense_number, category, description,
         amount, date, payment_method, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, req.user.id, vendor_id || null, expenseNumber, category || null,
        description || null, amt, date || new Date().toISOString().split('T')[0],
        payment_method || null, reference || null, notes || null,
      ]
    );
    await connection.commit();
    const [created] = await db.execute('SELECT * FROM expenses WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An expense with that number already exists for this company.' });
    }
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  } finally {
    connection.release();
  }
});

// PUT /api/expenses/:id — staff may edit their own; admins any.
router.put('/:id', async (req, res) => {
  try {
    const [check] = await db.execute('SELECT created_by FROM expenses WHERE id = ?', [req.params.id]);
    if (check.length === 0) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own expenses.' });
    }

    const { vendor_id, category, description, amount, date, payment_method, reference, notes } = req.body;
    const fields = [];
    const values = [];
    if (vendor_id !== undefined)     { fields.push('vendor_id = ?');      values.push(vendor_id || null); }
    if (category !== undefined)      { fields.push('category = ?');       values.push(category || null); }
    if (description !== undefined)   { fields.push('description = ?');     values.push(description || null); }
    if (amount !== undefined)        { fields.push('amount = ?');         values.push(Number(amount) || 0); }
    if (date !== undefined)          { fields.push('date = ?');           values.push(date); }
    if (payment_method !== undefined){ fields.push('payment_method = ?'); values.push(payment_method || null); }
    if (reference !== undefined)     { fields.push('reference = ?');      values.push(reference || null); }
    if (notes !== undefined)         { fields.push('notes = ?');          values.push(notes || null); }
    if (fields.length === 0) return res.status(400).json({ message: 'No changes provided.' });
    values.push(req.params.id);

    await db.execute(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, values);
    const [updated] = await db.execute('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id — admin only. Removes any attached receipt file.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT receipt_url FROM expenses WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }
    await db.execute('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted.' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// POST /api/expenses/:id/receipt — upload/replace the receipt scan.
router.post('/:id/receipt', receiptUpload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const [rows] = await db.execute('SELECT created_by, receipt_url FROM expenses WHERE id = ?', [id]);
    if (rows.length === 0) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: 'Expense not found' });
    }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'You do not have access to this expense' });
    }
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }

    const publicUrl = `/uploads/expenses/${req.file.filename}`;
    await db.execute('UPDATE expenses SET receipt_url = ? WHERE id = ?', [publicUrl, id]);
    const [updated] = await db.execute('SELECT * FROM expenses WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch {} }
    console.error('Error uploading expense receipt:', error);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
});

// DELETE /api/expenses/:id/receipt — remove the receipt (owner or admin).
router.delete('/:id/receipt', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT created_by, receipt_url FROM expenses WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this expense' });
    }
    if (rows[0].receipt_url) {
      try { fs.unlinkSync(resolveUploadDiskPath(rows[0].receipt_url)); } catch { /* already gone */ }
    }
    await db.execute('UPDATE expenses SET receipt_url = NULL WHERE id = ?', [req.params.id]);
    res.json({ message: 'Receipt removed.' });
  } catch (error) {
    console.error('Error deleting expense receipt:', error);
    res.status(500).json({ error: 'Failed to remove receipt' });
  }
});

module.exports = router;
