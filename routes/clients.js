const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated);

// GET /api/clients?company_id=X&q=foo
// Listing endpoint also powers the autocomplete on the New Quotation form.
// Each row includes counts and a "last activity" timestamp so the Clients
// page can render the summary table without further round-trips.
//
// Role scoping (added 2026-06-12): staff see only the clients they
// created OR clients they have at least one document for. Counts and totals
// in their view also reflect only their own documents. Admins see
// everything.
router.get('/', async (req, res) => {
  try {
    const { company_id, q } = req.query;
    const isAdmin = req.user.role === 'admin';
    const userId = req.user.id;

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

    // Per-row visibility predicate. Inlining the user id everywhere keeps
    // the EXISTS short-circuits efficient at the DB level.
    if (!isAdmin) {
      where.push(`(
        c.created_by = ?
        OR EXISTS (SELECT 1 FROM quotations    qx WHERE qx.client_id = c.id AND qx.created_by = ?)
        OR EXISTS (SELECT 1 FROM invoices      ix WHERE ix.client_id = c.id AND ix.created_by = ?)
        OR EXISTS (SELECT 1 FROM delivery_notes dx WHERE dx.client_id = c.id AND dx.created_by = ?)
      )`);
      params.push(userId, userId, userId, userId);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // The aggregate subqueries themselves are also filtered by created_by
    // for staff — so the counts/totals they see only reflect their own
    // documents, never another staff's or the admin's.
    const docFilter = isAdmin ? '' : 'AND created_by = ?';
    const docParams = isAdmin ? [] : [userId, userId, userId];

    const [rows] = await db.execute(
      `
      SELECT c.id, c.company_id, c.name, c.contact_person, c.email, c.phone,
             c.address, c.tax_id, c.notes, c.created_at, c.updated_at, c.created_by,
             IFNULL(q.cnt, 0)   AS quotation_count,
             IFNULL(i.cnt, 0)   AS invoice_count,
             IFNULL(d.cnt, 0)   AS delivery_note_count,
             IFNULL(i.total, 0) AS total_invoiced,
             GREATEST(
               IFNULL(q.latest, '1970-01-01'),
               IFNULL(i.latest, '1970-01-01'),
               IFNULL(d.latest, '1970-01-01')
             ) AS last_activity
        FROM clients c
        LEFT JOIN (
          SELECT client_id, COUNT(*) AS cnt, MAX(created_at) AS latest
            FROM quotations
           WHERE client_id IS NOT NULL ${docFilter}
           GROUP BY client_id
        ) q ON q.client_id = c.id
        LEFT JOIN (
          SELECT client_id, COUNT(*) AS cnt, SUM(grand_total) AS total, MAX(created_at) AS latest
            FROM invoices
           WHERE client_id IS NOT NULL ${docFilter}
           GROUP BY client_id
        ) i ON i.client_id = c.id
        LEFT JOIN (
          SELECT client_id, COUNT(*) AS cnt, MAX(created_at) AS latest
            FROM delivery_notes
           WHERE client_id IS NOT NULL ${docFilter}
           GROUP BY client_id
        ) d ON d.client_id = c.id
        ${whereSql}
       ORDER BY c.name
      `,
      // Subquery params come first (in JOIN order), then the WHERE params.
      [...docParams, ...params]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id — full record with stats.
// Staff role: 404 unless they created this client or have at least one
// document referencing it. Their stats only reflect their own documents.
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const userId = req.user.id;
    const clientId = req.params.id;

    if (!isAdmin) {
      const [allowed] = await db.execute(
        `SELECT 1 FROM clients c
          WHERE c.id = ? AND (
            c.created_by = ?
            OR EXISTS (SELECT 1 FROM quotations    qx WHERE qx.client_id = c.id AND qx.created_by = ?)
            OR EXISTS (SELECT 1 FROM invoices      ix WHERE ix.client_id = c.id AND ix.created_by = ?)
            OR EXISTS (SELECT 1 FROM delivery_notes dx WHERE dx.client_id = c.id AND dx.created_by = ?)
          )
          LIMIT 1`,
        [clientId, userId, userId, userId, userId]
      );
      if (allowed.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
    }

    const docFilter = isAdmin ? '' : 'AND created_by = ?';
    const subParams = isAdmin
      ? [clientId, clientId, clientId, clientId, clientId, clientId]
      : [clientId, userId, clientId, userId, clientId, userId, clientId, userId, clientId, userId];

    const [rows] = await db.execute(
      `
      SELECT c.*,
             (SELECT COUNT(*) FROM quotations    q WHERE q.client_id = ? ${docFilter}) AS quotation_count,
             (SELECT COUNT(*) FROM invoices      i WHERE i.client_id = ? ${docFilter}) AS invoice_count,
             (SELECT COUNT(*) FROM delivery_notes d WHERE d.client_id = ? ${docFilter}) AS delivery_note_count,
             (SELECT IFNULL(SUM(q.grand_total), 0) FROM quotations q WHERE q.client_id = ? ${docFilter}) AS total_quoted,
             (SELECT IFNULL(SUM(i.grand_total), 0) FROM invoices i WHERE i.client_id = ? ${docFilter}) AS total_invoiced
        FROM clients c
       WHERE c.id = ?
      `,
      subParams
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
      `INSERT INTO clients (company_id, created_by, name, contact_person, email, phone, address, tax_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, req.user.id, name.trim(), contact_person || null, email || null, phone || null,
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
