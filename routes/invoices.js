const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require("../utils/tenancy");
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveClientId } = require('../utils/clientResolver');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param("id", companyTableParamGuard("invoices"));
router.param("quotationId", companyTableParamGuard("quotations"));
router.param("jobCardId", companyTableParamGuard("job_cards"));

// Get all invoices (optionally filtered by company_id). Staff see only their
// own invoices; admins see everything.
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let query = `
      SELECT i.*, c.name as company_name, u.name as created_by_name,
             IFNULL(p.paid, 0) AS amount_paid,
             (i.grand_total - IFNULL(p.paid, 0)) AS balance_due,
             CASE
               WHEN IFNULL(p.paid, 0) >= i.grand_total THEN 'paid'
               WHEN IFNULL(p.paid, 0) > 0                  THEN 'partial'
               ELSE 'pending'
             END AS payment_status
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid
          FROM payments
         GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
    `;
    const conditions = [];
    const queryParams = [];

    if (company_id) {
      conditions.push('i.company_id = ?');
      queryParams.push(company_id);
    }
    // Always stay inside the caller's organization — also when no company_id
    // is given (otherwise the list would include other organizations' rows).
    conditions.push('i.company_id IN (SELECT id FROM companies WHERE organization_id = ?)');
    queryParams.push(req.user.organization_id);

    if (req.user.role !== 'admin') {
      conditions.push('i.created_by = ?');
      queryParams.push(req.user.id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY i.created_at DESC';

    const [invoices] = await db.execute(query, queryParams);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get single invoice by ID
router.get('/:id', async (req, res) => {
  try {
    const [invoices] = await db.execute(`
      SELECT i.*, c.name as company_name, c.address as company_address,
             c.tpin as company_tpin, c.bank_details as company_bank_details,
             c.logo_url as company_logo,
             c.quote_logo_url as company_quote_logo,
             c.primary_color, c.secondary_color,
             u.name as created_by_name,
             jc.job_card_number,
             IFNULL(p.paid, 0) AS amount_paid,
             (i.grand_total - IFNULL(p.paid, 0)) AS balance_due,
             CASE
               WHEN IFNULL(p.paid, 0) >= i.grand_total THEN 'paid'
               WHEN IFNULL(p.paid, 0) > 0                  THEN 'partial'
               ELSE 'pending'
             END AS payment_status
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN job_cards jc ON i.job_card_id = jc.id
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid
          FROM payments
         GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.id = ?
    `, [req.params.id]);

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Staff may only view their own invoices.
    if (req.user.role !== 'admin' && invoices[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this invoice' });
    }

    const [items] = await db.execute(
      'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );

    const invoice = {
      ...invoices[0],
      items
    };

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Create new invoice
router.post('/', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      company_id,
      client_id,
      quotation_id,
      job_card_id,
      invoice_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      due_days,
      subtotal,
      vat_amount,
      ppda_amount,
      grand_total,
      notes,
      terms_conditions,
      items
    } = req.body;

    const resolvedClientId = await resolveClientId(connection, {
      company_id, client_id, client_name, client_address, client_email, client_phone,
      created_by: req.user.id,
    });

    // Only link a job card from the same company (ignore anything else).
    let linkedJobCardId = null;
    if (job_card_id) {
      const [jcRows] = await connection.execute(
        'SELECT id FROM job_cards WHERE id = ? AND company_id = ?',
        [job_card_id, company_id]
      );
      if (jcRows.length > 0) linkedJobCardId = jcRows[0].id;
    }

    const [invoiceResult] = await connection.execute(`
      INSERT INTO invoices
      (company_id, created_by, client_id, quotation_id, job_card_id, invoice_number, client_name, client_address, client_email, client_phone,
       date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_id, req.user.id, resolvedClientId, quotation_id || null, linkedJobCardId, invoice_number, client_name, client_address, client_email, client_phone,
      date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions
    ]);

    const invoiceId = invoiceResult.insertId;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO invoice_items
        (invoice_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [invoiceId, item.description, item.quantity, item.unit_price, item.total, i]);
    }

    await connection.commit();

    const [newInvoice] = await db.execute(`
      SELECT i.*, c.name as company_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      WHERE i.id = ?
    `, [invoiceId]);

    res.status(201).json(newInvoice[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating invoice:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An invoice with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    connection.release();
  }
});

// Generate invoice from quotation
router.post('/from-quotation/:quotationId', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { quotationId } = req.params;

    // Fetch the quotation
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

    // Staff may only convert quotations they created.
    if (req.user.role !== 'admin' && quotation.created_by !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ error: 'You do not have access to this quotation' });
    }

    // Fetch quotation items
    const [quotationItems] = await connection.execute(
      'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id',
      [quotationId]
    );

    // Generate invoice number — based on the highest existing numeric suffix
    // for this company's prefix so manual overrides keep advancing the series.
    const prefix = `${getCompanyPrefix(quotation.company_name)}-INV`;
    const [maxResult] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM invoices
        WHERE company_id = ? AND invoice_number LIKE ?`,
      [quotation.company_id, `${prefix}-%`]
    );
    const nextNumber = (maxResult[0].max_num || 0) + 1;
    const invoiceNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    // Create invoice
    const today = new Date().toISOString().split('T')[0];

    const [invoiceResult] = await connection.execute(`
      INSERT INTO invoices
      (company_id, created_by, client_id, quotation_id, invoice_number, client_name, client_address, client_email, client_phone,
       date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      quotation.company_id,
      req.user.id,
      quotation.client_id || null,
      quotationId,
      invoiceNumber,
      quotation.client_name,
      quotation.client_address,
      quotation.client_email,
      quotation.client_phone,
      today,
      quotation.expiry_days,
      quotation.subtotal,
      quotation.vat_amount,
      quotation.ppda_amount,
      quotation.grand_total,
      quotation.notes,
      null // terms_conditions intentionally not copied — invoices no longer use T&C
    ]);

    const invoiceId = invoiceResult.insertId;

    // Copy quotation items to invoice items
    for (let i = 0; i < quotationItems.length; i++) {
      const item = quotationItems[i];
      await connection.execute(`
        INSERT INTO invoice_items
        (invoice_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [invoiceId, item.description, item.quantity, item.unit_price, item.total, item.sort_order]);
    }

    await connection.commit();

    const [newInvoice] = await db.execute(`
      SELECT i.*, c.name as company_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      WHERE i.id = ?
    `, [invoiceId]);

    res.status(201).json(newInvoice[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error generating invoice from quotation:', error);
    res.status(500).json({ error: 'Failed to generate invoice from quotation' });
  } finally {
    connection.release();
  }
});

// Generate invoice from a job card. Copies client + items (with the job
// card's internal unit prices). Tax rates: if the job card came from a
// quotation that still exists, use that quotation's EFFECTIVE rates (so a
// VAT-exempt quotation stays exempt); otherwise the company's rates.
router.post('/from-job-card/:jobCardId', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { jobCardId } = req.params;

    const [jobCards] = await connection.execute(`
      SELECT jc.*, c.name as company_name, c.vat_rate as company_vat_rate, c.ppda_rate as company_ppda_rate
      FROM job_cards jc
      JOIN companies c ON jc.company_id = c.id
      WHERE jc.id = ?
    `, [jobCardId]);

    if (jobCards.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Job card not found' });
    }

    const jobCard = jobCards[0];

    // Staff may only convert job cards they created.
    if (req.user.role !== 'admin' && jobCard.created_by !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ error: 'You do not have access to this job card' });
    }

    const [jobCardItems] = await connection.execute(
      'SELECT description, quantity, unit_price FROM job_card_items WHERE job_card_id = ? ORDER BY sort_order, id',
      [jobCardId]
    );

    let vatRate = Number(jobCard.company_vat_rate) || 0;
    let ppdaRate = Number(jobCard.company_ppda_rate) || 0;
    let dueDays = 30;
    let quotationId = null;
    if (jobCard.quotation_id) {
      const [quotations] = await connection.execute(
        'SELECT id, subtotal, vat_amount, ppda_amount, expiry_days FROM quotations WHERE id = ?',
        [jobCard.quotation_id]
      );
      if (quotations.length > 0) {
        const q = quotations[0];
        quotationId = q.id;
        const qSubtotal = Number(q.subtotal) || 0;
        if (qSubtotal > 0) {
          vatRate = (Number(q.vat_amount) || 0) / qSubtotal;
          ppdaRate = (Number(q.ppda_amount) || 0) / qSubtotal;
        }
        if (q.expiry_days != null && Number(q.expiry_days) > 0) dueDays = Number(q.expiry_days);
      }
    }

    const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const items = jobCardItems.map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      return { description: it.description, quantity, unit_price: unitPrice, total: round2(quantity * unitPrice) };
    });
    const subtotal = round2(items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0));
    const vatAmount = round2(subtotal * vatRate);
    const ppdaAmount = round2(subtotal * ppdaRate);
    const grandTotal = round2(subtotal + vatAmount + ppdaAmount);

    // Same numbering scheme as from-quotation.
    const prefix = `${getCompanyPrefix(jobCard.company_name)}-INV`;
    const [maxResult] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM invoices
        WHERE company_id = ? AND invoice_number LIKE ?`,
      [jobCard.company_id, `${prefix}-%`]
    );
    const nextNumber = (maxResult[0].max_num || 0) + 1;
    const invoiceNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const [invoiceResult] = await connection.execute(`
      INSERT INTO invoices
      (company_id, created_by, client_id, quotation_id, job_card_id, invoice_number, client_name, client_address, client_email, client_phone,
       date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      jobCard.company_id,
      req.user.id,
      jobCard.client_id ?? null,
      quotationId,
      jobCard.id,
      invoiceNumber,
      jobCard.client_name,
      jobCard.client_address ?? null,
      jobCard.client_email ?? null,
      jobCard.client_phone ?? null,
      today,
      dueDays,
      subtotal,
      vatAmount,
      ppdaAmount,
      grandTotal,
      jobCard.notes ?? null,
      null
    ]);

    const invoiceId = invoiceResult.insertId;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO invoice_items
        (invoice_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [invoiceId, item.description, item.quantity, item.unit_price, item.total, i]);
    }

    await connection.commit();

    const [newInvoice] = await db.execute(`
      SELECT i.*, c.name as company_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      WHERE i.id = ?
    `, [invoiceId]);

    res.status(201).json(newInvoice[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error generating invoice from job card:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An invoice with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to generate invoice from job card' });
  } finally {
    connection.release();
  }
});

// Duplicate an invoice (e.g. the same monthly bill for a recurring client).
// Body: { date?: 'YYYY-MM-DD', invoice_number?: string }. Copies client,
// items, taxes, totals and notes into a NEW invoice with a new number (the
// next in the series unless one is given) and the given date (default today).
// Payments are NOT copied, and the copy is not linked to the original's
// quotation / job card — it's a new, independent invoice.
router.post('/:id/duplicate', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(`
      SELECT i.*, c.name as company_name
        FROM invoices i
        JOIN companies c ON i.company_id = c.id
       WHERE i.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const source = rows[0];
    if (req.user.role !== 'admin' && source.created_by !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ error: 'You can only duplicate your own invoices.' });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const rawDate = req.body && req.body.date ? String(req.body.date).slice(0, 10) : today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(rawDate))) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid invoice date.' });
    }

    let invoiceNumber = req.body && req.body.invoice_number ? String(req.body.invoice_number).trim() : '';
    if (!invoiceNumber) {
      const prefix = `${getCompanyPrefix(source.company_name)}-INV`;
      const [maxResult] = await connection.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_num
           FROM invoices
          WHERE company_id = ? AND invoice_number LIKE ?`,
        [source.company_id, `${prefix}-%`]
      );
      invoiceNumber = `${prefix}-${String((maxResult[0].max_num || 0) + 1).padStart(4, '0')}`;
    }

    const [items] = await connection.execute(
      'SELECT description, quantity, unit_price, total FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id',
      [source.id]
    );

    const [result] = await connection.execute(`
      INSERT INTO invoices
      (company_id, created_by, client_id, quotation_id, job_card_id, invoice_number, client_name, client_address, client_email, client_phone,
       date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      source.company_id, req.user.id, source.client_id ?? null, invoiceNumber,
      source.client_name, source.client_address ?? null, source.client_email ?? null, source.client_phone ?? null,
      rawDate, source.due_days ?? 30, source.subtotal, source.vat_amount, source.ppda_amount, source.grand_total,
      source.notes ?? null, source.terms_conditions ?? null,
    ]);
    const newId = result.insertId;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await connection.execute(`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [newId, it.description, it.quantity, it.unit_price, it.total, i]);
    }

    await connection.commit();
    const [created] = await db.execute(`
      SELECT i.*, c.name as company_name FROM invoices i JOIN companies c ON i.company_id = c.id WHERE i.id = ?
    `, [newId]);
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An invoice with that number already exists for this company.' });
    }
    console.error('Error duplicating invoice:', error);
    res.status(500).json({ error: 'Failed to duplicate invoice' });
  } finally {
    connection.release();
  }
});

// Update invoice — staff may edit their own; admins may edit any. Delete
// remains admin-only.
router.put('/:id', async (req, res) => {
  const [check] = await db.execute(
    'SELECT created_by FROM invoices WHERE id = ?',
    [req.params.id]
  );
  if (check.length === 0) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own invoices.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      invoice_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      due_days,
      subtotal,
      vat_amount,
      ppda_amount,
      grand_total,
      notes,
      terms_conditions,
      items
    } = req.body;

    // Build the SET clause dynamically so any field the form sends is
    // updated — `invoice_number` was previously dropped silently.
    const fields = [];
    const values = [];
    if (invoice_number != null)   { fields.push('invoice_number = ?');   values.push(invoice_number); }
    if (client_name != null)      { fields.push('client_name = ?');      values.push(client_name); }
    if (client_address != null)   { fields.push('client_address = ?');   values.push(client_address); }
    if (client_email != null)     { fields.push('client_email = ?');     values.push(client_email); }
    if (client_phone != null)     { fields.push('client_phone = ?');     values.push(client_phone); }
    if (date != null)             { fields.push('date = ?');             values.push(date); }
    if (due_days != null)         { fields.push('due_days = ?');         values.push(due_days); }
    if (subtotal != null)         { fields.push('subtotal = ?');         values.push(subtotal); }
    if (vat_amount != null)       { fields.push('vat_amount = ?');       values.push(vat_amount); }
    if (ppda_amount != null)      { fields.push('ppda_amount = ?');      values.push(ppda_amount); }
    if (grand_total != null)      { fields.push('grand_total = ?');      values.push(grand_total); }
    if (notes != null)            { fields.push('notes = ?');            values.push(notes); }
    if (terms_conditions != null) { fields.push('terms_conditions = ?'); values.push(terms_conditions); }
    values.push(id);

    const [updateResult] = await connection.execute(
      `UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO invoice_items
        (invoice_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, item.description, item.quantity, item.unit_price, item.total, i]);
    }

    await connection.commit();

    const [updatedInvoice] = await db.execute(`
      SELECT i.*, c.name as company_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      WHERE i.id = ?
    `, [id]);

    res.json(updatedInvoice[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An invoice with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to update invoice' });
  } finally {
    connection.release();
  }
});

// Delete invoice (admins only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.execute('DELETE FROM invoices WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;
