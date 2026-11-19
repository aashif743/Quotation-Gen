import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, UserRound, Users, Calculator, Banknote } from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { Client, DiscountType, InvoiceItem } from '../types';
import { computeTotals, defaultVatRate, formatCurrency, documentVatRate } from '../utils/calculations';
import { brandColorFor } from '../utils/colors';
import VatControl from '../components/common/VatControl';
import DiscountInput from '../components/common/DiscountInput';
import LineItemsEditor from '../components/common/LineItemsEditor';
import ClientPicker from '../components/Quotation/ClientPicker';
import AccountSelect from '../components/common/AccountSelect';
import { UnitInput } from '../components/common/MoneyInput';
import DocumentPreview, { PreviewColumn, PreviewToggleButton, usePreviewToggle } from '../components/Document/DocumentPreview';
import CashSaleDocument from '../components/CashSale/CashSaleDocument';
import { InvoiceDocCompany } from '../components/Invoice/InvoiceDocument';
import { createCashSale, getCashSale, getNextCashSaleNumber, updateCashSale } from '../services/cashSalesApi';

const METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card', 'Other'];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const newItem = (): InvoiceItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 });

interface FormState {
  invoice_number: string;
  date: string;
  title: string;
  walkIn: boolean;
  client_id: number | null;
  client_name: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  items: InvoiceItem[];
  discount_type: DiscountType | null;
  discount_value: number;
  notes: string;
  method: string;
  reference: string;
  account_id: number | null;
}

const blank = (): FormState => ({
  invoice_number: '', date: todayIso(), title: '', walkIn: true, client_id: null, client_name: '', client_phone: '',
  client_email: '', client_address: '', items: [newItem()], discount_type: null, discount_value: 0, notes: '',
  method: 'Cash', reference: '', account_id: null,
});

/** /cash-sales/new and /cash-sales/:id/edit */
const CashSaleForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const [showPreview, togglePreview] = usePreviewToggle();

  const [form, setForm] = useState<FormState>(blank);
  const [vatRate, setVatRate] = useState(0.165);
  const [ppdaRate, setPpdaRate] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accountsAvailable, setAccountsAvailable] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [savedAccount, setSavedAccount] = useState<{ id: number | null; name: string | null; amount: number }>({ id: null, name: null, amount: 0 });
  const [companyId, setCompanyId] = useState<number | null>(null);
  // Editing: the sale's own company (its letterhead), whatever company is selected.
  const [saleCompany, setSaleCompany] = useState<InvoiceDocCompany | null>(null);

  // New sale: defaults from the selected company.
  useEffect(() => {
    if (isEdit || !selectedCompany) return;
    setForm(blank());
    setCompanyId(selectedCompany.id);
    setVatRate(defaultVatRate(selectedCompany));
    setPpdaRate(0);
    getNextCashSaleNumber(selectedCompany.id)
      .then((n) => setForm((f) => ({ ...f, invoice_number: f.invoice_number || n })))
      .catch(() => {});
  }, [isEdit, selectedCompany]);

  // Edit: load the sale.
  useEffect(() => {
    if (!isEdit) return;
    getCashSale(Number(id))
      .then((s) => {
        const walkIn = !s.client_id && /^walk-in customer$/i.test(s.client_name || '');
        setCompanyId(s.company_id);
        setSaleCompany({
          name: s.company_name, address: s.company_address, tpin: s.company_tpin, bank_details: s.company_bank_details,
          logo_url: s.company_quote_logo || s.company_logo, primary_color: s.primary_color, secondary_color: s.secondary_color,
          template: s.company_template, letterhead: s.company_letterhead, currency: s.company_currency,
        });
        setForm({
          invoice_number: s.invoice_number,
          date: s.sale_date,
          title: s.title || '',
          walkIn,
          client_id: s.client_id ?? null,
          client_name: walkIn ? '' : s.client_name,
          client_phone: s.client_phone || '',
          client_email: s.client_email || '',
          client_address: s.client_address || '',
          items: (s.items || []).map((it) => ({ ...it, quantity: Number(it.quantity), unit_price: Number(it.unit_price), total: Number(it.total) })),
          discount_type: (s.discount_type as DiscountType) || null,
          discount_value: Number(s.discount_value) || 0,
          notes: s.notes || '',
          method: s.payment_method || 'Cash',
          reference: s.payment_reference || '',
          account_id: s.payment_account_id ?? null,
        });
        setVatRate(documentVatRate(s as any));
        const base = Number(s.subtotal) - Number(s.discount_amount || 0);
        setPpdaRate(base > 0 ? Number(s.ppda_amount) / base : 0);
        setSavedAccount({ id: s.payment_account_id ?? null, name: s.payment_account_name ?? null, amount: Number(s.amount_paid) || 0 });
      })
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the cash sale.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const totals = useMemo(
    () => computeTotals(form.items, vatRate, ppdaRate, form.discount_type, form.discount_value),
    [form.items, vatRate, ppdaRate, form.discount_type, form.discount_value]
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickClient = (c: Client) => setForm((f) => ({
    ...f, client_id: c.id ?? null, client_name: c.name, client_phone: c.phone || f.client_phone,
    client_email: c.email || f.client_email, client_address: c.address || f.client_address,
  }));

  const filledItems = form.items.filter((it) => it.description.trim() || Number(it.quantity) * Number(it.unit_price) !== 0);
  const needsAccount = accountsAvailable && (!isEdit || savedAccount.id != null);

  const save = async () => {
    setTriedSave(true);
    setError('');
    if (!filledItems.length) { setError('Add at least one item.'); return; }
    if (filledItems.some((it) => !it.description.trim())) { setError('Every item needs a description.'); return; }
    if (totals.grand_total <= 0) { setError('The sale total must be more than 0.'); return; }
    if (!form.walkIn && !form.client_name.trim()) { setError('Enter the customer name, or choose Walk-in customer.'); return; }
    if (needsAccount && !form.account_id) { setError('Choose the account the money went into.'); return; }
    if (!companyId) return;

    const payload = {
      company_id: companyId,
      invoice_number: form.invoice_number.trim(),
      date: form.date,
      title: form.title,
      client_id: form.walkIn ? null : form.client_id,
      client_name: form.walkIn ? '' : form.client_name.trim(),
      client_phone: form.client_phone,
      client_email: form.walkIn ? '' : form.client_email,
      client_address: form.walkIn ? '' : form.client_address,
      items: filledItems.map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0 })),
      vat_rate: vatRate,
      ppda_rate: ppdaRate,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      notes: form.notes,
      method: form.method,
      reference: form.reference,
      account_id: form.account_id,
    };
    setSaving(true);
    try {
      const sale = isEdit ? await updateCashSale(Number(id), payload) : await createCashSale(payload);
      navigate(`/cash-sales/${sale.id}`, { replace: isEdit });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Could not save the cash sale.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;

  const docCompany: InvoiceDocCompany = saleCompany || {
    name: selectedCompany.name,
    address: selectedCompany.address,
    tpin: selectedCompany.tpin,
    bank_details: selectedCompany.bank_details,
    logo_url: selectedCompany.quote_logo_url || selectedCompany.logo_url,
    primary_color: selectedCompany.primary_color,
    secondary_color: selectedCompany.secondary_color,
    template: selectedCompany.template,
    letterhead: selectedCompany.letterhead,
    currency: selectedCompany.currency,
  };
  const primary = brandColorFor(docCompany.primary_color || '#4f46e5', theme === 'dark');
  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const label = 'block text-sm font-medium text-gray-700 mb-2';
  const card = 'bg-white rounded-lg shadow-sm border border-gray-200 p-6';

  return (
    <div className={showPreview ? 'max-w-[1700px] mx-auto' : 'max-w-4xl mx-auto'}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate(-1)} className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">{isEdit ? `Edit Cash Sale ${form.invoice_number}` : 'New Cash Sale'}</h1>
            <p className="text-gray-600 mt-2">
              Sold and paid on the spot. The payment is recorded with the sale and a receipt is ready straight away.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PreviewToggleButton show={showPreview} onToggle={togglePreview} />
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center px-6 py-3 rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isEdit ? 'Save changes' : 'Save cash sale'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      <div className={showPreview ? 'grid grid-cols-1 xl:grid-cols-2 gap-8 items-start' : ''}>
        <div className="space-y-6">
          {/* Sale details */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-6">Sale details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className={label}>Cash sale number</label>
                <input value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} className={input} placeholder="e.g. CS-0001" />
              </div>
              <div>
                <label className={label}>Date</label>
                <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={input} />
              </div>
              {docCompany.template === 'supreme' && (
                <div>
                  <label className={label}>Title</label>
                  <input value={form.title} onChange={(e) => set('title', e.target.value)} className={input} placeholder="e.g. Printing of flyers" />
                </div>
              )}
              <VatControl rate={vatRate} onChange={setVatRate} defaultRate={Number(selectedCompany.vat_rate) || 0.165} />
              <div>
                <label className={label}>PPDA</label>
                <UnitInput unit="%" max={100} step="0.1" placeholder="0" value={+(ppdaRate * 100).toFixed(4)} onChange={(v) => setPpdaRate(v === '' ? 0 : parseFloat(v) / 100)} />
              </div>
              <DiscountInput
                className="md:col-span-2 lg:col-span-1"
                type={form.discount_type}
                value={form.discount_value}
                onChange={(t, v) => setForm((f) => ({ ...f, discount_type: t, discount_value: v }))}
              />
            </div>
          </div>

          {/* Customer */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-4">Customer</h2>
            <div className="inline-flex rounded-lg border border-gray-300 p-1 mb-5" role="tablist">
              {[
                { walkIn: true, label: 'Walk-in customer', Icon: UserRound },
                { walkIn: false, label: 'Named customer', Icon: Users },
              ].map((o) => {
                const on = form.walkIn === o.walkIn;
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => set('walkIn', o.walkIn)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${on ? 'text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    style={on ? { backgroundColor: primary } : undefined}
                  >
                    <o.Icon className="h-4 w-4" /> {o.label}
                  </button>
                );
              })}
            </div>
            {form.walkIn ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <p className="text-sm text-gray-500 md:col-span-2 -mt-1">
                  The cash sale shows “Walk-in customer”. No client record is created.
                </p>
                <div>
                  <label className={label}>Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="tel" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} className={input} placeholder="+265 ..." />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className={label}>Customer name *</label>
                  <ClientPicker
                    companyId={companyId || selectedCompany.id}
                    value={form.client_name}
                    onChange={(name) => setForm((f) => ({ ...f, client_name: name, client_id: null }))}
                    onSelect={pickClient}
                    required
                  />
                </div>
                <div>
                  <label className={label}>Phone</label>
                  <input type="tel" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} className={input} placeholder="+265 ..." />
                </div>
                <div>
                  <label className={label}>Email</label>
                  <input type="email" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} className={input} placeholder="customer@example.com" />
                </div>
                <div className="md:col-span-2">
                  <label className={label}>Address</label>
                  <textarea value={form.client_address} onChange={(e) => set('client_address', e.target.value)} rows={2} className={input} />
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-6">Items sold</h2>
            {form.items.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <button onClick={() => set('items', [newItem()])} className="text-sm font-semibold" style={{ color: primary }}>Add an item</button>
              </div>
            ) : (
              <LineItemsEditor
                items={form.items}
                onChange={(items) => set('items', items.map((it) => ({ ...it, total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) })))}
                newItem={newItem}
                accent={primary}
              />
            )}
            <div className="border-t border-gray-200 mt-4 pt-4 flex justify-end">
              <div className="w-full md:w-80 bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-medium tabular-nums">{formatCurrency(totals.subtotal)}</span></div>
                {totals.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-amber-700">
                    <span>Discount{form.discount_type === 'percent' ? ` (${form.discount_value}%)` : ''}</span>
                    <span className="font-medium tabular-nums">− {formatCurrency(totals.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{vatRate > 0 ? `VAT (${(vatRate * 100).toFixed(1)}%)` : 'VAT'}</span>
                  <span className={`tabular-nums ${vatRate > 0 ? 'font-medium' : 'text-gray-500'}`}>{vatRate > 0 ? formatCurrency(totals.vat_amount) : 'Not added'}</span>
                </div>
                {ppdaRate > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-gray-600">PPDA ({(ppdaRate * 100).toFixed(1)}%)</span><span className="font-medium tabular-nums">{formatCurrency(totals.ppda_amount)}</span></div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-300 text-base font-bold" style={{ color: primary }}>
                  <span>Total paid</span><span className="tabular-nums">{formatCurrency(totals.grand_total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className={card}>
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-5 w-5" style={{ color: primary }} />
              <h2 className="text-xl font-semibold">Payment</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              {formatCurrency(totals.grand_total)} received in full{form.date ? ` on ${new Date(`${form.date}T00:00:00`).toLocaleDateString()}` : ''}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AccountSelect
                className="md:col-span-2"
                companyId={companyId}
                value={form.account_id}
                onChange={(accId, opt) => setForm((f) => ({ ...f, account_id: accId, method: opt?.method || f.method }))}
                direction="in"
                label="Money received into"
                savedAccountId={savedAccount.id}
                savedAccountName={savedAccount.name}
                savedAmount={savedAccount.amount}
                onAvailable={setAccountsAvailable}
                showError={triedSave && needsAccount && !form.account_id}
                selectClassName={input}
              />
              <div>
                <label className={label}>Payment method</label>
                <select value={form.method} onChange={(e) => set('method', e.target.value)} className={`${input} bg-white`}>
                  {(METHODS.includes(form.method) ? METHODS : [form.method, ...METHODS]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Reference <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.reference} onChange={(e) => set('reference', e.target.value)} className={input} placeholder="Cheque no., transaction ID…" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-4">Notes <span className="text-sm font-normal text-gray-400">(optional)</span></h2>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={input} placeholder="Shown on the cash sale document" />
          </div>
        </div>

        {showPreview && (
          <PreviewColumn>
            <DocumentPreview watch={[form, vatRate, ppdaRate, saleCompany, selectedCompany]}>
              <CashSaleDocument
                data={{
                  ...totals,
                  invoice_number: form.invoice_number,
                  title: form.title,
                  date: form.date,
                  client_name: form.walkIn ? 'Walk-in customer' : form.client_name,
                  client_phone: form.client_phone,
                  client_email: form.walkIn ? '' : form.client_email,
                  client_address: form.walkIn ? '' : form.client_address,
                  items: filledItems,
                  discount_type: form.discount_type,
                  discount_value: form.discount_value,
                  vat_rate: vatRate,
                  notes: form.notes,
                  payment_method: form.method,
                  payment_reference: form.reference,
                }}
                company={docCompany}
              />
            </DocumentPreview>
          </PreviewColumn>
        )}
      </div>
    </div>
  );
};

export default CashSaleForm;
