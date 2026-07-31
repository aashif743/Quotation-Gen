import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  uploadExpenseReceipt, deleteExpenseReceipt, getVendors,
} from '../services/api';
import { Expense, Vendor } from '../types';
import {
  Wallet, Search, Plus, Trash2, Edit2, X, AlertCircle, DollarSign, Calendar,
  Paperclip, ExternalLink, Loader2,
} from 'lucide-react';

const CATEGORIES = [
  'Rent', 'Salaries', 'Transport', 'Fuel', 'Utilities', 'Office Supplies',
  'Marketing', 'Repairs & Maintenance', 'Bank Charges', 'Taxes & Licenses', 'Other',
];
const METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card', 'Other'];

interface FormValues {
  category: string;
  description: string;
  amount: string;
  date: string;
  payment_method: string;
  reference: string;
  vendor_id: string;
  notes: string;
}

const blankForm = (): FormValues => ({
  category: '', description: '', amount: '', date: new Date().toISOString().split('T')[0],
  payment_method: '', reference: '', vendor_id: '', notes: '',
});

const Expenses: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptTargetRef = useRef<number | null>(null);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [ex, vs] = await Promise.all([
        getExpenses({ company_id: selectedCompany.id }),
        getVendors(selectedCompany.id),
      ]);
      setExpenses(ex);
      setVendors(vs);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load expenses.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  const categoriesPresent = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category).filter(Boolean))) as string[],
    [expenses]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return expenses.filter((e) => {
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (!term) return true;
      return [e.expense_number, e.category, e.description, e.vendor_name, e.reference]
        .some((f) => (f || '').toLowerCase().includes(term));
    });
  }, [expenses, searchTerm, categoryFilter]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
    const now = new Date();
    const thisMonth = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { total, count: filtered.length, thisMonth };
  }, [filtered, expenses]);

  const openAdd = () => { setEditing(null); setForm(blankForm()); setFormError(''); setModalOpen(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      category: e.category || '', description: e.description || '', amount: String(e.amount ?? ''),
      date: (e.date || '').split('T')[0], payment_method: e.payment_method || '',
      reference: e.reference || '', vendor_id: e.vendor_id ? String(e.vendor_id) : '', notes: e.notes || '',
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
        category: form.category || null,
        description: form.description || null,
        amount: amt,
        date: form.date,
        payment_method: form.payment_method || null,
        reference: form.reference || null,
        vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
        notes: form.notes || null,
      };
      if (editing) {
        await updateExpense(editing.id, payload as any);
        setMessage({ type: 'success', text: 'Expense updated.' });
      } else {
        await createExpense({ company_id: selectedCompany.id, ...payload } as any);
        setMessage({ type: 'success', text: 'Expense added.' });
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Could not save the expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteExpense(toDelete.id);
      setMessage({ type: 'success', text: 'Expense deleted.' });
      setToDelete(null);
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Could not delete.' });
      setToDelete(null);
    }
  };

  const pickReceipt = (expenseId: number) => {
    receiptTargetRef.current = expenseId;
    fileInputRef.current?.click();
  };
  const onReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = receiptTargetRef.current;
    if (!file || id == null) return;
    setUploadingFor(id);
    try {
      await uploadExpenseReceipt(id, file);
      await load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Failed to upload receipt.' });
    } finally {
      setUploadingFor(null);
    }
  };
  const removeReceipt = async (id: number) => {
    if (!window.confirm('Remove this receipt?')) return;
    try { await deleteExpenseReceipt(id); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e?.response?.data?.error || 'Failed to remove receipt.' }); }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={onReceiptFile} className="hidden" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-600 mt-2">Track {selectedCompany.name}'s running costs — rent, salaries, transport and more.</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90" style={{ backgroundColor: primary }}>
          <Plus className="h-5 w-5 mr-2" /> Add Expense
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <SummaryCard label="Total (shown)" value={formatCurrency(stats.total)} icon={DollarSign} truncate />
        <SummaryCard label="This month" value={formatCurrency(stats.thisMonth)} icon={Calendar} truncate />
        <SummaryCard label="Records" value={String(stats.count)} icon={Wallet} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by number, category, description, vendor..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All categories</option>
            {categoriesPresent.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading expenses...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No expenses yet</h3>
              <p className="text-gray-600 mb-6">Record your running business costs to keep track of spending.</p>
              <button onClick={openAdd} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                <Plus className="h-4 w-4 mr-2" /> Add Expense
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: primary }}>{e.expense_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      {e.category ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{e.category}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {e.description || '—'}
                      {e.vendor_name && <span className="text-xs text-gray-500 block">to {e.vendor_name}</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(Number(e.amount || 0))}</td>
                    <td className="px-6 py-4 text-center">
                      {uploadingFor === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400 mx-auto" />
                      ) : e.receipt_url ? (
                        <div className="inline-flex items-center gap-1">
                          <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="View receipt">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button onClick={() => removeReceipt(e.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Remove receipt">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => pickReceipt(e.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Attach receipt">
                          <Paperclip className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(e)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setToDelete(e)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
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
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{formError}</div>}
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
              <div>
                <label className={labelCls}>Category</label>
                <input list="expense-categories" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Rent" />
                <datalist id="expense-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Payment method</label>
                  <select className={inputCls} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="">—</option>
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reference</label>
                  <input className={inputCls} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt #" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Paid to vendor (optional)</label>
                <select className={inputCls} value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
                  <option value="">—</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={submit} disabled={saving} className="px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primary }}>
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Add expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Expense</h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete <span className="font-medium">{toDelete.expense_number}</span> ({formatCurrency(Number(toDelete.amount || 0))})? This also removes its receipt.
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

const SummaryCard: React.FC<{ label: string; value: string; icon: React.ComponentType<{ className?: string }>; truncate?: boolean }> = ({ label, value, icon: Icon, truncate }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
    <div className="p-3 rounded-lg bg-green-100 flex-shrink-0"><Icon className="h-6 w-6 text-green-700" /></div>
    <div className="ml-4 min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`text-2xl font-bold text-gray-900 ${truncate ? 'truncate text-xl' : ''}`} title={value}>{value}</p>
    </div>
  </div>
);

export default Expenses;
