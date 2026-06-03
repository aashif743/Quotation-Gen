import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoice } from '../services/api';
import { Invoice } from '../types';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import {
  Download,
  Edit2,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Clock,
  Building2,
  Printer
} from 'lucide-react';

const InvoiceView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const loadInvoice = async () => {
      if (!id) return;

      try {
        const data = await getInvoice(parseInt(id));
        setInvoice(data);
      } catch (error) {
        console.error('Error loading invoice:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [id]);

  const handleDownloadPDF = async () => {
    if (!invoice) return;

    setGenerating(true);
    try {
      await generateInvoicePDF(invoice);
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

  const getCompanyColors = () => {
    if (!invoice) return { primary: '#000000', secondary: '#ffffff', bg: '#f3f4f6' };
    const primary = invoice.primary_color || '#000000';
    const secondary = invoice.secondary_color || '#ffffff';
    // Generate a light background based on the primary color
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    const rgb = hexToRgb(primary);
    const bg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    return { primary, secondary, bg };
  };

  const colors = getCompanyColors();

  const getDueDate = () => {
    if (!invoice?.date || !invoice?.due_days) return 'N/A';
    const date = new Date(invoice.date);
    date.setDate(date.getDate() + invoice.due_days);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Invoice not found</p>
        <button
          onClick={() => navigate('/invoice-history')}
          className="text-blue-600 hover:underline"
        >
          Back to Invoice History
        </button>
      </div>
    );
  }

  const getButtonStyle = (): React.CSSProperties => {
    return { backgroundColor: colors.primary };
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
          <button
            onClick={() => navigate(`/edit-invoice/${id}`)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
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

      <div className="invoice-document bg-white shadow-lg rounded-lg overflow-hidden">
        <div
          className="px-8 py-6"
          style={{ backgroundColor: colors.bg }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {(() => {
                // Invoice header uses the same bundled brand logo as the
                // quotation (admin-uploaded thumbnail stays in the sidebar).
                const logoPath = invoice.company_quote_logo || invoice.company_logo;
                if (!logoPath) {
                  return (
                    <div
                      className="h-16 w-16 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                      style={{ backgroundColor: colors.primary }}
                    >
                      {invoice.company_name?.charAt(0)}
                    </div>
                  );
                }
                // Same-origin in production; CRA proxies /uploads in dev.
                const src = logoPath;
                return (
                  <img
                    src={src}
                    alt={`${invoice.company_name} logo`}
                    className="object-contain"
                    style={{ maxHeight: 70, width: 'auto' }}
                  />
                );
              })()}
              <div>
                <div className="flex items-center text-sm text-gray-600 mt-1">
                  <MapPin className="h-4 w-4 mr-1" />
                  {invoice.company_address}
                </div>
              </div>
            </div>

            <div className="text-right">
              <h2
                className="text-3xl font-bold"
                style={{ color: colors.primary }}
              >
                INVOICE
              </h2>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {invoice.invoice_number}
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: colors.primary }}
              >
                Company Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                  <span>TPIN: {invoice.company_tpin}</span>
                </div>
                <div className="text-gray-600">
                  {invoice.company_bank_details}
                </div>
              </div>
            </div>

            <div>
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: colors.primary }}
              >
                Bill To
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-gray-900">
                  {invoice.client_name}
                </p>
                {invoice.client_address && (
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 mr-2 text-gray-400 mt-0.5" />
                    <span className="text-gray-600">{invoice.client_address}</span>
                  </div>
                )}
                {invoice.client_email && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                    <span className="text-gray-600">{invoice.client_email}</span>
                  </div>
                )}
                {invoice.client_phone && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-gray-400" />
                    <span className="text-gray-600">{invoice.client_phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="h-4 w-4 mr-2" />
                <span>Invoice Date: {new Date(invoice.date).toLocaleDateString()}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center text-sm text-gray-600">
                <Clock className="h-4 w-4 mr-2" />
                <span>Due Date: {getDueDate()}</span>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr
                  className="text-white text-left"
                  style={{ backgroundColor: colors.primary }}
                >
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold text-center">Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Unit Price</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="px-4 py-3 text-sm">
                      <div className="whitespace-pre-wrap">{item.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {formatNumber(item.quantity)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-8">
            <div className="flex justify-end">
              <div className="w-80">
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>VAT:</span>
                      <span className="font-medium">{formatCurrency(invoice.vat_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>PPDA:</span>
                      <span className="font-medium">{formatCurrency(invoice.ppda_amount)}</span>
                    </div>
                    <hr className="border-gray-300" />
                    <div
                      className="flex justify-between text-lg font-bold"
                      style={{ color: colors.primary }}
                    >
                      <span>Grand Total:</span>
                      <span>{formatCurrency(invoice.grand_total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {(invoice.notes || invoice.terms_conditions) && (
            <div className="space-y-6">
              {invoice.notes && (
                <div>
                  <h4
                    className="text-lg font-semibold mb-2"
                    style={{ color: colors.primary }}
                  >
                    Notes
                  </h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {invoice.notes}
                  </div>
                </div>
              )}

              {invoice.terms_conditions && (
                <div>
                  <h4
                    className="text-lg font-semibold mb-2"
                    style={{ color: colors.primary }}
                  >
                    Terms & Conditions
                  </h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {invoice.terms_conditions}
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            className="mt-8 pt-6 border-t-2 text-center text-sm text-gray-500"
            style={{ borderColor: colors.primary }}
          >
            Thank you for your business!
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceView;
