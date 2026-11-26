import React, { useEffect, useState } from 'react';
import { X, Loader2, MessageSquare, Send, Trophy, XCircle, Sparkles, Upload, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import {
  BidEvent, BidResult, BidSpec, STATUS_LABELS, SpecSuggestion, addBidComment, getBidEvents, suggestSpecsFromBrochure,
} from '../../services/bidsApi';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/calculations';
import { input, label } from './BidTabs';

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
      <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">{footer}</div>
    </div>
  </div>
);

/** A status change with an optional note (ready for review / request changes / approve). */
export const StatusNoteModal: React.FC<{
  title: string; hint: string; confirm: string; required?: boolean; primary: string;
  onClose: () => void; onConfirm: (note: string) => Promise<void>;
}> = ({ title, hint, confirm, required, primary, onClose, onConfirm }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
      <button disabled={busy || (required && !note.trim())} onClick={async () => { setBusy(true); try { await onConfirm(note.trim()); } finally { setBusy(false); } }}
        className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
        {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} {confirm}
      </button>
    </>}>
      <p className="text-sm text-gray-600">{hint}</p>
      <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={input} placeholder={required ? 'What needs to change?' : 'Note (optional)'} />
    </Modal>
  );
};

export const LOST_REASONS = ['Price too high', 'Technical non-compliance', 'Missing document', 'Late submission', 'Bid not responsive', 'Cancelled by buyer', 'Other'];

/** Won / not won, with the award details. */
export const ResultModal: React.FC<{
  won: boolean; ourValue: number; currency: string; primary: string;
  onClose: () => void; onConfirm: (result: BidResult, note: string) => Promise<void>;
}> = ({ won, ourValue, currency, primary, onClose, onConfirm }) => {
  const [r, setR] = useState<BidResult>(won ? { awarded_amount: ourValue || null } : { reason: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const gap = !won && Number(r.winner_price) > 0 && ourValue > 0 ? ((ourValue - Number(r.winner_price)) / Number(r.winner_price)) * 100 : null;
  return (
    <Modal title={won ? 'Bid won' : 'Bid not won'} onClose={onClose} footer={<>
      <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(r, note.trim()); } finally { setBusy(false); } }}
        className={`inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${won ? 'bg-emerald-600' : ''}`} style={won ? undefined : { backgroundColor: primary }}>
        {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : won ? <Trophy className="h-4 w-4 mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />} Save
      </button>
    </>}>
      {won ? (
        <>
          <div>
            <label className={label}>Contract amount awarded</label>
            <CurrencyInput value={Number(r.awarded_amount) || 0} onChange={(n) => setR({ ...r, awarded_amount: n || null })} className={`${input} text-right`} />
            <p className="text-xs text-gray-500 mt-1">Our bid: {formatCurrency(ourValue, currency)}. Change it if the buyer awarded a different amount.</p>
          </div>
          <div><label className={label}>Contract / LPO date</label><input type="date" value={r.contract_date || ''} onChange={(e) => setR({ ...r, contract_date: e.target.value })} className={input} /></div>
        </>
      ) : (
        <>
          <div>
            <label className={label}>Main reason</label>
            <select value={r.reason || ''} onChange={(e) => setR({ ...r, reason: e.target.value })} className={`${input} bg-white`}>
              <option value="">— Not known —</option>
              {LOST_REASONS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div><label className={label}>Who won <span className="text-gray-400 font-normal">(if known)</span></label><input value={r.winner || ''} onChange={(e) => setR({ ...r, winner: e.target.value })} className={input} /></div>
          <div>
            <label className={label}>Winning price <span className="text-gray-400 font-normal">(if known)</span></label>
            <CurrencyInput value={Number(r.winner_price) || 0} onChange={(n) => setR({ ...r, winner_price: n || null })} className={`${input} text-right`} />
            {gap != null && <p className={`text-xs mt-1 ${gap > 0 ? 'text-red-600' : 'text-emerald-700'}`}>Our price was {Math.abs(gap).toFixed(1)}% {gap > 0 ? 'higher' : 'lower'} than the winner.</p>}
          </div>
        </>
      )}
      <div><label className={label}>Notes</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} placeholder={won ? 'e.g. LPO number, delivery date' : 'What to do differently next time'} /></div>
    </Modal>
  );
};

/** Award details shown on the bid once it is decided. */
export const ResultCard: React.FC<{ status: string; result?: BidResult; ourValue: number; currency: string }> = ({ status, result, ourValue, currency }) => {
  if (status !== 'won' && status !== 'lost') return null;
  const r = result || {};
  const won = status === 'won';
  return (
    <div className={`rounded-xl border p-4 ${won ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50/60'}`}>
      <p className={`font-semibold flex items-center gap-1.5 ${won ? 'text-emerald-800' : 'text-red-800'}`}>
        {won ? <Trophy className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {won ? 'Won' : 'Not won'}
        {won && r.awarded_amount ? ` — ${formatCurrency(Number(r.awarded_amount), currency)}` : ''}
      </p>
      <div className="text-sm text-gray-700 mt-1 space-y-0.5">
        {won && r.contract_date && <p>Contract date: {new Date(`${r.contract_date}T00:00:00`).toLocaleDateString('en-GB')}</p>}
        {!won && r.reason && <p>Reason: {r.reason}</p>}
        {!won && (r.winner || r.winner_price) && (
          <p>Won by {r.winner || 'another bidder'}{r.winner_price ? ` at ${formatCurrency(Number(r.winner_price), currency)}` : ''}
            {r.winner_price && ourValue ? ` (ours was ${(((ourValue - Number(r.winner_price)) / Number(r.winner_price)) * 100).toFixed(1)}% ${ourValue > Number(r.winner_price) ? 'higher' : 'lower'})` : ''}</p>
        )}
        {r.notes && <p className="text-gray-600">{r.notes}</p>}
        {r.recorded_by && <p className="text-xs text-gray-400">Recorded by {r.recorded_by}{r.recorded_at ? ` on ${new Date(`${r.recorded_at}T00:00:00`).toLocaleDateString('en-GB')}` : ''}</p>}
      </div>
    </div>
  );
};

/** Activity tab: status changes and review comments, newest first. */
export const ActivityTab: React.FC<{ bidId: number; refreshKey: number; primary: string }> = ({ bidId, refreshKey, primary }) => {
  const [events, setEvents] = useState<BidEvent[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => getBidEvents(bidId).then(setEvents).catch(() => setEvents([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [bidId, refreshKey]);
  const send = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try { await addBidComment(bidId, note.trim()); setNote(''); await load(); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-gray-500" /> Activity & comments</h3>
      <p className="text-sm text-gray-500 mb-4">Notes for the team preparing and reviewing this bid. They are not printed.</p>
      <div className="flex gap-2 mb-5">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} placeholder="Write a comment, e.g. “Please confirm the delivery cost”" />
        <button onClick={send} disabled={busy || !note.trim()} className="self-end inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {events === null ? <Loader2 className="h-5 w-5 animate-spin text-gray-300" /> : events.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing yet.</p>
      ) : (
        <ol className="relative border-l border-gray-200 ml-2 space-y-4">
          {events.map((e) => (
            <li key={e.id} className="ml-4">
              <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${e.kind === 'comment' ? 'bg-gray-400' : e.status === 'won' ? 'bg-emerald-500' : e.status === 'lost' ? 'bg-red-500' : e.status === 'approved' ? 'bg-blue-500' : 'bg-amber-500'}`} />
              <p className="text-sm text-gray-900">
                <span className="font-medium">{e.user_name || 'Someone'}</span>{' '}
                {e.kind === 'comment' ? 'commented' : e.status === 'draft' ? (e.note ? 'requested changes' : 'moved it back to draft') : `marked it ${STATUS_LABELS[e.status as keyof typeof STATUS_LABELS]?.toLowerCase() || e.status}`}
                <span className="text-xs text-gray-400 ml-2">{new Date(String(e.created_at).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              {e.note && <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5 rounded-lg bg-gray-50 px-3 py-2">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/** Technical tab: compare a brochure with the requirements and apply chosen suggestions. */
export const BrochureModal: React.FC<{
  bidId: number; specs: BidSpec[]; primary: string; onClose: () => void;
  onApply: (picked: SpecSuggestion[]) => void;
}> = ({ bidId, specs, primary, onClose, onApply }) => {
  const [file, setFile] = useState<File | null>(null);
  const [product, setProduct] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState<SpecSuggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const run = async () => {
    if (!file) { setError('Choose the brochure or spec sheet.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('The file is too large (max 20 MB).'); return; }
    setBusy(true);
    setError('');
    try {
      const s = await suggestSpecsFromBrochure(bidId, file, product);
      setList(s);
      setPicked(new Set(s.filter((x) => x.compliance !== 'Not stated' && x.offered).map((x) => x.index)));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not read the brochure.');
    } finally {
      setBusy(false);
    }
  };
  const icon = (c: string) => (c === 'Comply' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : c === 'Not stated' ? <HelpCircle className="h-4 w-4 text-gray-400" /> : <AlertTriangle className={`h-4 w-4 ${c === 'Partly comply' ? 'text-amber-500' : 'text-red-600'}`} />);

  return (
    <Modal title="Fill in from a brochure" wide onClose={onClose} footer={list ? <>
      <button onClick={() => setList(null)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Try another file</button>
      <button disabled={!picked.size} onClick={() => onApply(list.filter((x) => picked.has(x.index)))} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
        Use {picked.size} suggestion{picked.size === 1 ? '' : 's'}
      </button>
    </> : <>
      <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
      <button disabled={busy} onClick={run} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
        {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />} {busy ? 'Comparing…' : 'Compare'}
      </button>
    </>}>
      {error && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {!list ? (
        <>
          <p className="text-sm text-gray-600">Upload the brochure or specification sheet of the product you are offering. AI compares it with all {specs.length} requirements and suggests what to write — you choose what to use.</p>
          <div><label className={label}>Product offered <span className="text-gray-400 font-normal">(optional)</span></label><input value={product} onChange={(e) => setProduct(e.target.value)} className={input} placeholder="e.g. Toyota Land Cruiser 78 Hard Top" /></div>
          <div>
            <label className={label}>Brochure / spec sheet</label>
            <label className="flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-4 cursor-pointer hover:border-gray-400">
              <Upload className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700 truncate">{file ? file.name : 'Choose a PDF or a photo (up to 20 MB)'}</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          {busy && <p className="text-sm text-gray-500">Reading the brochure and checking each requirement — this can take a minute for a long list.</p>}
        </>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-600">No suggestions — the brochure may not cover these requirements.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Tick the suggestions to use. “Not stated” means the brochure does not mention it — check those yourself.</p>
          {list.map((x) => {
            const s = specs[x.index];
            const on = picked.has(x.index);
            return (
              <label key={x.index} className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${on ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={on} disabled={!x.offered} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(x.index)) n.delete(x.index); else n.add(x.index); return n; })} className="h-4 w-4 mt-1 rounded" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-gray-900 flex items-center gap-1.5">{icon(x.compliance)} {s?.item_no}. {s?.section || 'Requirement'} — <span className="font-normal">{x.compliance}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">Required: {s?.requirement}</p>
                  {x.offered && <p className="text-gray-800 mt-1">Offered: {x.offered}</p>}
                  {x.evidence && <p className="text-xs text-gray-500 italic mt-0.5">{x.evidence}</p>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
