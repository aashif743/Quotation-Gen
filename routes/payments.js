const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, canHandlePayments } = require('../middleware/auth');
const { requireCompanyAccess } = require("../utils/tenancy");
const {
  makeProofUpload, acceptProofFile, publicProofUrl, discardUploaded, deleteStoredProof, originalName,
} = require('../utils/proofUpload');

const proofUpload = acceptProofFile(makeProofUpload('inv'));

// Columns returned for a payment everywhere (recorder + proof uploader names).
const PAYMENT_SELECT = `
  SELECT p.*, u.name AS recorded_by_name, pu.name AS proof_uploaded_by_name
    FROM payments p
    LEFT JOIN users u  ON p.recorded_by = u.id
    LEFT JOIN users pu ON p.proof_uploaded_by = pu.id`;

const router = express.Router();
router.use(isAuthenticated);
router.use(canHandlePayments);
router.use(requireCompanyAccess);

// Helper — return the invoice row if the current user is allowed to act on
// it, otherwise null. Staff may only see/record against invoices they
// created; admins may act on any.
async function loadAccessibleInvoice(req, invoiceId) {
  // Scope to the caller's organization first (cross-tenant safety), then apply
  // the per-creator rule for staff.
  const [rows] = await db.execute(
    `SELECT i.id, i.company_id, i.client_id, i.created_by, i.grand_total
       FROM invoices i JOIN companies c ON i.company_id = c.id
      WHERE i.id = ? AND c.organization_id = ?`,
    [invoiceId, req.user.organization_id]
  );
  if (rows.length === 0) return null;
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) return null;
  return rows[0];
}

// Helper — return the payment row if the current user is allowed to edit or
// delete it, otherwise null. Admins can act on any payment; staff can only
// touch payments they themselves recorded.
async function loadEditablePayment(req, paymentId) {
  // Payment → invoice → company must be in the caller's organization.
  const [rows] = await db.execute(
    `SELECT p.id, p.invoice_id, p.recorded_by
       FROM payments p
       JOIN invoices i  ON p.invoice_id = i.id
       JOIN companies c ON i.company_id = c.id
      WHERE p.id = ? AND c.organization_id = ?`,
    [paymentId, req.user.organization_id]
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
      `${PAYMENT_SELECT}
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
      `${PAYMENT_SELECT}
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
      `${PAYMENT_SELECT}
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
    // The payment's proof file (if any) is intentionally left on disk: uploaded
    // documents are never deleted as a side effect.
    await db.execute('DELETE FROM payments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment deleted.' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// ---------------------------------------------------------------------------
// Payment proof (one uploaded image/PDF per payment)
// ---------------------------------------------------------------------------

// Load a payment for proof actions: it must belong to the caller's
// organization, and staff must either own the invoice or have recorded the
// payment. Admins can act on any payment in their organization.
async function loadPaymentForProof(req, paymentId) {
  const [rows] = await db.execute(
    `SELECT p.id, p.invoice_id, p.recorded_by, p.proof_file_url, i.created_by AS invoice_created_by
       FROM payments p
       JOIN invoices i  ON p.invoice_id = i.id
       JOIN companies c ON i.company_id = c.id
      WHERE p.id = ? AND c.organization_id = ?`,
    [paymentId, req.user.organization_id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (req.user.role !== 'admin' && row.recorded_by !== req.user.id && row.invoice_created_by !== req.user.id) {
    return null;
  }
  return row;
}

// POST /api/payments/:id/proof — upload the proof (multipart field "file").
// Replacing an existing proof is admin-only so nobody can accidentally
// overwrite a document someone else uploaded.
router.post('/:id/proof', proofUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const payment = await loadPaymentForProof(req, req.params.id);
    if (!payment) {
      discardUploaded(req);
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (payment.proof_file_url && req.user.role !== 'admin') {
      discardUploaded(req);
      return res.status(403).json({ error: 'A proof is already attached. Only an admin can replace it.' });
    }
    if (payment.proof_file_url) deleteStoredProof(payment.proof_file_url);

    await db.execute(
      `UPDATE payments
          SET proof_file_url = ?, proof_file_name = ?, proof_uploaded_at = NOW(), proof_uploaded_by = ?
        WHERE id = ?`,
      [publicProofUrl(req.file.filename), originalName(req.file), req.user.id, payment.id]
    );
    const [updated] = await db.execute(`${PAYMENT_SELECT} WHERE p.id = ?`, [payment.id]);
    res.json(updated[0]);
  } catch (error) {
    discardUploaded(req);
    console.error('Error uploading payment proof:', error);
    res.status(500).json({ error: 'Failed to upload payment proof' });
  }
});

// DELETE /api/payments/:id/proof — remove the proof (admin only).
router.delete('/:id/proof', isAdmin, async (req, res) => {
  try {
    const payment = await loadPaymentForProof(req, req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.proof_file_url) deleteStoredProof(payment.proof_file_url);
    await db.execute(
      `UPDATE payments
          SET proof_file_url = NULL, proof_file_name = NULL, proof_uploaded_at = NULL, proof_uploaded_by = NULL
        WHERE id = ?`,
      [payment.id]
    );
    res.json({ message: 'Payment proof removed.' });
  } catch (error) {
    console.error('Error removing payment proof:', error);
    res.status(500).json({ error: 'Failed to remove payment proof' });
  }
});

module.exports = router;
