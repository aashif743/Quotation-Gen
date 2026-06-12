const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveClientId } = require('../utils/clientResolver');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Get all invoices (optionally filtered by company_id). Staff see only their
// own invoices; admins see everything.
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let query = `
      SELECT i.*, c.name as company_name, u.name as created_by_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
    `;
    const conditions = [];
    const queryParams = [];

    if (company_id) {
      conditions.push('i.company_id = ?');
      queryParams.push(company_id);
    }

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
             u.name as created_by_name
      FROM invoices i
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
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
    });

    const [invoiceResult] = await connection.execute(`
      INSERT INTO invoices
      (company_id, created_by, client_id, quotation_id, invoice_number, client_name, client_address, client_email, client_phone,
       date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_id, req.user.id, resolvedClientId, quotation_id || null, invoice_number, client_name, client_address, client_email, client_phone,
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

// Update invoice (staff are view-only; admins only)
router.put('/:id', isAdmin, async (req, res) => {
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
