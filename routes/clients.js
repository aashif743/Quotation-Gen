const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

// GET /api/clients?company_id=X&q=foo
// Listing endpoint also powers the autocomplete on the New Quotation form.
// Each row includes counts and a "last activity" timestamp so the Clients
// page can render the summary table without further round-trips.
router.get('/', async (req, res) => {
  try {
    const { company_id, q } = req.query;
    const params = [];
    const where = [];
    if (company_id) {
      where.push('c.company_id = ?');
      params.push(company_id);
    }
    if (q) {
      where.push('c.name LIKE ?');
      params.push(`%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `
      SELECT c.id, c.company_id, c.name, c.contact_person, c.email, c.phone,
             c.address, c.tax_id, c.notes, c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM quotations    q WHERE q.client_id = c.id) AS quotation_count,
             (SELECT COUNT(*) FROM invoices      i WHERE i.client_id = c.id) AS invoice_count,
             (SELECT COUNT(*) FROM delivery_notes d WHERE d.client_id = c.id) AS delivery_note_count,
             (SELECT IFNULL(SUM(i.grand_total), 0) FROM invoices i WHERE i.client_id = c.id) AS total_invoiced,
             GREATEST(
               IFNULL((SELECT MAX(q.created_at) FROM quotations    q WHERE q.client_id = c.id), '1970-01-01'),
               IFNULL((SELECT MAX(i.created_at) FROM invoices      i WHERE i.client_id = c.id), '1970-01-01'),
               IFNULL((SELECT MAX(d.created_at) FROM delivery_notes d WHERE d.client_id = c.id), '1970-01-01')
             ) AS last_activity
        FROM clients c
        ${whereSql}
       ORDER BY c.name
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id — full record with stats.
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
      SELECT c.*,
             (SELECT COUNT(*) FROM quotations    q WHERE q.client_id = c.id) AS quotation_count,
             (SELECT COUNT(*) FROM invoices      i WHERE i.client_id = c.id) AS invoice_count,
             (SELECT COUNT(*) FROM delivery_notes d WHERE d.client_id = c.id) AS delivery_note_count,
             (SELECT IFNULL(SUM(q.grand_total), 0) FROM quotations q WHERE q.client_id = c.id) AS total_quoted,
             (SELECT IFNULL(SUM(i.grand_total), 0) FROM invoices i WHERE i.client_id = c.id) AS total_invoiced
        FROM clients c
       WHERE c.id = ?
      `,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// GET /api/clients/:id/quotations  (and /invoices /delivery-notes)
// Filtered lists for the Client detail page tabs. Role-scoped same as the
// global history pages — staff see only their own; admin sees all.
const buildDocList = (table, numberCol) => async (req, res) => {
  try {
    const conditions = ['d.client_id = ?'];
    const params = [req.params.id];
    if (req.user.role !== 'admin') {
      conditions.push('d.created_by = ?');
      params.push(req.user.id);
    }
    const [rows] = await db.execute(
      `
      SELECT d.id, d.${numberCol} AS number, d.client_name, d.date, d.grand_total,
             d.created_at, d.created_by, u.name AS created_by_name
        FROM ${table} d
        LEFT JOIN users u ON d.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error(`Error fetching ${table} for client:`, error);
    res.status(500).json({ error: `Failed to fetch ${table}` });
  }
};
router.get('/:id/quotations', buildDocList('quotations', 'quote_number'));
router.get('/:id/invoices', buildDocList('invoices', 'invoice_number'));
// Delivery notes don't have grand_total; use a custom query.
router.get('/:id/delivery-notes', async (req, res) => {
  try {
    const conditions = ['d.client_id = ?'];
    const params = [req.params.id];
    if (req.user.role !== 'admin') {
      conditions.push('d.created_by = ?');
      params.push(req.user.id);
    }
    const [rows] = await db.execute(
      `
      SELECT d.id, d.delivery_note_number AS number, d.client_name, d.date,
             d.signed_file_url, d.signed_at,
             d.created_at, d.created_by, u.name AS created_by_name
        FROM delivery_notes d
        LEFT JOIN users u ON d.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching delivery notes for client:', error);
    res.status(500).json({ error: 'Failed to fetch delivery notes' });
  }
});

// POST /api/clients — staff can create (used implicitly when saving a quote).
router.post('/', async (req, res) => {
  try {
    const { company_id, name, contact_person, email, phone, address, tax_id, notes } = req.body;
    if (!company_id || !name?.trim()) {
      return res.status(400).json({ message: 'company_id and name are required.' });
    }
    const [result] = await db.execute(
      `INSERT INTO clients (company_id, name, contact_person, email, phone, address, tax_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, name.trim(), contact_person || null, email || null, phone || null,
       address || null, tax_id || null, notes || null]
    );
    const [created] = await db.execute('SELECT * FROM clients WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A client with that name already exists for this company.' });
    }
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id — admin only.
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, tax_id, notes } = req.body;
    const fields = [];
    const values = [];
    if (name != null)           { fields.push('name = ?');           values.push(name); }
    if (contact_person != null) { fields.push('contact_person = ?'); values.push(contact_person || null); }
    if (email != null)          { fields.push('email = ?');          values.push(email || null); }
    if (phone != null)          { fields.push('phone = ?');          values.push(phone || null); }
    if (address != null)        { fields.push('address = ?');        values.push(address || null); }
    if (tax_id != null)         { fields.push('tax_id = ?');         values.push(tax_id || null); }
    if (notes != null)          { fields.push('notes = ?');          values.push(notes || null); }
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No changes provided.' });
    }
    values.push(req.params.id);
    const [result] = await db.execute(
      `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const [updated] = await db.execute('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A client with that name already exists for this company.' });
    }
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id — admin only. Linked docs survive (FK is SET NULL).
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM clients WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deleted. Their quotations and invoices have been kept.' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;
