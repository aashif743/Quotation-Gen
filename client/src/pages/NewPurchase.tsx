import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getQuotations, getInvoices, createPurchase } from '../services/api';
import { Vendor, Quotation, Invoice } from '../types';
import VendorPicker from '../components/Vendor/VendorPicker';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';

interface Row { description: string; quantity: string; unit_cost: string; }

const emptyRow = (): Row => ({ description: '', quantity: '1', unit_cost: '' });

const NewPurchase: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [orderLink, setOrderLink] = useState(''); // "q:123" | "i:456" | ""
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    getQuotations(selectedCompany.id).then(setQuotations).catch(() => setQuotations([]));
    getInvoices(selectedCompany.id).then(setInvoices).catch(() => setInvoices([]));
  }, [selectedCompany]);

  const onSelectVendor = (v: Vendor) => {
    setVendorId(v.id);
    setVendorName(v.name);
    setVendorAddress(v.address || '');
    setVendorEmail(v.email || '');
    setVendorPhone(v.phone || '');
  };

  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0), 0),
    [rows]
  );

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    if (!selectedCompany) return;
    if (!vendorName.trim()) { setError('Please choose or enter a vendor.'); return; }
    const items = rows
      .filter((r) => r.description.trim() !== '')
      .map((r, i) => ({
        description: r.description.trim(),
        quantity: Number(r.quantity) || 0,
        unit_cost: Number(r.unit_cost) || 0,
        total: (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0),
        sort_order: i,
      }));
    if (items.length === 0) { setError('Add at least one item with a description.'); return; }

    const quotation_id = orderLink.startsWith('q:') ? Number(orderLink.slice(2)) : null;
    const invoice_id = orderLink.startsWith('i:') ? Number(orderLink.slice(2)) : null;

    setSaving(true);
    setError('');
    try {
      const created = await createPurchase({
        company_id: selectedCompany.id,
        vendor_id: vendorId,
        vendor_name: vendorName.trim(),
        vendor_address: vendorAddress,
        vendor_email: vendorEmail,
        vendor_phone: vendorPhone,
        quotation_id,
        invoice_id,
        date,
        notes,
        items,
      } as any);
      navigate(`/purchase/${created.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save the purchase.');
      setSaving(false);
    }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
      </button>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">New Purchase</h1>
        <p className="text-gray-600 mt-2">Record what you bought from a vendor. Link it to a client order to track profit.</p>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
          <VendorPicker
            companyId={selectedCompany.id}
            value={vendorName}
            onChange={(name) => { setVendorName(name); setVendorId(null); }}
            onSelect={onSelectVendor}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Vendor email"><input className={inputCls} value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} placeholder="vendor@example.com" /></Field>
          <Field label="Vendor phone"><input className={inputCls} value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="+265 ..." /></Field>
        </div>
        <Field label="Vendor address"><input className={inputCls} value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Purchase date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Link to client order (optional)">
            <select className={inputCls} value={orderLink} onChange={(e) => setOrderLink(e.target.value)}>
              <option value="">— none —</option>
              {invoices.length > 0 && (
                <optgroup label="Invoices">
                  {invoices.map((i) => (
                    <option key={`i${i.id}`} value={`i:${i.id}`}>{i.invoice_number} · {i.client_name}</option>
                  ))}
                </optgroup>
              )}
              {quotations.length > 0 && (
                <optgroup label="Quotations">
                  {quotations.map((q) => (
                    <option key={`q${q.id}`} value={`q:${q.id}`}>{q.quote_number} · {q.client_name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Items bought</h2>
          <button onClick={addRow} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add item
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left font-medium py-2">Description</th>
                <th className="text-right font-medium py-2 w-24">Qty</th>
                <th className="text-right font-medium py-2 w-32">Unit cost</th>
                <th className="text-right font-medium py-2 w-32">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <input className={inputCls} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="What you bought" />
                  </td>
                  <td className="py-2 px-1">
                    <input type="number" min="0" className={`${inputCls} text-right`} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                  </td>
                  <td className="py-2 px-1">
                    <input type="number" min="0" className={`${inputCls} text-right`} value={r.unit_cost} onChange={(e) => setRow(i, { unit_cost: e.target.value })} onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" />
                  </td>
                  <td className="py-2 pl-1 text-right text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency((Number(r.quantity) || 0) * (Number(r.unit_cost) || 0))}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeRow(i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-gray-200">
          <div className="text-right">
            <div className="text-sm text-gray-500">Total cost</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(subtotal)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about this purchase..." />
        </Field>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: primary }}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Saving...' : 'Save Purchase'}
        </button>
      </div>
    </div>
  );
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
);

export default NewPurchase;
