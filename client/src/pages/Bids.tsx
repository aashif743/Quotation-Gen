import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, Plus, Loader2, AlertCircle, Gavel, Clock, Trophy, Send, FileSearch, X, Building2, List, CalendarDays, BarChart3 } from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { Bid, BidKind, STATUS_LABELS, STATUS_STYLE, createBid, getBidProfile, getBids, uploadTender } from '../services/bidsApi';
import { getAiStatus, AiStatus } from '../services/aiApi';
import { timeLeftText } from './BidWorkspace';
import FitText from '../components/common/FitText';
import DeadlineCalendar from '../components/Bid/DeadlineCalendar';

type Filter = 'active' | 'submitted' | 'won' | 'closed' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'In progress' }, { key: 'submitted', label: 'Submitted' }, { key: 'won', label: 'Won' },
  { key: 'closed', label: 'Not won / cancelled' }, { key: 'all', label: 'All' },
];
const inFilter = (b: Bid, f: Filter) =>
  f === 'all' ? true
    : f === 'active' ? ['draft', 'review', 'approved'].includes(b.status)
      : f === 'submitted' ? b.status === 'submitted'
        : f === 'won' ? b.status === 'won'
          : ['lost', 'cancelled'].includes(b.status);

/** /tenders — tenders and RFQs the company is responding to. */
const Bids: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [view, setView] = useState<'list' | 'calendar'>(() => { try { return localStorage.getItem('bidsView') === 'calendar' ? 'calendar' : 'list'; } catch { return 'list'; } });
  const pickView = (v: 'list' | 'calendar') => { setView(v); try { localStorage.setItem('bidsView', v); } catch { /* private mode */ } };
  const [uploading, setUploading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(true);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [manual, setManual] = useState<{ kind: BidKind; title: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    Promise.all([
      getBids(selectedCompany.id).then(setBids),
      getBidProfile(selectedCompany.id).then((p) => setProfileSaved(p.saved)).catch(() => {}),
      getAiStatus().then(setAi).catch(() => {}),
    ])
      .catch((e) => setError(e?.response?.data?.error || 'Could not load bids.'))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const shown = useMemo(() => bids.filter((b) => inFilter(b, filter)), [bids, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, bids.filter((b) => inFilter(b, f.key)).length])) as Record<Filter, number>, [bids]);

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  const primary = brandColorFor(selectedCompany.primary_color || '#4f46e5', theme === 'dark');
  const currency = selectedCompany.currency || 'MWK';

  const upload = async (file: File | null) => {
    if (!file) return;
    if (!/\.(docx|pdf)$/i.test(file.name)) { setError('Upload the tender as a Word (.docx) or PDF file. Old .doc files: open in Word and “Save as” .docx.'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('The file is too large (max 25 MB).'); return; }
    setUploading(true);
    setError('');
    try {
      const b = await uploadTender(selectedCompany.id, file);
      navigate(`/tenders/${b.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not upload the document.');
      setUploading(false);
    }
  };

  const startManual = async () => {
    if (!manual) return;
    try {
      const b = await createBid(selectedCompany.id, manual.kind, manual.title || (manual.kind === 'rfq' ? 'New RFQ' : 'New tender'));
      navigate(`/tenders/${b.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not create the bid.');
    }
  };

  const open = bids.filter((b) => ['draft', 'review', 'approved'].includes(b.status));
  const dueSoon = open.filter((b) => b.minutes_left != null && b.minutes_left >= 0 && b.minutes_left < 7 * 1440).length;
  const won = bids.filter((b) => b.status === 'won');
  const decided = bids.filter((b) => ['won', 'lost'].includes(b.status)).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Tenders & RFQs</h1>
          <p className="text-gray-600 mt-2">Upload the bid document you received — the forms are filled in from your Bid Profile and checked before you print.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setManual({ kind: 'rfq', title: '' })} className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 shadow-sm hover:bg-gray-50">
            <Plus className="h-5 w-5 mr-2" /> Without a document
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: primary }}>
            {uploading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Upload className="h-5 w-5 mr-2" />} Upload tender / RFQ
          </button>
          <input ref={fileRef} type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; upload(f); }} />
        </div>
      </div>

      {error && <div className="p-4 rounded-lg flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5 flex-shrink-0" /> {error}</div>}
      {!profileSaved && (
        <div className="p-4 rounded-lg flex flex-wrap items-center gap-2 bg-amber-50 text-amber-800 text-sm">
          <Building2 className="h-5 w-5" /> Fill in the <Link to="/bid-profile" className="font-semibold underline">Bid Profile</Link> first — registration numbers, directors, signatory and certificates are filled into every bid from it.
        </div>
      )}
      {ai && !ai.available && (
        <p className="text-sm text-gray-500">AI reading is not available right now, so the tender details are typed in by hand. The forms, checks and bid pack work the same.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'In progress', value: String(open.length), Icon: Gavel },
          { label: 'Due within 7 days', value: String(dueSoon), Icon: Clock, warn: dueSoon > 0 },
          { label: 'Submitted', value: String(bids.filter((b) => b.status === 'submitted').length), Icon: Send },
          { label: decided ? `Won (${Math.round((won.length / decided) * 100)}% of decided)` : 'Won', value: won.length ? formatCurrency(won.reduce((s, b) => s + Number(b.total || 0), 0), currency) : '0', Icon: Trophy },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center">
            <div className={`p-3 rounded-lg flex-shrink-0 ${c.warn ? 'bg-red-100' : 'brand-halo'}`}><c.Icon className={`h-6 w-6 ${c.warn ? 'text-red-600' : 'brand-icon'}`} /></div>
            <div className="ml-4 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600">{c.label}</p>
              <FitText className="text-xl font-bold text-gray-900 tabular-nums">{c.value}</FitText>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 mr-1">
            {([['list', List, 'List'], ['calendar', CalendarDays, 'Calendar']] as const).map(([k, I, l]) => (
              <button key={k} onClick={() => pickView(k)} title={l} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm ${view === k ? 'text-white' : 'text-gray-600'}`} style={view === k ? { backgroundColor: primary } : undefined}>
                <I className="h-4 w-4" /> <span className="hidden sm:inline">{l}</span>
              </button>
            ))}
          </div>
          {view === 'list' && FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${on ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                style={on ? { backgroundColor: primary } : undefined}>
                {f.label}<span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/25' : 'bg-gray-100 text-gray-600'}`}>{counts[f.key]}</span>
              </button>
            );
          })}
          <Link to="/tender-reports" className="ml-auto inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"><BarChart3 className="h-4 w-4" /> Reports</Link>
        </div>
        <div className="overflow-x-auto">
          {view === 'calendar' && !loading ? <DeadlineCalendar bids={bids} primary={primary} /> : loading ? (
            <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-gray-300 mx-auto" /></div>
          ) : shown.length === 0 ? (
            <div className="p-12 text-center">
              <FileSearch className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{bids.length ? 'Nothing here' : 'No bids yet'}</h3>
              <p className="text-gray-600 mb-6">{bids.length ? 'Try another filter.' : 'Upload a tender or RFQ you received (Word or PDF) to start.'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Deadline', 'Bid', 'Tender', 'Status', 'Value'].map((h) => (
                    <th key={h} className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${h === 'Value' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {shown.map((b) => {
                  const urgent = ['draft', 'review', 'approved'].includes(b.status) && b.minutes_left != null && b.minutes_left >= 0 && b.minutes_left < 3 * 1440;
                  const overdue = ['draft', 'review', 'approved'].includes(b.status) && b.minutes_left != null && b.minutes_left < 0;
                  return (
                    <tr key={b.id} onClick={() => navigate(`/tenders/${b.id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {b.deadline ? (
                          <>
                            <div className="text-sm text-gray-900">{new Date(b.deadline.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                            {['draft', 'review', 'approved'].includes(b.status) && <div className={`text-xs ${urgent || overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{timeLeftText(b.minutes_left)}</div>}
                          </>
                        ) : <span className="text-sm text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold" style={{ color: primary }}>{b.bid_number}</div>
                        <div className="text-[11px] font-semibold uppercase text-gray-400">{b.kind === 'rfq' ? 'RFQ' : 'Tender'}</div>
                      </td>
                      <td className="px-6 py-4 max-w-md">
                        <div className="text-sm text-gray-900 truncate">{b.title || 'Untitled'}</div>
                        <div className="text-xs text-gray-500 truncate">{[b.procuring_entity, b.reference_number].filter(Boolean).join(' · ')}</div>
                        {b.ai_status === 'reading' && <div className="text-xs text-indigo-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Reading the document…</div>}
                      </td>
                      <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[b.status]}`}>{STATUS_LABELS[b.status]}</span></td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{Number(b.total) > 0 ? formatCurrency(Number(b.total), currency) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {manual && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4" onClick={() => setManual(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Start a bid without a document</h3>
              <button onClick={() => setManual(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm">
                {(['rfq', 'tender'] as const).map((k) => (
                  <button key={k} onClick={() => setManual({ ...manual, kind: k })} className={`px-3 py-1.5 rounded-md ${manual.kind === k ? 'text-white' : 'text-gray-600'}`} style={manual.kind === k ? { backgroundColor: primary } : undefined}>
                    {k === 'rfq' ? 'Request for quotation' : 'Tender'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What is it for?</label>
                <input autoFocus value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="e.g. Supply of office stationery"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setManual(null)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
              <button onClick={startManual} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>Start</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bids;
