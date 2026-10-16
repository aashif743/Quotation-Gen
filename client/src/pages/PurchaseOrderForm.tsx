import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getQuotations } from '../services/api';
import {
  getPurchaseOrder, getNextLpoNumber, createPurchaseOrder, updatePurchaseOrder, getJobCardOptions,
} from '../services/purchaseOrdersApi';
import { Vendor, Quotation } from '../types';
import { PurchaseOrderInput } from '../types/purchaseOrders';
import VendorPicker from '../components/Vendor/VendorPicker';
import CurrencyInput from '../components/common/CurrencyInput';
import { localToday } from '../components/PurchaseOrder/poUtils';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';

interface Row { description: string; quantity: string; unit_cost: number; }

const emptyRow = (): Row => ({ description: '', quantity: '1', unit_cost: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Create / edit page for LPOs. `/lpos/new` creates; `/lpos/:id/edit` edits.
 * Totals shown here are a live preview — the server recomputes them from the
 * items and the company's VAT rate on save.
 */
const PurchaseOrderForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [vatRate, setVatRate] = useState(0);
  const [lpoNumber, setLpoNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [date, setDate] = useState(localToday);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [quotationId, setQuotationId] = useState('');
  const [jobCardId, setJobCardId] = useState('');
  const [includeVat, setIncludeVat] = useState(false);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [jobCards, setJobCards] = useState<{ id: number; job_card_number: string; client_name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lockedReceived, setLockedReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Initial load: new → company defaults + next number; edit → existing LPO.
  useEffect(() => {
    let alive = true;
    if (isNew) {
      if (!selectedCompany) return;
      setCompanyId(selectedCompany.id);
      const rate = Number(selectedCompany.vat_rate) || 0;
      setVatRate(rate);
      setIncludeVat(rate > 0);
      setLoading(true);
      getNextLpoNumber(selectedCompany.id)
        .then(({ lpoNumber: n }) => { if (alive) setLpoNumber((prev) => prev || n); })
        .catch(() => { /* user can type a number */ })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }
    (async () => {
      try {
        const po = await getPurchaseOrder(parseInt(id!, 10));
        if (!alive) return;
        setCompanyId(po.company_id);
        setVatRate(Number(po.company_vat_rate) || 0);
        setLpoNumber(po.lpo_number);
        setVendorName(po.vendor_name || '');
        setVendorId(po.vendor_id ?? null);
        setVendorAddress(po.vendor_address || '');
        setVendorEmail(po.vendor_email || '');
        setVendorPhone(po.vendor_phone || '');
        setDate(po.date || localToday());
        setDeliveryDate(po.delivery_date || '');
        setDeliveryAddress(po.delivery_address || '');
        setPaymentTerms(po.payment_terms || '');
        setQuotationId(po.quotation_id ? String(po.quotation_id) : '');
        setJobCardId(po.job_card_id ? String(po.job_card_id) : '');
        setIncludeVat(Number(po.vat_amount) > 0);
        setNotes(po.notes || '');
        setTerms(po.terms_conditions || '');
        setRows(
          (po.items || []).length
            ? (po.items || []).map((it) => ({
                description: it.description,
                quantity: String(Number(it.quantity)),
                unit_cost: Number(it.unit_cost) || 0,
              }))
            : [emptyRow()]
        );
        setLockedReceived(po.status === 'received' && !isAdmin);
      } catch (e: any) {
        if (alive) setLoadError(e?.response?.data?.error || 'Failed to load LPO.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isNew, selectedCompany, isAdmin]);

  // Optional link targets for the LPO's company.
  useEffect(() => {
    if (!companyId) return;
    getQuotations(companyId).then(setQuotations).catch(() => setQuotations([]));
    getJobCardOptions(companyId).then(setJobCards);
  }, [companyId]);

  const onSelectVendor = (v: Vendor) => {
    setVendorId(v.id);
    setVendorName(v.name);
    setVendorAddress(v.address || '');
    setVendorEmail(v.email || '');
    setVendorPhone(v.phone || '');
  };

  const subtotal = useMemo(
    () => round2(rows.reduce((s, r) => s + round2((Number(r.quantity) || 0) * (Number(r.unit_cost) || 0)), 0)),
    [rows]
  );
  const vatAmount = includeVat ? round2(subtotal * vatRate) : 0;
  const grandTotal = round2(subtotal + vatAmount);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    if (!companyId) return;
    if (!lpoNumber.trim()) { setError('Please enter an LPO number.'); return; }
    if (!vendorName.trim()) { setError('Please choose or enter a supplier.'); return; }
    const items = rows
      .filter((r) => r.description.trim() !== '')
      .map((r) => ({
        description: r.description.trim(),
        quantity: Number(r.quantity) || 0,
        unit_cost: Number(r.unit_cost) || 0,
      }));
    if (items.length === 0) { setError('Add at least one item with a description.'); return; }

    const payload: PurchaseOrderInput = {
      company_id: companyId,
      vendor_id: vendorId,
      lpo_number: lpoNumber.trim(),
      vendor_name: vendorName.trim(),
      vendor_address: vendorAddress,
      vendor_email: vendorEmail,
      vendor_phone: vendorPhone,
      quotation_id: quotationId ? Number(quotationId) : null,
      job_card_id: jobCardId ? Number(jobCardId) : null,
      date,
      delivery_date: deliveryDate || null,
      delivery_address: deliveryAddress,
      payment_terms: paymentTerms,
      include_vat: includeVat,
      notes,
      terms_conditions: terms,
      items,
    };

    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const created = await createPurchaseOrder(payload);
        navigate(`/lpos/${created.id}`);
      } else {
        await updatePurchaseOrder(parseInt(id!, 10), payload);
        navigate(`/lpos/${id}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || `Failed to ${isNew ? 'create' : 'update'} the LPO.`);
      setSaving(false);
    }
  };

  if (isNew && !selectedCompany) return <div className="text-center">Please select a company</div>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">{loadError}</p>
        <button onClick={() => navigate('/lpos')} className="text-blue-600 hover:underline">Back to LPOs</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
      </button>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">{isNew ? 'New LPO' : `Edit ${lpoNumber}`}</h1>
        <p className="text-gray-600 mt-2">Order goods or services from a supplier. Convert it to a purchase when they arrive.</p>
      </div>

      {lockedReceived && (
        <div className="p-4 rounded-lg bg-amber-50 text-amber-800 text-sm">
          This LPO has already been received. Only an admin can change it.
        </div>
      )}
      {error && <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Order details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Order details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="LPO number *"><input className={inputCls} value={lpoNumber} onChange={(e) => setLpoNumber(e.target.value)} placeholder="e.g. ABC-LPO-0001" /></Field>
          <Field label="Date *"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Expected delivery"><input type="date" className={inputCls} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Delivery address">
            <textarea className={inputCls} rows={2} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Defaults to our company address" />
          </Field>
          <Field label="Payment terms">
            <input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days from invoice" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="For quotation (optional)">
            <select className={inputCls} value={quotationId} onChange={(e) => setQuotationId(e.target.value)}>
              <option value="">— none —</option>
              {quotationId && !quotations.some((q) => String(q.id) === quotationId) && (
                <option value={quotationId}>Quotation #{quotationId}</option>
              )}
              {quotations.map((q) => (
                <option key={q.id} value={String(q.id)}>{q.quote_number} · {q.client_name}</option>
              ))}
            </select>
          </Field>
          <Field label="For job card (optional)">
            <select className={inputCls} value={jobCardId} onChange={(e) => setJobCardId(e.target.value)}>
              <option value="">— none —</option>
              {jobCardId && !jobCards.some((j) => String(j.id) === jobCardId) && (
                <option value={jobCardId}>Job card #{jobCardId}</option>
              )}
              {jobCards.map((j) => (
                <option key={j.id} value={String(j.id)}>{j.job_card_number}{j.client_name ? ` · ${j.client_name}` : ''}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Supplier */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Supplier</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
          <VendorPicker
            companyId={companyId!}
            value={vendorName}
            onChange={(name) => { setVendorName(name); setVendorId(null); }}
            onSelect={onSelectVendor}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier email"><input className={inputCls} value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} placeholder="supplier@example.com" /></Field>
          <Field label="Supplier phone"><input className={inputCls} value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="+265 ..." /></Field>
        </div>
        <Field label="Supplier address"><input className={inputCls} value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} /></Field>
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Items ordered</h2>
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
                <th className="text-right font-medium py-2 w-36">Unit cost</th>
                <th className="text-right font-medium py-2 w-36">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-2">
                    <textarea
                      className={inputCls}
                      rows={1}
                      value={r.description}
                      onChange={(e) => setRow(i, { description: e.target.value })}
                      placeholder="What you are ordering"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input type="number" min="0" className={`${inputCls} text-right`} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} onWheel={(e) => e.currentTarget.blur()} />
                  </td>
                  <td className="py-2 px-1">
                    <CurrencyInput className={`${inputCls} text-right`} value={r.unit_cost} onChange={(v) => setRow(i, { unit_cost: v })} />
                  </td>
                  <td className="py-2 pl-1 pt-4 text-right text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency((Number(r.quantity) || 0) * (Number(r.unit_cost) || 0))}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeRow(i)} className="p-1.5 mt-1 text-red-500 hover:bg-red-50 rounded" title="Remove item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4 pt-4 border-t border-gray-200">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={includeVat}
              onChange={(e) => setIncludeVat(e.target.checked)}
            />
            Include VAT{vatRate > 0 ? ` (${+(vatRate * 100).toFixed(2)}%)` : ' (company VAT rate is 0%)'}
          </label>
          <div className="w-full sm:w-72 text-sm space-y-1.5">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span className="tabular-nums text-gray-900">{formatCurrency(subtotal)}</span>
            </div>
            {includeVat && (
              <div className="flex justify-between text-gray-600">
                <span>VAT</span><span className="tabular-nums text-gray-900">{formatCurrency(vatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-medium text-gray-700">Total</span>
              <span className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the supplier..." />
        </Field>
        <Field label="Terms & conditions">
          <textarea className={inputCls} rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Optional terms printed on the LPO..." />
        </Field>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || lockedReceived}
          className="inline-flex items-center px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: primary }}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? 'Saving...' : isNew ? 'Create LPO' : 'Save Changes'}
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

export default PurchaseOrderForm;
