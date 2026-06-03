import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { QuotationItem, Quotation } from '../types';
import { createQuotation, getNextQuoteNumber } from '../services/api';
import { 
  calculateSubtotal, 
  calculateVAT, 
  calculatePPDA, 
  calculateGrandTotal,
  formatCurrency 
} from '../utils/calculations';
import QuotationForm from '../components/Quotation/QuotationForm';
import QuotationPreview from '../components/Quotation/QuotationPreview';
import { Save, Eye, EyeOff } from 'lucide-react';

const NewQuotation: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [showPreview, setShowPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [quotationData, setQuotationData] = useState<Partial<Quotation>>({
    client_name: '',
    client_address: '',
    client_email: '',
    client_phone: '',
    date: new Date().toISOString().split('T')[0],
    expiry_days: 30,
    notes: '',
    terms_conditions: 'Payment due within 30 days of invoice date.\nAll prices are inclusive of VAT.\nGoods remain property of the seller until full payment is received.',
    items: []
  });

  useEffect(() => {
    const loadQuoteNumber = async () => {
      if (!selectedCompany) return;
      
      try {
        const { quoteNumber } = await getNextQuoteNumber(selectedCompany.id);
        setQuotationData(prev => ({
          ...prev,
          quote_number: quoteNumber,
          company_id: selectedCompany.id
        }));
      } catch (error) {
        console.error('Error loading quote number:', error);
      }
    };

    loadQuoteNumber();
  }, [selectedCompany]);

  const handleInputChange = (field: string, value: any) => {
    setQuotationData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleItemsChange = (items: QuotationItem[]) => {
    const updatedItems = items.map(item => ({
      ...item,
      total: item.quantity * item.unit_price
    }));

    if (!selectedCompany) return;

    const subtotal = calculateSubtotal(updatedItems);
    const vatAmount = calculateVAT(subtotal, selectedCompany.vat_rate);
    const ppdaAmount = calculatePPDA(subtotal, selectedCompany.ppda_rate);
    const grandTotal = calculateGrandTotal(subtotal, vatAmount, ppdaAmount);

    setQuotationData(prev => ({
      ...prev,
      items: updatedItems,
      subtotal,
      vat_amount: vatAmount,
      ppda_amount: ppdaAmount,
      grand_total: grandTotal
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !quotationData.items || quotationData.items.length === 0) return;

    if (!quotationData.quote_number?.trim()) {
      alert('Please enter a quote number.');
      return;
    }

    setLoading(true);
    try {
      const quotation = await createQuotation(quotationData as Omit<Quotation, 'id'>);
      navigate(`/quotation/${quotation.id}`);
    } catch (error: any) {
      console.error('Error creating quotation:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Failed to create quotation. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  // Get the primary color from the selected company
  const primaryColor = selectedCompany?.primary_color || '#4f46e5';

  const getButtonStyle = (): React.CSSProperties => ({
    backgroundColor: primaryColor,
  });

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Quotation</h1>
          <p className="text-gray-600 mt-2">
            Create a new quotation for {selectedCompany.name}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {showPreview ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !quotationData.items?.length}
            className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={getButtonStyle()}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Quotation
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[4fr_8fr] gap-8">
        <div className="space-y-6">
          <QuotationForm
            quotationData={quotationData}
            onInputChange={handleInputChange}
            onItemsChange={handleItemsChange}
          />
        </div>

        {showPreview && (
          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh_-_3rem)] xl:overflow-y-auto">
            <QuotationPreview
              quotationData={quotationData}
              company={selectedCompany}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default NewQuotation;