// Client-side mirror of utils/paye.js (server) — used ONLY for live preview.
// The server recomputes every total on save; keep the two in sync.
import { PayeBand, PayLine, PayrollSettings } from '../types/payroll';

export const DEFAULT_PAYE_BANDS: PayeBand[] = [
  { upTo: 150000, rate: 0 },
  { upTo: 500000, rate: 25 },
  { upTo: 2550000, rate: 30 },
  { upTo: null, rate: 35 },
];

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Sort bands (capped ascending, open-ended last); falls back to defaults if unusable. */
export function orderedBands(bands: PayeBand[] | null | undefined): PayeBand[] {
  if (!Array.isArray(bands) || !bands.length) return DEFAULT_PAYE_BANDS;
  const capped = bands.filter((b) => b.upTo !== null && Number.isFinite(Number(b.upTo)))
    .map((b) => ({ upTo: Number(b.upTo), rate: num(b.rate) }))
    .sort((a, b) => a.upTo - b.upTo);
  const open = bands.find((b) => b.upTo === null);
  if (!open) return DEFAULT_PAYE_BANDS;
  return [...capped, { upTo: null, rate: num(open.rate) }];
}

export function progressiveTax(taxable: number, bands: PayeBand[]): number {
  const t = Math.max(0, num(taxable));
  let prev = 0;
  let tax = 0;
  for (const b of orderedBands(bands)) {
    const cap = b.upTo === null ? Infinity : b.upTo;
    if (t > prev) tax += (Math.min(t, cap) - prev) * (num(b.rate) / 100);
    prev = cap;
    if (t <= cap) break;
  }
  return round2(tax);
}

export interface PayslipCalc {
  gross_pay: number;
  taxable_pay: number;
  paye: number;
  pension_employee: number;
  pension_employer: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
}

export function computePayslip(
  basicSalary: number,
  lines: PayLine[],
  settings: Pick<PayrollSettings, 'paye_bands' | 'pension_employee_percent' | 'pension_employer_percent'> | null,
): PayslipCalc {
  const basic = round2(Math.max(0, num(basicSalary)));
  const allowances = lines.filter((l) => l.type === 'allowance');
  const deductions = lines.filter((l) => l.type === 'deduction');
  const amt = (l: PayLine) => round2(Math.max(0, num(l.amount)));
  const allowanceTotal = allowances.reduce((s, l) => s + amt(l), 0);
  const taxableAllowances = allowances.filter((l) => l.taxable !== false).reduce((s, l) => s + amt(l), 0);
  const otherDed = deductions.reduce((s, l) => s + amt(l), 0);

  const gross_pay = round2(basic + allowanceTotal);
  const pension_employee = round2((basic * num(settings?.pension_employee_percent)) / 100);
  const pension_employer = round2((basic * num(settings?.pension_employer_percent)) / 100);
  const taxable_pay = round2(basic + taxableAllowances - pension_employee);
  const paye = progressiveTax(Math.max(0, taxable_pay), settings?.paye_bands || DEFAULT_PAYE_BANDS);
  const other_deductions = round2(otherDed);
  const total_deductions = round2(paye + pension_employee + other_deductions);
  return {
    gross_pay, taxable_pay, paye, pension_employee, pension_employer,
    other_deductions, total_deductions, net_pay: round2(gross_pay - total_deductions),
  };
}

// ---- Period helpers (timezone-free string math) ----
const pad = (n: number) => String(n).padStart(2, '0');

export const currentPeriod = (now = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** "2026-10" -> "October 2026" */
export const periodLabel = (period: string): string => {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/** Working days (Mon–Sat, Sundays off) in the whole month. */
export function workingDaysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return 0;
  const last = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= last; d += 1) if (new Date(y, m - 1, d).getDay() !== 0) count += 1;
  return count;
}

/** "2026-10-05" -> "5 Oct 2026" without timezone shifts. */
export const formatYmd = (s: string | null | undefined): string => {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const todayYmd = (now = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
