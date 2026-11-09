import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getAccounts, updateAccount, deleteAccount, MoneyAccount, AccountType } from '../services/accountsApi';
import { AccountFormModal, TransactionModal, TxnDraft } from '../components/Accounts/AccountModals';
import {
  Landmark, Smartphone, Banknote, Wallet, Plus, ArrowLeftRight, Loader2, AlertCircle, Pencil, Trash2,
  FileText, Lock, Unlock, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

export const ACCOUNT_ICON: Record<AccountType, typeof Landmark> = {
  bank: Landmark, mobile: Smartphone, cash: Banknote, petty_cash: Wallet,
};
const TYPE_TINT: Record<AccountType, string> = {
  bank: 'bg-sky-50 text-sky-700 dark:!bg-sky-500/15 dark:!text-sky-300',
  mobile: 'bg-rose-50 text-rose-700 dark:!bg-rose-500/15 dark:!text-rose-300',
  cash: 'bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-300',
  petty_cash: 'bg-amber-50 text-amber-700 dark:!bg-amber-500/15 dark:!text-amber-300',
};

/**
 * Bank & Cash: the company's bank accounts, mobile money wallets, cash and
 * petty cash with live balances. Balances move automatically with payments,
 * expenses, supplier payments, salaries and transfers linked to them.
 */
const Accounts: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<MoneyAccount | null | 'new'>(null);
  const [txn, setTxn] = useState<TxnDraft | null>(null);

  const load = () => {
    if (!selectedCompany) return;
    setLoading(true);
    getAccounts(selectedCompany.id)
      .then((a) => { setAccounts(a); setError(''); })
      .catch(() => setError('Could not load accounts.'))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [selectedCompany]);

  const open = accounts.filter((a) => a.is_active);
  const closed = accounts.filter((a) => !a.is_active);
  const totals = useMemo(() => {
    const by = (t: AccountType[]) => open.filter((a) => t.includes(a.type)).reduce((s, a) => s + a.balance, 0);
    return { all: by(['bank', 'mobile', 'cash', 'petty_cash']), bank: by(['bank']), mobile: by(['mobile']), cash: by(['cash', 'petty_cash']) };
  }, [open]);
  const hasOwnAccounts = accounts.some((a) => a.type !== 'petty_cash');

  const toggleClosed = async (a: MoneyAccount) => {
    try { await updateAccount(a.id, { name: a.name, is_active: a.is_active ? 0 : 1 } as any); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not update the account.'); }
  };
  const remove = async (a: MoneyAccount) => {
    if (!window.confirm(`Delete "${a.name}"? Only accounts with no transactions can be deleted.`)) return;
    try { await deleteAccount(a.id); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not delete the account.'); }
  };

  if (!selectedCompany) return <div className="p-6 text-gray-500">Select a company first.</div>;

  const card = (a: MoneyAccount) => {
    const Icon = ACCOUNT_ICON[a.type] || Landmark;
    return (
      <div key={a.id} className={`bg-white rounded-xl border border-gray-200 p-5 flex flex-col ${a.is_active ? '' : 'opacity-70'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TYPE_TINT[a.type]}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{a.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {[a.type_name, a.bank_name && a.bank_name !== a.name ? a.bank_name : '', a.account_number].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          {!a.is_active && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Closed</span>}
        </div>
        <div className={`mt-4 text-2xl font-bold tabular-nums ${a.balance < -0.004 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(a.balance)}</div>
        <div className="mt-1 flex gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> {formatCurrency(a.total_in)}</span>
          <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5 text-red-500" /> {formatCurrency(a.total_out)}</span>
        </div>
        {a.type !== 'petty_cash' && a.opening_date && (
          <div className="mt-1 text-[11px] text-gray-400">Opening {formatCurrency(a.opening_balance)} on {new Date(`${a.opening_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        )}
        {a.type === 'petty_cash' && <div className="mt-1 text-[11px] text-gray-400">From the <Link to="/petty-cash" className="underline">Petty Cash</Link> book</div>}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1">
          <Link to={`/accounts/${a.id}`} className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: primary }}>
            <FileText className="h-4 w-4 mr-1.5" /> Statement
          </Link>
          <div className="ml-auto flex items-center">
            <button onClick={() => setEditing(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit"><Pencil className="h-4 w-4" /></button>
            {a.type !== 'petty_cash' && (
              <>
                <button onClick={() => toggleClosed(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50" title={a.is_active ? 'Close account (hide from new payments)' : 'Reopen account'}>
                  {a.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
                <button onClick={() => remove(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Landmark className="h-7 w-7" style={{ color: primary }} /> Bank & Cash
          </h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Your bank accounts, Airtel Money / Mpamba and cash. Client payments add to the account they went into; supplier payments,
            expenses, salaries and donations come off the account they were paid from.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTxn({ kind: 'transfer' })} disabled={!hasOwnAccounts}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            <ArrowLeftRight className="h-4 w-4 mr-1.5" /> Move money
          </button>
          <button onClick={() => setEditing('new')} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add account
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-300"><AlertCircle size={16} /> {error}</div>}

      {loading ? (
        <div className="py-20 text-center text-gray-400"><Loader2 className="h-7 w-7 animate-spin inline" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              ['Total cash position', totals.all, true],
              ['In banks', totals.bank, false],
              ['Mobile money', totals.mobile, false],
              ['Cash & petty cash', totals.cash, false],
            ].map(([label, val, main]) => (
              <div key={label as string} className="bg-white rounded-xl border border-gray-200 p-4" style={main ? { borderColor: primary } : undefined}>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label as string}</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${(val as number) < -0.004 ? 'text-red-600' : 'text-gray-900'}`} style={main ? { color: primary } : undefined}>
                  {formatCurrency(val as number)}
                </div>
              </div>
            ))}
          </div>

          {!hasOwnAccounts && (
            <div className="mb-6 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
              <Landmark className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="font-semibold text-gray-900">Add your first account</p>
              <p className="text-sm text-gray-500 mt-1 max-w-lg mx-auto">
                Add each bank account, Airtel Money / Mpamba number and your cash with today's real balance. From then on, choose the
                account whenever you record a payment or expense and the balances update by themselves.
              </p>
              <button onClick={() => setEditing('new')} className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add account
              </button>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{open.map(card)}</div>

          {closed.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowClosed((v) => !v)} className="text-sm font-medium text-gray-600 hover:text-gray-900">
                {showClosed ? 'Hide' : 'Show'} closed accounts ({closed.length})
              </button>
              {showClosed && <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{closed.map(card)}</div>}
            </div>
          )}
        </>
      )}

      {editing && (
        <AccountFormModal
          companyId={selectedCompany.id}
          account={editing === 'new' ? null : editing}
          primary={primary}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {txn && (
        <TransactionModal
          companyId={selectedCompany.id}
          accounts={accounts}
          initial={txn}
          primary={primary}
          onClose={() => setTxn(null)}
          onSaved={() => { setTxn(null); load(); }}
        />
      )}
    </div>
  );
};

export default Accounts;
