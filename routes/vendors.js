const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require("../utils/tenancy");

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param("id", companyTableParamGuard("vendors"));

// GET /api/vendors?company_id=X&q=foo
// Buy-side mirror of /api/clients. Each row carries purchase counts + totals
// and a "last activity" timestamp so the Vendors page renders in one call.
//
// Role scoping: staff see only vendors they created OR have at least one
// purchase for; their counts/totals reflect only their own purchases. Admins
// see everything.
router.get('/', async (req, res) => {
  try {
    const { company_id, q } = req.query;
    const isAdminUser = req.user.role === 'admin';
    const userId = req.user.id;

    const params = [];
    const where = [];
    if (company_id) {
      where.push('v.company_id = ?');
      params.push(company_id);
    }
    if (q) {
      where.push('v.name LIKE ?');
      params.push(`%${q}%`);
    }

    if (!isAdminUser) {
      where.push(`(
        v.created_by = ?
        OR EXISTS (SELECT 1 FROM purchases px WHERE px.vendor_id = v.id AND px.created_by = ?)
      )`);
      params.push(userId, userId);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Aggregate subqueries are filtered by created_by for staff so counts and
    // totals only reflect their own purchases.
    const docFilter = isAdminUser ? '' : 'AND created_by = ?';
    // p (count/total/latest) + pay (paid). p is filtered directly; pay filters
    // via a join back to purchases.
    const payFilter = isAdminUser ? '' : 'AND pu.created_by = ?';
    const docParams = isAdminUser ? [] : [userId, userId];

    const [rows] = await db.execute(
      `
      SELECT v.id, v.company_id, v.name, v.contact_person, v.email, v.phone,
             v.address, v.tax_id, v.notes, v.created_at, v.updated_at, v.created_by,
             IFNULL(p.cnt, 0)   AS purchase_count,
             IFNULL(p.total, 0) AS total_purchased,
             IFNULL(pay.paid, 0) AS total_paid,
             (IFNULL(p.total, 0) - IFNULL(pay.paid, 0)) AS balance_payable,
             IFNULL(p.latest, NULL) AS last_activity
        FROM vendors v
        LEFT JOIN (
          SELECT vendor_id, COUNT(*) AS cnt, SUM(grand_total) AS total, MAX(created_at) AS latest
            FROM purchases
           WHERE vendor_id IS NOT NULL ${docFilter}
           GROUP BY vendor_id
        ) p ON p.vendor_id = v.id
        LEFT JOIN (
          SELECT pu.vendor_id, SUM(vp.amount) AS paid
            FROM vendor_payments vp
            JOIN purchases pu ON vp.purchase_id = pu.id
           WHERE pu.vendor_id IS NOT NULL ${payFilter}
           GROUP BY pu.vendor_id
        ) pay ON pay.vendor_id = v.id
        ${whereSql}
       ORDER BY v.name
      `,
      // Subquery params first (JOIN order), then WHERE params.
      [...docParams, ...params]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /api/vendors/:id — full record with stats.
router.get('/:id', async (req, res) => {
  try {
    const isAdminUser = req.user.role === 'admin';
    const userId = req.user.id;
    const vendorId = req.params.id;

    if (!isAdminUser) {
      const [allowed] = await db.execute(
        `SELECT 1 FROM vendors v
          WHERE v.id = ? AND (
            v.created_by = ?
            OR EXISTS (SELECT 1 FROM purchases px WHERE px.vendor_id = v.id AND px.created_by = ?)
          ) LIMIT 1`,
        [vendorId, userId, userId]
      );
      if (allowed.length === 0) {
        return res.status(404).json({ error: 'Vendor not found' });
      }
    }

    const docFilter = isAdminUser ? '' : 'AND created_by = ?';
    const paidFilter = isAdminUser ? '' : 'AND pu.created_by = ?';
    // Params, in query order:
    //   purchase_count (vendorId [+userId])
    //   total_purchased (vendorId [+userId])
    //   total_paid (vendorId [+userId])
    //   outer WHERE v.id (vendorId)
    const p = () => (isAdminUser ? [vendorId] : [vendorId, userId]);
    const subParams = [...p(), ...p(), ...p(), vendorId];

    const [rows] = await db.execute(
      `
      SELECT v.*,
             (SELECT COUNT(*) FROM purchases pu WHERE pu.vendor_id = ? ${docFilter}) AS purchase_count,
             (SELECT IFNULL(SUM(pu.grand_total), 0) FROM purchases pu WHERE pu.vendor_id = ? ${docFilter}) AS total_purchased,
             (SELECT IFNULL(SUM(vp.amount), 0)
                FROM vendor_payments vp
                JOIN purchases pu ON vp.purchase_id = pu.id
               WHERE pu.vendor_id = ? ${paidFilter}) AS total_paid
        FROM vendors v
       WHERE v.id = ?
      `,
      subParams
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// GET /api/vendors/:id/purchases — purchases for a vendor with payable status.
router.get('/:id/purchases', async (req, res) => {
  try {
    const conditions = ['pu.vendor_id = ?'];
    const params = [req.params.id];
    if (req.user.role !== 'admin') {
      conditions.push('pu.created_by = ?');
      params.push(req.user.id);
    }
    const [rows] = await db.execute(
      `
      SELECT pu.id, pu.purchase_number AS number, pu.vendor_name, pu.date, pu.grand_total,
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
        LEFT JOIN (
          SELECT purchase_id, SUM(amount) AS paid FROM vendor_payments GROUP BY purchase_id
        ) pay ON pay.purchase_id = pu.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pu.created_at DESC
      `,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching purchases for vendor:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// POST /api/vendors — any staff can create (also used implicitly on save).
router.post('/', async (req, res) => {
  try {
    const { company_id, name, contact_person, email, phone, address, tax_id, notes } = req.body;
    if (!company_id || !name?.trim()) {
      return res.status(400).json({ message: 'company_id and name are required.' });
    }
    const [result] = await db.execute(
      `INSERT INTO vendors (company_id, created_by, name, contact_person, email, phone, address, tax_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, req.user.id, name.trim(), contact_person || null, email || null, phone || null,
       address || null, tax_id || null, notes || null]
    );
    const [created] = await db.execute('SELECT * FROM vendors WHERE id = ?', [result.insertId]);
    res.status(201).json(created[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A vendor with that name already exists for this company.' });
    }
    console.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/vendors/:id — admin only.
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
    const [result] = await db.execute(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const [updated] = await db.execute('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A vendor with that name already exists for this company.' });
    }
    console.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id — admin only. Linked purchases survive (FK SET NULL).
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM vendors WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json({ message: 'Vendor deleted. Their purchases have been kept.' });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// GET /api/vendors/:id/statement?from=...&to=...
// Payable statement: opening payable (purchased − paid before `from`),
// purchases in the period, payments out in the period, closing payable.
router.get('/:id/statement', async (req, res) => {
  try {
    const isAdminUser = req.user.role === 'admin';
    const userId = req.user.id;
    const vendorId = req.params.id;
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to query params are required (YYYY-MM-DD).' });
    }

    if (!isAdminUser) {
      const [allowed] = await db.execute(
        `SELECT 1 FROM vendors v
          WHERE v.id = ? AND (
            v.created_by = ?
            OR EXISTS (SELECT 1 FROM purchases px WHERE px.vendor_id = v.id AND px.created_by = ?)
          ) LIMIT 1`,
        [vendorId, userId, userId]
      );
      if (allowed.length === 0) {
        return res.status(404).json({ error: 'Vendor not found' });
      }
    }

    const ownerFilter = isAdminUser ? '' : 'AND pu.created_by = ?';
    const ownerParams = isAdminUser ? [] : [userId];

    const [vendors] = await db.execute(
      'SELECT id, company_id, name, contact_person, email, phone, address, tax_id FROM vendors WHERE id = ?',
      [vendorId]
    );

    const [opening] = await db.execute(
      `SELECT
         IFNULL((
           SELECT SUM(pu.grand_total) FROM purchases pu
            WHERE pu.vendor_id = ? AND pu.date < ? ${ownerFilter}
         ), 0) AS purchased_before,
         IFNULL((
           SELECT SUM(vp.amount) FROM vendor_payments vp
            JOIN purchases pu ON vp.purchase_id = pu.id
            WHERE pu.vendor_id = ? AND vp.payment_date < ? ${ownerFilter}
         ), 0) AS paid_before`,
      [vendorId, from, ...ownerParams, vendorId, from, ...ownerParams]
    );
    const openingBalance = Number(opening[0].purchased_before) - Number(opening[0].paid_before);

    const [periodPurchases] = await db.execute(
      `SELECT pu.id, pu.purchase_number, pu.date, pu.grand_total,
              IFNULL(pay.paid, 0) AS amount_paid,
              (pu.grand_total - IFNULL(pay.paid, 0)) AS balance_due,
              CASE
                WHEN IFNULL(pay.paid, 0) >= pu.grand_total THEN 'paid'
                WHEN IFNULL(pay.paid, 0) > 0               THEN 'partial'
                ELSE 'pending'
              END AS payment_status
         FROM purchases pu
         LEFT JOIN (SELECT purchase_id, SUM(amount) AS paid FROM vendor_payments GROUP BY purchase_id) pay
                ON pay.purchase_id = pu.id
        WHERE pu.vendor_id = ? AND pu.date BETWEEN ? AND ? ${ownerFilter}
        ORDER BY pu.date, pu.id`,
      [vendorId, from, to, ...ownerParams]
    );

    const [periodPayments] = await db.execute(
      `SELECT vp.id, vp.amount, vp.payment_date, vp.method, vp.reference, vp.notes,
              vp.recorded_by, u.name AS recorded_by_name,
              pu.id AS purchase_id, pu.purchase_number
         FROM vendor_payments vp
         JOIN purchases pu ON vp.purchase_id = pu.id
         LEFT JOIN users u ON vp.recorded_by = u.id
        WHERE pu.vendor_id = ? AND vp.payment_date BETWEEN ? AND ? ${ownerFilter}
        ORDER BY vp.payment_date, vp.id`,
      [vendorId, from, to, ...ownerParams]
    );

    const totalPurchasedInPeriod = periodPurchases.reduce((s, r) => s + Number(r.grand_total || 0), 0);
    const totalPaidInPeriod = periodPayments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const closingBalance = openingBalance + totalPurchasedInPeriod - totalPaidInPeriod;

    res.json({
      vendor: vendors[0] || null,
      period: { from, to },
      opening_balance: openingBalance,
      total_purchased: totalPurchasedInPeriod,
      total_paid: totalPaidInPeriod,
      closing_balance: closingBalance,
      purchases: periodPurchases,
      payments: periodPayments,
    });
  } catch (error) {
    console.error('Error generating vendor statement:', error);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
});

module.exports = router;
