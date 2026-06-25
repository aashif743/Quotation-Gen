import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { InvoiceItem, Invoice } from '../types';
import { getInvoice, updateInvoice } from '../services/api';
import {
  calculateSubtotal,
  calculateVAT,
  calculatePPDA,
  calculateGrandTotal,
  formatCurrency,
  formatNumber
} from '../utils/calculations';
import { Save, ArrowLeft, Plus, Trash2, Calculator } from 'lucide-react';
import CurrencyInput from '../components/common/CurrencyInput';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';

const EditInvoice: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState<Partial<Invoice>>({});

  useEffect(() => {
    const loadInvoice = async () => {
      if (!id) return;

      try {
        const data = await getInvoice(parseInt(id));
        setInvoiceData(data);
      } catch (error) {
        console.error('Error loading invoice:', error);
        alert('Failed to load invoice');
        navigate('/invoice-history');
      } finally {
        setInitialLoading(false);
      }
    };

    loadInvoice();
  }, [id, navigate]);

  const handleInputChange = (field: string, value: any) => {
    setInvoiceData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleItemsChange = (items: InvoiceItem[]) => {
    const updatedItems = items.map(item => ({
      ...item,
      total: item.quantity * item.unit_price
    }));

    if (!selectedCompany) return;

    const subtotal = calculateSubtotal(updatedItems);
    const vatAmount = calculateVAT(subtotal, selectedCompany.vat_rate);
    const ppdaAmount = calculatePPDA(subtotal, selectedCompany.ppda_rate);
    const grandTotal = calculateGrandTotal(subtotal, vatAmount, ppdaAmount);

    setInvoiceData(prev => ({
      ...prev,
      items: updatedItems,
      subtotal,
      vat_amount: vatAmount,
      ppda_amount: ppdaAmount,
      grand_total: grandTotal
    }));
  };

  const addNewItem = () => {
    const newItem: InvoiceItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      total: 0
    };

    const updatedItems = [...(invoiceData.items || []), newItem];
    handleItemsChange(updatedItems);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...(invoiceData.items || [])];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value
    };
    handleItemsChange(updatedItems);
  };

  const removeItem = (index: number) => {
    const updatedItems = (invoiceData.items || []).filter((_, i) => i !== index);
    handleItemsChange(updatedItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedCompany || !invoiceData.items || invoiceData.items.length === 0) return;

    if (!invoiceData.invoice_number?.trim()) {
      alert('Please enter an invoice number.');
      return;
    }

    setLoading(true);
    try {
      await updateInvoice(parseInt(id), invoiceData as Partial<Invoice>);
      navigate(`/invoice/${id}`);
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Failed to update invoice. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300"></div>
      </div>
    );
  }

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  // Get the primary color from the selected company
  // Brightened in dark mode so dark company palettes stay readable.
  const { theme } = useTheme();
  const primaryColor = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

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
            <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
            <p className="text-gray-600 mt-2">
              Editing {invoiceData.invoice_number}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !invoiceData.items?.length}
          className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={getButtonStyle()}
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Invoice Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceData.invoice_number || ''}
                onChange={(e) => handleInputChange('invoice_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g. EH-INV-0001"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Auto-generated when created. Edit if needed.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={invoiceData.date || ''}
                onChange={(e) => handleInputChange('date', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due In (Days)
              </label>
              <input
                type="number"
                value={invoiceData.due_days || 30}
                onChange={(e) => handleInputChange('due_days', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                min="1"
                required
              />
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
              <input
                type="text"
                value={invoiceData.client_name || ''}
                onChange={(e) => handleInputChange('client_name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
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
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
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
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Address
              </label>
              <textarea
                value={invoiceData.client_address || ''}
                onChange={(e) => handleInputChange('client_address', e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Invoice Items</h2>
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
            {invoiceData.items && invoiceData.items.length > 0 ? (
              invoiceData.items.map((item, index) => (
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
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        placeholder="Enter item description"
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
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        min="0"
                        step="0.01"
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
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right tabular-nums`}
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium" style={getTextStyle()}>
                        {formatCurrency(item.quantity * item.unit_price)}
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-end">
                      <button
                        onClick={() => removeItem(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        disabled={invoiceData.items!.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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

          {invoiceData.items && invoiceData.items.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoiceData.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VAT ({formatNumber((selectedCompany?.vat_rate || 0) * 100, 1)}%):</span>
                  <span className="font-medium">{formatCurrency(invoiceData.vat_amount || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>PPDA ({formatNumber((selectedCompany?.ppda_rate || 0) * 100, 1)}%):</span>
                  <span className="font-medium">{formatCurrency(invoiceData.ppda_amount || 0)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2" style={getTextStyle()}>
                  <span>Grand Total:</span>
                  <span>{formatCurrency(invoiceData.grand_total || 0)}</span>
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
                value={invoiceData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                placeholder="Any additional notes for this invoice"
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default EditInvoice;
