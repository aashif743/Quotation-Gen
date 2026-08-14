const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require("../utils/tenancy");
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveVendorId } = require('../utils/vendorResolver');

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param("id", companyTableParamGuard("purchases"));

// Compute item totals + subtotal/grand_total from a raw items array.
function normalizeItems(items) {
  const clean = (items || [])
    .filter((it) => it && (it.description || '').toString().trim() !== '')
    .map((it, i) => {
      const quantity = Number(it.quantity) || 0;
      const unit_cost = Number(it.unit_cost) || 0;
      return {
        description: String(it.description).trim(),
        quantity,
        unit_cost,
        total: Math.round(quantity * unit_cost * 100) / 100,
        sort_order: i,
      };
    });
  const subtotal = clean.reduce((s, it) => s + it.total, 0);
  return { clean, subtotal: Math.round(subtotal * 100) / 100 };
}

// GET /api/purchases?company_id=X&vendor_id=&quotation_id=&invoice_id=&q=
// Company- and role-scoped list with payable status. Optional filters power
// the vendor detail page and the per-order profit view.
router.get('/', async (req, res) => {
  try {
    const { company_id, vendor_id, quotation_id, invoice_id, q } = req.query;
    const conditions = [];
    const params = [];
    if (company_id)   { conditions.push('pu.company_id = ?');   params.push(company_id); }
    if (vendor_id)    { conditions.push('pu.vendor_id = ?');    params.push(vendor_id); }
    if (quotation_id) { conditions.push('pu.quotation_id = ?'); params.push(quotation_id); }
    if (invoice_id)   { conditions.push('pu.invoice_id = ?');   params.push(invoice_id); }
    if (q) {
      conditions.push('(pu.purchase_number LIKE ? OR pu.vendor_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (req.user.role !== 'admin') {
      conditions.push('pu.created_by = ?');
      params.push(req.user.id);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `
      SELECT pu.id, pu.company_id, pu.vendor_id, pu.purchase_number, pu.vendor_name,
             pu.quotation_id, pu.invoice_id, pu.date, pu.grand_total,
             pu.created_at, pu.created_by, u.name AS created_by_name,
             IFNULL(pay.paid, 0) AS amount_paid,
             (pu.grand_total - IFNULL(pay.paid, 0)) AS balance_due,
             CASE
               WHEN IFNULL(pay.paid, 0) >= pu.grand_total THEN 'paid'
               WHEN IFNULL(pay.paid, 0) > 0               THEN 'partial'
               ELSE 'pending'
             END AS payment_status
        FROM purchases pu
        LEFT JOIN users u ON pu.created_by = u.id
        LEFT JOIN (SELECT purchase_id, SUM(amount) AS paid FROM vendor_payments GROUP BY purchase_id) pay
               ON pay.purchase_id = pu.id
        ${whereSql}
       ORDER BY pu.created_at DESC
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /api/purchases/:id — full purchase with items, payments, and (if the
// purchase is linked to a client quotation/invoice) the profit for that order.
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT pu.*, v.name AS vendor_current_name,
              q.quote_number AS quotation_number, q.grand_total AS quotation_total,
              i.invoice_number AS invoice_number, i.grand_total AS invoice_total,
              u.name AS created_by_name
         FROM purchases pu
         LEFT JOIN vendors v    ON pu.vendor_id = v.id
         LEFT JOIN quotations q ON pu.quotation_id = q.id
         LEFT JOIN invoices i   ON pu.invoice_id = i.id
         LEFT JOIN users u      ON pu.created_by = u.id
        WHERE pu.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    const purchase = rows[0];

    if (req.user.role !== 'admin' && purchase.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this purchase' });
    }

    const [items] = await db.execute(
      'SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );
    const [payments] = await db.execute(
      `SELECT vp.*, u.name AS recorded_by_name
         FROM vendor_payments vp
         LEFT JOIN users u ON vp.recorded_by = u.id
        WHERE vp.purchase_id = ?
        ORDER BY vp.payment_date, vp.id`,
      [req.params.id]
    );
    const amountPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Profit is computed at the client-order level: the order's sale value
    // minus the total cost of ALL purchases linked to that same order.
    let profit = null;
    const saleValue = purchase.invoice_total != null
      ? Number(purchase.invoice_total)
      : (purchase.quotation_total != null ? Number(purchase.quotation_total) : null);
    if (saleValue != null) {
      const linkCol = purchase.invoice_id != null ? 'invoice_id' : 'quotation_id';
      const linkVal = purchase.invoice_id != null ? purchase.invoice_id : purchase.quotation_id;
      const [[costRow]] = await db.execute(
        `SELECT IFNULL(SUM(grand_total), 0) AS cost FROM purchases WHERE ${linkCol} = ?`,
        [linkVal]
      );
      const orderCost = Number(costRow.cost || 0);
      profit = {
        sale_value: saleValue,
        order_cost: orderCost,
        profit: Math.round((saleValue - orderCost) * 100) / 100,
      };
    }

    res.json({
      ...purchase,
      items,
      payments,
      amount_paid: amountPaid,
      balance_due: Math.round((Number(purchase.grand_total) - amountPaid) * 100) / 100,
      payment_status:
        amountPaid >= Number(purchase.grand_total) ? 'paid' : amountPaid > 0 ? 'partial' : 'pending',
      profit,
    });
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// POST /api/purchases — create a purchase (bill) against a vendor.
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const {
      company_id, vendor_id, vendor_name, vendor_address, vendor_email, vendor_phone,
      quotation_id, invoice_id, date, notes, items,
    } = req.body;

    if (!company_id) {
      await connection.rollback();
      return res.status(400).json({ error: 'company_id is required' });
    }

    const resolvedVendorId = await resolveVendorId(connection, {
      company_id, vendor_id, vendor_name, vendor_address, vendor_email, vendor_phone,
      created_by: req.user.id,
    });

    // Generate a per-company purchase number: <PREFIX>-PO-000N.
    const [companies] = await connection.execute('SELECT name FROM companies WHERE id = ?', [company_id]);
    const companyName = companies.length ? companies[0].name : '';
    const prefix = `${getCompanyPrefix(companyName)}-PO`;
    const [maxRow] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(purchase_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM purchases
        WHERE company_id = ? AND purchase_number LIKE ?`,
      [company_id, `${prefix}-%`]
    );
    const nextNumber = (maxRow[0].max_num || 0) + 1;
    const purchaseNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    const { clean, subtotal } = normalizeItems(items);
    const grandTotal = subtotal; // purchases carry no tax for now

    const [result] = await connection.execute(
      `INSERT INTO purchases
        (company_id, created_by, vendor_id, purchase_number, vendor_name, vendor_address,
         vendor_email, vendor_phone, quotation_id, invoice_id, date, subtotal, grand_total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, req.user.id, resolvedVendorId, purchaseNumber,
        (vendor_name || '').trim(), vendor_address || null, vendor_email || null, vendor_phone || null,
        quotation_id || null, invoice_id || null, date || new Date().toISOString().split('T')[0],
        subtotal, grandTotal, notes || null,
      ]
    );
    const id = result.insertId;

    for (const it of clean) {
      await connection.execute(
        `INSERT INTO purchase_items (purchase_id, description, quantity, unit_cost, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, it.description, it.quantity, it.unit_cost, it.total, it.sort_order]
      );
    }

    await connection.commit();
    const [created] = await db.execute('SELECT * FROM purchases WHERE id = ?', [id]);
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A purchase with that number already exists for this company.' });
    }
    console.error('Error creating purchase:', error);
    res.status(500).json({ error: 'Failed to create purchase' });
  } finally {
    connection.release();
  }
});

// PUT /api/purchases/:id — staff may edit their own; admins may edit any.
router.put('/:id', async (req, res) => {
  const [check] = await db.execute('SELECT created_by FROM purchases WHERE id = ?', [req.params.id]);
  if (check.length === 0) {
    return res.status(404).json({ error: 'Purchase not found' });
  }
  if (req.user.role !== 'admin' && check[0].created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own purchases.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const {
      vendor_name, vendor_address, vendor_email, vendor_phone,
      quotation_id, invoice_id, date, notes, items,
    } = req.body;

    const { clean, subtotal } = normalizeItems(items);
    const grandTotal = subtotal;

    const [upd] = await connection.execute(
      `UPDATE purchases
          SET vendor_name = ?, vendor_address = ?, vendor_email = ?, vendor_phone = ?,
              quotation_id = ?, invoice_id = ?, date = ?, notes = ?, subtotal = ?, grand_total = ?
        WHERE id = ?`,
      [
        (vendor_name || '').trim(), vendor_address || null, vendor_email || null, vendor_phone || null,
        quotation_id || null, invoice_id || null, date, notes || null, subtotal, grandTotal, id,
      ]
    );
    if (upd.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Purchase not found' });
    }

    await connection.execute('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);
    for (const it of clean) {
      await connection.execute(
        `INSERT INTO purchase_items (purchase_id, description, quantity, unit_cost, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, it.description, it.quantity, it.unit_cost, it.total, it.sort_order]
      );
    }

    await connection.commit();
    const [updated] = await db.execute('SELECT * FROM purchases WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  } finally {
    connection.release();
  }
});

// DELETE /api/purchases/:id — admin only.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM purchases WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    res.json({ message: 'Purchase deleted.' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

// POST /api/purchases/:id/payments — record a payment made OUT to the vendor.
// Admin or the purchase's creator may record.
router.post('/:id/payments', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await db.execute('SELECT created_by, grand_total FROM purchases WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only record payments on your own purchases.' });
    }

    const { amount, payment_date, method, reference, notes } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ error: 'A positive amount is required.' });
    }

    await db.execute(
      `INSERT INTO vendor_payments (purchase_id, amount, payment_date, method, reference, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, amt, payment_date || new Date().toISOString().split('T')[0],
       method || null, reference || null, notes || null, req.user.id]
    );

    const [[paidRow]] = await db.execute(
      'SELECT IFNULL(SUM(amount), 0) AS paid FROM vendor_payments WHERE purchase_id = ?', [id]
    );
    const paid = Number(paidRow.paid || 0);
    const grand = Number(rows[0].grand_total || 0);
    res.status(201).json({
      amount_paid: paid,
      balance_due: Math.round((grand - paid) * 100) / 100,
      payment_status: paid >= grand ? 'paid' : paid > 0 ? 'partial' : 'pending',
    });
  } catch (error) {
    console.error('Error recording vendor payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// DELETE /api/purchases/:id/payments/:paymentId — admin or purchase creator.
router.delete('/:id/payments/:paymentId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT pu.created_by
         FROM vendor_payments vp JOIN purchases pu ON vp.purchase_id = pu.id
        WHERE vp.id = ? AND vp.purchase_id = ?`,
      [req.params.paymentId, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete payments on your own purchases.' });
    }
    await db.execute('DELETE FROM vendor_payments WHERE id = ?', [req.params.paymentId]);
    res.json({ message: 'Payment removed.' });
  } catch (error) {
    console.error('Error deleting vendor payment:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

module.exports = router;
