const express = require('express');
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { requireCompanyAccess } = require('../utils/tenancy');

const router = express.Router();

router.use(isAuthenticated);
router.use(requireCompanyAccess); // validates ?company_id belongs to the caller's org

// GET /api/dashboard?company_id=X
// One aggregated payload for the dashboard. Role-scoped: staff see only their
// own documents; admins see the whole company.
router.get('/', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const isAdmin = req.user.role === 'admin';
    const uid = req.user.id;

    // `own` appends a created_by filter for staff; args() supplies the params.
    const own = isAdmin ? '' : ' AND created_by = ?';
    const ownAs = (alias) => (isAdmin ? '' : ` AND ${alias}.created_by = ?`);
    const args = (...extra) => (isAdmin ? [companyId, ...extra] : [companyId, ...extra, uid]);

    const num = (v) => Number(v || 0);
    const one = async (sql, params) => (await db.execute(sql, params))[0][0];

    // ---- Headline totals ----
    const q  = await one(`SELECT COUNT(*) c, IFNULL(SUM(grand_total),0) t FROM quotations WHERE company_id=?${own}`, args());
    const inv = await one(`SELECT COUNT(*) c, IFNULL(SUM(grand_total),0) t FROM invoices WHERE company_id=?${own}`, args());
    const paid = await one(
      `SELECT IFNULL(SUM(p.amount),0) t
         FROM payments p JOIN invoices i ON p.invoice_id=i.id
        WHERE i.company_id=?${ownAs('i')}`, args());
    const exp = await one(`SELECT COUNT(*) c, IFNULL(SUM(amount),0) t FROM expenses WHERE company_id=?${own}`, args());
    const pur = await one(`SELECT COUNT(*) c, IFNULL(SUM(grand_total),0) t FROM purchases WHERE company_id=?${own}`, args());
    const dn  = await one(`SELECT COUNT(*) c FROM delivery_notes WHERE company_id=?${own}`, args());
    const cl  = await one(`SELECT COUNT(*) c FROM clients WHERE company_id=?${own}`, args());
    const petty = await one(
      `SELECT IFNULL(SUM(CASE WHEN type='in' THEN amount ELSE -amount END),0) bal FROM petty_cash WHERE company_id=?`, [companyId]);

    const totalInvoiced = num(inv.t);
    const totalPaid = num(paid.t);
    const outstanding = Math.max(0, totalInvoiced - totalPaid);

    // ---- This month vs last month (invoiced) for the trend badge ----
    const monthSum = async (table, offset) => num((await one(
      `SELECT IFNULL(SUM(grand_total),0) t FROM ${table}
        WHERE company_id=?${own}
          AND date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${offset} MONTH), '%Y-%m-01')
          AND date <  DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${offset - 1} MONTH), '%Y-%m-01')`, args())).t);
    const invThisMonth = await monthSum('invoices', 0);
    const invLastMonth = await monthSum('invoices', 1);

    // ---- 12-month series: invoiced, quoted, expenses ----
    const series = async (table, col) => {
      const [rows] = await db.execute(
        `SELECT DATE_FORMAT(date,'%Y-%m') ym, IFNULL(SUM(${col}),0) t
           FROM ${table}
          WHERE company_id=?${own} AND date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01')
          GROUP BY ym`, args());
      const map = {}; rows.forEach((r) => { map[r.ym] = num(r.t); });
      return map;
    };
    const invMap = await series('invoices', 'grand_total');
    const quoMap = await series('quotations', 'grand_total');
    const expMap = await series('expenses', 'amount');
    const revenueSeries = [];
    const now = new Date();
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      revenueSeries.push({
        month: d.toLocaleString('en', { month: 'short' }),
        ym,
        invoiced: invMap[ym] || 0,
        quoted: quoMap[ym] || 0,
        expenses: expMap[ym] || 0,
      });
    }

    // ---- Payment status breakdown (invoice counts) ----
    const [statusRows] = await db.execute(
      `SELECT CASE WHEN IFNULL(pp.paid,0) >= i.grand_total THEN 'paid'
                   WHEN IFNULL(pp.paid,0) > 0 THEN 'partial' ELSE 'pending' END st, COUNT(*) c
         FROM invoices i
         LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) pp ON pp.invoice_id=i.id
        WHERE i.company_id=?${ownAs('i')}
        GROUP BY st`, args());
    const paymentStatus = { paid: 0, partial: 0, pending: 0 };
    statusRows.forEach((r) => { paymentStatus[r.st] = num(r.c); });

    // ---- Expenses by category ----
    const [expCat] = await db.execute(
      `SELECT IFNULL(NULLIF(category,''),'Other') category, IFNULL(SUM(amount),0) amount
         FROM expenses WHERE company_id=?${own} GROUP BY category ORDER BY amount DESC LIMIT 6`, args());

    // ---- Top clients by invoiced ----
    const [topClients] = await db.execute(
      `SELECT client_name name, IFNULL(SUM(grand_total),0) invoiced, COUNT(*) invoices
         FROM invoices WHERE company_id=?${own} AND client_name IS NOT NULL AND client_name<>''
        GROUP BY client_name ORDER BY invoiced DESC LIMIT 5`, args());

    // ---- Recent invoices ----
    const [recent] = await db.execute(
      `SELECT i.id, i.invoice_number, i.client_name, i.date, i.grand_total,
              IFNULL(pp.paid,0) amount_paid,
              CASE WHEN IFNULL(pp.paid,0) >= i.grand_total THEN 'paid'
                   WHEN IFNULL(pp.paid,0) > 0 THEN 'partial' ELSE 'pending' END payment_status
         FROM invoices i
         LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) pp ON pp.invoice_id=i.id
        WHERE i.company_id=?${ownAs('i')}
        ORDER BY i.created_at DESC LIMIT 6`, args());

    res.json({
      totals: {
        quotations: num(q.c), total_quoted: num(q.t),
        invoices: num(inv.c), total_invoiced: totalInvoiced,
        total_paid: totalPaid, outstanding,
        expenses: num(exp.c), total_expenses: num(exp.t),
        purchases: num(pur.c), total_purchases: num(pur.t),
        delivery_notes: num(dn.c), clients: num(cl.c),
        petty_balance: num(petty.bal),
        net: Math.round((totalInvoiced - num(exp.t) - num(pur.t)) * 100) / 100,
      },
      trend: {
        invoiced_this_month: invThisMonth,
        invoiced_last_month: invLastMonth,
        invoiced_change_pct: invLastMonth > 0
          ? Math.round(((invThisMonth - invLastMonth) / invLastMonth) * 1000) / 10
          : (invThisMonth > 0 ? 100 : 0),
      },
      revenue_series: revenueSeries,
      payment_status: paymentStatus,
      expenses_by_category: expCat.map((r) => ({ category: r.category, amount: num(r.amount) })),
      top_clients: topClients.map((r) => ({ name: r.name, invoiced: num(r.invoiced), invoices: num(r.invoices) })),
      recent_invoices: recent,
    });
  } catch (error) {
    console.error('Error building dashboard:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
