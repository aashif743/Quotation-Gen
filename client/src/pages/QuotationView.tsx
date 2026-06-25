import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getQuotation, createInvoiceFromQuotation, createDeliveryNoteFromQuotation } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Quotation } from '../types';
import { generatePDF } from '../utils/pdfGenerator';
import QuotationDocument from '../components/Quotation/QuotationDocument';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import { Download, Edit2, ArrowLeft, Printer, FileText, Truck } from 'lucide-react';

const QuotationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatingDeliveryNote, setGeneratingDeliveryNote] = useState(false);

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

  // Tab title (and any print-header text) becomes e.g. "Quotation QT-0001 —
  // Acme Co." instead of the default app name. Browsers that inject the page
  // title into the print header will at least show something useful.
  useDocumentTitle(
    quotation
      ? `Quotation ${quotation.quote_number}${quotation.client_name ? ` — ${quotation.client_name}` : ''}`
      : null
  );

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

  const handleGenerateDeliveryNote = async () => {
    if (!quotation?.id) return;

    setGeneratingDeliveryNote(true);
    try {
      const dn = await createDeliveryNoteFromQuotation(quotation.id);
      navigate(`/delivery-note/${dn.id}`);
    } catch (error: any) {
      console.error('Error generating delivery note:', error);
      const message = error?.response?.data?.error || 'Failed to generate delivery note. Please try again.';
      alert(message);
    } finally {
      setGeneratingDeliveryNote(false);
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

  // Use the brightened brand color for buttons in dark mode so very dark
  // brand palettes (navy, deep maroon, …) stay visible on the dark surface.
  // The captured document itself still uses the raw `quotation.primary_color`.
  const primaryColor = quotation.primary_color || '#111827';
  const accentColor = brandColorFor(primaryColor, theme === 'dark');
  const getButtonStyle = (): React.CSSProperties => {
    return { backgroundColor: accentColor };
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar. Uniform pill-sized buttons (same height/padding/text size,
          consistent icon dimensions) grouped visually: navigation on the left,
          actions on the right. Wraps on narrow screens. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Admin can edit anything; staff can edit their own quotations. */}
          {(isAdmin || (user && quotation.created_by === user.id)) && (
            <button
              onClick={() => navigate(`/edit-quotation/${id}`)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <Edit2 className="h-4 w-4 mr-1.5" />
              Edit
            </button>
          )}

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </button>

          <button
            onClick={handleGenerateInvoice}
            disabled={generatingInvoice}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-blue-500 text-blue-600 rounded-lg bg-white hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {generatingInvoice ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-1.5" />
                Creating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-1.5" />
                Invoice
              </>
            )}
          </button>

          <button
            onClick={handleGenerateDeliveryNote}
            disabled={generatingDeliveryNote}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-amber-500 text-amber-700 rounded-lg bg-white hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            {generatingDeliveryNote ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600 mr-1.5" />
                Creating...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4 mr-1.5" />
                Delivery Note
              </>
            )}
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
            style={getButtonStyle()}
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1.5" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" />
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
        rootClassName="quotation-document shadow-lg rounded-lg"
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
          // Back-calculate the rates from the stored amounts so the saved
          // document shows the same "VAT (X%)" / "PPDA (X%)" labels as the
          // live preview did.
          vat_rate: quotation.vat_rate
            ?? (quotation.subtotal ? (quotation.vat_amount || 0) / quotation.subtotal : undefined),
          ppda_rate: quotation.ppda_rate
            ?? (quotation.subtotal ? (quotation.ppda_amount || 0) / quotation.subtotal : undefined),
        }}
      />
    </div>
  );
};

export default QuotationView;