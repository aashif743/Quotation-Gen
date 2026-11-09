import React, { useEffect, useState } from 'react';
import {
  MoneyAccount, AccountType, AccountTxnKind, createAccount, updateAccount, createAccountTxn, updateAccountTxn,
} from '../../services/accountsApi';
import { formatCurrency } from '../../utils/calculations';
import CurrencyInput from '../common/CurrencyInput';
import { X, Landmark, Smartphone, Banknote, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Loader2, AlertTriangle } from 'lucide-react';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1';

const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-gray-900/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">{children}</div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">{footer}</div>
      </div>
    </div>
  );
};

const TYPE_CHOICES: { type: AccountType; label: string; hint: string; Icon: typeof Landmark }[] = [
  { type: 'bank', label: 'Bank account', hint: 'NBM, Standard Bank, FDH…', Icon: Landmark },
  { type: 'mobile', label: 'Mobile money', hint: 'Airtel Money, TNM Mpamba', Icon: Smartphone },
  { type: 'cash', label: 'Cash', hint: 'Cash on hand, till', Icon: Banknote },
];

export const AccountFormModal: React.FC<{
  companyId: number;
  account?: MoneyAccount | null;
  primary: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ companyId, account, primary, onClose, onSaved }) => {
  const isEdit = !!account;
  const isPetty = account?.type === 'petty_cash';
  const [type, setType] = useState<AccountType>(account?.type || 'bank');
  const [name, setName] = useState(account?.name || '');
  const [bankName, setBankName] = useState(account?.bank_name || '');
  const [branch, setBranch] = useState(account?.branch || '');
  const [number, setNumber] = useState(account?.account_number || '');
  const [opening, setOpening] = useState<number>(account ? Number(account.opening_balance) : 0);
  const [openingDate, setOpeningDate] = useState(account?.opening_date || todayIso());
  const [notes, setNotes] = useState(account?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('Give the account a name, e.g. "NBM Current" or "Airtel Money".'); return; }
    setSaving(true); setError('');
    const body = {
      name: name.trim(), bank_name: bankName.trim() || null, branch: branch.trim() || null, account_number: number.trim() || null,
      opening_balance: opening, opening_date: openingDate || null, notes: notes.trim() || null,
    };
    try {
      if (isEdit) await updateAccount(account!.id, body);
      else await createAccount({ company_id: companyId, type, ...body });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save the account.');
      setSaving(false);
    }
  };

  return (
    <Shell
      title={isEdit ? `Edit ${account!.name}` : 'Add account'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: primary }}>
          {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} {isEdit ? 'Save changes' : 'Add account'}
        </button>
      </>}
    >
      {error && <div className="p-2.5 rounded-lg text-sm bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-300">{error}</div>}
      {!isEdit && (
        <div className="grid grid-cols-3 gap-2">
          {TYPE_CHOICES.map(({ type: t, label, hint, Icon }) => (
            <button
              key={t} type="button" onClick={() => setType(t)}
              className={`text-left p-2.5 rounded-xl border-2 transition-colors ${type === t ? 'border-current' : 'border-gray-200 hover:border-gray-300'}`}
              style={type === t ? { color: primary } : undefined}
            >
              <Icon className="h-5 w-5 mb-1" />
              <div className="text-sm font-semibold text-gray-900">{label}</div>
              <div className="text-[11px] text-gray-500 leading-tight">{hint}</div>
            </button>
          ))}
        </div>
      )}
      <div>
        <label className={labelCls}>Account name *</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder={type === 'bank' ? 'e.g. NBM Current Account' : type === 'mobile' ? 'e.g. Airtel Money – Office' : 'e.g. Cash on hand'} />
      </div>
      {type !== 'cash' && !isPetty && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{type === 'mobile' ? 'Provider' : 'Bank'}</label>
            <input className={inputCls} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={type === 'mobile' ? 'Airtel Money' : 'National Bank of Malawi'} />
          </div>
          <div>
            <label className={labelCls}>{type === 'mobile' ? 'Phone number' : 'Account number'}</label>
            <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={type === 'mobile' ? '099…' : '1001234567'} />
          </div>
          {type === 'bank' && (
            <div className="col-span-2">
              <label className={labelCls}>Branch</label>
              <input className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Blantyre" />
            </div>
          )}
        </div>
      )}
      {isPetty ? (
        <p className="text-xs text-gray-500 rounded-lg bg-gray-50 p-2.5">
          The petty cash balance comes from the Petty Cash page (top-ups and payouts), so it has no separate opening balance.
        </p>
      ) : (
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Opening balance</label>
              <CurrencyInput value={opening} onChange={setOpening} className={`${inputCls} text-right tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>As at</label>
              <input type="date" className={inputCls} value={openingDate || ''} onChange={(e) => setOpeningDate(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-500 leading-snug">
            The real balance on this date, from your bank statement, Airtel Money balance or a cash count. Payments and expenses recorded
            in the system with this account then move it automatically.
          </p>
        </div>
      )}
      <div>
        <label className={labelCls}>Notes</label>
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
    </Shell>
  );
};

const KIND_TABS: { kind: AccountTxnKind; label: string; Icon: typeof ArrowLeftRight }[] = [
  { kind: 'transfer', label: 'Transfer', Icon: ArrowLeftRight },
  { kind: 'deposit', label: 'Money in', Icon: ArrowDownLeft },
  { kind: 'withdrawal', label: 'Money out', Icon: ArrowUpRight },
];
const IN_CATEGORIES = ['Owner capital', 'Loan received', 'Interest earned', 'Other income', 'Balance correction'];
const OUT_CATEGORIES = ['Bank charges', 'Owner drawings', 'Loan repayment', 'Tax payment', 'Balance correction'];

export interface TxnDraft {
  id?: number;
  kind: AccountTxnKind;
  from_account_id?: number | null;
  to_account_id?: number | null;
  amount?: number;
  date?: string;
  category?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export const TransactionModal: React.FC<{
  companyId: number;
  accounts: MoneyAccount[];
  initial: TxnDraft;
  primary: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ companyId, accounts, initial, primary, onClose, onSaved }) => {
  const isEdit = !!initial.id;
  const usable = accounts.filter((a) => a.type !== 'petty_cash' && (a.is_active || a.id === initial.from_account_id || a.id === initial.to_account_id));
  const [kind, setKind] = useState<AccountTxnKind>(initial.kind);
  const [fromId, setFromId] = useState<number | ''>(initial.from_account_id || '');
  const [toId, setToId] = useState<number | ''>(initial.to_account_id || '');
  const [amount, setAmount] = useState<number>(initial.amount || 0);
  const [date, setDate] = useState(initial.date || todayIso());
  const [category, setCategory] = useState(initial.category || '');
  const [reference, setReference] = useState(initial.reference || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needFrom = kind !== 'deposit';
  const needTo = kind !== 'withdrawal';
  const from = accounts.find((a) => a.id === fromId);
  const fromAfter = from ? from.balance + (isEdit && initial.from_account_id === from.id ? Number(initial.amount || 0) : 0) - amount : 0;

  const save = async () => {
    if (!(amount > 0)) { setError('Enter an amount greater than 0.'); return; }
    if (needFrom && !fromId) { setError('Choose the account the money comes from.'); return; }
    if (needTo && !toId) { setError('Choose the account the money goes to.'); return; }
    if (kind === 'transfer' && fromId === toId) { setError('Choose two different accounts.'); return; }
    setSaving(true); setError('');
    const body = {
      company_id: companyId, kind, amount, date,
      from_account_id: needFrom ? Number(fromId) : null,
      to_account_id: needTo ? Number(toId) : null,
      category: kind === 'transfer' ? undefined : category.trim() || undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (isEdit) await updateAccountTxn(initial.id!, body); else await createAccountTxn(body);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save.');
      setSaving(false);
    }
  };

  const accountSelect = (value: number | '', set: (v: number | '') => void, exclude?: number | '') => (
    <select className={inputCls} value={value} onChange={(e) => set(e.target.value ? Number(e.target.value) : '')}>
      <option value="">Choose account…</option>
      {usable.filter((a) => a.id !== exclude).map((a) => (
        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)}){a.is_active ? '' : ' – closed'}</option>
      ))}
    </select>
  );

  return (
    <Shell
      title={isEdit ? 'Edit transaction' : 'Move money'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: primary }}>
          {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save
        </button>
      </>}
    >
      {error && <div className="p-2.5 rounded-lg text-sm bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-300">{error}</div>}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100">
        {KIND_TABS.map(({ kind: k, label, Icon }) => (
          <button key={k} type="button" onClick={() => { setKind(k); setCategory(''); }}
            className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${kind === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {kind === 'transfer' && 'Move money between your own accounts, e.g. a cash deposit to the bank or an Airtel Money withdrawal.'}
        {kind === 'deposit' && 'Money received that is not an invoice payment, e.g. owner capital, a loan or interest.'}
        {kind === 'withdrawal' && 'Money paid out that is not an expense or supplier payment, e.g. bank charges or owner drawings.'}
        {' '}For petty cash, use a top-up on the Petty Cash page.
      </p>
      <div className={`grid gap-3 ${needFrom && needTo ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {needFrom && <div><label className={labelCls}>From</label>{accountSelect(fromId, setFromId, kind === 'transfer' ? toId : '')}</div>}
        {needTo && <div><label className={labelCls}>To</label>{accountSelect(toId, setToId, kind === 'transfer' ? fromId : '')}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Amount *</label>
          <CurrencyInput value={amount} onChange={setAmount} className={`${inputCls} text-right tabular-nums font-semibold`} />
        </div>
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {needFrom && from && amount > 0 && fromAfter < -0.005 && (
        <p className="text-xs text-amber-700 dark:!text-amber-300 flex items-start gap-1">
          <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" /> This takes {from.name} to {formatCurrency(fromAfter)}. You can still save.
        </p>
      )}
      {kind !== 'transfer' && (
        <div>
          <label className={labelCls}>What is it?</label>
          <input list={`txn-cat-${kind}`} className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}
            placeholder={kind === 'deposit' ? 'e.g. Owner capital' : 'e.g. Bank charges'} />
          <datalist id={`txn-cat-${kind}`}>{(kind === 'deposit' ? IN_CATEGORIES : OUT_CATEGORIES).map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Reference</label>
          <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Slip / transaction ID" />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Shell>
  );
};
