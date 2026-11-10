import React from 'react';
import { useCompany } from '../../context/CompanyContext';
import { QuotationItem, Quotation, Client } from '../../types';
import { Plus, Calculator } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import ClientPicker from './ClientPicker';
import LineItemsEditor from '../common/LineItemsEditor';
import DiscountInput from '../common/DiscountInput';
import VatControl from '../common/VatControl';
import { UnitInput } from '../common/MoneyInput';

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

          {selectedCompany?.template === 'supreme' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title
              </label>
              <input
                type="text"
                value={quotationData.title || ''}
                onChange={(e) => onInputChange('title', e.target.value)}
                placeholder="e.g. Supply of branded T-shirts"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid for
            </label>
            <UnitInput
              unit="days"
              min={1}
              step="1"
              fallback={30}
              value={quotationData.expiry_days ?? 30}
              onChange={(v) => onInputChange('expiry_days', v === '' ? ('' as any) : parseInt(v, 10))}
            />
          </div>

          <VatControl
            rate={Number(quotationData.vat_rate) || 0}
            onChange={(r) => onInputChange('vat_rate', r)}
            defaultRate={Number(selectedCompany?.vat_rate) || 0.165}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PPDA
            </label>
            <UnitInput
              unit="%"
              max={100}
              step="0.1"
              placeholder="0"
              value={quotationData.ppda_rate != null ? +(quotationData.ppda_rate * 100).toFixed(4) : ''}
              onChange={(v) => onInputChange('ppda_rate', v === '' ? 0 : parseFloat(v) / 100)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Auto-filled from the last quotation. Edit if needed.
            </p>
          </div>

          <DiscountInput
            className="md:col-span-2"
            type={quotationData.discount_type}
            value={quotationData.discount_value}
            onChange={(t, v) => { onInputChange('discount_type', t); onInputChange('discount_value', v); }}
          />
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

        {quotationData.items && quotationData.items.length > 0 ? (
          <LineItemsEditor
            items={quotationData.items}
            onChange={onItemsChange}
            newItem={() => ({ description: '', quantity: 1, unit_price: 0, total: 0 })}
            accent={primaryColor}
          />
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

        {quotationData.items && quotationData.items.length > 0 && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(quotationData.subtotal || 0)}</span>
              </div>
              {Number(quotationData.discount_amount) > 0 && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>Discount{quotationData.discount_type === 'percent' ? ` (${formatNumber(Number(quotationData.discount_value) || 0, 1)}%)` : ''}:</span>
                  <span className="font-medium">− {formatCurrency(Number(quotationData.discount_amount))}</span>
                </div>
              )}
              {Number(quotationData.vat_rate) > 0 ? (
                <div className="flex justify-between text-sm">
                  <span>VAT ({formatNumber(Number(quotationData.vat_rate) * 100, 1)}%):</span>
                  <span className="font-medium">{formatCurrency(quotationData.vat_amount || 0)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>VAT:</span>
                  <span>Not added</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>PPDA ({formatNumber((quotationData.ppda_rate ?? selectedCompany?.ppda_rate ?? 0) * 100, 1)}%):</span>
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