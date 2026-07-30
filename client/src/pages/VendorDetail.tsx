import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getVendor, getVendorPurchases, updateVendor } from '../services/api';
import { Vendor, PurchaseDocSummary } from '../types';
import {
  ArrowLeft, Edit2, Save, X, Plus, ShoppingCart, DollarSign, Calendar, Loader2,
} from 'lucide-react';

const statusPill = (s?: string) => ({
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  pending: 'bg-gray-100 text-gray-700',
}[s || 'pending'] || 'bg-gray-100 text-gray-700');

const VendorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [purchases, setPurchases] = useState<PurchaseDocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Vendor>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [v, p] = await Promise.all([getVendor(Number(id)), getVendorPurchases(Number(id))]);
      setVendor(v);
      setPurchases(p);
    } catch {
      setVendor(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEdit = () => {
    if (!vendor) return;
    setForm({
      name: vendor.name, contact_person: vendor.contact_person, email: vendor.email,
      phone: vendor.phone, address: vendor.address, tax_id: vendor.tax_id, notes: vendor.notes,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!vendor) return;
    setSaving(true);
    try {
      const updated = await updateVendor(vendor.id, form);
      setVendor((prev) => (prev ? { ...prev, ...updated } : updated));
      setEditing(false);
    } catch {
      /* keep editing on error */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }
  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Vendor not found</p>
        <button onClick={() => navigate('/vendors')} className="text-blue-600 hover:underline">Back to Vendors</button>
      </div>
    );
  }

  const totalPurchased = Number(vendor.total_purchased || 0);
  const totalPaid = Number(vendor.total_paid || 0);
  const outstanding = totalPurchased - totalPaid;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/vendors')} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Vendors
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/new-purchase')} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Purchase
          </button>
          {isAdmin && !editing && (
            <button onClick={startEdit} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50">
              <Edit2 className="h-4 w-4 mr-1.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Header / info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {!editing ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-600">
              {vendor.contact_person && <div><span className="text-gray-400">Contact:</span> {vendor.contact_person}</div>}
              {vendor.email && <div><span className="text-gray-400">Email:</span> {vendor.email}</div>}
              {vendor.phone && <div><span className="text-gray-400">Phone:</span> {vendor.phone}</div>}
              {vendor.tax_id && <div><span className="text-gray-400">Tax ID:</span> {vendor.tax_id}</div>}
              {vendor.address && <div className="sm:col-span-2"><span className="text-gray-400">Address:</span> {vendor.address}</div>}
              {vendor.notes && <div className="sm:col-span-2 mt-1 text-gray-500 italic">{vendor.notes}</div>}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Edit vendor</h2>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <EditInput label="Name" value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
            <EditInput label="Contact person" value={form.contact_person || ''} onChange={(v) => setForm({ ...form, contact_person: v })} />
            <div className="grid grid-cols-2 gap-3">
              <EditInput label="Email" value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} />
              <EditInput label="Phone" value={form.phone || ''} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <EditInput label="Address" value={form.address || ''} onChange={(v) => setForm({ ...form, address: v })} />
            <EditInput label="Tax ID" value={form.tax_id || ''} onChange={(v) => setForm({ ...form, tax_id: v })} />
            <EditInput label="Notes" value={form.notes || ''} onChange={(v) => setForm({ ...form, notes: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primary }}>
                <Save className="h-4 w-4 mr-1.5" />{saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Stat label="Purchases" value={String(vendor.purchase_count || 0)} icon={ShoppingCart} />
        <Stat label="Total purchased" value={formatCurrency(totalPurchased)} icon={DollarSign} />
        <Stat label="Outstanding payable" value={formatCurrency(outstanding)} icon={DollarSign} amber={outstanding > 0} />
      </div>

      {/* Purchases list */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Purchases</h2>
        </div>
        {purchases.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">No purchases recorded for this vendor yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchases.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/purchase/${p.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: primary }}>{p.number}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />{new Date(p.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 tabular-nums">{formatCurrency(Number(p.grand_total || 0))}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPill(p.payment_status)}`}>
                        {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; icon: React.ComponentType<{ className?: string }>; amber?: boolean }> = ({ label, value, icon: Icon, amber }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex items-center">
    <div className={`p-3 rounded-lg flex-shrink-0 ${amber ? 'bg-amber-100' : 'bg-green-100'}`}>
      <Icon className={`h-5 w-5 ${amber ? 'text-amber-700' : 'text-green-700'}`} />
    </div>
    <div className="ml-4 min-w-0">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`text-xl font-bold ${amber ? 'text-amber-700' : 'text-gray-900'} tabular-nums truncate`} title={value}>{value}</p>
    </div>
  </div>
);

const EditInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default VendorDetail;
