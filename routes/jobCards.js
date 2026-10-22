const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveClientId } = require('../utils/clientResolver');

// Job cards are internal WORK ORDERS (quotation → job card → invoice →
// delivery note). Items carry an internal unit_price so an invoice can be
// generated from the job card, but the printed job card shows no prices.

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('job_cards'));
router.param('quotationId', companyTableParamGuard('quotations'));

const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

/** Today as a local 'YYYY-MM-DD' (toISOString would use UTC). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Empty strings / undefined → null so mysql2 never sees `undefined` and DATE
// columns never get ''.
const orNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);

// Accepts 'YYYY-MM-DD' or an ISO datetime string; returns 'YYYY-MM-DD' or null.
// A full timestamp (what the API itself returns for a DATE column: local
// midnight serialized as UTC) is converted back with LOCAL getters — taking the
// UTC date part would shift the date a day back on servers east of UTC.
const dateOrNull = (v) => {
  const s = orNull(v);
  if (s == null) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str.split('T')[0];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function nextJobCardNumber(conn, companyId, companyName) {
  const prefix = `${getCompanyPrefix(companyName)}-JC`;
  const [maxResult] = await conn.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(job_card_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM job_cards
      WHERE company_id = ? AND job_card_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  const nextNumber = (maxResult[0].max_num || 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

async function insertItems(conn, jobCardId, items) {
  for (let i = 0; i < (items || []).length; i++) {
    const item = items[i] || {};
    const rate = orNull(item.rate_per_sqm);
    await conn.execute(`
      INSERT INTO job_card_items (job_card_id, description, quantity, unit_price, sort_order, size, service, rate_per_sqm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      jobCardId,
      String(item.description || ''),
      Number(item.quantity) || 0,
      Number(item.unit_price) || 0,
      i,
      orNull(item.size),
      orNull(item.service),
      rate == null || Number.isNaN(Number(rate)) ? null : Number(rate),
    ]);
  }
}

// Optional letterhead-design fields (job card type + sign-off names). Only the
// keys the client actually sends are written, so forms that don't use them
// never clear them.
const EXTRA_FIELDS = ['card_type', 'prepared_by', 'checked_by', 'approved_by', 'link_person'];
async function saveExtras(conn, jobCardId, body) {
  const fields = [];
  const values = [];
  for (const k of EXTRA_FIELDS) {
    if (body[k] === undefined) continue;
    let v = orNull(body[k]);
    if (k === 'card_type' && v != null && !['job', 'interiors'].includes(v)) v = null;
    fields.push(`${k} = ?`);
    values.push(v == null ? null : String(v).trim().slice(0, 255));
  }
  if (!fields.length) return;
  values.push(jobCardId);
  await conn.execute(`UPDATE job_cards SET ${fields.join(', ')} WHERE id = ?`, values);
}

const fetchBasic = async (id) => {
  const [rows] = await db.execute(
    `SELECT jc.*, c.name as company_name FROM job_cards jc JOIN companies c ON jc.company_id = c.id WHERE jc.id = ?`,
    [id]
  );
  return rows[0];
};

// List job cards (role-scoped). Staff see only their own; admins see all.
router.get('/', async (req, res) => {
  try {
    const { company_id, status, q } = req.query;
    let query = `
      SELECT jc.id, jc.company_id, jc.created_by, jc.client_id, jc.quotation_id,
             jc.job_card_number, jc.client_name, jc.client_email, jc.client_phone,
             jc.date, jc.due_date, jc.completed_date, jc.status, jc.assigned_to,
             jc.created_at, jc.updated_at,
             c.name as company_name,
             u.name as created_by_name,
             q.quote_number as quotation_number,
             (SELECT COUNT(*) FROM job_card_items jci WHERE jci.job_card_id = jc.id) AS item_count,
             (SELECT COUNT(*) FROM invoices inv WHERE inv.job_card_id = jc.id) AS invoice_count,
             (SELECT inv.id FROM invoices inv WHERE inv.job_card_id = jc.id ORDER BY inv.id LIMIT 1) AS first_invoice_id,
             (SELECT inv.invoice_number FROM invoices inv WHERE inv.job_card_id = jc.id ORDER BY inv.id LIMIT 1) AS first_invoice_number
        FROM job_cards jc
        JOIN companies c ON jc.company_id = c.id
        LEFT JOIN users u ON jc.created_by = u.id
        LEFT JOIN quotations q ON jc.quotation_id = q.id
    `;
    const conditions = [];
    const queryParams = [];

    if (company_id) {
      conditions.push('jc.company_id = ?');
      queryParams.push(company_id);
    } else {
      // No explicit company: keep the list inside the caller's organization.
      conditions.push('c.organization_id = ?');
      queryParams.push(req.user.organization_id);
    }
    if (status && STATUSES.includes(String(status))) {
      conditions.push('jc.status = ?');
      queryParams.push(String(status));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      conditions.push('(jc.job_card_number LIKE ? OR jc.client_name LIKE ? OR jc.assigned_to LIKE ?)');
      queryParams.push(like, like, like);
    }
    if (req.user.role !== 'admin') {
      conditions.push('jc.created_by = ?');
      queryParams.push(req.user.id);
    }
    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY jc.created_at DESC, jc.id DESC';

    const [rows] = await db.execute(query, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching job cards:', error);
    res.status(500).json({ error: 'Failed to fetch job cards' });
  }
});

// Next suggested job card number for a company. Must be defined before /:id.
router.get('/next-number', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }
    const [company] = await db.execute(
      'SELECT id, name FROM companies WHERE id = ? AND organization_id = ?',
      [company_id, req.user.organization_id]
    );
    if (company.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const jobCardNumber = await nextJobCardNumber(db, company[0].id, company[0].name);
    res.json({ jobCardNumber });
  } catch (error) {
    console.error('Error generating job card number:', error);
    res.status(500).json({ error: 'Failed to generate job card number' });
  }
});

// Get single job card by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT jc.*, c.name as company_name, c.address as company_address,
             c.tpin as company_tpin,
             c.logo_url as company_logo,
             c.quote_logo_url as company_quote_logo,
             c.primary_color, c.secondary_color,
             c.template as company_template, c.letterhead as company_letterhead,
             c.bank_details as company_bank_details,
             u.name as created_by_name,
             q.quote_number as quotation_number
        FROM job_cards jc
        JOIN companies c ON jc.company_id = c.id
        LEFT JOIN users u ON jc.created_by = u.id
        LEFT JOIN quotations q ON jc.quotation_id = q.id
       WHERE jc.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this job card' });
    }

    const [items] = await db.execute(
      'SELECT * FROM job_card_items WHERE job_card_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );
    const [invoices] = await db.execute(
      'SELECT id, invoice_number FROM invoices WHERE job_card_id = ? ORDER BY id',
      [req.params.id]
    );

    res.json({ ...rows[0], items, invoices });
  } catch (error) {
    console.error('Error fetching job card:', error);
    res.status(500).json({ error: 'Failed to fetch job card' });
  }
});

// Create a new job card manually
router.post('/', async (req, res) => {
  const {
    company_id,
    client_id,
    quotation_id,
    job_card_number,
    client_name,
    client_address,
    client_email,
    client_phone,
    date,
    due_date,
    completed_date,
    status,
    assigned_to,
    description,
    notes,
    items,
  } = req.body || {};

  if (!company_id || !String(job_card_number || '').trim() || !String(client_name || '').trim() || !date) {
    return res.status(400).json({ error: 'Company, job card number, client name and date are required.' });
  }
  if (!Array.isArray(items) || items.length === 0 || items.some((it) => !String((it && it.description) || '').trim())) {
    return res.status(400).json({ error: 'Add at least one item, each with a description.' });
  }
  const finalStatus = STATUSES.includes(status) ? status : 'pending';

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const resolvedClientId = await resolveClientId(connection, {
      company_id, client_id, client_name, client_address, client_email, client_phone,
      created_by: req.user.id,
    });

    const [insertResult] = await connection.execute(`
      INSERT INTO job_cards
      (company_id, created_by, client_id, quotation_id, job_card_number,
       client_name, client_address, client_email, client_phone,
       date, due_date, completed_date, status, assigned_to, description, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_id, req.user.id, resolvedClientId ?? null, orNull(quotation_id), String(job_card_number).trim(),
      String(client_name).trim(), orNull(client_address), orNull(client_email), orNull(client_phone),
      dateOrNull(date), dateOrNull(due_date),
      finalStatus === 'completed' ? (dateOrNull(completed_date) || localToday()) : dateOrNull(completed_date),
      finalStatus, orNull(assigned_to), orNull(description), orNull(notes),
    ]);
    const id = insertResult.insertId;
    await insertItems(connection, id, items);
    await saveExtras(connection, id, req.body || {});

    await connection.commit();
    res.status(201).json(await fetchBasic(id));
  } catch (error) {
    await connection.rollback();
    console.error('Error creating job card:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A job card with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create job card' });
  } finally {
    connection.release();
  }
});

// Generate a job card from a quotation (copies client, items incl. internal
// prices, and notes).
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
      'SELECT description, quantity, unit_price FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id',
      [quotationId]
    );

    const jobCardNumber = await nextJobCardNumber(connection, quotation.company_id, quotation.company_name);

    const [result] = await connection.execute(`
      INSERT INTO job_cards
      (company_id, created_by, client_id, quotation_id, job_card_number,
       client_name, client_address, client_email, client_phone,
       date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [
      quotation.company_id, req.user.id, quotation.client_id ?? null, quotation.id, jobCardNumber,
      quotation.client_name, quotation.client_address ?? null,
      quotation.client_email ?? null, quotation.client_phone ?? null,
      localToday(), quotation.notes ?? null,
    ]);
    const id = result.insertId;
    await insertItems(connection, id, quotationItems);

    await connection.commit();
    res.status(201).json(await fetchBasic(id));
  } catch (error) {
    await connection.rollback();
    console.error('Error generating job card from quotation:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A job card with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to generate job card from quotation' });
  } finally {
    connection.release();
  }
});

// Ownership check shared by update routes. Returns the row or sends an error.
async function loadForEdit(req, res) {
  const [check] = await db.execute(
    'SELECT id, created_by, status, completed_date FROM job_cards WHERE id = ?',
    [req.params.id]
  );
  if (check.length === 0) {
    res.status(404).json({ error: 'Job card not found' });
    return null;
  }
  if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
    res.status(403).json({ error: 'You can only edit your own job cards.' });
    return null;
  }
  return check[0];
}

// Update job card header + replace items — staff may edit their own; admins any.
router.put('/:id', async (req, res) => {
  const existing = await loadForEdit(req, res);
  if (!existing) return;

  const {
    job_card_number,
    client_name,
    client_address,
    client_email,
    client_phone,
    date,
    due_date,
    completed_date,
    status,
    assigned_to,
    description,
    notes,
    items,
  } = req.body || {};

  if (!String(job_card_number || '').trim() || !String(client_name || '').trim() || !date) {
    return res.status(400).json({ error: 'Job card number, client name and date are required.' });
  }
  if (!Array.isArray(items) || items.length === 0 || items.some((it) => !String((it && it.description) || '').trim())) {
    return res.status(400).json({ error: 'Add at least one item, each with a description.' });
  }
  const finalStatus = STATUSES.includes(status) ? status : existing.status;
  let finalCompleted = dateOrNull(completed_date);
  if (finalStatus === 'completed' && !finalCompleted) finalCompleted = localToday();

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    await connection.execute(`
      UPDATE job_cards
         SET job_card_number = ?, client_name = ?, client_address = ?,
             client_email = ?, client_phone = ?, date = ?, due_date = ?,
             completed_date = ?, status = ?, assigned_to = ?, description = ?, notes = ?
       WHERE id = ?
    `, [
      String(job_card_number).trim(), String(client_name).trim(), orNull(client_address),
      orNull(client_email), orNull(client_phone), dateOrNull(date), dateOrNull(due_date),
      finalCompleted, finalStatus, orNull(assigned_to), orNull(description), orNull(notes),
      id,
    ]);

    await connection.execute('DELETE FROM job_card_items WHERE job_card_id = ?', [id]);
    await insertItems(connection, id, items);
    await saveExtras(connection, id, req.body || {});

    await connection.commit();
    res.json(await fetchBasic(id));
  } catch (error) {
    await connection.rollback();
    console.error('Error updating job card:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A job card with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to update job card' });
  } finally {
    connection.release();
  }
});

// Quick status change: { status, completed_date? }
router.patch('/:id/status', async (req, res) => {
  try {
    const existing = await loadForEdit(req, res);
    if (!existing) return;

    const { status, completed_date } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    }
    let finalCompleted;
    if (status === 'completed') {
      finalCompleted = dateOrNull(completed_date) || localToday();
    } else {
      // Leaving "completed" clears the completion date unless one is supplied.
      finalCompleted = dateOrNull(completed_date);
    }

    await db.execute(
      'UPDATE job_cards SET status = ?, completed_date = ? WHERE id = ?',
      [status, finalCompleted, req.params.id]
    );
    res.json(await fetchBasic(req.params.id));
  } catch (error) {
    console.error('Error updating job card status:', error);
    res.status(500).json({ error: 'Failed to update job card status' });
  }
});

// Delete job card (admin only). Linked invoices keep existing (FK SET NULL).
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM job_cards WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Job card not found' });
    }
    res.json({ message: 'Job card deleted successfully' });
  } catch (error) {
    console.error('Error deleting job card:', error);
    res.status(500).json({ error: 'Failed to delete job card' });
  }
});

module.exports = router;
