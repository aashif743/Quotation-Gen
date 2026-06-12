const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveClientId } = require('../utils/clientResolver');

const router = express.Router();

router.use(isAuthenticated);

// Multer config for uploading the signed/stamped scan or photo. Saved under
// /uploads/signed/ so it's served by the existing static middleware at
// /uploads/signed/<filename>.
const SIGNED_DIR = path.join(__dirname, '..', 'uploads', 'signed');
const signedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(SIGNED_DIR)) fs.mkdirSync(SIGNED_DIR, { recursive: true });
    cb(null, SIGNED_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `signed-dn-${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const signedUpload = multer({
  storage: signedStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    cb(new Error('Only image or PDF files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// List delivery notes (role-scoped). Staff see only their own; admins see all.
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let query = `
      SELECT d.id, d.company_id, d.created_by, d.quotation_id,
             d.delivery_note_number, d.client_name, d.client_email,
             d.client_phone, d.date, d.created_at, d.updated_at,
             d.signed_file_url, d.signed_at, d.signed_by,
             c.name as company_name,
             u.name as created_by_name,
             su.name as signed_by_name
        FROM delivery_notes d
        JOIN companies c ON d.company_id = c.id
        LEFT JOIN users u ON d.created_by = u.id
        LEFT JOIN users su ON d.signed_by = su.id
    `;
    const conditions = [];
    const queryParams = [];

    if (company_id) {
      conditions.push('d.company_id = ?');
      queryParams.push(company_id);
    }
    if (req.user.role !== 'admin') {
      conditions.push('d.created_by = ?');
      queryParams.push(req.user.id);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY d.created_at DESC';

    const [rows] = await db.execute(query, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching delivery notes:', error);
    res.status(500).json({ error: 'Failed to fetch delivery notes' });
  }
});

// Get single delivery note by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT d.*, c.name as company_name, c.address as company_address,
             c.tpin as company_tpin, c.bank_details as company_bank_details,
             c.logo_url as company_logo,
             c.quote_logo_url as company_quote_logo,
             c.primary_color, c.secondary_color,
             c.template as company_template,
             u.name as created_by_name,
             su.name as signed_by_name
        FROM delivery_notes d
        JOIN companies c ON d.company_id = c.id
        LEFT JOIN users u ON d.created_by = u.id
        LEFT JOIN users su ON d.signed_by = su.id
       WHERE d.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Delivery note not found' });
    }

    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this delivery note' });
    }

    const [items] = await db.execute(
      'SELECT * FROM delivery_note_items WHERE delivery_note_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );

    res.json({ ...rows[0], items });
  } catch (error) {
    console.error('Error fetching delivery note:', error);
    res.status(500).json({ error: 'Failed to fetch delivery note' });
  }
});

// Create a new delivery note manually
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const {
      company_id,
      client_id,
      quotation_id,
      delivery_note_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      items,
    } = req.body;

    const resolvedClientId = await resolveClientId(connection, {
      company_id, client_id, client_name, client_address, client_email, client_phone,
      created_by: req.user.id,
    });

    const [insertResult] = await connection.execute(`
      INSERT INTO delivery_notes
      (company_id, created_by, client_id, quotation_id, delivery_note_number,
       client_name, client_address, client_email, client_phone, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_id, req.user.id, resolvedClientId, quotation_id || null, delivery_note_number,
      client_name, client_address, client_email, client_phone, date,
    ]);
    const id = insertResult.insertId;

    for (let i = 0; i < (items || []).length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO delivery_note_items (delivery_note_id, description, quantity, sort_order)
        VALUES (?, ?, ?, ?)
      `, [id, item.description, item.quantity, i]);
    }

    await connection.commit();
    const [created] = await db.execute(
      `SELECT d.*, c.name as company_name FROM delivery_notes d JOIN companies c ON d.company_id = c.id WHERE d.id = ?`,
      [id]
    );
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating delivery note:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A delivery note with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create delivery note' });
  } finally {
    connection.release();
  }
});

// Generate delivery note from a quotation (copies client + items, drops prices)
router.post('/from-quotation/:quotationId', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { quotationId } = req.params;

    const [quotations] = await connection.execute(`
      SELECT q.*, c.name as company_name
        FROM quotations q
        JOIN companies c ON q.company_id = c.id
       WHERE q.id = ?
    `, [quotationId]);

    if (quotations.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Quotation not found' });
    }
    const quotation = quotations[0];

    if (req.user.role !== 'admin' && quotation.created_by !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ error: 'You do not have access to this quotation' });
    }

    const [quotationItems] = await connection.execute(
      'SELECT description, quantity, sort_order FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id',
      [quotationId]
    );

    const prefix = `${getCompanyPrefix(quotation.company_name)}-DN`;
    const [maxResult] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(delivery_note_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM delivery_notes
        WHERE company_id = ? AND delivery_note_number LIKE ?`,
      [quotation.company_id, `${prefix}-%`]
    );
    const nextNumber = (maxResult[0].max_num || 0) + 1;
    const deliveryNoteNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    const today = new Date().toISOString().split('T')[0];
    const [result] = await connection.execute(`
      INSERT INTO delivery_notes
      (company_id, created_by, client_id, quotation_id, delivery_note_number,
       client_name, client_address, client_email, client_phone, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      quotation.company_id, req.user.id, quotation.client_id || null, quotationId, deliveryNoteNumber,
      quotation.client_name, quotation.client_address,
      quotation.client_email, quotation.client_phone, today,
    ]);
    const id = result.insertId;

    for (let i = 0; i < quotationItems.length; i++) {
      const item = quotationItems[i];
      await connection.execute(`
        INSERT INTO delivery_note_items (delivery_note_id, description, quantity, sort_order)
        VALUES (?, ?, ?, ?)
      `, [id, item.description, item.quantity, item.sort_order ?? i]);
    }

    await connection.commit();
    const [created] = await db.execute(
      `SELECT d.*, c.name as company_name FROM delivery_notes d JOIN companies c ON d.company_id = c.id WHERE d.id = ?`,
      [id]
    );
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error generating delivery note from quotation:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A delivery note with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to generate delivery note from quotation' });
  } finally {
    connection.release();
  }
});

// Update delivery note — staff may edit their own; admins may edit any.
// Delete remains admin-only.
router.put('/:id', async (req, res) => {
  const [check] = await db.execute(
    'SELECT created_by FROM delivery_notes WHERE id = ?',
    [req.params.id]
  );
  if (check.length === 0) {
    return res.status(404).json({ error: 'Delivery note not found' });
  }
  if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own delivery notes.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const {
      delivery_note_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      items,
    } = req.body;

    const [updateResult] = await connection.execute(`
      UPDATE delivery_notes
         SET delivery_note_number = ?, client_name = ?, client_address = ?,
             client_email = ?, client_phone = ?, date = ?
       WHERE id = ?
    `, [delivery_note_number, client_name, client_address, client_email, client_phone, date, id]);

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Delivery note not found' });
    }

    await connection.execute('DELETE FROM delivery_note_items WHERE delivery_note_id = ?', [id]);
    for (let i = 0; i < (items || []).length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO delivery_note_items (delivery_note_id, description, quantity, sort_order)
        VALUES (?, ?, ?, ?)
      `, [id, item.description, item.quantity, i]);
    }

    await connection.commit();
    const [updated] = await db.execute(
      `SELECT d.*, c.name as company_name FROM delivery_notes d JOIN companies c ON d.company_id = c.id WHERE d.id = ?`,
      [id]
    );
    res.json(updated[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating delivery note:', error);
    res.status(500).json({ error: 'Failed to update delivery note' });
  } finally {
    connection.release();
  }
});

// Delete delivery note (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.execute('DELETE FROM delivery_notes WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Delivery note not found' });
    }
    res.json({ message: 'Delivery note deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivery note:', error);
    res.status(500).json({ error: 'Failed to delete delivery note' });
  }
});

// POST /:id/signed  Upload (or replace) the signed/stamped scan or photo.
// Staff may sign their own DNs; admins may sign any.
router.post('/:id/signed', signedUpload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const [rows] = await db.execute(
      'SELECT id, created_by, signed_file_url FROM delivery_notes WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      // Don't keep an orphan file if the DN doesn't exist.
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(404).json({ error: 'Delivery note not found' });
    }
    const dn = rows[0];

    if (req.user.role !== 'admin' && dn.created_by !== req.user.id) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'You do not have access to this delivery note' });
    }

    // Delete previous signed file if replacing.
    if (dn.signed_file_url) {
      const oldPath = path.join(__dirname, '..', dn.signed_file_url);
      try { fs.unlinkSync(oldPath); } catch { /* ignore — file may already be gone */ }
    }

    const publicUrl = `/uploads/signed/${req.file.filename}`;
    await db.execute(
      'UPDATE delivery_notes SET signed_file_url = ?, signed_at = NOW(), signed_by = ? WHERE id = ?',
      [publicUrl, req.user.id, id]
    );

    const [updated] = await db.execute(`
      SELECT d.*, su.name as signed_by_name
        FROM delivery_notes d
        LEFT JOIN users su ON d.signed_by = su.id
       WHERE d.id = ?
    `, [id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error uploading signed delivery note:', error);
    // Clean up upload if we error after the file was saved.
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: 'Failed to upload signed copy' });
  }
});

// DELETE /:id/signed  Remove the signed copy (admin only).
router.delete('/:id/signed', isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await db.execute(
      'SELECT signed_file_url FROM delivery_notes WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Delivery note not found' });
    }

    if (rows[0].signed_file_url) {
      const filePath = path.join(__dirname, '..', rows[0].signed_file_url);
      try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
    }

    await db.execute(
      'UPDATE delivery_notes SET signed_file_url = NULL, signed_at = NULL, signed_by = NULL WHERE id = ?',
      [id]
    );
    res.json({ message: 'Signed copy removed.' });
  } catch (error) {
    console.error('Error deleting signed delivery note:', error);
    res.status(500).json({ error: 'Failed to remove signed copy' });
  }
});

module.exports = router;
