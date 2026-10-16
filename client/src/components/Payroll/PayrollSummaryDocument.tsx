import React from 'react';
import { Company } from '../../types';
import { Payslip } from '../../types/payroll';
import { formatCurrency } from '../../utils/calculations';
import { periodLabel } from '../../utils/payroll';

// Month payroll register (one row per pay slip). Uses the `payslip-document`
// root class so the shared PDF capture recognises it; it is only ever mounted
// off-screen for the duration of a download.

interface Props {
  period: string;
  slips: Payslip[];
  company: Company;
}

const PayrollSummaryDocument: React.FC<Props> = ({ period, slips, company }) => {
  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const logo = company.quote_logo_url || company.logo_url;
  const money = (n: number) => formatCurrency(Number(n) || 0);
  const sum = (k: keyof Payslip) => slips.reduce((s, p) => s + (Number(p[k]) || 0), 0);
  const other = (p: Payslip) => p.total_deductions - p.paye - p.pension_employee;
  const totals = {
    basic: sum('basic_salary'), gross: sum('gross_pay'), paye: sum('paye'),
    pension: sum('pension_employee'), other: slips.reduce((s, p) => s + other(p), 0),
    net: sum('net_pay'),
  };
  const th = 'px-2 py-2 text-xs font-semibold';
  const td = 'px-2 py-1.5 text-xs border-b border-gray-100 text-gray-800';

  return (
    <div className="payslip-document bg-white text-gray-800 flex flex-col" style={{ aspectRatio: '210 / 297' }}>
      <div className="px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {logo && <img src={logo} alt="" className="object-contain" style={{ maxHeight: 56, width: 'auto' }} />}
          <div>
            <p className="font-semibold text-gray-900">{company.name}</p>
            {company.tpin && <p className="text-xs text-gray-500">TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-extrabold" style={{ color: primary }}>PAYROLL SUMMARY</h2>
          <p className="text-sm font-semibold text-gray-900">{periodLabel(period)}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />
      <div className="px-8 py-6 flex-1 flex flex-col">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: primary, color: secondary }}>
              <th className={`${th} text-left`}>#</th>
              <th className={`${th} text-left`}>Staff</th>
              <th className={`${th} text-right`}>Basic</th>
              <th className={`${th} text-right`}>Gross</th>
              <th className={`${th} text-right`}>PAYE</th>
              <th className={`${th} text-right`}>Pension</th>
              <th className={`${th} text-right`}>Other ded.</th>
              <th className={`${th} text-right`}>Net pay</th>
              <th className={`${th} text-center`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {slips.length === 0 ? (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-xs text-gray-400">No pay slips for this month.</td></tr>
            ) : slips.map((p, i) => (
              <tr key={p.id}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  <div className="font-medium">{p.employee_name}</div>
                  {p.position && <div className="text-gray-500">{p.position}</div>}
                </td>
                <td className={`${td} text-right tabular-nums`}>{money(p.basic_salary)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(p.gross_pay)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(p.paye)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(p.pension_employee)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(other(p))}</td>
                <td className={`${td} text-right tabular-nums font-semibold`}>{money(p.net_pay)}</td>
                <td className={`${td} text-center capitalize`}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-auto pt-6" data-pdf-keep>
          <table className="w-full">
            <tbody>
              {([
                ['Staff paid', String(slips.length)],
                ['Total basic', money(totals.basic)],
                ['Total gross', money(totals.gross)],
                ['Total PAYE', money(totals.paye)],
                ['Total pension (employee)', money(totals.pension)],
                ['Total other deductions', money(totals.other)],
              ] as const).map(([l, v]) => (
                <tr key={l}>
                  <td className="py-1 text-sm text-gray-600">{l}</td>
                  <td className="py-1 text-sm text-right font-medium tabular-nums text-gray-900">{v}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: primary, color: secondary }}>
                <td className="px-3 py-2 text-sm font-semibold uppercase tracking-wider">Total net pay</td>
                <td className="px-3 py-2 text-lg font-extrabold text-right tabular-nums">{money(totals.net)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-6 text-center text-xs text-gray-400">Computer-generated payroll summary.</p>
        </div>
      </div>
    </div>
  );
};

export default PayrollSummaryDocument;
