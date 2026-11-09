import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import {
  getAccountLedger, getAccounts, getAccountTxn, deleteAccountTxn, AccountLedger as LedgerData, LedgerLine, MoneyAccount,
} from '../services/accountsApi';
import AccountStatementDocument, { fmtLedgerDate } from '../components/Accounts/AccountStatementDocument';
import { TransactionModal, TxnDraft } from '../components/Accounts/AccountModals';
import { ArrowLeft, Printer, Download, Loader2, Pencil, Trash2, ArrowLeftRight, ExternalLink } from 'lucide-react';

type Preset = 'month' | 'last_month' | '3mo' | 'year' | 'all' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: '3mo', label: 'Last 3 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom range' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rangeFor = (p: Preset, from: string, to: string): { from?: string; to?: string } => {
  const t = new Date();
  switch (p) {
    case 'month': return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) };
    case 'last_month': return { from: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: iso(new Date(t.getFullYear(), t.getMonth(), 0)) };
    case '3mo': return { from: iso(new Date(t.getFullYear(), t.getMonth() - 2, 1)), to: iso(t) };
    case 'year': return { from: iso(new Date(t.getFullYear(), 0, 1)), to: iso(t) };
    case 'custom': return { from, to };
    default: return {};
  }
};

/** Statement of one bank / mobile money / cash / petty cash account. */
const AccountLedgerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAccessPayroll } = useAuth();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(iso(new Date()));
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [txn, setTxn] = useState<TxnDraft | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setLedger(await getAccountLedger(Number(id), rangeFor(preset, customFrom, customTo)));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load this account.');
    } finally {
      setLoading(false);
    }
  }, [id, preset, customFrom, customTo]);

  // A custom range waits for "Apply".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (preset !== 'custom') load(); }, [preset, id]);

  const companyId = ledger?.account.company_id;
  useEffect(() => { if (companyId) getAccounts(companyId).then(setAccounts).catch(() => {}); }, [companyId, ledger]);

  const linkFor = (l: LedgerLine): string | null => {
    switch (l.source) {
      case 'payment': return `/invoice/${l.source_id}`;
      case 'vendor_payment': return `/purchase/${l.source_id}`;
      case 'expense': return '/expenses';
      case 'donation': return `/donations/${l.source_id}`;
      case 'petty_cash': return '/petty-cash';
      case 'payroll': return canAccessPayroll ? '/payroll' : null;
      default: return null;
    }
  };

  const editTxn = async (l: LedgerLine) => {
    try {
      const t = await getAccountTxn(l.source_id!);
      setTxn({ ...t, amount: Number(t.amount) });
    } catch { setError('Could not open this transaction.'); }
  };
  const removeTxn = async (l: LedgerLine) => {
    if (!window.confirm('Delete this transaction? It moves to Recently Deleted for 30 days.')) return;
    try { await deleteAccountTxn(l.source_id!); load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not delete it.'); }
  };

  const download = async () => {
    if (!ledger) return;
    setDownloading(true);
    try {
      await generateDocumentPDF('.account-statement-document',
        `Account_${pdfFileSegment(ledger.account.name)}_${ledger.from || 'start'}_to_${ledger.to || iso(new Date())}.pdf`);
    } catch { setError('Could not create the PDF. Please try again.'); }
    finally { setDownloading(false); }
  };

  const acc = ledger?.account;
  const btn = 'inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap no-print">
        <button onClick={() => navigate('/accounts')} className="inline-flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-2" /> Bank & Cash
        </button>
        <div className="flex gap-2">
          {acc && acc.type !== 'petty_cash' && (
            <button onClick={() => setTxn({ kind: 'transfer', from_account_id: acc.id })} className={btn}>
              <ArrowLeftRight className="h-4 w-4 mr-2" /> Move money
            </button>
          )}
          <button onClick={() => window.print()} disabled={!ledger || loading} className={btn}><Printer className="h-4 w-4 mr-2" /> Print</button>
          <button onClick={download} disabled={!ledger || loading || downloading}
            className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50" style={{ backgroundColor: primary }}>
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF
          </button>
        </div>
      </div>

      {acc && (
        <div className="no-print">
          <h1 className="text-2xl font-bold text-gray-900">{acc.name}</h1>
          <p className="text-sm text-gray-500">
            {[acc.type_name, acc.bank_name && acc.bank_name !== acc.name ? acc.bank_name : '', acc.account_number].filter(Boolean).join(' · ')}
            {' · '}Balance today <span className={`font-semibold ${ledger!.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(ledger!.balance)}</span>
          </p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 no-print">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${preset === p.id ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              style={preset === p.id ? { backgroundColor: primary } : undefined}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
            <button onClick={load} className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: primary }}>Apply</button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm no-print dark:!bg-red-500/15 dark:!text-red-300">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-gray-400 no-print"><Loader2 className="h-7 w-7 animate-spin inline" /></div>
      ) : ledger && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
            {[
              [ledger.from ? 'Opening balance' : 'Opening balance', ledger.opening, 'text-gray-900'],
              ['Money in', ledger.total_in, 'text-emerald-600'],
              ['Money out', ledger.total_out, 'text-red-600'],
              ['Closing balance', ledger.closing, ledger.closing < 0 ? 'text-red-600' : 'text-gray-900'],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label as string}</div>
                <div className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{formatCurrency(val as number)}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto no-print">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Money in</th>
                  <th className="px-4 py-3 text-right">Money out</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:!divide-[#2e2e2e] text-sm">
                <tr className="bg-gray-50/60 dark:!bg-white/5">
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtLedgerDate(ledger.from || ledger.account.opening_date)}</td>
                  <td />
                  <td className="px-4 py-2.5 font-medium text-gray-700">{ledger.from ? 'Balance brought forward' : 'Opening balance'}</td>
                  <td /><td />
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(ledger.opening)}</td>
                  <td />
                </tr>
                {ledger.lines.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No money in or out in this period.</td></tr>
                ) : ledger.lines.map((l, i) => {
                  const to = linkFor(l);
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:!bg-white/5">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtLedgerDate(l.date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {to && l.number ? (
                          <Link to={to} className="font-medium inline-flex items-center gap-1 hover:underline" style={{ color: primary }}>
                            {l.number} <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                        ) : <span className="font-medium text-gray-700">{l.number || l.reference || ''}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">
                        {l.description}
                        {l.reference && l.number && <span className="text-gray-400"> · Ref {l.reference}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">{l.dir === 'in' ? formatCurrency(l.amount) : ''}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600 font-medium">{l.dir === 'out' ? formatCurrency(l.amount) : ''}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${l.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(l.balance)}</td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {l.source === 'transaction' && (
                          <>
                            <button onClick={() => editTxn(l)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => removeTxn(l)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Printable statement: off-screen on the page, used for Print and Download PDF. */}
          <div className="account-print" aria-hidden="true">
            <AccountStatementDocument ledger={ledger} rootClassName="account-statement-document" />
          </div>
        </>
      )}

      {txn && companyId && (
        <TransactionModal
          companyId={companyId}
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

export default AccountLedgerPage;
