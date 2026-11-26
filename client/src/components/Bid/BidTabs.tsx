import React, { useState } from 'react';
import {
  AlertTriangle, Sparkles, FileText, ExternalLink, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown, CheckCircle2,
  Circle, Paperclip, ListChecks,
} from 'lucide-react';
import {
  BidData, BidDocument, BidItem, BidSpec, ChecklistItem, DOC_TYPE_LABELS, FORM_LABELS, TenderInfo, bidTotals, formForLabel, lineTotal,
} from '../../services/bidsApi';
import { ExpiryBadge } from '../../pages/BidProfile';
import CurrencyInput from '../common/CurrencyInput';
import { amountInWords } from '../../utils/amountInWords';
import { formatCurrency } from '../../utils/calculations';

export const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
export const label = 'block text-sm font-medium text-gray-700 mb-1';
export const card = 'bg-white rounded-xl border border-gray-200 p-5';

type Update = (fn: (d: BidData) => BidData) => void;

/** Best vault document for a checklist line: same type, not expired, newest expiry. */
export const matchDocument = (docType: string, docs: BidDocument[]): BidDocument | undefined =>
  docs
    .filter((d) => d.doc_type === docType)
    .sort((a, b) => (Number(b.days_left ?? 99999) >= 0 ? 1 : 0) - (Number(a.days_left ?? 99999) >= 0 ? 1 : 0)
      || String(b.expires || '9999').localeCompare(String(a.expires || '9999')))[0];

/* -------------------------------- Overview -------------------------------- */

export const OverviewTab: React.FC<{
  data: BidData; update: Update; sourceUrl?: string | null; sourceName?: string | null;
  canReread: boolean; onReread: () => void; rereading: boolean;
}> = ({ data, update, sourceUrl, sourceName, canReread, onReread, rereading }) => {
  const t = data.tender || {};
  const setT = <K extends keyof TenderInfo>(k: K, v: TenderInfo[K]) => update((d) => ({ ...d, tender: { ...(d.tender || {}), [k]: v } }));
  const f = (k: keyof TenderInfo, l: string, ph = '', wide = false) => (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className={label}>{l}</label>
      <input value={(t[k] as any) ?? ''} onChange={(e) => setT(k, e.target.value as any)} placeholder={ph} className={input} />
    </div>
  );
  return (
    <div className="space-y-5">
      {(t.summary || (t.warnings || []).length > 0) && (
        <div className={`${card} border-indigo-200`}>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1"><Sparkles className="h-4 w-4 text-indigo-500" /> Summary</p>
          {t.summary && <p className="text-sm text-gray-700">{t.summary}</p>}
          {(t.warnings || []).length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><AlertTriangle className="h-4 w-4" /> Do not miss</p>
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">{(t.warnings || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Read by AI — check the details below against the tender document.</p>
        </div>
      )}

      {sourceUrl && (
        <div className={`${card} flex flex-wrap items-center gap-3`}>
          <FileText className="h-5 w-5 text-gray-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{sourceName || 'Tender document'}</p>
            <p className="text-xs text-gray-500">The document you received</p>
          </div>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"><ExternalLink className="h-4 w-4 mr-1.5" /> Open</a>
          {canReread && (
            <button onClick={onReread} disabled={rereading} className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50" title="Read the document again with AI (your prices are kept)">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${rereading ? 'animate-spin' : ''}`} /> Read again
            </button>
          )}
        </div>
      )}

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-900">Tender details</h3>
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm">
            {(['tender', 'rfq'] as const).map((k) => (
              <button key={k} type="button" onClick={() => update((d) => ({ ...d, kind: k }))}
                className={`px-3 py-1 rounded-md ${(data.kind || 'tender') === k ? 'bg-gray-900 text-white dark:!bg-gray-200 dark:!text-gray-900' : 'text-gray-600'}`}>
                {k === 'tender' ? 'Tender' : 'RFQ'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {f('title', 'Subject of the procurement', 'e.g. Supply and Delivery of 23 Ambulances', true)}
          {f('procuring_entity', 'Procuring entity', 'e.g. Ministry of Health')}
          {f('reference_number', 'Procurement reference number')}
          <div className="md:col-span-2">
            <label className={label}>Bids are addressed to</label>
            <textarea value={t.addressee || ''} onChange={(e) => setT('addressee', e.target.value)} rows={4} className={input} placeholder={'The Chairperson\nInternal Procurement and Disposal Committee\n…'} />
          </div>
          <div>
            <label className={label}>Submission deadline</label>
            <input type="datetime-local" value={(t.deadline || '').replace(' ', 'T').slice(0, 16)} onChange={(e) => setT('deadline', e.target.value.replace('T', ' '))} className={input} />
          </div>
          {f('submission_place', 'Where to submit')}
          {f('opening', 'Bid opening')}
          {f('procurement_method', 'Procurement method')}
          <div>
            <label className={label}>Required bid validity (days)</label>
            <input type="number" min={0} value={t.validity_days || ''} onChange={(e) => setT('validity_days', Number(e.target.value) || 0)} className={input} />
          </div>
          {f('currency', 'Currency')}
          {f('copies_required', 'Copies required', '1 original + 3 copies')}
          {f('bid_security', 'Bid security', 'Bid securing declaration')}
          {f('performance_security', 'Performance security', 'e.g. 5% of contract price')}
          <div>
            <label className={label}>Performance security (%)</label>
            <input type="number" min={0} step="0.5" value={t.performance_security_percent || ''} onChange={(e) => setT('performance_security_percent', Number(e.target.value) || 0)} className={input} />
          </div>
          {f('delivery_period', 'Delivery period required')}
          {f('delivery_place', 'Delivery place')}
          {f('warranty_required', 'Warranty required')}
          {f('payment_terms', "Buyer's payment terms")}
          {f('price_basis', 'Price basis', 'e.g. inclusive of VAT and PPDA levy', true)}
          {f('clarification_contact', 'Contact for clarifications', '', true)}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------- Checklist ------------------------------- */

export const ChecklistTab: React.FC<{ data: BidData; update: Update; docs: BidDocument[]; isAdmin: boolean }> = ({ data, update, docs, isAdmin }) => {
  const list = data.checklist || [];
  const forms = data.forms || [];
  const attachments = data.options?.attachments || [];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const setItem = (i: number, patch: Partial<ChecklistItem>) => update((d) => ({ ...d, checklist: (d.checklist || []).map((c, n) => (n === i ? { ...c, ...patch } : c)) }));
  const setAttachments = (ids: number[]) => update((d) => ({ ...d, options: { ...(d.options || {}), attachments: ids } }));
  const attach = (id: number) => { if (!attachments.includes(id)) setAttachments([...attachments, id]); };
  const move = (i: number, dir: -1 | 1) => {
    const a = [...attachments];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setAttachments(a);
  };
  const [extra, setExtra] = useState('');

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2"><ListChecks className="h-5 w-5 text-gray-500" /> Requirements checklist</h3>
        <p className="text-sm text-gray-500 mb-4">What the tender asks for. Documents are matched from your vault; forms are filled in automatically.</p>
        {list.length === 0 && <p className="text-sm text-gray-400 mb-3">No requirements yet — add them below.</p>}
        <div className="divide-y divide-gray-100">
          {list.map((c, i) => {
            const isDoc = c.doc_type !== 'condition' && c.doc_type !== 'form';
            const doc = c.document_id ? docById.get(c.document_id) : undefined;
            const form = !isDoc ? formForLabel(c.label) : null;
            const formIncluded = !!form && forms.includes(form);
            const validityMet = /validity/i.test(c.label) && Number(data.tender?.validity_days) > 0 && Number(data.options?.validity_days) >= Number(data.tender?.validity_days);
            const ok = isDoc ? !!doc && !(doc.expires && Number(doc.days_left) < 0) : c.done || formIncluded || validityMet;
            return (
              <div key={i} className="py-3 flex flex-wrap items-start gap-3">
                <button type="button" onClick={() => !isDoc && setItem(i, { done: !c.done })} className={`mt-0.5 ${isDoc ? 'cursor-default' : ''}`} title={isDoc ? undefined : 'Tick when done'}>
                  {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className={`h-5 w-5 ${c.mandatory ? 'text-red-400' : 'text-gray-300'}`} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{c.label} {c.mandatory && <span className="ml-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600">mandatory</span>}</p>
                  {form ? (
                    <p className={`text-xs ${formIncluded ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formIncluded ? `Filled in automatically: ${FORM_LABELS[form]}` : `${FORM_LABELS[form]} is not selected under Forms`}
                    </p>
                  ) : c.doc_type === 'form' && <p className="text-xs text-gray-500">A bidding form — tick it when it is included.</p>}
                  {c.doc_type === 'condition' && <p className="text-xs text-gray-500">A condition — tick it when you have made sure.</p>}
                  {isDoc && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <select
                        value={c.document_id ?? ''}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          setItem(i, { document_id: id, done: !!id });
                          if (id) attach(id);
                        }}
                        className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white max-w-xs"
                      >
                        <option value="">— Choose from vault —</option>
                        {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.expires ? ` (exp. ${d.expires})` : ''}</option>)}
                      </select>
                      {doc ? <ExpiryBadge doc={doc} /> : (
                        <span className="text-xs text-red-600">
                          {docs.some((d) => d.doc_type === c.doc_type) ? 'Choose the document' : `No ${DOC_TYPE_LABELS[c.doc_type] || 'document'} in the vault${isAdmin ? ' — add it in Bid Profile' : ''}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => update((d) => ({ ...d, checklist: (d.checklist || []).filter((_, n) => n !== i) }))} className="p-1.5 text-gray-300 hover:text-red-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Add a requirement, e.g. Valid PPDA certificate" className={input} />
          <button type="button" onClick={() => { if (!extra.trim()) return; update((d) => ({ ...d, checklist: [...(d.checklist || []), { label: extra.trim(), doc_type: 'other', mandatory: true, done: false, document_id: null }] })); setExtra(''); }}
            className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"><Plus className="h-4 w-4 mr-1" /> Add</button>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2"><Paperclip className="h-5 w-5 text-gray-500" /> Annexes in the bid pack</h3>
        <p className="text-sm text-gray-500 mb-4">Added after the forms, each with an “ANNEX” cover page, in this order.</p>
        {attachments.length === 0 ? <p className="text-sm text-gray-400">No annexes yet.</p> : (
          <ol className="space-y-2">
            {attachments.map((id, i) => {
              const d = docById.get(id);
              return (
                <li key={id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-xs font-bold text-gray-500 w-14">ANNEX {i + 1}</span>
                  <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{d ? d.title : 'Removed document'}</span>
                  {d && <ExpiryBadge doc={d} />}
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Up"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === attachments.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Down"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => setAttachments(attachments.filter((x) => x !== id))} className="p-1 text-gray-400 hover:text-red-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ol>
        )}
        {docs.filter((d) => !attachments.includes(d.id)).length > 0 && (
          <select value="" onChange={(e) => e.target.value && attach(Number(e.target.value))} className="mt-3 px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">+ Add a document from the vault…</option>
            {docs.filter((d) => !attachments.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        )}
      </div>
    </div>
  );
};

/* --------------------------------- Prices --------------------------------- */

export const PricesTab: React.FC<{ data: BidData; update: Update; currency: string }> = ({ data, update, currency }) => {
  const items = data.items || [];
  const o = data.options || {};
  const tot = bidTotals(data);
  const setItem = (i: number, patch: Partial<BidItem>) => update((d) => ({ ...d, items: (d.items || []).map((it, n) => (n === i ? { ...it, ...patch } : it)) }));
  const setO = (patch: Partial<NonNullable<BidData['options']>>) => update((d) => ({ ...d, options: { ...(d.options || {}), ...patch } }));
  const pct = Number(data.tender?.performance_security_percent) || 0;
  const cell = 'px-2 py-1.5 border border-gray-300 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-900">Price schedule</h3>
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm">
            {([['inclusive', 'Prices include VAT & levy'], ['separate', 'Add VAT & levy']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setO({ tax_mode: k })}
                className={`px-3 py-1 rounded-md ${(o.tax_mode || 'inclusive') === k ? 'bg-gray-900 text-white dark:!bg-gray-200 dark:!text-gray-900' : 'text-gray-600'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-2 pr-2 w-14">Item</th><th className="pb-2 pr-2">Description</th><th className="pb-2 pr-2 w-28">Origin</th>
                <th className="pb-2 pr-2 w-20 text-right">Qty</th><th className="pb-2 pr-2 w-20">Unit</th><th className="pb-2 pr-2 w-36 text-right">Unit price</th>
                <th className="pb-2 pr-2 w-36 text-right">Total</th><th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td className="pr-2 pb-2"><input value={it.item_no} onChange={(e) => setItem(i, { item_no: e.target.value })} className={cell} /></td>
                  <td className="pr-2 pb-2"><textarea value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} rows={2} className={cell} /></td>
                  <td className="pr-2 pb-2"><input value={it.origin || ''} onChange={(e) => setItem(i, { origin: e.target.value })} placeholder="e.g. Japan" className={cell} /></td>
                  <td className="pr-2 pb-2"><CurrencyInput value={Number(it.quantity) || 0} onChange={(n) => setItem(i, { quantity: n })} className={`${cell} text-right`} /></td>
                  <td className="pr-2 pb-2"><input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} className={cell} /></td>
                  <td className="pr-2 pb-2">
                    <CurrencyInput value={it.unit_price ?? 0} onChange={(n) => setItem(i, { unit_price: n })} placeholder="0.00"
                      className={`${cell} text-right ${it.unit_price == null || !(Number(it.unit_price) > 0) ? 'border-red-300' : ''}`} />
                  </td>
                  <td className="pr-2 pb-2 text-right tabular-nums font-medium pt-2">{lineTotal(it).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="pb-2"><button onClick={() => update((d) => ({ ...d, items: (d.items || []).filter((_, n) => n !== i) }))} className="p-1.5 text-gray-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update((d) => ({ ...d, items: [...(d.items || []), { item_no: String((d.items || []).length + 1), description: '', quantity: 1, unit: 'Each', unit_price: null, origin: '' }] }))}
          className="mt-2 inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"><Plus className="h-4 w-4 mr-1" /> Add item</button>

        <div className="mt-5 flex flex-wrap justify-between gap-6">
          <div className="space-y-3 max-w-md flex-1 min-w-[16rem]">
            {(o.tax_mode || 'inclusive') === 'inclusive' ? (
              <div>
                <label className={label}>Wording on the forms</label>
                <input value={o.prices_include ?? ''} onChange={(e) => setO({ prices_include: e.target.value })} placeholder="e.g. all taxes and PPDA levy included" className={input} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>VAT %</label><input type="number" step="0.1" value={+((o.vat_rate ?? 0.165) * 100).toFixed(2)} onChange={(e) => setO({ vat_rate: (Number(e.target.value) || 0) / 100 })} className={input} /></div>
                <div><label className={label}>PPDA levy %</label><input type="number" step="0.1" value={+((o.levy_rate ?? 0.01) * 100).toFixed(2)} onChange={(e) => setO({ levy_rate: (Number(e.target.value) || 0) / 100 })} className={input} /></div>
              </div>
            )}
          </div>
          <div className="w-full sm:w-96 bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
            {tot.separate && <>
              <div className="flex justify-between"><span className="text-gray-600">Sub-total</span><span className="tabular-nums">{formatCurrency(tot.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">VAT</span><span className="tabular-nums">{formatCurrency(tot.vat, currency)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">PPDA levy</span><span className="tabular-nums">{formatCurrency(tot.levy, currency)}</span></div>
            </>}
            <div className="flex justify-between text-base font-bold pt-1 border-t border-gray-200"><span>Total bid price</span><span className="tabular-nums">{formatCurrency(tot.grand, currency)}</span></div>
            <p className="text-xs text-gray-500 italic">{amountInWords(tot.grand, currency)}</p>
            {pct > 0 && <p className="text-xs text-gray-500">Performance security ({pct}%): {formatCurrency(Math.round(tot.grand * pct) / 100, currency)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------- Technical ------------------------------- */

export const TechnicalTab: React.FC<{ data: BidData; update: Update }> = ({ data, update }) => {
  const specs = data.specs || [];
  const setSpec = (i: number, patch: Partial<BidSpec>) => update((d) => ({ ...d, specs: (d.specs || []).map((s, n) => (n === i ? { ...s, ...patch } : s)) }));
  const forms = data.forms || [];
  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Technical specifications & compliance</h3>
          <p className="text-sm text-gray-500">Each requirement is filled in as “Comply” with the same specification offered. Change only the lines where your product differs (e.g. the colour or the model offered).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => update((d) => ({ ...d, specs: (d.specs || []).map((s) => ({ ...s, compliance: 'Comply' })) }))} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">All comply</button>
          <button onClick={() => update((d) => ({ ...d, specs: [...(d.specs || []), { item_no: String((d.specs || []).length + 1), section: '', requirement: '', mandatory: true, offered: '', compliance: 'Comply' }] }))}
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"><Plus className="h-4 w-4 mr-1" /> Add row</button>
        </div>
      </div>
      {!forms.includes('technical_compliance') && <p className="mb-3 text-sm text-amber-700">The compliance sheet is not selected under Forms, so it will not be in the bid pack.</p>}
      {specs.length === 0 ? <p className="text-sm text-gray-400">No technical specifications.</p> : (
        <div className="space-y-3">
          {specs.map((s, i) => (
            <div key={i} className={`rounded-lg border p-3 ${/does not/i.test(s.compliance) ? 'border-red-300 bg-red-50/40' : /partly/i.test(s.compliance) ? 'border-amber-300' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input value={s.item_no} onChange={(e) => setSpec(i, { item_no: e.target.value })} className="w-14 px-2 py-1 border border-gray-300 rounded-md text-sm" />
                <input value={s.section} onChange={(e) => setSpec(i, { section: e.target.value })} placeholder="Feature" className="w-40 px-2 py-1 border border-gray-300 rounded-md text-sm font-semibold" />
                {s.mandatory && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-600">mandatory</span>}
                <div className="ml-auto flex items-center gap-2">
                  <select value={s.compliance} onChange={(e) => setSpec(i, { compliance: e.target.value })} className="px-2 py-1 border border-gray-300 rounded-md text-sm bg-white">
                    {['Comply', 'Partly comply', 'Does not comply'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={() => update((d) => ({ ...d, specs: (d.specs || []).filter((_, n) => n !== i) }))} className="p-1 text-gray-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Required</p>
                  <textarea value={s.requirement} onChange={(e) => setSpec(i, { requirement: e.target.value })} rows={3} className={`${input} text-gray-600`} />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Offered by us</p>
                  <textarea value={s.offered} onChange={(e) => setSpec(i, { offered: e.target.value })} rows={3} className={`${input} ${!s.offered.trim() ? 'border-red-300' : ''}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { FORM_LABELS };
