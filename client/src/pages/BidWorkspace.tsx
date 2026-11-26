import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Sparkles, Download, Copy, Trash2, Clock,
  ShieldCheck, Send, Trophy, XCircle, RotateCcw, Plus, RefreshCw, FileDown, CalendarPlus, MessageSquareWarning,
} from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import {
  Bid, BidData, BidDocument, BidProfile, BidStatus, Commission, DOC_TYPE_LABELS, FORM_LABELS, FORM_ORDER, STATUS_LABELS, STATUS_STYLE,
  BidResult, bidCalendarUrl, bidTotals, deleteBid, duplicateBid, getBid, getBidDocuments, getBidProfile, readBidAgain, saveBid, setBidStatus,
} from '../services/bidsApi';
import { getLetterOptions, Signer } from '../services/lettersApi';
import { ChecklistTab, OverviewTab, PricesTab, TechnicalTab, card, input, label, matchDocument } from '../components/Bid/BidTabs';
import { BidFormContext, BidFormView, defaultCoverBody } from '../components/Bid/BidForms';
import { checkBid } from '../utils/bidChecker';
import WordFillCard from '../components/Bid/WordFillCard';
import { ActivityTab, BrochureModal, ResultCard, ResultModal, StatusNoteModal } from '../components/Bid/BidActivity';
import { buildBidPack, downloadPdf } from '../utils/bidPack';
import { pdfFileSegment } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'prices', label: 'Prices' },
  { key: 'technical', label: 'Technical' },
  { key: 'forms', label: 'Forms' },
  { key: 'check', label: 'Check & download' },
  { key: 'activity', label: 'Activity' },
] as const;
type Tab = typeof TABS[number]['key'];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "3 days 4 h left" / "Closed 2 days ago". */
export const timeLeftText = (minutes?: number | null) => {
  if (minutes == null) return '';
  const m = Math.abs(minutes);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const text = d > 0 ? `${d} day${d === 1 ? '' : 's'}${d < 3 && h ? ` ${h} h` : ''}` : h > 0 ? `${h} h ${m % 60} min` : `${m % 60} min`;
  return minutes >= 0 ? `${text} left` : `Closed ${text} ago`;
};

/** Fill in sensible defaults the first time a bid is opened. */
function withDefaults(data: BidData, profile: BidProfile, docs: BidDocument[]): BidData {
  const o = data.options || {};
  if (o.bid_date) return data;
  const t = data.tender || {};
  const checklist = (data.checklist || []).map((c) => {
    if (c.document_id || c.doc_type === 'form' || c.doc_type === 'condition') return c;
    const m = matchDocument(c.doc_type, docs);
    return m ? { ...c, document_id: m.id, done: true } : c;
  });
  const attachments = Array.from(new Set(checklist.map((c) => c.document_id).filter((x): x is number => !!x)));
  const isRfq = data.kind === 'rfq';
  const next: BidData = {
    ...data,
    checklist,
    forms: data.forms && data.forms.length ? data.forms : isRfq ? ['cover_letter', 'quotation'] : ['cover_letter', 'bid_submission_sheet', 'price_schedule', 'technical_compliance'],
    options: {
      bid_date: todayIso(),
      validity_days: Math.max(Number(t.validity_days) || 0, Number(profile.validity_days) || 0) || 90,
      warranty: profile.warranty || t.warranty_required || '',
      delivery: profile.delivery || t.delivery_period || '',
      payment_terms: profile.payment_terms || '',
      nationality: profile.nationality || 'Malawian',
      addenda: 'N/A',
      alternative_no: 'N/A',
      discounts: '',
      commissions: [],
      tax_mode: 'inclusive',
      prices_include: isRfq ? '' : 'all taxes and PPDA levy included',
      show_signature: true,
      attachments,
      ...o,
    },
  };
  const labels = attachments.map((id) => docs.find((d) => d.id === id)?.title).filter(Boolean) as string[];
  next.options!.cover_body = o.cover_body || defaultCoverBody(next, profile, labels);
  return next;
}

/** /tenders/:id — the bid workspace. */
const BidWorkspace: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedCompany, companies } = useCompany();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [bid, setBid] = useState<Bid | null>(null);
  const [data, setData] = useState<BidData>({});
  const [profile, setProfile] = useState<BidProfile>({});
  const [docs, setDocs] = useState<BidDocument[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [packProblems, setPackProblems] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'' | 'review' | 'changes' | 'approved' | 'won' | 'lost' | 'brochure'>('');
  const [activityKey, setActivityKey] = useState(0);
  const dirtyRef = useRef(false);
  const dataRef = useRef<BidData>({});
  dataRef.current = data;
  const previewRef = useRef<HTMLDivElement>(null);
  // Latest profile + vault, for defaults applied when the AI finishes reading.
  const supportRef = useRef<{ profile: BidProfile; docs: BidDocument[] }>({ profile: {}, docs: [] });

  const loadSupport = useCallback(async (companyId: number) => {
    const [p, d, o] = await Promise.all([
      getBidProfile(companyId), getBidDocuments(companyId), getLetterOptions(companyId).catch(() => null),
    ]);
    setProfile(p.profile);
    setDocs(d);
    if (o) setSigners(o.signers);
    supportRef.current = { profile: p.profile, docs: d };
    return supportRef.current;
  }, []);

  // Load the bid (and keep polling while the AI is reading it).
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const load = async (first: boolean) => {
      try {
        const b = await getBid(Number(id));
        if (!alive) return;
        const support = first ? await loadSupport(b.company_id) : supportRef.current;
        setBid(b);
        if (b.ai_status === 'reading') {
          timer = window.setTimeout(() => load(false), 3000);
        } else if (first || !dirtyRef.current) {
          setData(withDefaults(b.data || {}, support.profile, support.docs));
        }
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.error || 'Could not load the bid.');
      } finally {
        if (alive && first) setLoading(false);
      }
    };
    load(true);
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useDocumentTitle(bid ? `${bid.bid_number} — ${data.tender?.title || bid.title || 'Bid'}` : null);

  // Autosave (1.2 s after the last change).
  const update = useCallback((fn: (d: BidData) => BidData) => {
    setData((d) => fn(d));
    dirtyRef.current = true;
    setSaveState('dirty');
  }, []);
  useEffect(() => {
    if (saveState !== 'dirty' || !bid) return;
    const t = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const b = await saveBid(bid.id, dataRef.current);
        dirtyRef.current = false;
        setBid((old) => (old ? { ...old, ...b, data: old.data } : b));
        setSaveState('saved');
      } catch (e: any) {
        setSaveState('error');
        setError(e?.response?.data?.error || 'Could not save — check your connection.');
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [data, saveState, bid]);

  const signatureUrl = useMemo(() => signers.find((s) => s.id === profile.signatory_user_id)?.signature_url || null, [signers, profile.signatory_user_id]);
  const checks = useMemo(() => (bid ? checkBid({ ...bid, kind: data.kind || bid.kind, data }, profile, docs, signatureUrl) : []), [bid, data, profile, docs, signatureUrl]);
  const errors = checks.filter((c) => c.level === 'error');
  const warnings = checks.filter((c) => c.level === 'warning');

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!bid) return <div className="max-w-xl mx-auto mt-10 p-4 rounded-lg bg-red-50 text-red-700 flex items-center gap-2"><AlertCircle size={18} /> {error || 'Bid not found.'}</div>;

  // The bid's own company (its letterhead), whatever company is selected.
  const company: Partial<NonNullable<typeof selectedCompany>> = companies.find((c) => c.id === bid.company_id) || selectedCompany || {};
  const primary = brandColorFor(company.primary_color || '#4f46e5', theme === 'dark');
  const currency = String(company.currency || 'MWK').toUpperCase();
  const canEdit = isAdmin || bid.created_by === user?.id;
  const t = data.tender || {};
  const o = data.options || {};
  const setO = (patch: Partial<NonNullable<BidData['options']>>) => update((d) => ({ ...d, options: { ...(d.options || {}), ...patch } }));
  const forms = FORM_ORDER.filter((f) => (data.forms || []).includes(f));
  const ctx: BidFormContext = {
    data, profile, bidNumber: bid.bid_number, signatureUrl,
    company: {
      name: company.name || '', address: company.address, tpin: company.tpin, logo_url: company.quote_logo_url || company.logo_url,
      primary_color: company.primary_color, secondary_color: company.secondary_color, template: company.template,
      letterhead: company.letterhead, letter_details: company.letter_details, currency: company.currency,
    },
  };

  const changeStatus = async (s: BidStatus, extra: { note?: string; result?: BidResult } = {}) => {
    setBusy(s);
    try {
      const b = await setBidStatus(bid.id, s, extra);
      setBid(b);
      // The result is kept in the bid's data — keep the page's copy in step.
      if (extra.result && b.data) setData((d) => ({ ...d, result: b.data.result }));
      setActivityKey((k) => k + 1);
      setDialog('');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not change the status.');
    } finally {
      setBusy('');
    }
  };
  const ourValue = bidTotals(data).grand;
  const reread = async () => {
    if (!window.confirm('Read the tender document again with AI? The details, checklist and specifications are replaced; your prices are kept.')) return;
    setBusy('reread');
    try { const b = await readBidAgain(bid.id); setBid(b); window.location.reload(); } catch (e: any) { setError(e?.response?.data?.error || 'Could not start reading.'); setBusy(''); }
  };
  const copy = async () => {
    setBusy('copy');
    try { const b = await duplicateBid(bid.id); navigate(`/tenders/${b.id}`); window.location.reload(); } catch (e: any) { setError(e?.response?.data?.error || 'Could not copy.'); setBusy(''); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${bid.bid_number}? You can restore it from Recently Deleted for 30 days.`)) return;
    try { await deleteBid(bid.id); navigate('/tenders'); } catch (e: any) { setError(e?.response?.data?.error || 'Could not delete.'); }
  };

  const download = async (withAnnexes: boolean) => {
    if (!previewRef.current) return;
    setBusy(withAnnexes ? 'pack' : 'forms');
    setPackProblems([]);
    setError('');
    try {
      const els = Array.from(previewRef.current.querySelectorAll<HTMLElement>(':scope > div > .bid-form'));
      const atts = withAnnexes ? (o.attachments || []).map((aid) => docs.find((d) => d.id === aid)).filter((d): d is BidDocument => !!d) : [];
      const { bytes, problems } = await buildBidPack({ formElements: els, attachments: atts, companyName: profile.legal_name || company.name || '', onProgress: setProgress });
      setPackProblems(problems);
      const name = [bid.bid_number, t.reference_number || t.title].filter(Boolean).map((s) => pdfFileSegment(String(s))).join('_');
      downloadPdf(bytes, `${name || 'Bid'}${withAnnexes ? '' : '_forms'}.pdf`);
    } catch (e) {
      console.error(e);
      setError('Could not build the PDF. Please try again.');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  const minutes = bid.minutes_left;
  const urgent = minutes != null && minutes >= 0 && minutes < 3 * 1440;
  const btn = 'inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap';
  const outline = `${btn} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50`;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button onClick={() => navigate('/tenders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 mt-0.5" title="All bids"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{t.title || bid.title || 'New bid'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{bid.bid_number}</span>
              <span className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{(data.kind || bid.kind) === 'rfq' ? 'RFQ' : 'Tender'}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[bid.status]}`}>{STATUS_LABELS[bid.status]}</span>
              {t.procuring_entity && <span>· {t.procuring_entity}</span>}
              {bid.deadline && (
                <span className={`inline-flex items-center gap-1 ${urgent ? 'text-red-600 font-medium' : ''}`}>
                  <Clock className="h-3.5 w-3.5" /> {new Date(bid.deadline.replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {timeLeftText(minutes)}
                </span>
              )}
              {bid.deadline && minutes != null && minutes > 0 && (
                <a href={bidCalendarUrl(bid.id)} className="inline-flex items-center gap-1 text-xs underline hover:text-gray-700" title="Add the deadline to your phone or computer calendar, with reminders 3 days and 1 day before">
                  <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">
            {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Not saved' : 'All changes saved'}
          </span>
          {bid.status === 'draft' && <button onClick={() => setDialog('review')} disabled={!!busy} className={outline}><Send className="h-4 w-4 mr-1.5" /> Ready for review</button>}
          {isAdmin && bid.status === 'review' && <button onClick={() => setDialog('changes')} disabled={!!busy} className={outline}><MessageSquareWarning className="h-4 w-4 mr-1.5" /> Request changes</button>}
          {isAdmin && (bid.status === 'draft' || bid.status === 'review') && <button onClick={() => setDialog('approved')} disabled={!!busy} className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}><ShieldCheck className="h-4 w-4 mr-1.5" /> Approve</button>}
          {['draft', 'review', 'approved'].includes(bid.status) && <button onClick={() => changeStatus('submitted')} disabled={!!busy} className={outline}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark submitted</button>}
          {bid.status === 'submitted' && <>
            <button onClick={() => setDialog('won')} disabled={!!busy} className={`${btn} text-white bg-emerald-600 hover:bg-emerald-700`}><Trophy className="h-4 w-4 mr-1.5" /> Won</button>
            <button onClick={() => setDialog('lost')} disabled={!!busy} className={outline}><XCircle className="h-4 w-4 mr-1.5" /> Not won</button>
          </>}
          {!['draft'].includes(bid.status) && <button onClick={() => changeStatus('draft')} disabled={!!busy} className={outline} title="Back to draft"><RotateCcw className="h-4 w-4" /></button>}
          {canEdit && <button onClick={copy} disabled={!!busy} className={outline} title="Start a similar bid from this one"><Copy className="h-4 w-4" /></button>}
          {isAdmin && <button onClick={remove} className={`${btn} text-red-600 hover:bg-red-50`} title="Delete"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle size={16} /> {error}</div>}
      {(bid.status === 'won' || bid.status === 'lost') && <div className="mb-4"><ResultCard status={bid.status} result={data.result} ourValue={ourValue} currency={currency} /></div>}

      {dialog === 'review' && <StatusNoteModal title="Ready for review" hint="Tell the reviewer anything they should check (optional)." confirm="Send for review" primary={primary} onClose={() => setDialog('')} onConfirm={(note) => changeStatus('review', { note })} />}
      {dialog === 'changes' && <StatusNoteModal title="Request changes" hint="The bid goes back to draft with your note, shown in its Activity tab." confirm="Send back" required primary={primary} onClose={() => setDialog('')} onConfirm={(note) => changeStatus('draft', { note })} />}
      {dialog === 'approved' && <StatusNoteModal title="Approve bid" hint="Approve this bid for submission. Add a note if needed." confirm="Approve" primary="#2563eb" onClose={() => setDialog('')} onConfirm={(note) => changeStatus('approved', { note })} />}
      {(dialog === 'won' || dialog === 'lost') && (
        <ResultModal won={dialog === 'won'} ourValue={ourValue} currency={currency} primary={primary} onClose={() => setDialog('')}
          onConfirm={(result, note) => changeStatus(dialog as BidStatus, { result, note })} />
      )}
      {dialog === 'brochure' && (
        <BrochureModal bidId={bid.id} specs={data.specs || []} primary={primary} onClose={() => setDialog('')}
          onApply={(picked) => {
            update((d) => ({ ...d, specs: (d.specs || []).map((s, i) => { const p = picked.find((x) => x.index === i); return p ? { ...s, offered: p.offered, compliance: p.compliance === 'Not stated' ? s.compliance : p.compliance } : s; }) }));
            setDialog('');
          }} />
      )}

      {bid.ai_status === 'reading' ? (
        <div className={`${card} text-center py-16`}>
          <Sparkles className="h-10 w-10 mx-auto mb-3 animate-pulse" style={{ color: primary }} />
          <p className="text-lg font-semibold text-gray-900">Reading the tender document…</p>
          <p className="text-sm text-gray-500 mt-1">Finding the deadline, requirements, items and specifications. This usually takes under a minute for a large tender.</p>
          <Loader2 className="h-5 w-5 mx-auto mt-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {bid.ai_status === 'failed' && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 flex flex-wrap items-center gap-2">
              <AlertTriangle size={16} /> The document could not be read: {bid.ai_error || 'unknown problem'}. You can fill in the details yourself
              {bid.source_file_url && <button onClick={reread} className="underline font-medium inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> or try again</button>}.
            </div>
          )}
          {bid.ai_status === 'unavailable' && bid.source_file_url && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-gray-50 text-gray-700">AI reading is not available, so fill in the tender details below. Everything else (forms, checks and PDF) works the same.</div>
          )}

          {/* Tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
            {TABS.filter((x) => x.key !== 'technical' || (data.kind || bid.kind) === 'tender' || (data.specs || []).length > 0).map((x) => {
              const n = checks.filter((c) => c.tab === x.key && c.level === 'error').length;
              const on = tab === x.key;
              return (
                <button key={x.key} onClick={() => setTab(x.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${on ? 'text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                  style={on ? { borderColor: primary } : undefined}>
                  {x.label}
                  {x.key === 'check' ? (
                    <span className={`ml-1.5 px-1.5 rounded-full text-xs ${errors.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{errors.length ? errors.length : '✓'}</span>
                  ) : n > 0 && <span className="ml-1.5 px-1.5 rounded-full text-xs bg-red-100 text-red-700">{n}</span>}
                </button>
              );
            })}
          </div>

          <fieldset disabled={!canEdit} className="min-w-0">
            {tab === 'overview' && (
              <OverviewTab data={data} update={update} sourceUrl={bid.source_file_url} sourceName={bid.source_file_name}
                canReread={!!bid.source_file_url && canEdit} onReread={reread} rereading={busy === 'reread'} />
            )}
            {tab === 'checklist' && <ChecklistTab data={data} update={update} docs={docs} isAdmin={isAdmin} />}
            {tab === 'prices' && <PricesTab data={data} update={update} currency={currency} />}
            {tab === 'technical' && <TechnicalTab data={data} update={update} onBrochure={canEdit ? () => setDialog('brochure') : undefined} />}
            {tab === 'forms' && (
              <div className="space-y-5">
                <div className={card}>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">Forms in the bid pack</h3>
                  <p className="text-sm text-gray-500 mb-3">Filled in automatically from the Bid Profile, the tender and your prices.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FORM_ORDER.map((f) => {
                      const on = (data.forms || []).includes(f);
                      return (
                        <label key={f} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}>
                          <input type="checkbox" checked={on} onChange={() => update((d) => ({ ...d, forms: on ? (d.forms || []).filter((x) => x !== f) : [...(d.forms || []), f] }))} className="h-4 w-4 rounded" />
                          {FORM_LABELS[f]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className={card}>
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Our offer</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className={label}>Bid date</label><input type="date" value={o.bid_date || ''} onChange={(e) => setO({ bid_date: e.target.value })} className={input} /></div>
                    <div>
                      <label className={label}>Bid validity (days)</label>
                      <input type="number" min={0} value={o.validity_days || ''} onChange={(e) => setO({ validity_days: Number(e.target.value) || 0 })} className={`${input} ${Number(t.validity_days) > (Number(o.validity_days) || 0) ? 'border-red-400' : ''}`} />
                      {Number(t.validity_days) > 0 && <p className="text-xs text-gray-500 mt-1">Required: {t.validity_days} days</p>}
                    </div>
                    <div><label className={label}>Nationality</label><input value={o.nationality || ''} onChange={(e) => setO({ nationality: e.target.value })} className={input} /></div>
                    <div><label className={label}>Warranty</label><input value={o.warranty || ''} onChange={(e) => setO({ warranty: e.target.value })} className={input} placeholder="e.g. 24 months" /></div>
                    <div><label className={label}>Delivery</label><input value={o.delivery || ''} onChange={(e) => setO({ delivery: e.target.value })} className={input} /></div>
                    <div><label className={label}>Payment terms</label><input value={o.payment_terms || ''} onChange={(e) => setO({ payment_terms: e.target.value })} className={input} /></div>
                    <div><label className={label}>Addenda received</label><input value={o.addenda || ''} onChange={(e) => setO({ addenda: e.target.value })} className={input} placeholder="N/A" /></div>
                    <div><label className={label}>Alternative No.</label><input value={o.alternative_no || ''} onChange={(e) => setO({ alternative_no: e.target.value })} className={input} placeholder="N/A" /></div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                      <input type="checkbox" checked={o.show_signature !== false} onChange={(e) => setO({ show_signature: e.target.checked })} className="h-4 w-4 rounded" />
                      Print the signature {signatureUrl ? '' : '(none saved)'}
                    </label>
                    <div className="md:col-span-3"><label className={label}>Discounts offered</label><input value={o.discounts || ''} onChange={(e) => setO({ discounts: e.target.value })} className={input} placeholder="Leave empty for N/A" /></div>
                    {o.discounts && <div className="md:col-span-3"><label className={label}>How the discount is applied</label><input value={o.discount_method || ''} onChange={(e) => setO({ discount_method: e.target.value })} className={input} /></div>}
                  </div>
                  <div className="mt-4">
                    <label className={label}>Commissions or fees paid (Bid Submission Sheet)</label>
                    {(o.commissions || []).map((c: Commission, i: number) => (
                      <div key={i} className="grid grid-cols-4 gap-2 mb-2">
                        {(['name', 'address', 'reason', 'amount'] as const).map((k) => (
                          <input key={k} value={c[k]} placeholder={k} onChange={(e) => setO({ commissions: (o.commissions || []).map((x, n) => (n === i ? { ...x, [k]: e.target.value } : x)) })} className={input} />
                        ))}
                      </div>
                    ))}
                    <button type="button" onClick={() => setO({ commissions: [...(o.commissions || []), { name: '', address: '', reason: '', amount: '' }] })} className="text-sm text-gray-700 inline-flex items-center"><Plus className="h-4 w-4 mr-1" /> Add {(o.commissions || []).length ? 'another' : '(normally “None”)'}</button>
                  </div>
                </div>

                {(data.forms || []).includes('cover_letter') && (
                  <div className={card}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-base font-semibold text-gray-900">Cover letter</h3>
                      <button type="button" onClick={() => {
                        const labels = (o.attachments || []).map((aid) => docs.find((d) => d.id === aid)?.title).filter(Boolean) as string[];
                        setO({ cover_body: defaultCoverBody(data, profile, labels) });
                      }} className="text-sm text-gray-600 inline-flex items-center"><RefreshCw className="h-4 w-4 mr-1" /> Rewrite from the bid details</button>
                    </div>
                    <label className={label}>Subject</label>
                    <input value={o.cover_subject || ''} onChange={(e) => setO({ cover_subject: e.target.value })} placeholder={`Bid for ${t.title || ''}`} className={`${input} mb-3`} />
                    <label className={label}>Letter text</label>
                    <textarea value={o.cover_body || ''} onChange={(e) => setO({ cover_body: e.target.value })} rows={14} className={`${input} leading-relaxed`} />
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {tab === 'activity' && <ActivityTab bidId={bid.id} refreshKey={activityKey} primary={primary} />}

          {tab === 'check' && (
            <div className="space-y-5">
              <WordFillCard
                bid={bid}
                primary={primary}
                disabled={!canEdit}
                beforeFill={async () => {
                  if (dirtyRef.current) {
                    const b = await saveBid(bid.id, dataRef.current);
                    dirtyRef.current = false;
                    setSaveState('saved');
                    setBid((old) => (old ? { ...old, ...b, data: old.data } : b));
                  }
                }}
                onFilled={(b) => setBid((old) => (old ? { ...old, ...b, data: old.data } : b))}
              />
              <div className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Bid check</h3>
                    <p className="text-sm text-gray-500">
                      {errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before submitting.` : 'No problems found.'}
                      {warnings.length ? ` ${warnings.length} thing${warnings.length === 1 ? '' : 's'} to check.` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => download(false)} disabled={!!busy || !forms.length} className={outline}>
                      {busy === 'forms' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />} Forms only
                    </button>
                    <button onClick={() => download(true)} disabled={!!busy || !forms.length} className={`${btn} text-white`} style={{ backgroundColor: primary }}>
                      {busy === 'pack' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download bid pack
                    </button>
                  </div>
                </div>
                {progress && <p className="text-sm text-gray-600 mb-2 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {progress}</p>}
                {packProblems.length > 0 && <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-sm">{packProblems.join(' ')}</div>}
                <ul className="space-y-1.5">
                  {checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {c.level === 'error' ? <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" /> : c.level === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />}
                      <span className="flex-1 text-gray-800">{c.text}</span>
                      {c.tab === 'profile'
                        ? <Link to="/bid-profile" className="text-xs underline text-gray-500 whitespace-nowrap">Bid Profile</Link>
                        : c.tab !== 'check' && <button onClick={() => setTab(c.tab as Tab)} className="text-xs underline text-gray-500 whitespace-nowrap">Fix</button>}
                    </li>
                  ))}
                </ul>
                {(o.attachments || []).length > 0 && (
                  <p className="text-xs text-gray-400 mt-3">
                    The bid pack adds {(o.attachments || []).length} annex{(o.attachments || []).length === 1 ? '' : 'es'} after the forms: {(o.attachments || []).map((aid) => docs.find((d) => d.id === aid)?.title || DOC_TYPE_LABELS.other).join(', ')}.
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Preview ({forms.length} form{forms.length === 1 ? '' : 's'})</p>
                <div ref={previewRef} className="space-y-6">
                  {forms.map((f) => (
                    <div key={f} className="shadow-lg rounded-lg overflow-hidden bg-white">
                      <BidFormView form={f} ctx={ctx} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BidWorkspace;
