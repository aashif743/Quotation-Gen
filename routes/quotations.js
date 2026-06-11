const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { resolveClientId } = require('../utils/clientResolver');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Staff see only the quotations they created; admins see everything. Every
// row carries the creating staff member's name.
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    let query = `
      SELECT q.*, c.name as company_name, u.name as created_by_name
      FROM quotations q
      JOIN companies c ON q.company_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
    `;
    const conditions = [];
    const queryParams = [];

    if (company_id) {
      conditions.push('q.company_id = ?');
      queryParams.push(company_id);
    }

    if (req.user.role !== 'admin') {
      conditions.push('q.created_by = ?');
      queryParams.push(req.user.id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY q.created_at DESC';

    const [quotations] = await db.execute(query, queryParams);
    res.json(quotations);
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [quotations] = await db.execute(`
      SELECT q.*, c.name as company_name, c.address as company_address,
             c.tpin as company_tpin, c.bank_details as company_bank_details,
             c.logo_url as company_logo,
             c.quote_logo_url as company_quote_logo,
             c.primary_color, c.secondary_color,
             c.template as company_template,
             u.name as created_by_name
      FROM quotations q
      JOIN companies c ON q.company_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ?
    `, [req.params.id]);

    if (quotations.length === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    // Staff may only view their own quotations.
    if (req.user.role !== 'admin' && quotations[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this quotation' });
    }

    const [items] = await db.execute(
      'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );

    const quotation = {
      ...quotations[0],
      items
    };

    res.json(quotation);
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      company_id,
      client_id,
      quote_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      expiry_days,
      subtotal,
      vat_amount,
      ppda_amount,
      grand_total,
      notes,
      terms_conditions,
      vat_rate,
      ppda_rate,
      items
    } = req.body;

    // Find-or-create the client so this quotation is filed under the right
    // customer in the Clients page. Pass-through null if no client name.
    const resolvedClientId = await resolveClientId(connection, {
      company_id, client_id, client_name, client_address, client_email, client_phone,
    });

    const [quotationResult] = await connection.execute(`
      INSERT INTO quotations
      (company_id, created_by, client_id, quote_number, client_name, client_address, client_email, client_phone,
       date, expiry_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      company_id, req.user.id, resolvedClientId, quote_number, client_name, client_address, client_email, client_phone,
      date, expiry_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions
    ]);

    const quotationId = quotationResult.insertId;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO quotation_items
        (quotation_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [quotationId, item.description, item.quantity, item.unit_price, item.total, i]);
    }

    // Persist the rates the user typed back to the company so the next
    // quotation pre-fills with their last entered values. Skip if the
    // caller didn't send rates.
    if (vat_rate != null || ppda_rate != null) {
      await connection.execute(
        `UPDATE companies
            SET vat_rate = COALESCE(?, vat_rate),
                ppda_rate = COALESCE(?, ppda_rate)
          WHERE id = ?`,
        [vat_rate ?? null, ppda_rate ?? null, company_id]
      );
    }

    await connection.commit();

    const [newQuotation] = await db.execute(`
      SELECT q.*, c.name as company_name 
      FROM quotations q 
      JOIN companies c ON q.company_id = c.id 
      WHERE q.id = ?
    `, [quotationId]);

    res.status(201).json(newQuotation[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quotation:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A quotation with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create quotation' });
  } finally {
    connection.release();
  }
});

// Staff are view-only; only admins may edit or delete quotations.
router.put('/:id', isAdmin, async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      quote_number,
      client_name,
      client_address,
      client_email,
      client_phone,
      date,
      expiry_days,
      subtotal,
      vat_amount,
      ppda_amount,
      grand_total,
      notes,
      terms_conditions,
      items
    } = req.body;

    // Build the SET clause dynamically — `quote_number` was previously
    // dropped by this route, which is why edits to it were silently ignored.
    const fields = [];
    const values = [];
    if (quote_number != null)     { fields.push('quote_number = ?');     values.push(quote_number); }
    if (client_name != null)      { fields.push('client_name = ?');      values.push(client_name); }
    if (client_address != null)   { fields.push('client_address = ?');   values.push(client_address); }
    if (client_email != null)     { fields.push('client_email = ?');     values.push(client_email); }
    if (client_phone != null)     { fields.push('client_phone = ?');     values.push(client_phone); }
    if (date != null)             { fields.push('date = ?');             values.push(date); }
    if (expiry_days != null)      { fields.push('expiry_days = ?');      values.push(expiry_days); }
    if (subtotal != null)         { fields.push('subtotal = ?');         values.push(subtotal); }
    if (vat_amount != null)       { fields.push('vat_amount = ?');       values.push(vat_amount); }
    if (ppda_amount != null)      { fields.push('ppda_amount = ?');      values.push(ppda_amount); }
    if (grand_total != null)      { fields.push('grand_total = ?');      values.push(grand_total); }
    if (notes != null)            { fields.push('notes = ?');            values.push(notes); }
    if (terms_conditions != null) { fields.push('terms_conditions = ?'); values.push(terms_conditions); }
    values.push(id);

    const [updateResult] = await connection.execute(
      `UPDATE quotations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Quotation not found' });
    }

    await connection.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await connection.execute(`
        INSERT INTO quotation_items 
        (quotation_id, description, quantity, unit_price, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, item.description, item.quantity, item.unit_price, item.total, i]);
    }

    await connection.commit();

    const [updatedQuotation] = await db.execute(`
      SELECT q.*, c.name as company_name 
      FROM quotations q 
      JOIN companies c ON q.company_id = c.id 
      WHERE q.id = ?
    `, [id]);

    res.json(updatedQuotation[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating quotation:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A quotation with that number already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to update quotation' });
  } finally {
    connection.release();
  }
});

router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.execute('DELETE FROM quotations WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('Error deleting quotation:', error);
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

module.exports = router;