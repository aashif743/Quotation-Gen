import React, { useEffect, useMemo, useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getServices, createService, updateService, deleteService, CatalogService, ServicePricing } from '../services/servicesApi';
import { Tags, Plus, Search, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';

const PRICING_LABEL: Record<ServicePricing, string> = { unit: 'Per item', sqm: 'Per square metre' };

type Draft = { name: string; pricing: ServicePricing; price: string; notes: string };
const emptyDraft: Draft = { name: '', pricing: 'unit', price: '', notes: '' };

/**
 * The company's services and their prices. Picked from when filling in a job
 * card; services typed on a job card are added here automatically.
 */
const Services: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [rows, setRows] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!selectedCompany) return;
    setLoading(true);
    getServices(selectedCompany.id)
      .then(setRows)
      .catch(() => setError('Could not load services.'))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [selectedCompany]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => r.name.toLowerCase().includes(t) || String(r.notes || '').toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const errText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

  const add = async () => {
    if (!selectedCompany || !draft.name.trim()) return;
    setBusy(true); setError('');
    try {
      await createService({ company_id: selectedCompany.id, name: draft.name.trim(), pricing: draft.pricing, price: Number(draft.price) || 0, notes: draft.notes.trim() || undefined });
      setDraft(emptyDraft); setAdding(false); load();
    } catch (e) { setError(errText(e, 'Could not add the service.')); } finally { setBusy(false); }
  };

  const save = async (id: number) => {
    if (!editDraft.name.trim()) return;
    setBusy(true); setError('');
    try {
      await updateService(id, { name: editDraft.name.trim(), pricing: editDraft.pricing, price: Number(editDraft.price) || 0, notes: editDraft.notes.trim() || null });
      setEditingId(null); load();
    } catch (e) { setError(errText(e, 'Could not save the service.')); } finally { setBusy(false); }
  };

  const remove = async (s: CatalogService) => {
    if (!window.confirm(`Remove "${s.name}" from the price list? Job cards that already use it are not changed.`)) return;
    setBusy(true); setError('');
    try { await deleteService(s.id); load(); }
    catch (e) { setError(errText(e, 'Could not remove the service.')); } finally { setBusy(false); }
  };

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const draftFields = (d: Draft, set: (d: Draft) => void) => (
    <>
      <input autoFocus value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} placeholder="Service name, e.g. Banner printing" className={input} />
      <select value={d.pricing} onChange={(e) => set({ ...d, pricing: e.target.value as ServicePricing })} className={input}>
        <option value="unit">Per item</option>
        <option value="sqm">Per square metre</option>
      </select>
      <input type="number" min="0" step="any" value={d.price} onChange={(e) => set({ ...d, price: e.target.value })} placeholder="Price" className={`${input} text-right tabular-nums`} />
      <input value={d.notes} onChange={(e) => set({ ...d, notes: e.target.value })} placeholder="Notes (optional)" className={input} />
    </>
  );

  if (!selectedCompany) return <div className="p-6 text-gray-500">Select a company first.</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Tags className="h-7 w-7" style={{ color: primary }} /> Services & Prices
          </h1>
          <p className="text-gray-600 mt-1">
            Pick these when filling in a job card and the price is filled in for you. New services typed on a job card are added here automatically.
          </p>
        </div>
        <button onClick={() => { setAdding(true); setDraft(emptyDraft); }} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add service
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle size={16} /> {error}</div>}

      {adding && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-sm font-semibold text-gray-900 mb-3">New service</p>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_2fr] gap-2">
            {draftFields(draft, setDraft)}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
            <button onClick={add} disabled={busy || !draft.name.trim()} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Save
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className={`${input} pl-9`} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Service</th>
              <th className="px-5 py-3">Pricing</th>
              <th className="px-5 py-3 text-right">Price</th>
              <th className="px-5 py-3">Notes</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">
                <Tags className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                {rows.length ? 'No services match your search.' : 'No services yet. Add your first one, or type a service on a job card.'}
              </td></tr>
            ) : filtered.map((s) => editingId === s.id ? (
              <tr key={s.id} className="bg-indigo-50/40">
                <td colSpan={4} className="px-5 py-3">
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_2fr] gap-2">{draftFields(editDraft, setEditDraft)}</div>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <button onClick={() => save(s.id)} disabled={busy} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Save"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="Cancel"><X className="h-4 w-4" /></button>
                </td>
              </tr>
            ) : (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-sm font-medium text-gray-900">{s.name}</td>
                <td className="px-5 py-3 text-sm text-gray-600">{PRICING_LABEL[s.pricing] || s.pricing}</td>
                <td className="px-5 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">{formatCurrency(s.price)}</td>
                <td className="px-5 py-3 text-sm text-gray-500">{s.notes || ''}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => { setEditingId(s.id); setEditDraft({ name: s.name, pricing: s.pricing, price: String(s.price), notes: s.notes || '' }); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit"
                      ><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remove"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Services;
