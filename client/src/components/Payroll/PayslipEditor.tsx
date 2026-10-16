import React, { useMemo, useState } from 'react';
import { AlertCircle, CalendarMinus } from 'lucide-react';
import { Payslip, PayrollSettings } from '../../types/payroll';
import { updatePayslip } from '../../services/payrollApi';
import { formatCurrency } from '../../utils/calculations';
import { computePayslip, periodLabel, workingDaysInMonth, round2 } from '../../utils/payroll';
import { Modal, Field, inputCls, LinesEditor, LineDraft, toDrafts, fromDrafts, Flash } from './ui';

// Edit one pay slip with live recalculation (client mirror). The server
// recomputes the real totals on save.
const PayslipEditor: React.FC<{
  slip: Payslip;
  settings: PayrollSettings | null;
  primary: string;
  onClose: () => void;
  onSaved: (s: Payslip) => void;
  flash: Flash;
}> = ({ slip, settings, primary, onClose, onSaved, flash }) => {
  const paid = slip.status === 'paid';
  const [basic, setBasic] = useState(String(slip.basic_salary));
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(slip.lines));
  const [position, setPosition] = useState(slip.position || '');
  const [daysPresent, setDaysPresent] = useState(slip.days_present == null ? '' : String(slip.days_present));
  const [daysAbsent, setDaysAbsent] = useState(slip.days_absent == null ? '' : String(slip.days_absent));
  const [notes, setNotes] = useState(slip.notes || '');
  const [method, setMethod] = useState(slip.payment_method || '');
  const [payDate, setPayDate] = useState(slip.payment_date || '');
  const [bankName, setBankName] = useState(slip.bank_name || '');
  const [bankAccount, setBankAccount] = useState(slip.bank_account || '');
  const [saving, setSaving] = useState(false);

  const parsedLines = useMemo(() => fromDrafts(lines), [lines]);
  const calc = useMemo(() => computePayslip(Number(basic) || 0, parsedLines, settings), [basic, parsedLines, settings]);
  const workingDays = workingDaysInMonth(slip.period);
  const absentN = Math.max(0, Math.round(Number(daysAbsent) || 0));

  // Adds (or replaces) a deduction line = basic / working days × days absent.
  const addAbsence = () => {
    if (!absentN) return flash('error', 'Days absent is 0 — nothing to deduct.');
    if (!workingDays) return;
    const amount = Math.round(((Number(basic) || 0) / workingDays) * absentN);
    const line: LineDraft = { type: 'deduction', label: `Absence (${absentN} day${absentN === 1 ? '' : 's'})`, amount: String(amount), taxable: false };
    const idx = lines.findIndex((l) => l.type === 'deduction' && /^Absence \(/.test(l.label));
    setLines(idx >= 0 ? lines.map((l, i) => (i === idx ? line : l)) : [...lines, line]);
  };

  const save = async () => {
    const b = Number(basic);
    if (!Number.isFinite(b) || b < 0) return flash('error', 'Enter a valid basic salary.');
    setSaving(true);
    try {
      const intOrNull = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s) || 0)));
      const saved = await updatePayslip(slip.id, {
        basic_salary: round2(b),
        lines: parsedLines,
        position: position.trim() || null,
        days_present: intOrNull(daysPresent),
        days_absent: intOrNull(daysAbsent),
        notes: notes.trim() || null,
        payment_method: method.trim() || null,
        payment_date: payDate || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        ...(paid ? { reopen: true } : {}),
      });
      onSaved(saved);
    } catch (e: any) {
      flash('error', e?.response?.data?.error || 'Failed to save pay slip.');
    } finally { setSaving(false); }
  };

  const money = (n: number) => formatCurrency(n);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between text-sm py-1 ${strong ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <Modal title={`Pay slip · ${slip.employee_name} · ${periodLabel(slip.period)}`} onClose={onClose} wide="4xl">
      {paid && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <AlertCircle size={16} /> This pay slip is marked paid. Saving changes will reopen it as a draft.
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic salary"><input type="number" min={0} step="0.01" value={basic} onChange={(e) => setBasic(e.target.value)} className={`${inputCls} w-full`} /></Field>
            <Field label="Position"><input value={position} onChange={(e) => setPosition(e.target.value)} className={`${inputCls} w-full`} /></Field>
            <Field label="Days present"><input type="number" min={0} value={daysPresent} onChange={(e) => setDaysPresent(e.target.value)} className={`${inputCls} w-full`} /></Field>
            <Field label={`Days absent (of ${workingDays} working days)`}><input type="number" min={0} value={daysAbsent} onChange={(e) => setDaysAbsent(e.target.value)} className={`${inputCls} w-full`} /></Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Allowances &amp; deductions</span>
              <button type="button" onClick={addAbsence} disabled={!absentN}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                title="Deduction = basic ÷ working days in the month × days absent">
                <CalendarMinus size={13} /> Add absence deduction
              </button>
            </div>
            <LinesEditor lines={lines} onChange={setLines} primary={primary} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank"><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={`${inputCls} w-full`} /></Field>
            <Field label="Account number"><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={`${inputCls} w-full`} /></Field>
            <Field label="Payment method"><input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. Bank transfer / Cash" className={`${inputCls} w-full`} /></Field>
            <Field label="Payment date"><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={`${inputCls} w-full`} /></Field>
          </div>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} w-full`} /></Field>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 h-fit">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Live calculation</p>
          {row('Gross pay', money(calc.gross_pay), true)}
          {row('Taxable pay', money(calc.taxable_pay))}
          {row('PAYE', money(calc.paye))}
          {row(`Pension (${settings?.pension_employee_percent ?? 0}%)`, money(calc.pension_employee))}
          {row('Other deductions', money(calc.other_deductions))}
          {row('Total deductions', money(calc.total_deductions), true)}
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-baseline">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Net pay</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: primary }}>{money(calc.net_pay)}</span>
          </div>
          {calc.pension_employer > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Employer pension (not deducted): {money(calc.pension_employer)}</p>
          )}
          <p className="text-xs text-gray-400 mt-3">Totals are recalculated on the server when you save.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : paid ? 'Reopen & save' : 'Save'}
        </button>
      </div>
    </Modal>
  );
};

export default PayslipEditor;
