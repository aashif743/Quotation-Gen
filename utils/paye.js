// Pure payroll calculations (no DB). Mirrored on the client in
// client/src/utils/payroll.ts for live preview — the server ALWAYS recomputes
// from these functions on save, so client totals are never trusted.

// Default Malawi monthly PAYE bands. Cumulative upper thresholds; `upTo: null`
// is the open-ended top band. Rates are percentages. MRA revises these, so
// they are editable per company in payroll_settings.paye_bands.
const DEFAULT_PAYE_BANDS = Object.freeze([
  { upTo: 150000, rate: 0 },
  { upTo: 500000, rate: 25 },
  { upTo: 2550000, rate: 30 },
  { upTo: null, rate: 35 },
]);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Validate + normalise a bands array. Throws an Error with a user-facing
// message when invalid (used by PUT /settings); `safeBands` falls back to the
// defaults for stored data.
function normalizeBands(input) {
  if (!Array.isArray(input) || input.length === 0) throw new Error('Add at least one PAYE band.');
  const bands = input.map((b, i) => {
    const raw = b && b.upTo;
    const upTo = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    const rate = Number(b && b.rate);
    if (upTo !== null && (!Number.isFinite(upTo) || upTo <= 0)) throw new Error(`Band ${i + 1}: threshold must be a positive number.`);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error(`Band ${i + 1}: rate must be between 0 and 100.`);
    return { upTo: upTo === null ? null : round2(upTo), rate: round2(rate) };
  });
  const open = bands.filter((b) => b.upTo === null);
  if (open.length !== 1) throw new Error('Exactly one band (the last) must have no upper limit.');
  const capped = bands.filter((b) => b.upTo !== null).sort((a, b) => a.upTo - b.upTo);
  for (let i = 1; i < capped.length; i += 1) {
    if (capped[i].upTo === capped[i - 1].upTo) throw new Error('Band thresholds must be different.');
  }
  return [...capped, open[0]];
}

function safeBands(input) {
  try {
    const v = typeof input === 'string' ? JSON.parse(input) : input;
    return normalizeBands(v);
  } catch {
    return DEFAULT_PAYE_BANDS.map((b) => ({ ...b }));
  }
}

// Progressive tax on a monthly taxable amount.
function progressiveTax(taxable, bands) {
  const t = Math.max(0, num(taxable));
  let prev = 0;
  let tax = 0;
  for (const b of bands) {
    const cap = b.upTo === null ? Infinity : b.upTo;
    if (t > prev) tax += (Math.min(t, cap) - prev) * (num(b.rate) / 100);
    prev = cap;
    if (t <= cap) break;
  }
  return round2(tax);
}

// Normalise recurring / pay-slip lines: [{type, label, amount, taxable}].
function normalizeLines(input) {
  let arr = input;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((l) => {
      const type = l && l.type === 'deduction' ? 'deduction' : 'allowance';
      const label = String((l && l.label) || '').trim().slice(0, 120);
      const amount = round2(Math.max(0, num(l && l.amount)));
      const line = { type, label, amount };
      if (type === 'allowance') line.taxable = l && l.taxable !== undefined ? !!l.taxable : true;
      return line;
    })
    .filter((l) => l.label !== '' || l.amount > 0)
    .map((l) => (l.label ? l : { ...l, label: l.type === 'allowance' ? 'Allowance' : 'Deduction' }))
    .slice(0, 50);
}

/**
 * gross   = basic + all allowances
 * pension = basic × employee% (deducted, tax-deductible); employer% informational
 * taxable = basic + taxable allowances − employee pension
 * paye    = progressive tax on max(0, taxable)
 * deductions = paye + employee pension + other deduction lines
 * net     = gross − deductions
 */
function computePayslip({ basic_salary, lines, settings }) {
  const basic = round2(Math.max(0, num(basic_salary)));
  const ls = normalizeLines(lines);
  const bands = safeBands(settings && settings.paye_bands);
  const empPct = num(settings && settings.pension_employee_percent);
  const erPct = num(settings && settings.pension_employer_percent);

  const allowances = ls.filter((l) => l.type === 'allowance');
  const otherDeductions = ls.filter((l) => l.type === 'deduction');
  const allowanceTotal = allowances.reduce((s, l) => s + l.amount, 0);
  const taxableAllowances = allowances.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const otherDeductionTotal = otherDeductions.reduce((s, l) => s + l.amount, 0);

  const gross_pay = round2(basic + allowanceTotal);
  const pension_employee = round2((basic * empPct) / 100);
  const pension_employer = round2((basic * erPct) / 100);
  const taxable_pay = round2(basic + taxableAllowances - pension_employee);
  const paye = progressiveTax(Math.max(0, taxable_pay), bands);
  const other_deductions = round2(otherDeductionTotal);
  const total_deductions = round2(paye + pension_employee + other_deductions);
  const net_pay = round2(gross_pay - total_deductions);

  return {
    basic_salary: basic,
    lines: ls,
    gross_pay,
    taxable_pay,
    paye,
    pension_employee,
    pension_employer,
    other_deductions,
    total_deductions,
    net_pay,
  };
}

// ---- Calendar helpers (pure, timezone-free: operate on Y/M/D integers) ----
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const isValidPeriod = (p) => typeof p === 'string' && PERIOD_RE.test(p);

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// First and last 'YYYY-MM-DD' of a 'YYYY-MM' period.
function periodBounds(period) {
  const [y, m] = period.split('-').map(Number);
  const last = daysInMonth(y, m);
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/**
 * Working days (Mon–Sat; Sundays off) in a period. If `todayYmd` is given and
 * falls inside the period, count only up to and including today; a period
 * entirely in the future has 0 elapsed working days.
 */
function workingDaysInPeriod(period, todayYmd) {
  const [y, m] = period.split('-').map(Number);
  let lastDay = daysInMonth(y, m);
  if (todayYmd) {
    const cur = todayYmd.slice(0, 7);
    if (cur === period) lastDay = Number(todayYmd.slice(8, 10));
    else if (cur < period) return 0;
  }
  let count = 0;
  for (let d = 1; d <= lastDay; d += 1) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) count += 1;
  }
  return count;
}

module.exports = {
  DEFAULT_PAYE_BANDS,
  round2,
  normalizeBands,
  safeBands,
  progressiveTax,
  normalizeLines,
  computePayslip,
  isValidPeriod,
  periodBounds,
  workingDaysInPeriod,
};
