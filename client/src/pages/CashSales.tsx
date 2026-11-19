import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Banknote, Calendar, ShoppingBag, Receipt, AlertCircle, X } from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { CashSale, getCashSales } from '../services/cashSalesApi';
import { formatCurrency } from '../utils/calculations';
import { brandColorFor } from '../utils/colors';
import FitText from '../components/common/FitText';

type MethodFilter = 'all' | 'cash' | 'bank' | 'mobile' | 'other';
const METHOD_FILTERS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank' },
  { key: 'mobile', label: 'Mobile money' },
  { key: 'other', label: 'Cheque / other' },
];
const methodGroup = (m?: string | null): Exclude<MethodFilter, 'all'> =>
  !m || /cash/i.test(m) ? 'cash' : /bank|transfer|eft|deposit/i.test(m) ? 'bank' : /mobile|airtel|mpamba|tnm/i.test(m) ? 'mobile' : 'other';

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString();
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** /cash-sales — every cash sale of the selected company. */
const CashSales: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sales, setSales] = useState<CashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const method = (METHOD_FILTERS.some((m) => m.key === params.get('method')) ? params.get('method') : 'all') as MethodFilter;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getCashSales(selectedCompany.id, { from, to })
      .then((rows) => { setSales(rows); setError(''); })
      .catch((e) => setError(e?.response?.data?.error || 'Could not load cash sales.'))
      .finally(() => setLoading(false));
  }, [selectedCompany, from, to]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((s) =>
      (method === 'all' || methodGroup(s.payment_method) === method) &&
      (!term || [s.invoice_number, s.client_name, s.client_phone, s.receipt_number, s.payment_reference]
        .some((f) => (f || '').toLowerCase().includes(term)))
    );
  }, [sales, search, method]);

  const total = shown.reduce((sum, s) => sum + Number(s.grand_total || 0), 0);
  const ms = monthStart();
  const thisMonth = sales.filter((s) => s.sale_date >= ms).reduce((sum, s) => sum + Number(s.grand_total || 0), 0);
  const counts = useMemo(() => {
    const c: Record<MethodFilter, number> = { all: sales.length, cash: 0, bank: 0, mobile: 0, other: 0 };
    sales.forEach((s) => { c[methodGroup(s.payment_method)] += 1; });
    return c;
  }, [sales]);

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  const primary = brandColorFor(selectedCompany.primary_color || '#4f46e5', theme === 'dark');
  const filtering = !!(search.trim() || from || to || method !== 'all');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Cash Sales</h1>
          <p className="text-gray-600 mt-2">Sales paid on the spot, with a cash sale document and receipt for each.</p>
        </div>
        <button
          onClick={() => navigate('/cash-sales/new')}
          className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90 flex-shrink-0"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-5 w-5 mr-2" /> New Cash Sale
        </button>
      </div>

      {error && <div className="p-4 rounded-lg flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5" /> {error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: filtering ? 'Total (shown)' : 'Total sales', value: formatCurrency(total), Icon: Banknote },
          { label: 'This month', value: formatCurrency(thisMonth), Icon: Calendar },
          { label: filtering ? 'Sales (shown)' : 'Sales', value: String(shown.length), Icon: ShoppingBag },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
            <div className="p-3 rounded-lg brand-halo flex-shrink-0"><c.Icon className="h-6 w-6 brand-icon" /></div>
            <div className="ml-4 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600">{c.label}</p>
              <FitText className="text-xl font-bold text-gray-900 tabular-nums" title={c.value}>{c.value}</FitText>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number, customer, phone, receipt or reference..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" aria-label="From date" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className="px-3 py-2 border rounded-lg text-sm" aria-label="To date" />
              {(from || to) && (
                <button onClick={() => { const n = new URLSearchParams(params); n.delete('from'); n.delete('to'); setParams(n, { replace: true }); }} className="p-2 text-gray-400 hover:text-gray-700" title="Clear dates">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by payment method">
            {METHOD_FILTERS.map((f) => {
              const active = method === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam('method', f.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'text-white border-transparent shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: primary } : undefined}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>{counts[f.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading cash sales...</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="p-12 text-center">
              <Banknote className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{sales.length ? 'No cash sales match' : 'No cash sales yet'}</h3>
              <p className="text-gray-600 mb-6">
                {sales.length ? 'Try another filter or search.' : 'Record a sale that is paid on the spot. A cash sale document and receipt are made for it.'}
              </p>
              {!sales.length && (
                <button onClick={() => navigate('/cash-sales/new')} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                  <Plus className="h-4 w-4 mr-2" /> New Cash Sale
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Number', 'Customer', 'Paid by', 'Total', 'Receipt'].map((h) => (
                    <th key={h} className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {shown.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/cash-sales/${s.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{fmtDate(s.sale_date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold whitespace-nowrap" style={{ color: primary }}>{s.invoice_number}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{s.client_name}</div>
                      <div className="text-xs text-gray-500">{s.item_count || 0} item{s.item_count === 1 ? '' : 's'}{s.client_phone ? ` · ${s.client_phone}` : ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{s.payment_method || 'Cash'}</div>
                      {s.payment_account_name && <div className="text-xs text-gray-500">into {s.payment_account_name}</div>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatCurrency(Number(s.grand_total))}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {s.payment_id ? (
                        <Link
                          to={`/receipts/${s.payment_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                          style={{ color: primary }}
                        >
                          <Receipt className="h-4 w-4" /> {s.receipt_number || 'Receipt'}
                        </Link>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtering && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-gray-700">{shown.length} of {sales.length} sale{sales.length === 1 ? '' : 's'} shown</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CashSales;
