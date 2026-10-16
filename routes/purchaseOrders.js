const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const { getCompanyPrefix } = require('../utils/quotePrefix');
const { resolveVendorId } = require('../utils/vendorResolver');

// LPOs — Local Purchase Orders that WE issue to a supplier (vendor).
// Lifecycle: draft → sent → received (or cancelled). "Convert to Purchase"
// turns the LPO into a normal Purchase (vendor bill) and marks it received.

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('purchase_orders'));

const STATUSES = ['draft', 'sent', 'received', 'cancelled'];

// DATE columns are returned as 'YYYY-MM-DD' strings so the client never sees a
// timezone-shifted timestamp.
const PO_COLUMNS = `
  po.id, po.company_id, po.created_by, po.vendor_id, po.lpo_number,
  po.vendor_name, po.vendor_address, po.vendor_email, po.vendor_phone,
  po.quotation_id, po.job_card_id, po.purchase_id,
  DATE_FORMAT(po.date, '%Y-%m-%d') AS date,
  DATE_FORMAT(po.delivery_date, '%Y-%m-%d') AS delivery_date,
  po.delivery_address, po.payment_terms, po.subtotal, po.vat_amount, po.grand_total,
  po.status, po.notes, po.terms_conditions, po.created_at, po.updated_at`;

const isStaff = (req) => req.user.role !== 'admin';
const nul = (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v);
const nulId = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Compute item totals + subtotal from a raw items array (mirrors purchases.js).
function normalizeItems(items) {
  const clean = (Array.isArray(items) ? items : [])
    .filter((it) => it && (it.description || '').toString().trim() !== '')
    .map((it, i) => {
      const quantity = Number(it.quantity) || 0;
      const unit_cost = Number(it.unit_cost) || 0;
      return {
        description: String(it.description).trim(),
        quantity,
        unit_cost,
        total: round2(quantity * unit_cost),
        sort_order: i,
      };
    });
  const subtotal = round2(clean.reduce((s, it) => s + it.total, 0));
  return { clean, subtotal };
}

// Server-side totals. `include_vat` (boolean) decides whether the company's
// VAT rate (a fraction, e.g. 0.165) is applied.
async function computeTotals(conn, companyId, items, includeVat) {
  const { clean, subtotal } = normalizeItems(items);
  let vatAmount = 0;
  if (includeVat) {
    const [rows] = await conn.execute('SELECT vat_rate FROM companies WHERE id = ?', [companyId]);
    const rate = rows.length ? Number(rows[0].vat_rate) || 0 : 0;
    vatAmount = round2(subtotal * rate);
  }
  return { clean, subtotal, vatAmount, grandTotal: round2(subtotal + vatAmount) };
}

async function nextLpoNumber(conn, companyId, companyName) {
  const prefix = `${getCompanyPrefix(companyName)}-LPO`;
  const [rows] = await conn.execute(
    `SELECT MAX(CAST(SUBSTRING_INDEX(lpo_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM purchase_orders
      WHERE company_id = ? AND lpo_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  const next = (rows[0].max_num || 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

async function insertItems(conn, poId, clean) {
  for (const it of clean) {
    await conn.execute(
      `INSERT INTO purchase_order_items (purchase_order_id, description, quantity, unit_cost, total, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [poId, it.description, it.quantity, it.unit_cost, it.total, it.sort_order]
    );
  }
}

// Only trust a vendor_id that belongs to this company.
async function companyVendorId(conn, vendorId, companyId) {
  const id = nulId(vendorId);
  if (!id) return null;
  const [rows] = await conn.execute('SELECT id FROM vendors WHERE id = ? AND company_id = ?', [id, companyId]);
  return rows.length ? id : null;
}

// Validate optional quotation / job-card links belong to the same company.
async function validLink(conn, table, id, companyId) {
  if (!id) return null;
  const [rows] = await conn.execute(`SELECT id FROM \`${table}\` WHERE id = ? AND company_id = ?`, [id, companyId]);
  return rows.length ? id : null;
}

// Load the basic row + enforce staff ownership. Returns null after sending a response.
async function loadOwned(req, res) {
  const [rows] = await db.execute(
    'SELECT id, company_id, created_by, status, purchase_id FROM purchase_orders WHERE id = ?',
    [req.params.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'LPO not found' });
    return null;
  }
  if (isStaff(req) && rows[0].created_by !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this LPO.' });
    return null;
  }
  return rows[0];
}

// GET /api/purchase-orders?company_id=&status=&vendor_id=&q=
router.get('/', async (req, res) => {
  try {
    const { company_id, status, vendor_id, q } = req.query;
    const conditions = ['c.organization_id = ?'];
    const params = [req.user.organization_id];
    if (company_id) { conditions.push('po.company_id = ?'); params.push(company_id); }
    if (status)     { conditions.push('po.status = ?');     params.push(String(status)); }
    if (vendor_id)  { conditions.push('po.vendor_id = ?');  params.push(vendor_id); }
    if (q) {
      conditions.push('(po.lpo_number LIKE ? OR po.vendor_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (isStaff(req)) {
      conditions.push('po.created_by = ?');
      params.push(req.user.id);
    }

    const [rows] = await db.execute(
      `SELECT ${PO_COLUMNS},
              u.name AS created_by_name,
              pu.purchase_number
         FROM purchase_orders po
         JOIN companies c       ON po.company_id = c.id
         LEFT JOIN users u      ON po.created_by = u.id
         LEFT JOIN purchases pu ON po.purchase_id = pu.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY po.created_at DESC, po.id DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching LPOs:', error);
    res.status(500).json({ error: 'Failed to fetch LPOs' });
  }
});

// GET /api/purchase-orders/next-number?company_id=X  (must precede /:id)
router.get('/next-number', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id is required' });
    const [company] = await db.execute(
      'SELECT name FROM companies WHERE id = ? AND organization_id = ?',
      [company_id, req.user.organization_id]
    );
    if (company.length === 0) return res.status(404).json({ error: 'Company not found' });
    const lpoNumber = await nextLpoNumber(db, company_id, company[0].name);
    res.json({ lpoNumber });
  } catch (error) {
    console.error('Error generating LPO number:', error);
    res.status(500).json({ error: 'Failed to generate LPO number' });
  }
});

// GET /api/purchase-orders/:id — record + items + company branding.
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ${PO_COLUMNS},
              u.name AS created_by_name,
              pu.purchase_number,
              q.quote_number AS quotation_number,
              c.name AS company_name, c.address AS company_address, c.tpin AS company_tpin,
              c.logo_url AS company_logo, c.quote_logo_url AS company_quote_logo,
              c.primary_color, c.secondary_color, c.vat_rate AS company_vat_rate
         FROM purchase_orders po
         JOIN companies c        ON po.company_id = c.id
         LEFT JOIN users u       ON po.created_by = u.id
         LEFT JOIN purchases pu  ON po.purchase_id = pu.id
         LEFT JOIN quotations q  ON po.quotation_id = q.id
        WHERE po.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'LPO not found' });
    const po = rows[0];
    if (isStaff(req) && po.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this LPO.' });
    }

    // Job card number is looked up separately so this endpoint keeps working
    // even if the job cards module is not deployed yet.
    po.job_card_number = null;
    if (po.job_card_id) {
      try {
        const [jc] = await db.execute('SELECT job_card_number FROM job_cards WHERE id = ?', [po.job_card_id]);
        if (jc.length) po.job_card_number = jc[0].job_card_number;
      } catch { /* job_cards table unavailable */ }
    }

    const [items] = await db.execute(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json({ ...po, items });
  } catch (error) {
    console.error('Error fetching LPO:', error);
    res.status(500).json({ error: 'Failed to fetch LPO' });
  }
});

// POST /api/purchase-orders — create an LPO.
router.post('/', async (req, res) => {
  const {
    company_id, vendor_id, vendor_name, vendor_address, vendor_email, vendor_phone,
    lpo_number, quotation_id, job_card_id, date, delivery_date, delivery_address,
    payment_terms, include_vat, notes, terms_conditions, items,
  } = req.body || {};

  if (!company_id) return res.status(400).json({ error: 'company_id is required' });
  if (!String(vendor_name || '').trim()) return res.status(400).json({ error: 'Supplier (vendor) name is required.' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { clean, subtotal, vatAmount, grandTotal } = await computeTotals(connection, company_id, items, !!include_vat);
    if (clean.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Add at least one item with a description.' });
    }

    const resolvedVendorId = await resolveVendorId(connection, {
      company_id, vendor_id: await companyVendorId(connection, vendor_id, company_id), vendor_name, vendor_address, vendor_email, vendor_phone,
      created_by: req.user.id,
    });

    let number = String(lpo_number || '').trim();
    if (!number) {
      const [companies] = await connection.execute('SELECT name FROM companies WHERE id = ?', [company_id]);
      number = await nextLpoNumber(connection, company_id, companies.length ? companies[0].name : '');
    }

    const qId = await validLink(connection, 'quotations', nulId(quotation_id), company_id);
    let jcId = null;
    try { jcId = await validLink(connection, 'job_cards', nulId(job_card_id), company_id); } catch { jcId = null; }

    const [result] = await connection.execute(
      `INSERT INTO purchase_orders
         (company_id, created_by, vendor_id, lpo_number, vendor_name, vendor_address, vendor_email, vendor_phone,
          quotation_id, job_card_id, date, delivery_date, delivery_address, payment_terms,
          subtotal, vat_amount, grand_total, status, notes, terms_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [
        company_id, req.user.id, resolvedVendorId ?? null, number, String(vendor_name).trim(),
        nul(vendor_address), nul(vendor_email), nul(vendor_phone),
        qId, jcId, nul(date) || new Date().toISOString().split('T')[0], nul(delivery_date),
        nul(delivery_address), nul(payment_terms),
        subtotal, vatAmount, grandTotal, nul(notes), nul(terms_conditions),
      ]
    );
    await insertItems(connection, result.insertId, clean);
    await connection.commit();

    res.status(201).json({ id: result.insertId, lpo_number: number });
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An LPO with that number already exists for this company.' });
    }
    console.error('Error creating LPO:', error);
    res.status(500).json({ error: 'Failed to create LPO' });
  } finally {
    connection.release();
  }
});

// PUT /api/purchase-orders/:id — replace header + items.
router.put('/:id', async (req, res) => {
  let existing;
  try {
    existing = await loadOwned(req, res);
  } catch (error) {
    console.error('Error loading LPO:', error);
    return res.status(500).json({ error: 'Failed to update LPO' });
  }
  if (!existing) return;
  if (existing.status === 'received' && isStaff(req)) {
    return res.status(400).json({ error: 'This LPO has already been received and can no longer be edited. Ask an admin if a change is needed.' });
  }

  const {
    vendor_id, vendor_name, vendor_address, vendor_email, vendor_phone,
    lpo_number, quotation_id, job_card_id, date, delivery_date, delivery_address,
    payment_terms, include_vat, notes, terms_conditions, items,
  } = req.body || {};
  if (!String(vendor_name || '').trim()) return res.status(400).json({ error: 'Supplier (vendor) name is required.' });
  const number = String(lpo_number || '').trim();
  if (!number) return res.status(400).json({ error: 'LPO number is required.' });

  const companyId = existing.company_id;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { clean, subtotal, vatAmount, grandTotal } = await computeTotals(connection, companyId, items, !!include_vat);
    if (clean.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Add at least one item with a description.' });
    }

    const resolvedVendorId = await resolveVendorId(connection, {
      company_id: companyId, vendor_id: await companyVendorId(connection, vendor_id, companyId), vendor_name, vendor_address, vendor_email, vendor_phone,
      created_by: req.user.id,
    });

    const qId = await validLink(connection, 'quotations', nulId(quotation_id), companyId);
    let jcId = null;
    try { jcId = await validLink(connection, 'job_cards', nulId(job_card_id), companyId); } catch { jcId = null; }

    await connection.execute(
      `UPDATE purchase_orders
          SET vendor_id = ?, lpo_number = ?, vendor_name = ?, vendor_address = ?, vendor_email = ?, vendor_phone = ?,
              quotation_id = ?, job_card_id = ?, date = ?, delivery_date = ?, delivery_address = ?, payment_terms = ?,
              subtotal = ?, vat_amount = ?, grand_total = ?, notes = ?, terms_conditions = ?
        WHERE id = ?`,
      [
        resolvedVendorId ?? null, number, String(vendor_name).trim(),
        nul(vendor_address), nul(vendor_email), nul(vendor_phone),
        qId, jcId, nul(date) || new Date().toISOString().split('T')[0], nul(delivery_date),
        nul(delivery_address), nul(payment_terms),
        subtotal, vatAmount, grandTotal, nul(notes), nul(terms_conditions),
        req.params.id,
      ]
    );
    await connection.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [req.params.id]);
    await insertItems(connection, req.params.id, clean);
    await connection.commit();

    res.json({ id: Number(req.params.id), lpo_number: number });
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An LPO with that number already exists for this company.' });
    }
    console.error('Error updating LPO:', error);
    res.status(500).json({ error: 'Failed to update LPO' });
  } finally {
    connection.release();
  }
});

// PATCH /api/purchase-orders/:id/status { status }
router.patch('/:id/status', async (req, res) => {
  try {
    const existing = await loadOwned(req, res);
    if (!existing) return;
    const status = String((req.body && req.body.status) || '');
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    }
    if (existing.status === 'received' && status !== 'received' && isStaff(req)) {
      return res.status(400).json({ error: 'This LPO has already been received; only an admin can change its status.' });
    }
    await db.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ id: Number(req.params.id), status });
  } catch (error) {
    console.error('Error updating LPO status:', error);
    res.status(500).json({ error: 'Failed to update LPO status' });
  }
});

// DELETE /api/purchase-orders/:id — admin only. A converted Purchase is kept.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'LPO not found' });
    res.json({ message: 'LPO deleted.' });
  } catch (error) {
    console.error('Error deleting LPO:', error);
    res.status(500).json({ error: 'Failed to delete LPO' });
  }
});

// POST /api/purchase-orders/:id/convert — create a Purchase (vendor bill) from
// this LPO, link it, and mark the LPO received.
router.post('/:id/convert', async (req, res) => {
  let existing;
  try {
    existing = await loadOwned(req, res);
  } catch (error) {
    console.error('Error loading LPO:', error);
    return res.status(500).json({ error: 'Failed to convert LPO' });
  }
  if (!existing) return;
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'A cancelled LPO cannot be converted. Change its status first.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the LPO row so two concurrent clicks can't both convert it.
    const [rows] = await connection.execute(
      `SELECT po.*, DATE_FORMAT(po.date, '%Y-%m-%d') AS date_str, c.name AS company_name
         FROM purchase_orders po JOIN companies c ON po.company_id = c.id
        WHERE po.id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'LPO not found' });
    }
    const po = rows[0];

    if (po.purchase_id) {
      const [linked] = await connection.execute('SELECT id FROM purchases WHERE id = ?', [po.purchase_id]);
      if (linked.length) {
        await connection.rollback();
        return res.status(409).json({ error: 'This LPO has already been converted to a purchase.', purchase_id: po.purchase_id });
      }
    }

    const [items] = await connection.execute(
      'SELECT description, quantity, unit_cost, total, sort_order FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY sort_order, id',
      [po.id]
    );
    if (items.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'This LPO has no items to convert.' });
    }

    // Purchase number: <PREFIX>-PO-000N — same logic as POST /api/purchases.
    const prefix = `${getCompanyPrefix(po.company_name || '')}-PO`;
    const [maxRow] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(purchase_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM purchases
        WHERE company_id = ? AND purchase_number LIKE ?`,
      [po.company_id, `${prefix}-%`]
    );
    const purchaseNumber = `${prefix}-${String((maxRow[0].max_num || 0) + 1).padStart(4, '0')}`;

    const vat = Number(po.vat_amount) || 0;
    const noteParts = [
      `Converted from LPO ${po.lpo_number}${vat > 0 ? ` (incl. VAT ${vat.toFixed(2)})` : ''}`,
    ];
    if (po.notes) noteParts.push(po.notes);

    const today = new Date().toISOString().split('T')[0];
    const [result] = await connection.execute(
      `INSERT INTO purchases
         (company_id, created_by, vendor_id, purchase_number, vendor_name, vendor_address,
          vendor_email, vendor_phone, quotation_id, invoice_id, date, subtotal, grand_total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        po.company_id, req.user.id, po.vendor_id ?? null, purchaseNumber, po.vendor_name,
        po.vendor_address ?? null, po.vendor_email ?? null, po.vendor_phone ?? null,
        po.quotation_id ?? null, null, today,
        Number(po.subtotal) || 0, Number(po.grand_total) || 0, noteParts.join('\n'),
      ]
    );
    const purchaseId = result.insertId;

    for (const it of items) {
      await connection.execute(
        `INSERT INTO purchase_items (purchase_id, description, quantity, unit_cost, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [purchaseId, it.description, it.quantity, it.unit_cost, it.total, it.sort_order ?? 0]
      );
    }

    await connection.execute(
      "UPDATE purchase_orders SET purchase_id = ?, status = 'received' WHERE id = ?",
      [purchaseId, po.id]
    );
    await connection.commit();
    res.status(201).json({ purchase_id: purchaseId, purchase_number: purchaseNumber });
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Could not allocate a purchase number. Please try again.' });
    }
    console.error('Error converting LPO:', error);
    res.status(500).json({ error: 'Failed to convert LPO to a purchase' });
  } finally {
    connection.release();
  }
});

module.exports = router;
