import React from 'react';
import { Company } from '../../types';
import { Payslip } from '../../types/payroll';
import { formatCurrency } from '../../utils/calculations';
import { periodLabel, formatYmd } from '../../utils/payroll';

// Printable A4 pay slip. The root carries `payslip-document` (the class the PDF
// generator looks for) unless overridden — on-screen previews pass a different
// class so only ONE `.payslip-document` is ever in the DOM during capture.
// Always light-themed: no `dark:` variants here.

interface PayslipDocumentProps {
  slip: Payslip;
  company: Company;
  /** Employee TPIN (lives on the staff record, not the slip snapshot). */
  employeeTpin?: string | null;
  rootClassName?: string;
}

const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };

const hexToRgb = (hex: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 17, g: 24, b: 39 };
};

const PayslipDocument: React.FC<PayslipDocumentProps> = ({
  slip, company, employeeTpin, rootClassName = 'payslip-document',
}) => {
  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  const logo = company.quote_logo_url || company.logo_url;
  const money = (n: number) => formatCurrency(Number(n) || 0);

  const allowances = slip.lines.filter((l) => l.type === 'allowance');
  const otherDeductions = slip.lines.filter((l) => l.type === 'deduction');
  const earnings: { label: string; amount: number; note?: string }[] = [
    { label: 'Basic salary', amount: slip.basic_salary },
    ...allowances.map((l) => ({ label: l.label, amount: l.amount, note: l.taxable === false ? 'non-taxable' : undefined })),
  ];
  const deductions: { label: string; amount: number }[] = [
    { label: 'PAYE (income tax)', amount: slip.paye },
    ...(slip.pension_employee ? [{ label: 'Pension (employee)', amount: slip.pension_employee }] : []),
    ...otherDeductions.map((l) => ({ label: l.label, amount: l.amount })),
  ];

  const infoRow = (label: string, value?: string | null) => (
    <div className="flex text-sm py-0.5">
      <span className="w-32 flex-shrink-0 text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value || '—'}</span>
    </div>
  );

  const table = (title: string, rows: { label: string; amount: number; note?: string }[], total: number, totalLabel: string) => (
    <div className="flex-1 min-w-0">
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: primary, color: secondary }}>
            <th className="px-3 py-2 text-left text-sm font-semibold">{title}</th>
            <th className="px-3 py-2 text-right text-sm font-semibold w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }}>
              <td className="px-3 py-2 text-sm border-b border-gray-100 text-gray-800">
                {r.label}
                {r.note && <span className="ml-1 text-xs text-gray-400">({r.note})</span>}
              </td>
              <td className="px-3 py-2 text-sm border-b border-gray-100 text-right tabular-nums text-gray-800">{money(r.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="px-3 py-2 text-sm font-semibold text-gray-900">{totalLabel}</td>
            <td className="px-3 py-2 text-sm font-semibold text-right tabular-nums text-gray-900">{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      {/* Header */}
      <div className="px-10 py-7 flex items-start justify-between" style={{ backgroundColor: tint(0.06) }}>
        <div className="flex flex-col">
          {logo ? (
            <img src={logo} alt={`${company.name} logo`} className="object-contain" style={{ maxHeight: 80, width: 'auto' }} />
          ) : (
            <div className="rounded-lg flex items-center justify-center font-bold"
              style={{ width: 70, height: 70, backgroundColor: primary, color: secondary, fontSize: 28 }}>
              {company.name.charAt(0)}
            </div>
          )}
          <div className="mt-3 max-w-sm">
            <p className="text-sm font-semibold text-gray-900">{company.name}</p>
            {company.address && <p className="text-sm text-gray-600 whitespace-pre-line">{company.address}</p>}
            {company.tpin && <p className="text-xs text-gray-500 mt-0.5">TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>PAY SLIP</h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">{periodLabel(slip.period)}</p>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
            {slip.status === 'paid' ? 'Paid' : 'Draft'}
          </p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        {/* Employee */}
        <div className="rounded-lg border p-4 mb-6 grid grid-cols-2 gap-x-8" style={{ borderColor: tint(0.25) }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>Employee</p>
            {infoRow('Name', slip.employee_name)}
            {infoRow('Staff code', slip.employee_code)}
            {infoRow('Position', slip.position)}
            {infoRow('TPIN', employeeTpin)}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>Payment</p>
            {infoRow('Bank', slip.bank_name)}
            {infoRow('Account', slip.bank_account)}
            {infoRow('Payment date', slip.payment_date ? formatYmd(slip.payment_date) : null)}
            {infoRow('Method', slip.payment_method)}
          </div>
        </div>

        {/* Earnings / deductions */}
        <div className="flex gap-6 items-start">
          {table('Earnings', earnings, slip.gross_pay, 'Gross pay')}
          {table('Deductions', deductions, slip.total_deductions, 'Total deductions')}
        </div>

        {/* Net pay */}
        <div className="mt-6 rounded-lg px-5 py-4 flex items-center justify-between" style={{ backgroundColor: primary, color: secondary }}>
          <span className="text-sm font-semibold uppercase tracking-wider">Net pay</span>
          <span className="text-2xl font-extrabold tabular-nums">{money(slip.net_pay)}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-500">Taxable pay</p>
            <p className="font-semibold text-gray-900 tabular-nums">{money(slip.taxable_pay)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-500">Days present</p>
            <p className="font-semibold text-gray-900">{slip.days_present ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-500">Days absent</p>
            <p className="font-semibold text-gray-900">{slip.days_absent ?? '—'}</p>
          </div>
        </div>
        {slip.pension_employer > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Employer pension contribution (not deducted from pay): {money(slip.pension_employer)}
          </p>
        )}
        {slip.notes && (
          <div className="mt-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: primary }}>Notes</p>
            <p className="whitespace-pre-wrap">{slip.notes}</p>
          </div>
        )}

        {/* Footer — pinned to the bottom */}
        <div className="mt-auto pt-12" data-pdf-keep>
          <div className="grid grid-cols-2 gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>Authorised By</p>
              <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">Name &amp; Signature</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>Received By</p>
              <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">Employee Signature</div>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-gray-400">This is a computer-generated pay slip.</p>
        </div>
      </div>
    </div>
  );
};

export default PayslipDocument;
