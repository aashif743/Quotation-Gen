import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Trophy, Percent, Send, TrendingDown, Gavel } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { BidReports, STATUS_LABELS, STATUS_STYLE, getBidReports } from '../services/bidsApi';
import FitText from '../components/common/FitText';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: '12m', label: 'Last 12 months' },
  { key: 'year', label: 'This year' },
] as const;
type Period = typeof PERIODS[number]['key'];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = (p: Period): [string?, string?] => {
  const now = new Date();
  if (p === 'year') return [`${now.getFullYear()}-01-01`, undefined];
  if (p === '12m') return [ymd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1)), undefined];
  return [undefined, undefined];
};
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

const TenderReports: React.FC = () => {
  useDocumentTitle('Tender Reports');
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('all');
  const [r, setR] = useState<BidReports | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    setR(null);
    const [from, to] = range(period);
    getBidReports(selectedCompany.id, from, to).then(setR).catch((e) => setError(e?.response?.data?.error || 'Could not load the reports.'));
  }, [selectedCompany, period]);

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  const dark = theme === 'dark';
  const primary = brandColorFor(selectedCompany.primary_color || '#4f46e5', dark);
  const currency = selectedCompany.currency || 'MWK';
  const grid = dark ? '#2e2e2e' : '#e5e7eb';
  const axis = dark ? '#9ca3af' : '#6b7280';
  const t = r?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tenders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="All bids"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tender Reports</h1>
            <p className="text-sm text-gray-500">How many bids you win, where, and why you lose — to price the next one better.</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-3 py-1.5 rounded-md text-sm ${period === p.key ? 'text-white' : 'text-gray-600'}`} style={period === p.key ? { backgroundColor: primary } : undefined}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 rounded-lg flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5" /> {error}</div>}
      {!r || !t ? (
        !error && <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-gray-300 mx-auto" /></div>
      ) : t.bids === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Gavel className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700">No bids in this period.</p>
          <Link to="/tenders" className="text-sm underline text-gray-500">Go to Tenders & RFQs</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Win rate', value: t.win_rate == null ? '—' : `${t.win_rate}%`, sub: `${t.won} won of ${t.won + t.lost} decided`, Icon: Percent },
              { label: 'Value won', value: formatCurrency(t.value_won, currency), sub: `${t.won} contract${t.won === 1 ? '' : 's'}`, Icon: Trophy },
              { label: 'Submitted', value: String(t.submitted), sub: `${formatCurrency(t.value_bid, currency)} bid · ${t.in_progress} in progress`, Icon: Send },
              { label: 'Price vs winner (lost bids)', value: t.avg_gap_percent == null ? '—' : `${t.avg_gap_percent > 0 ? '+' : ''}${t.avg_gap_percent}%`, sub: t.avg_gap_percent == null ? 'Record the winning price when you lose' : t.avg_gap_percent > 0 ? 'On average we were more expensive' : 'On average we were cheaper', Icon: TrendingDown, warn: (t.avg_gap_percent ?? 0) > 0 },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center">
                <div className={`p-3 rounded-lg flex-shrink-0 ${c.warn ? 'bg-red-100' : 'brand-halo'}`}><c.Icon className={`h-6 w-6 ${c.warn ? 'text-red-600' : 'brand-icon'}`} /></div>
                <div className="ml-4 min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600">{c.label}</p>
                  <FitText className="text-xl font-bold text-gray-900 tabular-nums">{c.value}</FitText>
                  <p className="text-xs text-gray-500 truncate" title={c.sub}>{c.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Bids by month</h3>
              {r.by_month.length === 0 ? <p className="text-sm text-gray-400">Nothing yet.</p> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={r.by_month.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: axis }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: dark ? '#ffffff10' : '#00000008' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="submitted" name="Submitted" fill={primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="won" name="Won" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lost" name="Not won" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Why bids were not won</h3>
              {r.lost_reasons.length === 0 ? (
                <p className="text-sm text-gray-400">No reasons recorded yet. When you mark a bid “Not won”, choose the reason.</p>
              ) : (
                <div className="space-y-3">
                  {r.lost_reasons.map((x) => {
                    const max = r.lost_reasons[0].count;
                    return (
                      <div key={x.reason}>
                        <div className="flex justify-between text-sm"><span className="text-gray-700">{x.reason}</span><span className="font-semibold text-gray-900">{x.count}</span></div>
                        <div className="h-2 rounded-full bg-gray-100 mt-1"><div className="h-2 rounded-full bg-red-400" style={{ width: `${(x.count / max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 px-5 pt-5 pb-3">By procuring entity</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{['Procuring entity', 'Bids', 'Submitted', 'Won', 'Not won', 'Win rate', 'Value won'].map((h, i) => (
                    <th key={h} className={`px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.by_entity.map((e) => (
                    <tr key={e.entity}>
                      <td className="px-5 py-2.5 text-gray-900">{e.entity}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{e.bids}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{e.submitted}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-emerald-700">{e.won}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500">{e.lost}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{e.won + e.lost ? `${Math.round((e.won / (e.won + e.lost)) * 100)}%` : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">{e.value_won ? formatCurrency(e.value_won, currency) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {r.decided.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-base font-semibold text-gray-900 px-5 pt-5 pb-3">Results</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Bid', 'Result', 'Our price', 'Awarded / winner', 'Notes'].map((h, i) => (
                      <th key={h} className={`px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i === 2 || i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {r.decided.map((b) => {
                      const res = b.result || {};
                      return (
                        <tr key={b.id} onClick={() => navigate(`/tenders/${b.id}`)} className="hover:bg-gray-50 cursor-pointer">
                          <td className="px-5 py-2.5 max-w-xs">
                            <div className="font-semibold" style={{ color: primary }}>{b.bid_number}</div>
                            <div className="text-xs text-gray-500 truncate">{[b.title, b.procuring_entity].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td className="px-5 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[b.status]}`}>{STATUS_LABELS[b.status]}</span></td>
                          <td className="px-5 py-2.5 text-right tabular-nums whitespace-nowrap">{b.value ? formatCurrency(b.value, currency) : '—'}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums whitespace-nowrap">
                            {b.status === 'won'
                              ? (res.awarded_amount ? formatCurrency(Number(res.awarded_amount), currency) : '—')
                              : <>{res.winner_price ? formatCurrency(Number(res.winner_price), currency) : '—'}{res.winner && <div className="text-xs text-gray-500">{res.winner}</div>}</>}
                          </td>
                          <td className="px-5 py-2.5 text-gray-600 max-w-xs truncate">{[res.reason, res.notes].filter(Boolean).join(' — ') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TenderReports;
