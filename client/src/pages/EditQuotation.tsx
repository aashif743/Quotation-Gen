import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { QuotationItem, Quotation, Client } from '../types';
import { getQuotation, updateQuotation } from '../services/api';
import {
  calculateSubtotal,
  calculateVAT,
  calculatePPDA,
  calculateGrandTotal,
} from '../utils/calculations';
import QuotationForm from '../components/Quotation/QuotationForm';
import QuotationPreview from '../components/Quotation/QuotationPreview';
import { Save, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';

const EditQuotation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const [showPreview, setShowPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [quotationData, setQuotationData] = useState<Partial<Quotation>>({});

  useEffect(() => {
    const loadQuotation = async () => {
      if (!id) return;

      try {
        const data = await getQuotation(parseInt(id));
        // Back-fill the tax rates from the stored amounts if the quotation
        // pre-dates the per-quotation rate fields.
        const filled: Partial<Quotation> = { ...data };
        if (filled.vat_rate == null) {
          filled.vat_rate = filled.subtotal ? (filled.vat_amount || 0) / filled.subtotal : 0;
        }
        if (filled.ppda_rate == null) {
          filled.ppda_rate = filled.subtotal ? (filled.ppda_amount || 0) / filled.subtotal : 0;
        }
        setQuotationData(filled);
      } catch (error) {
        console.error('Error loading quotation:', error);
        alert('Failed to load quotation');
        navigate('/history');
      } finally {
        setInitialLoading(false);
      }
    };

    loadQuotation();
  }, [id, navigate]);

  const handleInputChange = (field: string, value: any) => {
    setQuotationData((prev) => {
      const next = { ...prev, [field]: value };
      if ((field === 'vat_rate' || field === 'ppda_rate') && next.items?.length) {
        const subtotal = calculateSubtotal(next.items);
        const vat = calculateVAT(subtotal, next.vat_rate ?? 0);
        const ppda = calculatePPDA(subtotal, next.ppda_rate ?? 0);
        next.subtotal = subtotal;
        next.vat_amount = vat;
        next.ppda_amount = ppda;
        next.grand_total = calculateGrandTotal(subtotal, vat, ppda);
      }
      return next;
    });
  };

  const handleItemsChange = (items: QuotationItem[]) => {
    if (!selectedCompany) return;

    const updatedItems = items.map((item) => ({
      ...item,
      total: item.quantity * item.unit_price,
    }));

    setQuotationData((prev) => {
      const vatRate = prev.vat_rate ?? selectedCompany.vat_rate;
      const ppdaRate = prev.ppda_rate ?? selectedCompany.ppda_rate;
      const subtotal = calculateSubtotal(updatedItems);
      const vat = calculateVAT(subtotal, vatRate);
      const ppda = calculatePPDA(subtotal, ppdaRate);
      return {
        ...prev,
        items: updatedItems,
        subtotal,
        vat_amount: vat,
        ppda_amount: ppda,
        grand_total: calculateGrandTotal(subtotal, vat, ppda),
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedCompany || !quotationData.items || quotationData.items.length === 0) return;

    if (!quotationData.quote_number?.trim()) {
      alert('Please enter a quote number.');
      return;
    }

    setLoading(true);
    try {
      await updateQuotation(parseInt(id), quotationData as Partial<Quotation>);
      navigate(`/quotation/${id}`);
    } catch (error: any) {
      console.error('Error updating quotation:', error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Failed to update quotation. Please try again.';
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
  const primaryColor = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const getButtonStyle = (): React.CSSProperties => ({
    backgroundColor: primaryColor,
  });

  return (
    <div className="max-w-7xl mx-auto">
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
            <h1 className="text-3xl font-bold text-gray-900">Edit Quotation</h1>
            <p className="text-gray-600 mt-2">
              Editing {quotationData.quote_number}
            </p>
          </div>
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <QuotationForm
            quotationData={quotationData}
            onInputChange={handleInputChange}
            onItemsChange={handleItemsChange}
            onClientSelected={(client: Client) => {
              setQuotationData((prev) => ({
                ...prev,
                client_id: client.id,
                client_name: client.name,
                client_address: client.address || prev.client_address || '',
                client_email: client.email || prev.client_email || '',
                client_phone: client.phone || prev.client_phone || '',
              }));
            }}
          />
        </div>

        {showPreview && (
          <div className="xl:sticky xl:top-6">
            <QuotationPreview
              quotationData={quotationData}
              company={{
                ...selectedCompany,
                vat_rate: quotationData.vat_rate ?? selectedCompany.vat_rate,
                ppda_rate: quotationData.ppda_rate ?? selectedCompany.ppda_rate,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EditQuotation;
