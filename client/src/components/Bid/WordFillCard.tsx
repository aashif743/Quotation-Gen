import React, { useState } from 'react';
import { FileText, Loader2, Download, Sparkles, ChevronDown, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Bid, fillWord } from '../../services/bidsApi';

/**
 * "The tender's own Word file": fills the original .docx (its own layout,
 * logos and wording) and offers it for download, with a report of what was
 * filled and which blanks were left (usually those for the bank, the
 * manufacturer or the procuring entity).
 */
const WordFillCard: React.FC<{
  bid: Bid;
  primary: string;
  /** Save pending changes first, so the Word file uses the latest prices. */
  beforeFill: () => Promise<void>;
  onFilled: (b: Bid) => void;
  disabled?: boolean;
}> = ({ bid, primary, beforeFill, onFilled, disabled }) => {
  const [highlight, setHighlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<'' | 'filled' | 'left'>('');
  const isWord = !!bid.source_file_url && /\.docx$/i.test(bid.source_file_url);
  const r = bid.word_report;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await beforeFill();
      onFilled(await fillWord(bid.id, highlight));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not fill the Word document.');
    } finally {
      setBusy(false);
    }
  };

  const by = (k: string) => (r ? r.filled.filter((x) => x.by === k).length : 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0"><FileText className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">The tender’s own Word file</h3>
            <p className="text-sm text-gray-500">
              {isWord
                ? 'Fill in the document you received — its own layout and wording — and download it as Word to print or check.'
                : bid.source_file_url
                  ? 'This tender was received as a PDF, which cannot be filled in place. Use the bid pack — or upload the Word (.docx) version as a new bid.'
                  : 'No tender document was uploaded for this bid. Use the bid pack.'}
            </p>
          </div>
        </div>
        {isWord && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="h-4 w-4 rounded" />
              Highlight what is filled (for checking)
            </label>
            <button onClick={run} disabled={busy || disabled} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap" style={{ backgroundColor: primary }}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              {busy ? 'Filling…' : r ? 'Fill again' : 'Fill the Word file'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {busy && <p className="mt-3 text-sm text-gray-500">Filling the forms{bid.word_report?.ai !== false ? ' — the AI checks any unusual blanks, this can take up to a minute' : ''}…</p>}

      {isWord && r && bid.word_file_url && !busy && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-emerald-900">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> {r.filled.length} blanks filled{r.tables.length ? `, ${r.tables.length} table${r.tables.length === 1 ? '' : 's'}` : ''}{r.signatures ? `, signature in ${r.signatures} place${r.signatures === 1 ? '' : 's'}` : ''}</p>
              <p className="text-emerald-800 text-xs mt-0.5">
                {[by('rule') + by('profile') ? `${by('rule') + by('profile')} from your profile and bid` : '', by('ai') ? `${by('ai')} by AI` : '', r.removed ? `${r.removed} instruction box${r.removed === 1 ? '' : 'es'} removed` : '']
                  .filter(Boolean).join(' · ')}
                {bid.word_filled_at ? ` · ${new Date(String(bid.word_filled_at).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </div>
            <a href={bid.word_file_url} download={bid.word_file_name || 'tender_filled.docx'} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-4 w-4 mr-1.5" /> Download Word file
            </a>
          </div>
          {r.tables.length > 0 && <p className="text-xs text-emerald-900 mt-2">Tables: {r.tables.join(' · ')}</p>}
          {(r.othersForms || []).length > 0 && (
            <p className="text-xs text-amber-800 mt-2 flex items-start gap-1">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Left for others to fill: {(r.othersForms || []).map((n) => `${n} (${/manufacturer/i.test(n) ? 'the manufacturer' : 'your bank or insurer'})`).join(', ')}.
            </p>
          )}
          {r.aiError && <p className="text-xs text-amber-700 mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> AI could not check the unusual blanks: {r.aiError}</p>}

          <div className="mt-3 space-y-2">
            <button onClick={() => setOpen(open === 'filled' ? '' : 'filled')} className="w-full flex items-center justify-between text-sm font-medium text-gray-800">
              What was filled ({r.filled.length}) <ChevronDown className={`h-4 w-4 transition-transform ${open === 'filled' ? 'rotate-180' : ''}`} />
            </button>
            {open === 'filled' && (
              <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-white">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {r.filled.map((x, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-gray-500 w-1/3">{x.blank.length > 90 ? `${x.blank.slice(0, 90)}…` : x.blank}</td>
                        <td className="px-2 py-1.5 text-gray-900">{x.value.length > 160 ? `${x.value.slice(0, 160)}…` : x.value}</td>
                        <td className="px-2 py-1.5 text-gray-400 w-12">{x.by === 'ai' ? 'AI' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {r.left.length > 0 && (
              <>
                <button onClick={() => setOpen(open === 'left' ? '' : 'left')} className="w-full flex items-center justify-between text-sm font-medium text-gray-800">
                  Left blank ({r.left.length}) <ChevronDown className={`h-4 w-4 transition-transform ${open === 'left' ? 'rotate-180' : ''}`} />
                </button>
                {open === 'left' && (
                  <div className="rounded border border-gray-200 bg-white p-2">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Usually for the bank, the manufacturer or the procuring entity — check the ones that are yours.</p>
                    <ul className="max-h-56 overflow-y-auto text-xs text-gray-700 list-disc pl-5 space-y-0.5">
                      {Array.from(new Set(r.left.map((x) => x.blank))).map((b, i) => <li key={i}>{b.length > 160 ? `${b.slice(0, 160)}…` : b}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WordFillCard;
