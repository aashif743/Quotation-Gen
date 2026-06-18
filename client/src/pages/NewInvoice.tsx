import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { Invoice, InvoiceItem, Client } from '../types';
import {
  createInvoice,
  getNextInvoiceNumber,
  getClient,
} from '../services/api';
import {
  calculateSubtotal,
  calculateVAT,
  calculatePPDA,
  calculateGrandTotal,
  formatCurrency,
} from '../utils/calculations';
import ClientPicker from '../components/Quotation/ClientPicker';
import CurrencyInput from '../components/common/CurrencyInput';
import { Save, ArrowLeft, Plus, Trash2, Calculator } from 'lucide-react';

const blankForm = (): Partial<Invoice> => ({
  client_name: '',
  client_address: '',
  client_email: '',
  client_phone: '',
  date: new Date().toISOString().split('T')[0],
  due_days: 30,
  notes: '',
  terms_conditions: '',
  items: [],
  subtotal: 0,
  vat_amount: 0,
  ppda_amount: 0,
  grand_total: 0,
});

const draftKey = (userId: number, companyId: number) =>
  `invoiceDraft:${userId}:${companyId}`;

const NewInvoice: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Partial<Invoice>>(blankForm);
  // Tax rates are stored on the form so we can recompute totals and offer the
  // same admin-controlled defaults a quotation would use. They're not part of
  // the invoice record itself; they only drive the amounts.
  const [vatRate, setVatRate] = useState<number>(0.165);
  const [ppdaRate, setPpdaRate] = useState<number>(0.01);
  // Suppress the auto-save effect until the initial draft/defaults restore
  // completes — otherwise the very first render writes a blank draft.
  const draftReady = useRef(false);

  // (Re-)initialize whenever the selected company changes — either by
  // restoring a saved draft for that company, or by setting up fresh
  // defaults from the company itself plus the next invoice number.
  useEffect(() => {
    if (!selectedCompany || !user?.id) return;
    draftReady.current = false;

    const key = draftKey(user.id, selectedCompany.id);

    let cancelled = false;
    (async () => {
      // 1) Restore saved draft if present.
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const draft = JSON.parse(stored) as {
            invoice: Partial<Invoice>;
            vatRate?: number;
            ppdaRate?: number;
          };
          // Top up tax rates/terms from current company settings if the draft
          // doesn't have them — so admin changes propagate to in-progress drafts.
          if (!draft.invoice.terms_conditions && selectedCompany.default_terms_conditions) {
            draft.invoice.terms_conditions = selectedCompany.default_terms_conditions;
          }
          const v = draft.vatRate ?? selectedCompany.vat_rate ?? 0.165;
          const p = draft.ppdaRate ?? selectedCompany.ppda_rate ?? 0.01;
          if (!cancelled) {
            setInvoiceData(draft.invoice);
            setVatRate(v);
            setPpdaRate(p);
            draftReady.current = true;
          }
          return;
        }
      } catch {
        /* corrupt draft — fall through to defaults */
      }

      // 2) No draft — build defaults from the company.
      const defaults: Partial<Invoice> = {
        ...blankForm(),
        company_id: selectedCompany.id,
        terms_conditions: selectedCompany.default_terms_conditions || '',
      };
      const v = selectedCompany.vat_rate ?? 0.165;
      const p = selectedCompany.ppda_rate ?? 0.01;

      try {
        const { invoiceNumber } = await getNextInvoiceNumber(selectedCompany.id);
        defaults.invoice_number = invoiceNumber;
      } catch (e) {
        console.error('Error loading next invoice number:', e);
      }

      if (!cancelled) {
        setInvoiceData(defaults);
        setVatRate(v);
        setPpdaRate(p);
        draftReady.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany, user?.id]);

  // Auto-save the in-progress form to localStorage so navigating away and
  // back doesn't lose work.
  useEffect(() => {
    if (!draftReady.current || !user?.id || !invoiceData.company_id) return;
    try {
      localStorage.setItem(
        draftKey(user.id, invoiceData.company_id),
        JSON.stringify({ invoice: invoiceData, vatRate, ppdaRate })
      );
    } catch {
      /* quota / serialization issues — ignore */
    }
  }, [invoiceData, vatRate, ppdaRate, user?.id]);

  // When invoked from a Client detail page as `/new-invoice?clientId=123`,
  // resolve the client and pre-fill it once on mount, then strip the param so
  // a refresh doesn't reapply.
  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    if (!clientIdParam) return;
    (async () => {
      try {
        const client = await getClient(parseInt(clientIdParam, 10));
        handleClientSelected(client);
        searchParams.delete('clientId');
        setSearchParams(searchParams, { replace: true });
      } catch {
        /* invalid id — silently ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (field: keyof Invoice, value: any) => {
    setInvoiceData((prev) => ({ ...prev, [field]: value }));
  };

  // Selecting a client from the autocomplete fills name + contact in one go
  // and locks the link via client_id so the backend doesn't auto-create a
  // duplicate on save.
  const handleClientSelected = (client: Client) => {
    setInvoiceData((prev) => ({
      ...prev,
      client_id: client.id,
      client_name: client.name,
      client_address: client.address || prev.client_address || '',
      client_email: client.email || prev.client_email || '',
      client_phone: client.phone || prev.client_phone || '',
    }));
  };

  const recomputeTotals = (
    items: InvoiceItem[],
    v: number = vatRate,
    p: number = ppdaRate
  ) => {
    const subtotal = calculateSubtotal(items);
    const vat = calculateVAT(subtotal, v);
    const ppda = calculatePPDA(subtotal, p);
    return {
      subtotal,
      vat_amount: vat,
      ppda_amount: ppda,
      grand_total: calculateGrandTotal(subtotal, vat, ppda),
    };
  };

  const handleItemsChange = (items: InvoiceItem[]) => {
    const updated = items.map((it) => ({
      ...it,
      total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    }));
    setInvoiceData((prev) => ({ ...prev, items: updated, ...recomputeTotals(updated) }));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const current = invoiceData.items || [];
    const next = [...current];
    next[index] = {
      ...next[index],
      [field]:
        field === 'quantity' || field === 'unit_price'
          ? parseFloat(value) || 0
          : value,
    };
    handleItemsChange(next);
  };

  const addNewItem = () => {
    const next: InvoiceItem = { description: '', quantity: 1, unit_price: 0, total: 0 };
    handleItemsChange([...(invoiceData.items || []), next]);
  };

  const removeItem = (index: number) => {
    const next = (invoiceData.items || []).filter((_, i) => i !== index);
    handleItemsChange(next);
  };

  const handleVatChange = (raw: string) => {
    const v = raw === '' ? 0 : parseFloat(raw) / 100;
    setVatRate(v);
    setInvoiceData((prev) => ({
      ...prev,
      ...recomputeTotals(prev.items || [], v, ppdaRate),
    }));
  };

  const handlePpdaChange = (raw: string) => {
    const p = raw === '' ? 0 : parseFloat(raw) / 100;
    setPpdaRate(p);
    setInvoiceData((prev) => ({
      ...prev,
      ...recomputeTotals(prev.items || [], vatRate, p),
    }));
  };

  const handleClearDraft = () => {
    if (!selectedCompany || !user?.id) return;
    if (!window.confirm('Discard the in-progress invoice and start over?')) return;

    try {
      localStorage.removeItem(draftKey(user.id, selectedCompany.id));
    } catch {}

    draftReady.current = false;
    (async () => {
      const defaults: Partial<Invoice> = {
        ...blankForm(),
        company_id: selectedCompany.id,
        terms_conditions: selectedCompany.default_terms_conditions || '',
      };
      try {
        const { invoiceNumber } = await getNextInvoiceNumber(selectedCompany.id);
        defaults.invoice_number = invoiceNumber;
      } catch {}
      setInvoiceData(defaults);
      setVatRate(selectedCompany.vat_rate ?? 0.165);
      setPpdaRate(selectedCompany.ppda_rate ?? 0.01);
      draftReady.current = true;
    })();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !invoiceData.items || invoiceData.items.length === 0) return;

    if (!invoiceData.invoice_number?.trim()) {
      alert('Please enter an invoice number.');
      return;
    }
    if (!invoiceData.client_name?.trim()) {
      alert('Please enter a client name.');
      return;
    }

    setLoading(true);
    try {
      const created = await createInvoice(invoiceData as Omit<Invoice, 'id'>);
      // Clear the saved draft so the next visit starts fresh.
      if (user?.id) {
        try {
          localStorage.removeItem(draftKey(user.id, selectedCompany.id));
        } catch {}
      }
      navigate(`/invoice/${created.id}`);
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Failed to create invoice. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  const primaryColor = selectedCompany.primary_color || '#4f46e5';
  const buttonStyle: React.CSSProperties = { backgroundColor: primaryColor };
  const accentTextStyle: React.CSSProperties = { color: primaryColor };
  const items = invoiceData.items || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">New Invoice</h1>
            <p className="text-gray-600 mt-2">
              Create an invoice directly for {selectedCompany.name}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleClearDraft}
            className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 bg-white hover:bg-gray-50"
            title="Discard the in-progress invoice"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !items.length}
            className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={buttonStyle}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Invoice
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Invoice Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Invoice Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceData.invoice_number || ''}
                onChange={(e) => handleInputChange('invoice_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. INV-0001"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Auto-suggested from the next available number — edit if needed.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={invoiceData.date || ''}
                onChange={(e) => handleInputChange('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due In (Days)
              </label>
              <input
                type="number"
                min={1}
                value={invoiceData.due_days || 30}
                onChange={(e) =>
                  handleInputChange('due_days', parseInt(e.target.value) || 0)
                }
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                VAT Rate (%)
              </label>
              <input
                type="number"
                value={+(vatRate * 100).toFixed(4)}
                onChange={(e) => handleVatChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                step="0.1"
                min="0"
                max="100"
                placeholder="16.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PPDA Rate (%)
              </label>
              <input
                type="number"
                value={+(ppdaRate * 100).toFixed(4)}
                onChange={(e) => handlePpdaChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                step="0.1"
                min="0"
                max="100"
                placeholder="1.0"
              />
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-2">Bill To</h2>
          <p className="text-xs text-gray-500 mb-4">
            Pick an existing client to auto-fill their details, or type a new
            name and a new client record will be created on save.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Name *
              </label>
              <ClientPicker
                companyId={selectedCompany.id}
                value={invoiceData.client_name || ''}
                onChange={(name) => {
                  // Typing a brand-new name breaks any existing client link
                  // so we don't accidentally overwrite the picked client.
                  if (invoiceData.client_id) handleInputChange('client_id', null);
                  handleInputChange('client_name', name);
                }}
                onSelect={handleClientSelected}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Email
              </label>
              <input
                type="email"
                value={invoiceData.client_email || ''}
                onChange={(e) => handleInputChange('client_email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="client@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Phone
              </label>
              <input
                type="tel"
                value={invoiceData.client_phone || ''}
                onChange={(e) => handleInputChange('client_phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="+265 ..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Address
              </label>
              <textarea
                value={invoiceData.client_address || ''}
                onChange={(e) => handleInputChange('client_address', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Invoice Items</h2>
            <button
              onClick={addNewItem}
              className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all"
              style={buttonStyle}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
              <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                No items yet. Click <span className="font-semibold">Add Item</span> to start.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-5">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <textarea
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Item description"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        min={0}
                        step="any"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Price (MWK) *
                      </label>
                      <CurrencyInput
                        value={Number(item.unit_price || 0)}
                        onChange={(n) => updateItem(index, 'unit_price', n)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total
                      </label>
                      <div
                        className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold tabular-nums text-right"
                        style={accentTextStyle}
                      >
                        {formatCurrency(Number(item.quantity) * Number(item.unit_price))}
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-end">
                      <button
                        onClick={() => removeItem(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-end">
                  <div className="w-full md:w-80 bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(invoiceData.subtotal || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        VAT ({(vatRate * 100).toFixed(1)}%)
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(invoiceData.vat_amount || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        PPDA ({(ppdaRate * 100).toFixed(1)}%)
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(invoiceData.ppda_amount || 0)}
                      </span>
                    </div>
                    <div
                      className="flex justify-between pt-2 border-t border-gray-300 text-base font-bold"
                      style={accentTextStyle}
                    >
                      <span>Grand Total</span>
                      <span className="tabular-nums">
                        {formatCurrency(invoiceData.grand_total || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes & Terms */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Notes &amp; Terms</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={invoiceData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Any notes for the customer..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Terms &amp; Conditions
              </label>
              <textarea
                value={invoiceData.terms_conditions || ''}
                onChange={(e) => handleInputChange('terms_conditions', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Payment terms, late fees, etc."
              />
              <p className="mt-1 text-xs text-gray-500">
                Pre-filled from the company's default terms — edit if needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewInvoice;
