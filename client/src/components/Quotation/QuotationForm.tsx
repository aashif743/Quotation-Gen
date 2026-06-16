import React from 'react';
import { useCompany } from '../../context/CompanyContext';
import { QuotationItem, Quotation, Client } from '../../types';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import ClientPicker from './ClientPicker';
import CurrencyInput from '../common/CurrencyInput';

interface QuotationFormProps {
  quotationData: Partial<Quotation>;
  onInputChange: (field: string, value: any) => void;
  onItemsChange: (items: QuotationItem[]) => void;
  onClientSelected?: (client: Client) => void;
}

const QuotationForm: React.FC<QuotationFormProps> = ({
  quotationData,
  onInputChange,
  onItemsChange,
  onClientSelected,
}) => {
  const { selectedCompany } = useCompany();

  const addNewItem = () => {
    const newItem: QuotationItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      total: 0
    };
    
    const updatedItems = [...(quotationData.items || []), newItem];
    onItemsChange(updatedItems);
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const updatedItems = [...(quotationData.items || [])];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value
    };
    onItemsChange(updatedItems);
  };

  const removeItem = (index: number) => {
    const updatedItems = (quotationData.items || []).filter((_, i) => i !== index);
    onItemsChange(updatedItems);
  };

  // Get the primary color from the selected company
  const primaryColor = selectedCompany?.primary_color || '#4f46e5';

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(79, 70, 229, ${alpha})`;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  };

  const getButtonStyle = (): React.CSSProperties => ({
    backgroundColor: primaryColor,
  });

  const getInputStyle = (): React.CSSProperties => ({
    borderColor: hexToRgba(primaryColor, 0.3),
  });

  const getTextStyle = (): React.CSSProperties => ({
    color: primaryColor,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Quotation Details</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quote Number
            </label>
            <input
              type="text"
              value={quotationData.quote_number || ''}
              onChange={(e) => onInputChange('quote_number', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g. EH-0001"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Auto-generated. Edit if needed — future quotations will continue from your value.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              value={quotationData.date || ''}
              onChange={(e) => onInputChange('date', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid For (Days)
            </label>
            <input
              type="number"
              value={quotationData.expiry_days || 30}
              onChange={(e) => onInputChange('expiry_days', parseInt(e.target.value))}
              onWheel={(e) => e.currentTarget.blur()}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              min="1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              VAT Rate (%)
            </label>
            <input
              type="number"
              value={
                quotationData.vat_rate != null
                  ? +(quotationData.vat_rate * 100).toFixed(4)
                  : ''
              }
              onChange={(e) => {
                const raw = e.target.value;
                onInputChange('vat_rate', raw === '' ? 0 : parseFloat(raw) / 100);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              step="0.1"
              min="0"
              max="100"
              placeholder="16.5"
            />
            <p className="mt-1 text-xs text-gray-500">
              Auto-filled from the last quotation. Edit if needed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PPDA Rate (%)
            </label>
            <input
              type="number"
              value={
                quotationData.ppda_rate != null
                  ? +(quotationData.ppda_rate * 100).toFixed(4)
                  : ''
              }
              onChange={(e) => {
                const raw = e.target.value;
                onInputChange('ppda_rate', raw === '' ? 0 : parseFloat(raw) / 100);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              step="0.1"
              min="0"
              max="100"
              placeholder="1.0"
            />
            <p className="mt-1 text-xs text-gray-500">
              Auto-filled from the last quotation. Edit if needed.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Client Information</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Name *
            </label>
            {selectedCompany ? (
              <ClientPicker
                companyId={selectedCompany.id}
                value={quotationData.client_name || ''}
                onChange={(name) => {
                  // Typing a new name detaches from any previously-selected client.
                  if (quotationData.client_id) onInputChange('client_id', null);
                  onInputChange('client_name', name);
                }}
                onSelect={(client) => {
                  if (onClientSelected) {
                    onClientSelected(client);
                  } else {
                    // Fallback: just set the name if no batched handler was passed.
                    onInputChange('client_name', client.name);
                  }
                }}
                required
              />
            ) : (
              <input
                type="text"
                value={quotationData.client_name || ''}
                onChange={(e) => onInputChange('client_name', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Email
            </label>
            <input
              type="email"
              value={quotationData.client_email || ''}
              onChange={(e) => onInputChange('client_email', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Phone
            </label>
            <input
              type="tel"
              value={quotationData.client_phone || ''}
              onChange={(e) => onInputChange('client_phone', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Address
            </label>
            <textarea
              value={quotationData.client_address || ''}
              onChange={(e) => onInputChange('client_address', e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Quotation Items</h2>
          <button
            onClick={addNewItem}
            className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all"
            style={getButtonStyle()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </button>
        </div>

        <div className="space-y-4">
          {quotationData.items && quotationData.items.length > 0 ? (
            quotationData.items.map((item, index) => (
              <div
                key={index}
                className="relative rounded-xl border border-gray-200 bg-gray-50/40 p-4 transition-colors hover:border-gray-300"
              >
                {/* Row header: item number + remove */}
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: hexToRgba(primaryColor, 0.12), color: primaryColor }}
                  >
                    Item {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="inline-flex items-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                    disabled={quotationData.items!.length === 1}
                    title="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Description */}
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Description *
                  </label>
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Describe the product or service…"
                    required
                  />
                </div>

                {/* Quantity (small) · Unit price (large) · Line total */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-3">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Qty *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="1"
                      min="0"
                      step="any"
                      required
                    />
                  </div>

                  <div className="col-span-7 sm:col-span-5">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Unit Price *
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                        MWK
                      </span>
                      <CurrencyInput
                        value={Number(item.unit_price || 0)}
                        onChange={(n) => updateItem(index, 'unit_price', n)}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-12 pr-3 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  <div className="col-span-5 sm:col-span-4">
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Line Total
                    </label>
                    <div
                      className="flex h-[42px] items-center justify-end rounded-lg border px-3 text-sm font-semibold tabular-nums"
                      style={{ borderColor: hexToRgba(primaryColor, 0.25), backgroundColor: hexToRgba(primaryColor, 0.06), color: primaryColor }}
                    >
                      {formatCurrency((item.quantity || 0) * (item.unit_price || 0))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <Calculator className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No items added yet</p>
              <button
                onClick={addNewItem}
                className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all"
                style={getButtonStyle()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Item
              </button>
            </div>
          )}
        </div>

        {quotationData.items && quotationData.items.length > 0 && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(quotationData.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT ({formatNumber((selectedCompany?.vat_rate || 0) * 100, 1)}%):</span>
                <span className="font-medium">{formatCurrency(quotationData.vat_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>PPDA ({formatNumber((selectedCompany?.ppda_rate || 0) * 100, 1)}%):</span>
                <span className="font-medium">{formatCurrency(quotationData.ppda_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2" style={getTextStyle()}>
                <span>Grand Total:</span>
                <span>{formatCurrency(quotationData.grand_total || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Additional Information</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={quotationData.notes || ''}
              onChange={(e) => onInputChange('notes', e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              placeholder="Any additional notes for this quotation"
            />
          </div>

          {quotationData.terms_conditions ? (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
              Terms &amp; conditions for this quotation come from the company settings. To change
              them, edit the company under <span className="font-medium">Company Settings</span>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default QuotationForm;