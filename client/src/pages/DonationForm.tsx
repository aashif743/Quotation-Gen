import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { createDonation, getDonation, updateDonation } from '../services/donationsApi';
import {
  Donation, DonationCategory, DonationItem, DonationStatus, RecipientType,
  DONATION_CATEGORY_LABELS, RECIPIENT_TYPE_LABELS,
} from '../types/donations';
import { ArrowLeft, HeartHandshake, Plus, Save, Trash2, Loader2, AlertCircle } from 'lucide-react';

const METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Other'];
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const toInputDate = (v?: string) => {
  if (!v) return localToday();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? localToday()
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface FormState {
  date: string;
  recipient_name: string;
  recipient_type: RecipientType | '';
  recipient_contact: string;
  recipient_address: string;
  category: DonationCategory;
  purpose: string;
  description: string;
  amount: string;
  payment_method: string;
  reference: string;
  received_by: string;
  notes: string;
  status: DonationStatus;
  items: DonationItem[];
}

const blank = (): FormState => ({
  date: localToday(), recipient_name: '', recipient_type: '', recipient_contact: '', recipient_address: '',
  category: 'cash', purpose: '', description: '', amount: '', payment_method: '', reference: '',
  received_by: '', notes: '', status: 'planned', items: [],
});

const DonationForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const currency = selectedCompany?.currency;

  const [form, setForm] = useState<FormState>(blank());
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    getDonation(Number(id))
      .then((d) => {
        setNumber(d.donation_number || '');
        setForm({
          date: toInputDate(d.date), recipient_name: d.recipient_name, recipient_type: d.recipient_type || '',
          recipient_contact: d.recipient_contact || '', recipient_address: d.recipient_address || '',
          category: d.category, purpose: d.purpose || '', description: d.description || '',
          amount: d.amount != null ? String(Number(d.amount)) : '', payment_method: d.payment_method || '',
          reference: d.reference || '', received_by: d.received_by || '', notes: d.notes || '', status: d.status,
          items: (d.items || []).map((it) => ({ description: it.description, quantity: Number(it.quantity), unit_value: Number(it.unit_value) })),
        });
      })
      .catch(() => setError('Failed to load the donation.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const usesItems = form.category === 'goods' || form.category === 'services' || form.items.length > 0;
  const itemsTotal = useMemo(() => form.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_value) || 0), 0), [form.items]);
  const setItem = (i: number, patch: Partial<DonationItem>) => set('items', form.items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const save = async () => {
    setError('');
    if (!selectedCompany) return;
    if (!form.recipient_name.trim()) { setError('Recipient name is required.'); return; }
    const items = form.items.filter((it) => it.description.trim());
    if (!(Number(form.amount) > 0) && !(items.length && itemsTotal > 0)) {
      setError(usesItems ? 'Add at least one item with a value, or enter the total value.' : 'Enter the amount donated.');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Donation> & { company_id: number } = {
        company_id: selectedCompany.id, date: form.date, recipient_name: form.recipient_name.trim(),
        recipient_type: form.recipient_type || null, recipient_contact: form.recipient_contact, recipient_address: form.recipient_address,
        category: form.category, purpose: form.purpose, description: form.description, amount: Number(form.amount) || 0,
        payment_method: form.payment_method, reference: form.reference, received_by: form.received_by, notes: form.notes, items,
        ...(isEdit ? {} : { status: form.status }),
      };
      const saved = isEdit ? await updateDonation(Number(id), payload) : await createDonation(payload);
      navigate(`/donations/${saved.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save the donation.');
      setSaving(false);
    }
  };

  if (!selectedCompany) return <div className="p-6 text-gray-500">Select a company first.</div>;
  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(isEdit ? `/donations/${id}` : '/donations')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft size={20} /></button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HeartHandshake style={{ color: primary }} /> {isEdit ? `Edit donation ${number}` : 'New donation'}
          </h1>
        </div>
        <button onClick={save} disabled={saving} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} {isEdit ? 'Save changes' : 'Save donation'}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle size={16} /> {error}</div>}

      <div className="space-y-5">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Recipient</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Recipient name *</Label><input value={form.recipient_name} onChange={(e) => set('recipient_name', e.target.value)} className={inp} placeholder="e.g. Area 25 Primary School" /></div>
            <div><Label>Recipient type</Label>
              <select value={form.recipient_type} onChange={(e) => set('recipient_type', e.target.value as RecipientType | '')} className={inp}>
                <option value="">Select…</option>
                {(Object.keys(RECIPIENT_TYPE_LABELS) as RecipientType[]).map((k) => <option key={k} value={k}>{RECIPIENT_TYPE_LABELS[k]}</option>)}
              </select>
            </div>
            <div><Label>Contact person / phone</Label><input value={form.recipient_contact} onChange={(e) => set('recipient_contact', e.target.value)} className={inp} /></div>
            <div><Label>Address</Label><input value={form.recipient_address} onChange={(e) => set('recipient_address', e.target.value)} className={inp} /></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Donation</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Date</Label><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inp} /></div>
            <div><Label>Type</Label>
              <select value={form.category} onChange={(e) => set('category', e.target.value as DonationCategory)} className={inp}>
                {(Object.keys(DONATION_CATEGORY_LABELS) as DonationCategory[]).map((k) => <option key={k} value={k}>{DONATION_CATEGORY_LABELS[k]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><Label>Purpose</Label><input value={form.purpose} onChange={(e) => set('purpose', e.target.value)} className={inp} placeholder="e.g. School fees support, flood relief, tournament sponsorship" /></div>
            <div className="sm:col-span-2"><Label>Details</Label><textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className={inp} /></div>
          </div>

          {usesItems && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Items donated</p>
                <button type="button" onClick={() => set('items', [...form.items, { description: '', quantity: 1, unit_value: 0 }])}
                  className="inline-flex items-center text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
                  <Plus className="h-4 w-4 mr-1" /> Add item
                </button>
              </div>
              {form.items.length === 0 && <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">No items yet — add what was donated, or just enter the total value below.</p>}
              <div className="space-y-2">
                {form.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Item" className={`${inp} col-span-12 sm:col-span-6`} />
                    <input type="number" min={0} step="any" value={it.quantity || ''} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} placeholder="Qty" className={`${inp} col-span-4 sm:col-span-2 text-right`} />
                    <input type="number" min={0} step="any" value={it.unit_value || ''} onChange={(e) => setItem(i, { unit_value: Number(e.target.value) })} placeholder="Unit value" className={`${inp} col-span-6 sm:col-span-3 text-right`} />
                    <button type="button" onClick={() => set('items', form.items.filter((_, k) => k !== i))} className="col-span-2 sm:col-span-1 p-2 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              {form.items.length > 0 && <p className="text-right text-sm text-gray-700 mt-2">Items total: <strong>{formatCurrency(itemsTotal, currency)}</strong></p>}
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4 mt-5">
            <div><Label>{usesItems ? `Total value (${currency || 'MWK'})` : `Amount (${currency || 'MWK'}) *`}</Label>
              <input type="number" min={0} step="any" value={form.items.length && itemsTotal > 0 ? itemsTotal : form.amount}
                disabled={form.items.length > 0 && itemsTotal > 0} onChange={(e) => set('amount', e.target.value)}
                className={`${inp} text-right disabled:bg-gray-50`} placeholder="0.00" />
            </div>
            <div><Label>Paid / given by</Label>
              <select value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)} className={inp}>
                <option value="">—</option>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Reference</Label><input value={form.reference} onChange={(e) => set('reference', e.target.value)} className={inp} placeholder="Cheque / transfer no." /></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Handover & notes</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Received by (name)</Label><input value={form.received_by} onChange={(e) => set('received_by', e.target.value)} className={inp} placeholder="Person who received it" /></div>
            {!isEdit && isAdmin && (
              <div><Label>Status</Label>
                <select value={form.status} onChange={(e) => set('status', e.target.value as DonationStatus)} className={inp}>
                  <option value="planned">Awaiting approval</option>
                  <option value="approved">Approved</option>
                  <option value="given">Already given</option>
                </select>
              </div>
            )}
            <div className="sm:col-span-2"><Label>Notes</Label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inp} /></div>
          </div>
          {!isAdmin && <p className="text-xs text-gray-500 mt-3">New donations wait for an admin to approve them.</p>}
        </section>
      </div>
    </div>
  );
};

export default DonationForm;
