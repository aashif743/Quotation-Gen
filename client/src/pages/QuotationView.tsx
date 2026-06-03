import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getQuotation, createInvoiceFromQuotation } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Quotation } from '../types';
import { generatePDF } from '../utils/pdfGenerator';
import QuotationDocument from '../components/Quotation/QuotationDocument';
import { Download, Edit2, ArrowLeft, Printer, FileText } from 'lucide-react';

const QuotationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  useEffect(() => {
    const loadQuotation = async () => {
      if (!id) return;
      
      try {
        const data = await getQuotation(parseInt(id));
        setQuotation(data);
      } catch (error) {
        console.error('Error loading quotation:', error);
      } finally {
        setLoading(false);
      }
    };

    loadQuotation();
  }, [id]);

  const handleDownloadPDF = async () => {
    if (!quotation) return;
    
    setGenerating(true);
    try {
      await generatePDF(quotation);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateInvoice = async () => {
    if (!quotation?.id) return;

    setGeneratingInvoice(true);
    try {
      const invoice = await createInvoiceFromQuotation(quotation.id);
      navigate(`/invoice/${invoice.id}`);
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Failed to generate invoice. Please try again.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300"></div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Quotation not found</p>
        <button
          onClick={() => navigate('/history')}
          className="text-blue-600 hover:underline"
        >
          Back to History
        </button>
      </div>
    );
  }

  const primaryColor = quotation.primary_color || '#111827';
  const getButtonStyle = (): React.CSSProperties => {
    return { backgroundColor: primaryColor };
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </button>
        
        <div className="flex items-center space-x-4">
          {isAdmin && (
            <button
              onClick={() => navigate(`/edit-quotation/${id}`)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </button>
          )}

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </button>

          <button
            onClick={handleGenerateInvoice}
            disabled={generatingInvoice}
            className="inline-flex items-center px-4 py-2 border border-blue-500 text-blue-600 rounded-lg bg-white hover:bg-blue-50 transition-all disabled:opacity-50"
          >
            {generatingInvoice ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Invoice
              </>
            )}
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="inline-flex items-center px-6 py-2 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
            style={getButtonStyle()}
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {quotation.created_by_name && (
        <p className="text-sm text-gray-500 mb-2 no-print">
          Prepared by {quotation.created_by_name}
        </p>
      )}

      <QuotationDocument
        rootClassName="quotation-document shadow-lg rounded-lg overflow-hidden"
        template={quotation.company_template}
        data={quotation}
        company={{
          name: quotation.company_name || '',
          address: quotation.company_address,
          tpin: quotation.company_tpin,
          bank_details: quotation.company_bank_details,
          // Quotation header always uses the bundled brand logo, not the
          // admin-uploaded thumbnail.
          logo_url: quotation.company_quote_logo || quotation.company_logo,
          primary_color: quotation.primary_color,
          secondary_color: quotation.secondary_color,
        }}
      />
    </div>
  );
};

export default QuotationView;