// Payroll types (kept separate from types/index.ts).

export interface PayeBand {
  /** Cumulative upper threshold of the band; null = no upper limit (top band). */
  upTo: number | null;
  /** Rate in percent. */
  rate: number;
}

export interface PayrollSettings {
  company_id: number;
  paye_bands: PayeBand[];
  pension_employee_percent: number;
  pension_employer_percent: number;
  /** True when the company hasn't saved its own bands yet (defaults in use). */
  is_default?: boolean;
}

export type PayLineType = 'allowance' | 'deduction';

export interface PayLine {
  type: PayLineType;
  label: string;
  amount: number;
  /** Allowances only: counts toward taxable pay. */
  taxable?: boolean;
}

export interface PayrollEmployee {
  id: number;
  company_id: number;
  name: string;
  code: string | null;
  active: boolean;
  position: string | null;
  basic_salary: number;
  bank_name: string | null;
  bank_account: string | null;
  employee_tpin: string | null;
  salary_lines: PayLine[];
}

export type PayslipStatus = 'draft' | 'paid';

export interface Payslip {
  id: number;
  company_id: number;
  created_by: number | null;
  employee_id: number | null;
  employee_name: string;
  employee_code: string | null;
  position: string | null;
  period: string;
  basic_salary: number;
  lines: PayLine[];
  gross_pay: number;
  taxable_pay: number;
  paye: number;
  pension_employee: number;
  pension_employer: number;
  total_deductions: number;
  net_pay: number;
  days_present: number | null;
  days_absent: number | null;
  status: PayslipStatus;
  payment_date: string | null;
  payment_method: string | null;
  bank_name: string | null;
  bank_account: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayslipList {
  period: string;
  payslips: Payslip[];
  /** Active staff with no pay slip for the period yet. */
  missing: PayrollEmployee[];
}

export interface PayrollSummary {
  period: string;
  count: number;
  paid_count: number;
  gross: number;
  paye: number;
  pension_employee: number;
  pension_employer: number;
  other_deductions: number;
  total_deductions: number;
  net: number;
}

export interface PayslipUpdate {
  basic_salary?: number;
  lines?: PayLine[];
  notes?: string | null;
  position?: string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  days_present?: number | null;
  days_absent?: number | null;
  reopen?: boolean;
}

export interface EmployeeSalaryUpdate {
  position?: string | null;
  basic_salary?: number;
  bank_name?: string | null;
  bank_account?: string | null;
  employee_tpin?: string | null;
  salary_lines?: PayLine[];
}
