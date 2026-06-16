const express = require('express');
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();
router.use(isAuthenticated);

// Helper — return the invoice row if the current user is allowed to act on
// it, otherwise null. Staff may only see/record against invoices they
// created; admins may act on any.
async function loadAccessibleInvoice(req, invoiceId) {
  const [rows] = await db.execute(
    'SELECT id, company_id, client_id, created_by, grand_total FROM invoices WHERE id = ?',
    [invoiceId]
  );
  if (rows.length === 0) return null;
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) return null;
  return rows[0];
}

// Helper — return the payment row if the current user is allowed to edit or
// delete it, otherwise null. Admins can act on any payment; staff can only
// touch payments they themselves recorded.
async function loadEditablePayment(req, paymentId) {
  const [rows] = await db.execute(
    'SELECT id, invoice_id, recorded_by FROM payments WHERE id = ?',
    [paymentId]
  );
  if (rows.length === 0) return null;
  if (req.user.role !== 'admin' && rows[0].recorded_by !== req.user.id) return null;
  return rows[0];
}

// GET /api/payments?invoice_id=X — list payments for one invoice
router.get('/', async (req, res) => {
  try {
    const invoiceId = req.query.invoice_id;
    if (!invoiceId) {
      return res.status(400).json({ message: 'invoice_id is required.' });
    }
    const invoice = await loadAccessibleInvoice(req, invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const [rows] = await db.execute(
      `SELECT p.*, u.name AS recorded_by_name
         FROM payments p
         LEFT JOIN users u ON p.recorded_by = u.id
        WHERE p.invoice_id = ?
        ORDER BY p.payment_date DESC, p.id DESC`,
      [invoiceId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST /api/payments — record a new payment (invoice_id in body)
router.post('/', async (req, res) => {
  try {
    const { invoice_id, amount, payment_date, method, reference, notes } = req.body;
    if (!invoice_id) {
      return res.status(400).json({ message: 'invoice_id is required.' });
    }
    const invoice = await loadAccessibleInvoice(req, invoice_id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }
    if (!payment_date) {
      return res.status(400).json({ message: 'Payment date is required.' });
    }

    const [result] = await db.execute(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoice.id, amt, payment_date, method || null, reference || null, notes || null, req.user.id]
    );
    const [created] = await db.execute(
      `SELECT p.*, u.name AS recorded_by_name
         FROM payments p LEFT JOIN users u ON p.recorded_by = u.id
        WHERE p.id = ?`,
      [result.insertId]
    );
    res.status(201).json(created[0]);
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// PUT /api/payments/:id — edit. Admin can edit any payment; staff can edit
// their own.
router.put('/:id', async (req, res) => {
  try {
    const payment = await loadEditablePayment(req, req.params.id);
    if (!payment) {
      return res.status(403).json({ error: 'You can only edit payments you recorded.' });
    }
    const { amount, payment_date, method, reference, notes } = req.body;
    const fields = [];
    const values = [];
    if (amount != null) {
      const amt = parseFloat(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ message: 'Amount must be greater than 0.' });
      }
      fields.push('amount = ?'); values.push(amt);
    }
    if (payment_date != null) { fields.push('payment_date = ?'); values.push(payment_date); }
    if (method != null)      { fields.push('method = ?');       values.push(method || null); }
    if (reference != null)   { fields.push('reference = ?');    values.push(reference || null); }
    if (notes != null)       { fields.push('notes = ?');        values.push(notes || null); }
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No changes provided.' });
    }
    values.push(req.params.id);
    await db.execute(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    const [updated] = await db.execute(
      `SELECT p.*, u.name AS recorded_by_name
         FROM payments p LEFT JOIN users u ON p.recorded_by = u.id
        WHERE p.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// DELETE /api/payments/:id — admin can delete any; staff can delete their own.
router.delete('/:id', async (req, res) => {
  try {
    const payment = await loadEditablePayment(req, req.params.id);
    if (!payment) {
      return res.status(403).json({ error: 'You can only delete payments you recorded.' });
    }
    await db.execute('DELETE FROM payments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment deleted.' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

module.exports = router;
