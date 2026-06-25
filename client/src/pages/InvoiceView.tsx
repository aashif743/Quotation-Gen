import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoice, getPaymentsForInvoice, deletePayment } from '../services/api';
import RecordPaymentModal from '../components/Payment/RecordPaymentModal';
import { useAuth } from '../context/AuthContext';
import { Invoice, Payment } from '../types';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { generateInvoicePDF } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
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
  Printer,
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';

const InvoiceView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  // When set, the modal opens in edit mode for this payment.
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  // Reload both the invoice (to refresh status/balance) and the payment list.
  const loadAll = async (invoiceId: number) => {
    const [inv, pays] = await Promise.all([
      getInvoice(invoiceId),
      getPaymentsForInvoice(invoiceId).catch(() => [] as Payment[]),
    ]);
    setInvoice(inv);
    setPayments(pays);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setPaymentsLoading(true);
    loadAll(parseInt(id))
      .catch((err) => console.error('Error loading invoice:', err))
      .finally(() => {
        setLoading(false);
        setPaymentsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Browser tab + any leaked print header gets a meaningful title.
  useDocumentTitle(
    invoice
      ? `Invoice ${invoice.invoice_number}${invoice.client_name ? ` — ${invoice.client_name}` : ''}`
      : null
  );

  const handleDeletePayment = async (paymentId: number) => {
    if (!invoice?.id) return;
    if (!window.confirm('Delete this payment? The invoice status will recalculate.')) return;
    try {
      await deletePayment(paymentId);
      await loadAll(invoice.id);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not delete payment.');
    }
  };

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

  // Use the brightened brand color for chrome buttons in dark mode so very
  // dark brand palettes still pop against the dark surface. The document
  // itself keeps the raw `colors.primary`.
  const accentColor = brandColorFor(colors.primary, theme === 'dark');
  const getButtonStyle = (): React.CSSProperties => {
    return { backgroundColor: accentColor };
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar — uniform compact buttons, same height/padding/icon size. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Admin can edit anything; staff can edit their own invoices. */}
          {(isAdmin || (user && invoice.created_by === user.id)) && (
            <button
              onClick={() => navigate(`/edit-invoice/${id}`)}
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

      {/* Payment tracking section — outside the .invoice-document so it
          doesn't appear in the PDF or print. */}
      <div className="mb-6 no-print">
        <PaymentPanel
          invoice={invoice}
          payments={payments}
          loading={paymentsLoading}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
          canRecord={isAdmin || (user && invoice.created_by === user.id)}
          onAddClick={() => setShowPaymentForm(true)}
          onEditPayment={(p) => setEditingPayment(p)}
          onDeletePayment={handleDeletePayment}
        />
      </div>

      <div className="invoice-document bg-white shadow-lg rounded-lg">
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
                    {(() => {
                      // Back-calculate the rates from the stored amounts so
                      // the saved invoice shows "VAT (X%)" / "PPDA (X%)"
                      // like the live preview did.
                      const vatPct =
                        invoice.subtotal ? ((invoice.vat_amount || 0) / invoice.subtotal) * 100 : 0;
                      const ppdaPct =
                        invoice.subtotal ? ((invoice.ppda_amount || 0) / invoice.subtotal) * 100 : 0;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span>VAT ({formatNumber(vatPct, 1)}%):</span>
                            <span className="font-medium">{formatCurrency(invoice.vat_amount)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>PPDA ({formatNumber(ppdaPct, 1)}%):</span>
                            <span className="font-medium">{formatCurrency(invoice.ppda_amount)}</span>
                          </div>
                        </>
                      );
                    })()}
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

          <div
            className="mt-8 pt-6 border-t-2 text-center text-sm text-gray-500"
            style={{ borderColor: colors.primary }}
          >
            Thank you for your business!
          </div>
        </div>
      </div>

      {showPaymentForm && invoice.id && (
        <RecordPaymentModal
          invoice={{
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            grand_total: invoice.grand_total,
            amount_paid: invoice.amount_paid,
            balance_due: invoice.balance_due,
            client_name: invoice.client_name,
          }}
          onClose={() => setShowPaymentForm(false)}
          onRecorded={() => loadAll(invoice.id!)}
        />
      )}

      {editingPayment && invoice.id && (
        <RecordPaymentModal
          invoice={{
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            grand_total: invoice.grand_total,
            amount_paid: invoice.amount_paid,
            balance_due: invoice.balance_due,
            client_name: invoice.client_name,
          }}
          existingPayment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onRecorded={() => loadAll(invoice.id!)}
        />
      )}
    </div>
  );
};

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  paid:    { label: 'Paid',     bg: 'bg-green-100',  text: 'text-green-700',  Icon: CheckCircle2 },
  partial: { label: 'Partial',  bg: 'bg-amber-100',  text: 'text-amber-700',  Icon: AlertCircle },
  pending: { label: 'Pending',  bg: 'bg-red-100',    text: 'text-red-700',    Icon: XCircle },
};

const PaymentPanel: React.FC<{
  invoice: Invoice;
  payments: Payment[];
  loading: boolean;
  isAdmin: boolean;
  currentUserId: number | null;
  canRecord: boolean | null;
  onAddClick: () => void;
  onEditPayment: (payment: Payment) => void;
  onDeletePayment: (id: number) => void;
}> = ({ invoice, payments, loading, isAdmin, currentUserId, canRecord, onAddClick, onEditPayment, onDeletePayment }) => {
  const status = invoice.payment_status || 'pending';
  const meta = STATUS_LABEL[status] || STATUS_LABEL.pending;
  const total = Number(invoice.grand_total || 0);
  const paid = Number(invoice.amount_paid || 0);
  const balance = Number(invoice.balance_due ?? (total - paid));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header strip with status + record button */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3">
          <CreditCard className="h-5 w-5 text-gray-500 flex-shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Payments</h2>
            <p className="text-xs text-gray-500">
              {payments.length} payment{payments.length === 1 ? '' : 's'} recorded
            </p>
          </div>
          <span
            className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ml-2 ${meta.bg} ${meta.text}`}
          >
            <meta.Icon className="h-3.5 w-3.5 mr-1" />
            {meta.label}
          </span>
        </div>

        {canRecord && balance > 0 && (
          <button
            onClick={onAddClick}
            className="inline-flex items-center px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Record Payment
          </button>
        )}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Total invoiced</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(total)}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Amount paid</p>
          <p className="text-lg font-bold text-green-700 tabular-nums">{formatCurrency(paid)}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Balance due</p>
          <p className={`text-lg font-bold tabular-nums ${balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      {/* Payments list */}
      {loading ? (
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-300 mx-auto" />
        </div>
      ) : payments.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">
          No payments recorded yet for this invoice.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-5 py-2 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Recorded by</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {payments.map((p) => {
                // Admin can act on any payment; staff can act on payments they
                // themselves recorded (matches the backend access rule).
                const canAct = isAdmin || p.recorded_by === currentUserId;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 text-sm text-gray-900 whitespace-nowrap">
                      {new Date(p.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-2 text-sm text-gray-700">{p.method || '—'}</td>
                    <td className="px-5 py-2 text-sm text-gray-700">{p.reference || '—'}</td>
                    <td className="px-5 py-2 text-sm text-right font-semibold text-green-700 tabular-nums">
                      {formatCurrency(Number(p.amount))}
                    </td>
                    <td className="px-5 py-2 text-sm text-gray-600">{p.recorded_by_name || '—'}</td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">
                      {canAct && (
                        <div className="inline-flex items-center space-x-1">
                          <button
                            onClick={() => onEditPayment(p)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                            title="Edit this payment"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDeletePayment(p.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete this payment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InvoiceView;
