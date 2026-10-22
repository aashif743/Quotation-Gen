const express = require('express');
const db = require('../config/database');
const { isAuthenticated, canAccessPayroll } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const {
  DEFAULT_PAYE_BANDS, normalizeBands, safeBands, normalizeLines, computePayslip,
  isValidPeriod, periodBounds, workingDaysInPeriod, round2,
} = require('../utils/paye');

// Payroll (staff salary + pay slips). Salary data → ADMIN ONLY.
// Staff come from the attendance roster (attendance_employees); this router
// only ever UPDATEs the salary columns on that table — never inserts/deletes.
const router = express.Router();

router.use(isAuthenticated);
router.use(canAccessPayroll);
router.use(requireCompanyAccess);

// Any :id is a pay slip; any :employeeId an attendance staff member — both must
// belong to the caller's organization (404 otherwise).
router.param('id', companyTableParamGuard('payslips'));
router.param('employeeId', companyTableParamGuard('attendance_employees'));

// requireCompanyAccess validates company_id when present; list endpoints also
// need it to be present.
const companyIdOf = (req) => {
  const raw = (req.body && req.body.company_id) != null ? req.body.company_id : req.query.company_id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toNum = (v) => (v == null ? 0 : Number(v));
const strOrNull = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// MySQL's idea of "today" — the same clock attendance uses (CURDATE()).
async function dbToday() {
  const [r] = await db.execute("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
  return r[0].d;
}

// ---- Settings ----
async function getSettings(companyId) {
  const [rows] = await db.execute(
    'SELECT paye_bands, pension_employee_percent, pension_employer_percent FROM payroll_settings WHERE company_id = ?',
    [companyId]);
  const row = rows[0];
  return {
    company_id: Number(companyId),
    paye_bands: row && row.paye_bands ? safeBands(row.paye_bands) : DEFAULT_PAYE_BANDS.map((b) => ({ ...b })),
    pension_employee_percent: row ? toNum(row.pension_employee_percent) : 0,
    pension_employer_percent: row ? toNum(row.pension_employer_percent) : 0,
    is_default: !row || !row.paye_bands,
  };
}

router.get('/settings', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    res.json(await getSettings(companyId));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch payroll settings' }); }
});

router.put('/settings', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    let bands;
    try { bands = normalizeBands(req.body.paye_bands); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    const pct = (v) => Math.min(100, Math.max(0, round2(Number(v) || 0)));
    const emp = pct(req.body.pension_employee_percent);
    const er = pct(req.body.pension_employer_percent);
    await db.execute(
      `INSERT INTO payroll_settings (company_id, paye_bands, pension_employee_percent, pension_employer_percent)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE paye_bands = VALUES(paye_bands),
         pension_employee_percent = VALUES(pension_employee_percent),
         pension_employer_percent = VALUES(pension_employer_percent)`,
      [companyId, JSON.stringify(bands), emp, er]);
    res.json(await getSettings(companyId));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to save payroll settings' }); }
});

// ---- Staff salaries (attendance roster) ----
const EMP_COLS = `id, company_id, name, code, active, position, basic_salary, bank_name, bank_account,
  employee_tpin, salary_lines`;

const serializeEmployee = (r) => ({
  id: r.id,
  company_id: r.company_id,
  name: r.name,
  code: r.code,
  active: !!r.active,
  position: r.position,
  basic_salary: toNum(r.basic_salary),
  bank_name: r.bank_name,
  bank_account: r.bank_account,
  employee_tpin: r.employee_tpin,
  salary_lines: normalizeLines(r.salary_lines),
});

router.get('/employees', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    const [rows] = await db.execute(
      `SELECT ${EMP_COLS} FROM attendance_employees WHERE company_id = ? ORDER BY active DESC, name`, [companyId]);
    res.json(rows.map(serializeEmployee));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch staff' }); }
});

// Updates ONLY the salary columns (name/code/fingerprint ID are managed in Attendance).
router.put('/employees/:employeeId', async (req, res) => {
  try {
    const b = req.body || {};
    const fields = [];
    const vals = [];
    if (b.position !== undefined) { fields.push('position = ?'); vals.push(strOrNull(b.position, 120)); }
    if (b.basic_salary !== undefined) {
      const n = Number(b.basic_salary);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Basic salary must be a positive number' });
      fields.push('basic_salary = ?'); vals.push(round2(n));
    }
    if (b.bank_name !== undefined) { fields.push('bank_name = ?'); vals.push(strOrNull(b.bank_name, 120)); }
    if (b.bank_account !== undefined) { fields.push('bank_account = ?'); vals.push(strOrNull(b.bank_account, 60)); }
    if (b.employee_tpin !== undefined) { fields.push('employee_tpin = ?'); vals.push(strOrNull(b.employee_tpin, 40)); }
    if (b.salary_lines !== undefined) { fields.push('salary_lines = ?'); vals.push(JSON.stringify(normalizeLines(b.salary_lines))); }
    if (!fields.length) return res.status(400).json({ error: 'No changes' });
    vals.push(req.params.employeeId);
    await db.execute(`UPDATE attendance_employees SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [rows] = await db.execute(`SELECT ${EMP_COLS} FROM attendance_employees WHERE id = ?`, [req.params.employeeId]);
    res.json(serializeEmployee(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update salary details' }); }
});

// ---- Pay slips ----
// `lines` is a MySQL reserved word — always backtick it.
const SLIP_COLS = `id, company_id, created_by, employee_id, employee_name, employee_code, position, period,
  basic_salary, \`lines\`, gross_pay, taxable_pay, paye, pension_employee, pension_employer,
  total_deductions, net_pay, days_present, days_absent, status,
  DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, payment_method, bank_name, bank_account, notes,
  created_at, updated_at`;

const serializeSlip = (r) => ({
  ...r,
  basic_salary: toNum(r.basic_salary),
  lines: normalizeLines(r.lines),
  gross_pay: toNum(r.gross_pay),
  taxable_pay: toNum(r.taxable_pay),
  paye: toNum(r.paye),
  pension_employee: toNum(r.pension_employee),
  pension_employer: toNum(r.pension_employer),
  total_deductions: toNum(r.total_deductions),
  net_pay: toNum(r.net_pay),
});

async function fetchSlip(id) {
  const [rows] = await db.execute(`SELECT ${SLIP_COLS} FROM payslips WHERE id = ?`, [id]);
  return rows[0] ? serializeSlip(rows[0]) : null;
}

router.get('/payslips', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    const { period } = req.query;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });
    const [slips] = await db.execute(
      `SELECT ${SLIP_COLS} FROM payslips WHERE company_id = ? AND period = ? ORDER BY employee_name`,
      [companyId, period]);
    const [missing] = await db.execute(
      `SELECT ${EMP_COLS} FROM attendance_employees e
        WHERE e.company_id = ? AND e.active = 1
          AND NOT EXISTS (SELECT 1 FROM payslips p WHERE p.company_id = e.company_id AND p.employee_id = e.id AND p.period = ?)
        ORDER BY e.name`, [companyId, period]);
    res.json({ period, payslips: slips.map(serializeSlip), missing: missing.map(serializeEmployee) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch pay slips' }); }
});

// Create DRAFT slips for every active staff member without one for the period.
// Existing slips are never touched (INSERT IGNORE on the unique key also
// guards against a double-click race).
router.post('/payslips/generate', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    const { period } = req.body || {};
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });

    const settings = await getSettings(companyId);
    const [emps] = await db.execute(
      `SELECT ${EMP_COLS} FROM attendance_employees e
        WHERE e.company_id = ? AND e.active = 1
          AND NOT EXISTS (SELECT 1 FROM payslips p WHERE p.company_id = e.company_id AND p.employee_id = e.id AND p.period = ?)
        ORDER BY e.name`, [companyId, period]);
    if (!emps.length) return res.json({ created: 0, skipped: 0, message: 'Every active staff member already has a pay slip for this month.' });

    // Days present = distinct calendar days with at least one punch. Dates are
    // compared as naive wall-clock values in SQL (no JS timezone conversion).
    const { from, to } = periodBounds(period);
    const [att] = await db.execute(
      `SELECT employee_id, COUNT(DISTINCT DATE(punch_time)) AS days
         FROM attendance_punches
        WHERE company_id = ? AND employee_id IS NOT NULL AND DATE(punch_time) BETWEEN ? AND ?
        GROUP BY employee_id`, [companyId, from, to]);
    const present = {};
    att.forEach((r) => { present[r.employee_id] = Number(r.days) || 0; });
    const workingDays = workingDaysInPeriod(period, await dbToday());

    let created = 0;
    for (const raw of emps) {
      const e = serializeEmployee(raw);
      const calc = computePayslip({ basic_salary: e.basic_salary, lines: e.salary_lines, settings });
      const daysPresent = present[e.id] || 0;
      const daysAbsent = Math.max(0, workingDays - daysPresent);
      const [r] = await db.execute(
        `INSERT IGNORE INTO payslips
           (company_id, created_by, employee_id, employee_name, employee_code, position, period,
            basic_salary, \`lines\`, gross_pay, taxable_pay, paye, pension_employee, pension_employer,
            total_deductions, net_pay, days_present, days_absent, status, bank_name, bank_account)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [companyId, req.user.id, e.id, e.name, e.code || null, e.position || null, period,
          calc.basic_salary, JSON.stringify(calc.lines), calc.gross_pay, calc.taxable_pay, calc.paye,
          calc.pension_employee, calc.pension_employer, calc.total_deductions, calc.net_pay,
          daysPresent, daysAbsent, e.bank_name || null, e.bank_account || null]);
      created += r.affectedRows;
    }
    res.status(201).json({ created, skipped: emps.length - created, working_days: workingDays });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to generate pay slips' }); }
});

router.get('/payslips/:id', async (req, res) => {
  try {
    const slip = await fetchSlip(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Pay slip not found' });
    res.json(slip);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch pay slip' }); }
});

// Edit a draft (recomputed server-side). A paid slip can only be edited when
// the body explicitly sets `reopen: true`, which moves it back to draft.
router.put('/payslips/:id', async (req, res) => {
  try {
    const slip = await fetchSlip(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Pay slip not found' });
    const b = req.body || {};
    if (slip.status === 'paid' && b.reopen !== true) {
      return res.status(409).json({ error: 'This pay slip is marked paid. Reopen it before editing.' });
    }
    const basic = b.basic_salary !== undefined ? Number(b.basic_salary) : slip.basic_salary;
    if (!Number.isFinite(basic) || basic < 0) return res.status(400).json({ error: 'Basic salary must be a positive number' });
    const lines = b.lines !== undefined ? b.lines : slip.lines;
    const settings = await getSettings(slip.company_id);
    const calc = computePayslip({ basic_salary: basic, lines, settings });

    const intOrNull = (v, cur) => {
      if (v === undefined) return cur;
      if (v === null || v === '') return null;
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : cur;
    };
    const pick = (key, max) => (b[key] !== undefined ? strOrNull(b[key], max) : slip[key]);
    let paymentDate = slip.payment_date;
    if (b.payment_date !== undefined) {
      if (b.payment_date === null || b.payment_date === '') paymentDate = null;
      else if (isYmd(b.payment_date)) paymentDate = b.payment_date;
      else return res.status(400).json({ error: 'payment_date must be YYYY-MM-DD' });
    }

    await db.execute(
      `UPDATE payslips SET basic_salary = ?, \`lines\` = ?, gross_pay = ?, taxable_pay = ?, paye = ?,
         pension_employee = ?, pension_employer = ?, total_deductions = ?, net_pay = ?,
         days_present = ?, days_absent = ?, position = ?, notes = ?, payment_date = ?, payment_method = ?,
         bank_name = ?, bank_account = ?, status = ?
       WHERE id = ?`,
      [calc.basic_salary, JSON.stringify(calc.lines), calc.gross_pay, calc.taxable_pay, calc.paye,
        calc.pension_employee, calc.pension_employer, calc.total_deductions, calc.net_pay,
        intOrNull(b.days_present, slip.days_present), intOrNull(b.days_absent, slip.days_absent),
        pick('position', 120), b.notes !== undefined ? (strOrNull(b.notes, 5000)) : slip.notes,
        paymentDate, pick('payment_method', 60), pick('bank_name', 120), pick('bank_account', 60),
        'draft', req.params.id]);
    res.json(await fetchSlip(req.params.id));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update pay slip' }); }
});

router.patch('/payslips/:id/status', async (req, res) => {
  try {
    const slip = await fetchSlip(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Pay slip not found' });
    const { status, payment_date, payment_method } = req.body || {};
    if (status !== 'paid' && status !== 'draft') return res.status(400).json({ error: "status must be 'paid' or 'draft'" });
    if (status === 'paid') {
      if (payment_date != null && payment_date !== '' && !isYmd(payment_date)) {
        return res.status(400).json({ error: 'payment_date must be YYYY-MM-DD' });
      }
      const date = isYmd(payment_date) ? payment_date : (slip.payment_date || await dbToday());
      const method = payment_method !== undefined ? strOrNull(payment_method, 60) : slip.payment_method;
      await db.execute('UPDATE payslips SET status = ?, payment_date = ?, payment_method = ? WHERE id = ?',
        ['paid', date, method, req.params.id]);
    } else {
      // Reopen: keep the payment details so re-marking paid is one click.
      await db.execute("UPDATE payslips SET status = 'draft' WHERE id = ?", [req.params.id]);
    }
    res.json(await fetchSlip(req.params.id));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update status' }); }
});

// Only drafts can be deleted — paid slips are payroll history and must be
// reopened first.
router.delete('/payslips/:id', async (req, res) => {
  try {
    const [r] = await db.execute("DELETE FROM payslips WHERE id = ? AND status = 'draft'", [req.params.id]);
    if (!r.affectedRows) return res.status(409).json({ error: 'Only draft pay slips can be deleted. Reopen it first.' });
    res.json({ message: 'Pay slip deleted.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to delete pay slip' }); }
});

// ---- Month summary ----
router.get('/summary', async (req, res) => {
  try {
    const companyId = companyIdOf(req);
    const { period } = req.query;
    if (!companyId) return res.status(400).json({ error: 'company_id is required' });
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'period must be YYYY-MM' });
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS count, COALESCE(SUM(status = 'paid'), 0) AS paid_count,
              COALESCE(SUM(gross_pay), 0) AS gross, COALESCE(SUM(paye), 0) AS paye,
              COALESCE(SUM(pension_employee), 0) AS pension_employee,
              COALESCE(SUM(pension_employer), 0) AS pension_employer,
              COALESCE(SUM(total_deductions), 0) AS total_deductions, COALESCE(SUM(net_pay), 0) AS net
         FROM payslips WHERE company_id = ? AND period = ?`, [companyId, period]);
    const s = rows[0];
    const paye = toNum(s.paye);
    const pensionEmp = toNum(s.pension_employee);
    const totalDed = toNum(s.total_deductions);
    res.json({
      period,
      count: Number(s.count) || 0,
      paid_count: Number(s.paid_count) || 0,
      gross: toNum(s.gross),
      paye,
      pension_employee: pensionEmp,
      pension_employer: toNum(s.pension_employer),
      other_deductions: round2(totalDed - paye - pensionEmp),
      total_deductions: totalDed,
      net: toNum(s.net),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to build payroll summary' }); }
});

module.exports = router;
