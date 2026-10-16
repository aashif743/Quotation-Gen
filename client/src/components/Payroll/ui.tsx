import React from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { PayLine } from '../../types/payroll';

// Small shared UI bits for the Payroll page (mirrors Attendance.tsx styling).
export const card = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700';
export const th = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
export const td = 'px-4 py-3 text-sm text-gray-800 dark:text-gray-200';
export const inputCls = 'px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0';
export const btnOutline = 'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40';

export type Flash = (t: 'success' | 'error', m: string) => void;

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <label className={`block ${className || ''}`}>
    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>
    {children}
  </label>
);

export const Spinner: React.FC = () => (
  <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: 'md' | 'xl' | '4xl' }> = ({ title, onClose, children, wide = 'md' }) => {
  const max = wide === '4xl' ? 'max-w-4xl' : wide === 'xl' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className={`${card} w-full ${max} p-5 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<{ title: string; body: string; confirmLabel?: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }> = ({ title, body, confirmLabel = 'Delete', danger = true, onCancel, onConfirm }) => (
  <Modal title={title} onClose={onCancel}>
    <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">{body}</p>
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
      <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm text-white font-medium ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'}`}>{confirmLabel}</button>
    </div>
  </Modal>
);

// Editable allowance / deduction rows. Amounts are kept as strings while typing
// so the field can be cleared; parsed with Number() by the caller.
export interface LineDraft { type: 'allowance' | 'deduction'; label: string; amount: string; taxable: boolean }

export const toDrafts = (lines: PayLine[]): LineDraft[] =>
  lines.map((l) => ({ type: l.type, label: l.label, amount: String(l.amount ?? ''), taxable: l.taxable !== false }));

export const fromDrafts = (drafts: LineDraft[]): PayLine[] =>
  drafts
    .filter((d) => d.label.trim() || Number(d.amount) > 0)
    .map((d) => ({
      type: d.type,
      label: d.label.trim() || (d.type === 'allowance' ? 'Allowance' : 'Deduction'),
      amount: Math.max(0, Number(d.amount) || 0),
      ...(d.type === 'allowance' ? { taxable: d.taxable } : {}),
    }));

export const LinesEditor: React.FC<{ lines: LineDraft[]; onChange: (l: LineDraft[]) => void; primary: string }> = ({ lines, onChange, primary }) => {
  const set = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (type: LineDraft['type']) => onChange([...lines, { type, label: '', amount: '', taxable: true }]);
  return (
    <div>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 mb-2">No allowances or deductions.</p>
      ) : (
        <div className="space-y-2 mb-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <select value={l.type} onChange={(e) => set(i, { type: e.target.value as LineDraft['type'] })} className={`${inputCls} w-32`}>
                <option value="allowance">Allowance</option>
                <option value="deduction">Deduction</option>
              </select>
              <input value={l.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={l.type === 'allowance' ? 'e.g. Housing' : 'e.g. Loan repayment'} className={`${inputCls} flex-1 min-w-[8rem]`} />
              <input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="0.00" className={`${inputCls} w-32 text-right`} />
              <label className={`flex items-center gap-1 text-xs w-20 ${l.type === 'allowance' ? 'text-gray-600 dark:text-gray-300' : 'invisible'}`}>
                <input type="checkbox" checked={l.taxable} onChange={(e) => set(i, { taxable: e.target.checked })} className="h-4 w-4 rounded border-gray-300" disabled={l.type !== 'allowance'} />
                Taxable
              </label>
              <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500" title="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => add('allowance')} className="flex items-center gap-1 text-sm hover:underline" style={{ color: primary }}><Plus size={14} /> Allowance</button>
        <button type="button" onClick={() => add('deduction')} className="flex items-center gap-1 text-sm hover:underline" style={{ color: primary }}><Plus size={14} /> Deduction</button>
      </div>
    </div>
  );
};
