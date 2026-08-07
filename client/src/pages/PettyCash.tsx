import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import {
  getPettyCash, getPettyCashSummary, createPettyCash, updatePettyCash,
  deletePettyCash, uploadPettyCashReceipt, deletePettyCashReceipt,
} from '../services/api';
import { PettyCashEntry, PettyCashSummary } from '../types';
import {
  Banknote, Search, Plus, Minus, Trash2, Edit2, X, AlertCircle,
  ArrowDownCircle, ArrowUpCircle, Paperclip, ExternalLink, Loader2, Wallet,
} from 'lucide-react';

const OUT_CATEGORIES = [
  'Transport', 'Tea & Refreshments', 'Stationery', 'Postage', 'Cleaning',
  'Fuel', 'Small Repairs', 'Airtime', 'Sundry', 'Other',
];

interface FormValues {
  type: 'in' | 'out';
  category: string;
  description: string;
  amount: string;
  date: string;
  reference: string;
  notes: string;
}

const blankForm = (type: 'in' | 'out'): FormValues => ({
  type, category: '', description: '', amount: '',
  date: new Date().toISOString().split('T')[0], reference: '', notes: '',
});

const PettyCash: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [summary, setSummary] = useState<PettyCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'in' | 'out'>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PettyCashEntry | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm('out'));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [toDelete, setToDelete] = useState<PettyCashEntry | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptTargetRef = useRef<number | null>(null);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        getPettyCash({ company_id: selectedCompany.id }),
        getPettyCashSummary(selectedCompany.id),
      ]);
      setEntries(list);
      setSummary(sum);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load petty cash.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  // Running balance per entry: accumulate oldest → newest, then look up by id.
  const balanceById = useMemo(() => {
    const asc = [...entries].sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      return d !== 0 ? d : a.id - b.id;
    });
    const map = new Map<number, number>();
    let running = 0;
    for (const e of asc) {
      running += e.type === 'in' ? Number(e.amount) : -Number(e.amount);
      map.set(e.id, Math.round(running * 100) / 100);
    }
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter && e.type !== typeFilter) return false;
      if (!term) return true;
      return [e.entry_number, e.category, e.description, e.reference]
        .some((f) => (f || '').toLowerCase().includes(term));
    });
  }, [entries, searchTerm, typeFilter]);

  const thisMonthOut = useMemo(() => {
    const now = new Date();
    return entries
      .filter((e) => e.type === 'out' && new Date(e.date).getFullYear() === now.getFullYear() && new Date(e.date).getMonth() === now.getMonth())
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [entries]);

  const balance = summary?.balance ?? 0;

  const openAdd = (type: 'in' | 'out') => { setEditing(null); setForm(blankForm(type)); setFormError(''); setModalOpen(true); };
  const openEdit = (e: PettyCashEntry) => {
    setEditing(e);
    setForm({
      type: e.type, category: e.category || '', description: e.description || '',
      amount: String(e.amount ?? ''), date: (e.date || '').split('T')[0],
      reference: e.reference || '', notes: e.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    if (!selectedCompany) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setFormError('Enter a positive amount.'); return; }
    if (!form.date) { setFormError('Pick a date.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        type: form.type,
        category: form.category || null,
        description: form.description || null,
        amount: amt,
        date: form.date,
        reference: form.reference || null,
        notes: form.notes || null,
      };
      if (editing) {
        await updatePettyCash(editing.id, payload as any);
        setMessage({ type: 'success', text: 'Entry updated.' });
      } else {
        await createPettyCash({ company_id: selectedCompany.id, ...payload } as any);
        setMessage({ type: 'success', text: form.type === 'in' ? 'Cash added to the fund.' : 'Payout recorded.' });
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Could not save the entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deletePettyCash(toDelete.id);
      setMessage({ type: 'success', text: 'Entry deleted.' });
      setToDelete(null);
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Could not delete.' });
      setToDelete(null);
    }
  };

  const pickReceipt = (id: number) => { receiptTargetRef.current = id; fileInputRef.current?.click(); };
  const onReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = receiptTargetRef.current;
    if (!file || id == null) return;
    setUploadingFor(id);
    try { await uploadPettyCashReceipt(id, file); await load(); }
    catch (err: any) { setMessage({ type: 'error', text: err?.response?.data?.error || 'Failed to upload receipt.' }); }
    finally { setUploadingFor(null); }
  };
  const removeReceipt = async (id: number) => {
    if (!window.confirm('Remove this receipt?')) return;
    try { await deletePettyCashReceipt(id); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e?.response?.data?.error || 'Failed to remove receipt.' }); }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={onReceiptFile} className="hidden" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Petty Cash</h1>
          <p className="text-gray-600 mt-2">{selectedCompany.name}'s cash fund — top-ups in, small payouts out, running balance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openAdd('in')} className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90 bg-emerald-600">
            <Plus className="h-4 w-4 mr-1.5" /> Cash In
          </button>
          <button onClick={() => openAdd('out')} className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90 bg-rose-600">
            <Minus className="h-4 w-4 mr-1.5" /> Cash Out
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Balance + summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2 rounded-xl shadow-sm border p-6 flex items-center justify-between text-white" style={{ backgroundColor: primary }}>
          <div>
            <p className="text-sm font-medium opacity-90">Current balance in hand</p>
            <p className="text-4xl font-bold mt-1 tabular-nums">{formatCurrency(balance)}</p>
          </div>
          <Wallet className="h-12 w-12 opacity-80" />
        </div>
        <SummaryCard label="Total in" value={formatCurrency(summary?.total_in || 0)} icon={ArrowDownCircle} tone="emerald" />
        <SummaryCard label="Total out" value={formatCurrency(summary?.total_out || 0)} icon={ArrowUpCircle} tone="rose" sub={`${formatCurrency(thisMonthOut)} this month`} />
      </div>

      {balance < 0 && (
        <div className="p-4 rounded-lg bg-amber-50 text-amber-800 flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>The recorded balance is negative — a top-up may be missing. Add a "Cash In" entry to reconcile.</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by number, description, category..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All entries</option>
            <option value="in">Cash in only</option>
            <option value="out">Cash out only</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading petty cash...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Banknote className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No petty cash entries yet</h3>
              <p className="text-gray-600 mb-6">Start by adding a "Cash In" top-up, then record small payouts as they happen.</p>
              <button onClick={() => openAdd('in')} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                <Plus className="h-4 w-4 mr-2" /> Add first top-up
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">In</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Out</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: primary }}>{e.entry_number}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{e.description || (e.type === 'in' ? 'Top-up' : 'Payout')}</div>
                      {e.category && <div className="text-xs text-gray-500">{e.category}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-emerald-600 tabular-nums">{e.type === 'in' ? formatCurrency(Number(e.amount)) : ''}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-rose-600 tabular-nums">{e.type === 'out' ? formatCurrency(Number(e.amount)) : ''}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(balanceById.get(e.id) ?? 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {uploadingFor === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" />
                      ) : e.receipt_url ? (
                        <div className="inline-flex items-center gap-1">
                          <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="View receipt"><ExternalLink className="h-4 w-4" /></a>
                          <button onClick={() => removeReceipt(e.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Remove receipt"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => pickReceipt(e.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Attach receipt"><Paperclip className="h-4 w-4" /></button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(e)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Edit"><Edit2 className="h-4 w-4" /></button>
                        {isAdmin && <button onClick={() => setToDelete(e)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Entry' : form.type === 'in' ? 'Add Cash (Top-up)' : 'Record Payout'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{formError}</div>}
              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({ ...form, type: 'in' })} className={`px-3 py-2 rounded-lg border text-sm font-medium ${form.type === 'in' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}>Cash In</button>
                <button type="button" onClick={() => setForm({ ...form, type: 'out' })} className={`px-3 py-2 rounded-lg border text-sm font-medium ${form.type === 'out' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-700 border-gray-300'}`}>Cash Out</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Amount *</label>
                  <input type="number" min="0" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>Date *</label>
                  <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              {form.type === 'out' && (
                <div>
                  <label className={labelCls}>Category</label>
                  <input list="pc-categories" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Transport" />
                  <datalist id="pc-categories">{OUT_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
              )}
              <div>
                <label className={labelCls}>{form.type === 'in' ? 'Source / note' : 'What was it for?'}</label>
                <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.type === 'in' ? 'e.g. Withdrawn from bank' : 'e.g. Taxi to bank'} />
              </div>
              <div>
                <label className={labelCls}>Reference</label>
                <input className={inputCls} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt / voucher #" />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={submit} disabled={saving} className={`px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 ${form.type === 'in' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                {saving ? 'Saving...' : editing ? 'Save changes' : form.type === 'in' ? 'Add cash' : 'Record payout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Entry</h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete <span className="font-medium">{toDelete.entry_number}</span> ({formatCurrency(Number(toDelete.amount || 0))})? This changes the running balance.
            </p>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

const SummaryCard: React.FC<{ label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: 'emerald' | 'rose'; sub?: string }> = ({ label, value, icon: Icon, tone, sub }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
    <div className={`p-3 rounded-lg flex-shrink-0 ${tone === 'emerald' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
      <Icon className={`h-6 w-6 ${tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'}`} />
    </div>
    <div className="ml-4 min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xl font-bold text-gray-900 truncate" title={value}>{value}</p>
      {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
    </div>
  </div>
);

export default PettyCash;
