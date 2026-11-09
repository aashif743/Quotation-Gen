import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { getDeletedItems, restoreDeletedItem, purgeDeletedItem, DeletedItem } from '../services/recycleBinApi';
import { Trash2, RotateCcw, Search, Loader2, AlertCircle, CheckCircle2, ArchiveRestore } from 'lucide-react';

const TYPES: [string, string][] = [
  ['', 'All types'], ['quotation', 'Quotations'], ['invoice', 'Invoices'], ['payment', 'Payments'],
  ['delivery_note', 'Delivery notes'], ['job_card', 'Job cards'], ['lpo', 'LPOs'], ['purchase', 'Purchases'],
  ['vendor_payment', 'Vendor payments'], ['expense', 'Expenses'], ['petty_cash', 'Petty cash'],
  ['donation', 'Donations'], ['contract', 'Contracts'], ['client', 'Clients'], ['vendor', 'Vendors'],
  ['account_transaction', 'Transfers & money in/out'],
];

// Where a restored item can be opened.
const openPath = (type: string, id: number): string | null => ({
  quotation: `/quotation/${id}`, invoice: `/invoice/${id}`, delivery_note: `/delivery-note/${id}`,
  job_card: `/job-cards/${id}`, lpo: `/lpos/${id}`, purchase: `/purchase/${id}`, donation: `/donations/${id}`,
  contract: `/contracts/${id}`, client: `/clients/${id}`, vendor: `/vendors/${id}`,
} as Record<string, string>)[type] || null;

const fmtWhen = (s: string) => new Date(s.replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Recently deleted items (30 days), restorable by admins. */
const RecycleBin: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [rows, setRows] = useState<DeletedItem[]>([]);
  const [retention, setRetention] = useState(30);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string; link?: string | null } | null>(null);

  const load = () => {
    setLoading(true);
    getDeletedItems({ type: type || undefined, q: q.trim() || undefined })
      .then((r) => { setRows(r.rows); setRetention(r.retention_days); })
      .catch(() => setNotice({ kind: 'err', text: 'Could not load deleted items.' }))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [type]);

  const restore = async (d: DeletedItem) => {
    setBusyId(d.id); setNotice(null);
    try {
      const r = await restoreDeletedItem(d.id);
      setRows((prev) => prev.filter((x) => x.id !== d.id));
      setNotice({ kind: 'ok', text: `${d.type_name}${d.label ? ` ${d.label}` : ''} restored.`, link: openPath(r.entity_type, r.id) });
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.response?.data?.message || 'Could not restore this item.' });
    } finally { setBusyId(null); }
  };

  const purge = async (d: DeletedItem) => {
    if (!window.confirm(`Delete ${d.type_name.toLowerCase()}${d.label ? ` ${d.label}` : ''} permanently? It can't be restored afterwards.`)) return;
    setBusyId(d.id); setNotice(null);
    try {
      await purgeDeletedItem(d.id);
      setRows((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e: any) {
      setNotice({ kind: 'err', text: e?.response?.data?.message || 'Could not delete this item.' });
    } finally { setBusyId(null); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <ArchiveRestore className="h-7 w-7" style={{ color: primary }} /> Recently Deleted
        </h1>
        <p className="text-gray-600 mt-1">
          Deleted quotations, invoices, payments and other records stay here for {retention} days. Restore puts them back exactly as they were, with their items and payments.
        </p>
      </div>

      {notice && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-300' : 'bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-300'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{notice.text}</span>
          {notice.link && <Link to={notice.link} className="ml-1 font-semibold underline">Open it</Link>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={load} placeholder="Search by number, client, vendor or who deleted it…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </form>
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Deleted</th>
              <th className="px-5 py-3">Kept for</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">
                <Trash2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                Nothing has been deleted in the last {retention} days.
              </td></tr>
            ) : rows.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{d.type_name}</span>
                    <span className="text-sm font-semibold text-gray-900">{d.label || '—'}</span>
                  </div>
                  {d.summary && <div className="text-xs text-gray-500 mt-0.5">{d.summary}</div>}
                </td>
                <td className="px-5 py-3 text-sm text-gray-600">{d.company_name || '—'}</td>
                <td className="px-5 py-3 text-sm text-gray-600">
                  {fmtWhen(d.deleted_at)}
                  {d.deleted_by_name && <div className="text-xs text-gray-400">by {d.deleted_by_name}</div>}
                </td>
                <td className="px-5 py-3 text-sm">
                  <span className={d.days_left <= 5 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                    {d.days_left === 0 ? 'Last day' : `${d.days_left} more day${d.days_left === 1 ? '' : 's'}`}
                  </span>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => restore(d)} disabled={busyId === d.id}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: primary }}>
                    {busyId === d.id ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />} Restore
                  </button>
                  <button onClick={() => purge(d)} disabled={busyId === d.id}
                    className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete permanently">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecycleBin;
