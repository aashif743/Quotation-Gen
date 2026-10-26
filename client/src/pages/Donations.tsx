import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getDonations, getDonationSummary } from '../services/donationsApi';
import {
  Donation, DonationCategory, DonationStatus, DonationSummary,
  DONATION_CATEGORY_LABELS, DONATION_STATUS_LABELS, DONATION_STATUS_STYLE, RECIPIENT_TYPE_LABELS,
} from '../types/donations';
import { toCsv, downloadCsv } from '../utils/csv';
import { HeartHandshake, Plus, Search, Download, Paperclip, Loader2, Gift, Users, Clock, CheckCircle2 } from 'lucide-react';

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const Donations: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const currency = selectedCompany?.currency;

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [rows, setRows] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<DonationStatus | ''>('');
  const [category, setCategory] = useState<DonationCategory | ''>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true); setError('');
    Promise.all([
      getDonations(selectedCompany.id, { from: `${year}-01-01`, to: `${year}-12-31` }),
      getDonationSummary(selectedCompany.id, year),
    ])
      .then(([list, sum]) => { setRows(list); setSummary(sum); })
      .catch(() => setError('Failed to load donations.'))
      .finally(() => setLoading(false));
  }, [selectedCompany, year]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || r.status === status) && (!category || r.category === category) &&
      (!t || [r.donation_number, r.recipient_name, r.purpose].some((v) => String(v || '').toLowerCase().includes(t))));
  }, [rows, status, category, q]);

  const exportCsv = () => {
    downloadCsv(`donations-${year}.csv`, toCsv(
      ['Number', 'Date', 'Recipient', 'Recipient type', 'Type', 'Purpose', 'Amount', 'Status', 'Approved by', 'Recorded by'],
      filtered.map((r) => [
        r.donation_number || '', String(r.date).slice(0, 10), r.recipient_name,
        r.recipient_type ? RECIPIENT_TYPE_LABELS[r.recipient_type] : '', DONATION_CATEGORY_LABELS[r.category],
        r.purpose || '', Number(r.amount), DONATION_STATUS_LABELS[r.status], r.approved_by_name || '', r.created_by_name || '',
      ])
    ));
  };

  if (!selectedCompany) return <div className="p-6 text-gray-500">Select a company first.</div>;

  const maxCat = Math.max(1, ...(summary?.by_category || []).map((c) => c.total));
  const cards = [
    { label: `Given in ${year}`, value: formatCurrency(summary?.given_total || 0, currency), icon: Gift, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Donations given', value: summary?.given_count ?? 0, icon: CheckCircle2, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Recipients supported', value: summary?.recipients ?? 0, icon: Users, tone: 'text-violet-600 bg-violet-50' },
    { label: 'Awaiting approval', value: summary?.awaiting_approval ?? 0, icon: Clock, tone: 'text-amber-600 bg-amber-50',
      sub: summary && summary.pending_total > 0 ? `${formatCurrency(summary.pending_total, currency)} planned / approved` : undefined },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <HeartHandshake className="h-7 w-7" style={{ color: primary }} /> Donations
          </h1>
          <p className="text-gray-600 mt-1">Donations and sponsorships the company gives to others.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCsv} className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </button>
          <Link to="/donations/new" className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
            <Plus className="h-4 w-4 mr-1.5" /> New donation
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{c.value}</div>
            <div className="text-xs text-gray-500">{c.label}</div>
            {c.sub && <div className="text-xs text-amber-700 mt-0.5">{c.sub}</div>}
          </div>
        ))}
      </div>

      {summary && summary.by_category.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">Given in {year} by type</p>
          <div className="space-y-2">
            {summary.by_category.map((c) => (
              <div key={c.category} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-gray-600">{DONATION_CATEGORY_LABELS[c.category]}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.total / maxCat) * 100}%`, backgroundColor: primary }} />
                </div>
                <span className="w-40 text-right font-medium text-gray-800">{formatCurrency(c.total, currency)}</span>
                <span className="w-10 text-right text-gray-400">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, recipient, purpose…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as DonationStatus | '')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All statuses</option>
          {(Object.keys(DONATION_STATUS_LABELS) as DonationStatus[]).map((k) => <option key={k} value={k}>{DONATION_STATUS_LABELS[k]}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as DonationCategory | '')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">All types</option>
          {(Object.keys(DONATION_CATEGORY_LABELS) as DonationCategory[]).map((k) => <option key={k} value={k}>{DONATION_CATEGORY_LABELS[k]}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Donation</th>
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Type / purpose</th>
              <th className="px-5 py-3 text-right">Amount / value</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">
                <HeartHandshake className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                No donations {rows.length ? 'match these filters' : `recorded for ${year}`}.
              </td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/donations/${r.id}`)}>
                <td className="px-5 py-3">
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    {r.donation_number}
                    {r.proof_url && <span title="Proof attached"><Paperclip className="h-3.5 w-3.5 text-gray-400" /></span>}
                  </div>
                  <div className="text-xs text-gray-500">{fmtDate(r.date)}{r.created_by_name ? ` · by ${r.created_by_name}` : ''}</div>
                </td>
                <td className="px-5 py-3">
                  <div className="text-sm text-gray-900">{r.recipient_name}</div>
                  {r.recipient_type && <div className="text-xs text-gray-500">{RECIPIENT_TYPE_LABELS[r.recipient_type]}</div>}
                </td>
                <td className="px-5 py-3">
                  <div className="text-sm text-gray-800">{DONATION_CATEGORY_LABELS[r.category]}</div>
                  {r.purpose && <div className="text-xs text-gray-500 truncate max-w-[260px]">{r.purpose}</div>}
                </td>
                <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(Number(r.amount), currency)}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${DONATION_STATUS_STYLE[r.status]}`}>
                    {DONATION_STATUS_LABELS[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Donations;
