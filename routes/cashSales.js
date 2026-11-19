const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, canHandlePayments } = require('../middleware/auth');
const { moveToRecycleBin } = require('../utils/recycleBin');
const { requireCompanyAccess, orgParamGuard } = require('../utils/tenancy');
const { resolveClientId } = require('../utils/clientResolver');
const { vatRateOf } = require('../utils/vat');
const { pickAccount, methodFor, AccountError } = require('../utils/accounts');
const { nextReceiptNumber, nextCashSaleNumber } = require('../utils/receipts');

// Cash sales: goods / services sold and paid for on the spot (walk-in
// customers, counter sales). A cash sale is stored as an invoice with
// doc_type = 'cash_sale' plus one payment for the full amount, recorded in
// the same transaction — so revenue, client statements and the bank / cash
// account balances include it with no special cases. It is never "unpaid":
// editing the sale moves its payment with it.

const router = express.Router();
router.use(isAuthenticated);
router.use(canHandlePayments);
router.use(requireCompanyAccess);
router.param('id', orgParamGuard(
  `SELECT 1 FROM invoices t JOIN companies c ON t.company_id = c.id
    WHERE t.id = ? AND c.organization_id = ? AND t.doc_type = 'cash_sale' LIMIT 1`
));

const WALK_IN = 'Walk-in customer';
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

class SaleError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** Today's date (YYYY-MM-DD) or a valid given one. */
function saleDate(raw) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const d = raw ? String(raw).slice(0, 10) : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw new SaleError('Invalid date.');
  return d;
}

/**
 * Items and totals, worked out here (not trusted from the browser) so the
 * payment recorded always equals the sale total.
 */
function workOutTotals(body) {
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({
      description: String(it.description || '').trim(),
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
    }))
    .filter((it) => it.description || it.quantity * it.unit_price !== 0)
    .map((it) => ({ ...it, total: round2(it.quantity * it.unit_price) }));
  if (!items.length) throw new SaleError('Add at least one item.');
  if (items.some((it) => !it.description)) throw new SaleError('Every item needs a description.');
  if (items.some((it) => it.quantity < 0 || it.unit_price < 0)) throw new SaleError('Quantities and prices cannot be negative.');

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  let discountType = null; let discountValue = 0; let discount = 0;
  const dv = Math.max(0, Number(body.discount_value) || 0);
  if (dv > 0 && (body.discount_type === 'percent' || body.discount_type === 'amount')) {
    discountType = body.discount_type;
    discountValue = dv;
    discount = discountType === 'percent' ? (subtotal * Math.min(dv, 100)) / 100 : Math.min(dv, subtotal);
  }
  const taxable = subtotal - discount;
  const vatRate = vatRateOf(body.vat_rate) ?? 0;
  const ppdaRate = Math.max(0, Math.min(1, Number(body.ppda_rate) || 0));
  const vat = taxable * vatRate;
  const ppda = taxable * ppdaRate;
  const grand = round2(taxable + vat + ppda);
  if (grand <= 0) throw new SaleError('The sale total must be more than 0.');
  return {
    items,
    subtotal: round2(subtotal),
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount: round2(discount),
    vat_rate: vatRate,
    vat_amount: round2(vat),
    ppda_amount: round2(ppda),
    grand_total: grand,
  };
}

/** Customer fields; a sale with no name is a walk-in sale (no client record). */
async function customerOf(conn, body, companyId, userId) {
  const name = String(body.client_name || '').trim();
  const walkIn = !name || name.toLowerCase() === WALK_IN.toLowerCase();
  let clientId = null;
  if (!walkIn) {
    if (body.client_id) {
      const [ok] = await conn.execute('SELECT id FROM clients WHERE id = ? AND company_id = ?', [body.client_id, companyId]);
      clientId = ok.length ? ok[0].id : null;
    }
    if (!clientId) {
      clientId = await resolveClientId(conn, {
        company_id: companyId, client_name: name, client_address: body.client_address,
        client_email: body.client_email, client_phone: body.client_phone, created_by: userId,
      });
    }
  }
  const opt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
  return {
    client_id: clientId,
    client_name: walkIn ? WALK_IN : name,
    client_address: opt(body.client_address),
    client_email: opt(body.client_email),
    client_phone: opt(body.client_phone),
  };
}

const SALE_SELECT = `
  SELECT i.*, DATE_FORMAT(i.date, '%Y-%m-%d') AS sale_date, c.name AS company_name, c.address AS company_address, c.tpin AS company_tpin,
         c.bank_details AS company_bank_details, c.logo_url AS company_logo, c.quote_logo_url AS company_quote_logo,
         c.primary_color, c.secondary_color, c.template AS company_template, c.letterhead AS company_letterhead,
         c.currency AS company_currency,
         u.name AS created_by_name,
         p.id AS payment_id, p.method AS payment_method, p.reference AS payment_reference,
         p.account_id AS payment_account_id, a.name AS payment_account_name, p.receipt_number,
         IFNULL(paid.total, 0) AS amount_paid
    FROM invoices i
    JOIN companies c ON c.id = i.company_id
    LEFT JOIN users u ON u.id = i.created_by
    LEFT JOIN payments p ON p.id = (SELECT MIN(x.id) FROM payments x WHERE x.invoice_id = i.id AND x.is_discount = 0)
    LEFT JOIN accounts a ON a.id = p.account_id
    LEFT JOIN (SELECT invoice_id, SUM(amount) AS total FROM payments GROUP BY invoice_id) paid ON paid.invoice_id = i.id`;

async function loadSale(id) {
  const [rows] = await db.execute(`${SALE_SELECT} WHERE i.id = ? AND i.doc_type = 'cash_sale'`, [id]);
  if (!rows.length) return null;
  const [items] = await db.execute('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]);
  return { ...rows[0], items };
}

const sendError = (res, error, fallback) => {
  if (error instanceof SaleError || error instanceof AccountError) return res.status(error.status).json({ error: error.message });
  if (error && error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That cash sale number is already used. Choose another number.' });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

// GET /api/cash-sales?company_id=X[&from&to] — the company's cash sales,
// newest first. Staff see the sales they made; admins see all.
router.get('/', async (req, res) => {
  try {
    const { company_id: companyId, from, to } = req.query;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const where = ["i.company_id = ?", "i.doc_type = 'cash_sale'"];
    const args = [companyId];
    if (from) { where.push('i.date >= ?'); args.push(String(from).slice(0, 10)); }
    if (to) { where.push('i.date <= ?'); args.push(String(to).slice(0, 10)); }
    if (req.user.role !== 'admin') { where.push('i.created_by = ?'); args.push(req.user.id); }
    const [rows] = await db.execute(
      `${SALE_SELECT}
        WHERE ${where.join(' AND ')}
        ORDER BY i.date DESC, i.id DESC`,
      args
    );
    const [counts] = rows.length
      ? await db.query('SELECT invoice_id, COUNT(*) AS n FROM invoice_items WHERE invoice_id IN (?) GROUP BY invoice_id', [rows.map((r) => r.id)])
      : [[]];
    const itemCount = new Map(counts.map((c) => [c.invoice_id, Number(c.n)]));
    res.json(rows.map((r) => ({ ...r, item_count: itemCount.get(r.id) || 0 })));
  } catch (error) {
    sendError(res, error, 'Failed to load cash sales');
  }
});

// GET /api/cash-sales/next-number?company_id=X
router.get('/next-number', async (req, res) => {
  try {
    if (!req.query.company_id) return res.status(400).json({ error: 'company_id is required' });
    res.json({ number: await nextCashSaleNumber(db, req.query.company_id) });
  } catch (error) {
    sendError(res, error, 'Failed to work out the next number');
  }
});

// GET /api/cash-sales/:id
router.get('/:id', async (req, res) => {
  try {
    const sale = await loadSale(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Cash sale not found' });
    if (req.user.role !== 'admin' && sale.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this cash sale' });
    }
    res.json(sale);
  } catch (error) {
    sendError(res, error, 'Failed to load the cash sale');
  }
});

// POST /api/cash-sales — make the sale and record its payment in one go.
router.post('/', async (req, res) => {
  let conn;
  try {
    const companyId = req.body.company_id;
    if (!companyId) throw new SaleError('company_id is required.');
    const date = saleDate(req.body.date);
    const t = workOutTotals(req.body);
    const acct = await pickAccount(companyId, req.body.account_id ?? null);
    const [[{ n: accountCount }]] = await db.execute(
      "SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND is_active = 1 AND type <> 'petty_cash'", [companyId]
    );
    if (accountCount > 0 && !acct.id) throw new SaleError('Choose the account the money went into.');

    conn = await db.getConnection();
    await conn.beginTransaction();
    const customer = await customerOf(conn, req.body, companyId, req.user.id);
    const number = String(req.body.invoice_number || '').trim() || await nextCashSaleNumber(conn, companyId);

    const [r] = await conn.execute(
      `INSERT INTO invoices
        (company_id, created_by, client_id, invoice_number, client_name, client_address, client_email, client_phone,
         date, due_days, subtotal, vat_amount, ppda_amount, grand_total, notes, terms_conditions, title,
         discount_type, discount_value, discount_amount, vat_rate, doc_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'cash_sale')`,
      [
        companyId, req.user.id, customer.client_id, number, customer.client_name, customer.client_address,
        customer.client_email, customer.client_phone, date, t.subtotal, t.vat_amount, t.ppda_amount, t.grand_total,
        String(req.body.notes || '').trim() || null, String(req.body.title || '').trim() || null,
        t.discount_type, t.discount_value, t.discount_amount, t.vat_rate,
      ]
    );
    const id = r.insertId;
    for (let i = 0; i < t.items.length; i++) {
      const it = t.items[i];
      await conn.execute(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [id, it.description, it.quantity, it.unit_price, it.total, i]
      );
    }
    const receipt = await nextReceiptNumber(conn, companyId);
    await conn.execute(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes, recorded_by, is_discount, account_id, receipt_number)
       VALUES (?, ?, ?, ?, ?, 'Cash sale', ?, 0, ?, ?)`,
      [id, t.grand_total, date, methodFor(acct.account, req.body.method) || 'Cash', String(req.body.reference || '').trim() || null,
        req.user.id, acct.id ?? null, receipt]
    );
    await conn.commit();
    res.status(201).json(await loadSale(id));
  } catch (error) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    sendError(res, error, 'Failed to save the cash sale');
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/cash-sales/:id — edit the sale; its payment follows the new total,
// date, method and account (the receipt number stays the same).
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const current = await loadSale(req.params.id);
    if (!current) return res.status(404).json({ error: 'Cash sale not found' });
    if (req.user.role !== 'admin' && current.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit cash sales you made.' });
    }
    const companyId = current.company_id;
    const date = saleDate(req.body.date || current.sale_date);
    const t = workOutTotals(req.body);
    const acct = await pickAccount(companyId, req.body.account_id ?? null, { current: current.payment_account_id });
    const [[{ n: accountCount }]] = await db.execute(
      "SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND is_active = 1 AND type <> 'petty_cash'", [companyId]
    );
    if (accountCount > 0 && !acct.id && current.payment_account_id != null) throw new SaleError('Choose the account the money went into.');

    conn = await db.getConnection();
    await conn.beginTransaction();
    const customer = await customerOf(conn, req.body, companyId, req.user.id);
    const number = String(req.body.invoice_number || '').trim() || current.invoice_number;
    await conn.execute(
      `UPDATE invoices
          SET client_id = ?, invoice_number = ?, client_name = ?, client_address = ?, client_email = ?, client_phone = ?,
              date = ?, subtotal = ?, vat_amount = ?, ppda_amount = ?, grand_total = ?, notes = ?, title = ?,
              discount_type = ?, discount_value = ?, discount_amount = ?, vat_rate = ?
        WHERE id = ?`,
      [
        customer.client_id, number, customer.client_name, customer.client_address, customer.client_email, customer.client_phone,
        date, t.subtotal, t.vat_amount, t.ppda_amount, t.grand_total, String(req.body.notes || '').trim() || null,
        String(req.body.title || '').trim() || null, t.discount_type, t.discount_value, t.discount_amount, t.vat_rate, current.id,
      ]
    );
    await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [current.id]);
    for (let i = 0; i < t.items.length; i++) {
      const it = t.items[i];
      await conn.execute(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [current.id, it.description, it.quantity, it.unit_price, it.total, i]
      );
    }
    // The sale stays fully paid: one money payment for the whole total.
    // (Any extra rows — e.g. a payment someone added by hand — are kept out of
    // it: the main payment covers what they don't.)
    const [[others]] = await conn.execute(
      'SELECT IFNULL(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ? AND id <> ?',
      [current.id, current.payment_id || 0]
    );
    const amount = round2(t.grand_total - Number(others.s));
    if (amount <= 0) throw new SaleError('Other payments on this sale already cover the new total. Remove them first.');
    const method = methodFor(acct.account, req.body.method) || current.payment_method || 'Cash';
    const reference = String(req.body.reference || '').trim() || null;
    if (current.payment_id) {
      await conn.execute(
        'UPDATE payments SET amount = ?, payment_date = ?, method = ?, reference = ?, account_id = ? WHERE id = ?',
        [amount, date, method, reference, acct.id ?? null, current.payment_id]
      );
    } else {
      const receipt = await nextReceiptNumber(conn, companyId);
      await conn.execute(
        `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes, recorded_by, is_discount, account_id, receipt_number)
         VALUES (?, ?, ?, ?, ?, 'Cash sale', ?, 0, ?, ?)`,
        [current.id, amount, date, method, reference, req.user.id, acct.id ?? null, receipt]
      );
    }
    await conn.commit();
    res.json(await loadSale(current.id));
  } catch (error) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    sendError(res, error, 'Failed to update the cash sale');
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/cash-sales/:id — admins only; goes to Recently Deleted with its
// items and payment, so a restore brings the money back too.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const result = await moveToRecycleBin('invoice', req.params.id, req);
    if (!result.affectedRows) return res.status(404).json({ error: 'Cash sale not found' });
    res.json({ message: 'Cash sale deleted.' });
  } catch (error) {
    sendError(res, error, 'Failed to delete the cash sale');
  }
});

module.exports = router;
