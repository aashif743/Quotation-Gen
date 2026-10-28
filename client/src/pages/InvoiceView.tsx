import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getInvoice, getPaymentsForInvoice, deletePayment, uploadPaymentProof, deletePaymentProof } from '../services/api';
import { PaymentProofCell } from '../components/Payment/PaymentProof';
import { createDeliveryNoteFromInvoice } from '../services/jobCardsApi';
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
  Printer,
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Truck,
  Copy,
} from 'lucide-react';
import DuplicateInvoiceModal from '../components/Invoice/DuplicateInvoiceModal';
import SupremeDocument from '../components/Letterhead/SupremeDocument';
import BrandDocument from '../components/Document/BrandDocument';
import { PRICED_COLUMNS, pricedTotals } from '../components/Quotation/QuotationDocument';

const InvoiceView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, canHandlePayments, canUseDeliveryNotes } = useAuth();
  const { theme } = useTheme();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingDeliveryNote, setGeneratingDeliveryNote] = useState(false);

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  // When set, the modal opens in edit mode for this payment.
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);

  // Reload both the invoice (to refresh status/balance) and the payment list.
  const loadAll = async (invoiceId: number) => {
    const [inv, pays] = await Promise.all([
      getInvoice(invoiceId),
      canHandlePayments ? getPaymentsForInvoice(invoiceId).catch(() => [] as Payment[]) : Promise.resolve([] as Payment[]),
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

  const handleGenerateDeliveryNote = async () => {
    if (!invoice?.id) return;

    setGeneratingDeliveryNote(true);
    try {
      const dn = await createDeliveryNoteFromInvoice(invoice.id);
      navigate(`/delivery-note/${dn.id}`);
    } catch (error: any) {
      console.error('Error generating delivery note:', error);
      const message = error?.response?.data?.error || 'Failed to generate delivery note. Please try again.';
      alert(message);
    } finally {
      setGeneratingDeliveryNote(false);
    }
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

          {/* Duplicate — e.g. the same monthly invoice for a recurring client. */}
          {(isAdmin || (user && invoice.created_by === user.id)) && (
            <button
              onClick={() => setShowDuplicate(true)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              title="Create a copy of this invoice with a new number and date"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Duplicate
            </button>
          )}

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </button>

          {canUseDeliveryNotes && (
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
          )}

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

      {invoice.job_card_id && (
        <p className="text-sm text-gray-500 mb-2 no-print">
          From Job Card{' '}
          <Link to={`/job-cards/${invoice.job_card_id}`} className="font-medium hover:underline" style={{ color: accentColor }}>
            {invoice.job_card_number || `#${invoice.job_card_id}`}
          </Link>
        </p>
      )}

      {/* Payment tracking section — outside the .invoice-document so it
          doesn't appear in the PDF or print. */}
      {canHandlePayments && (
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
          onUploadProof={async (paymentId, file) => {
            await uploadPaymentProof(paymentId, file);
            if (invoice.id) await loadAll(invoice.id);
          }}
          onRemoveProof={async (paymentId) => {
            await deletePaymentProof(paymentId);
            if (invoice.id) await loadAll(invoice.id);
          }}
        />
      </div>
      )}

      {invoice.company_template === 'supreme' ? (
        // Client-specific letterhead design (same look as the quotation).
        <SupremeDocument
          kind="invoice"
          rootClassName="invoice-document shadow-lg"
          data={{ ...invoice, number: invoice.invoice_number }}
          company={{
            name: invoice.company_name || '',
            tpin: invoice.company_tpin,
            bank_details: invoice.company_bank_details,
            logo_url: invoice.company_quote_logo || invoice.company_logo,
            primary_color: invoice.primary_color,
            secondary_color: invoice.secondary_color,
            letterhead: invoice.company_letterhead,
          }}
        />
      ) : (
        <BrandDocument
          template={invoice.company_template}
          kind="invoice"
          rootClassName="invoice-document shadow-lg rounded-lg"
          company={{
            name: invoice.company_name || '',
            address: invoice.company_address,
            tpin: invoice.company_tpin,
            bank_details: invoice.company_bank_details,
            // Same bundled brand logo as the quotation.
            logo_url: invoice.company_quote_logo || invoice.company_logo,
            primary_color: invoice.primary_color,
            secondary_color: invoice.secondary_color,
          }}
          title="Invoice"
          number={invoice.invoice_number}
          meta={[
            { l: 'Date', v: new Date(invoice.date).toLocaleDateString() },
            { l: 'Due Date', v: getDueDate() },
          ]}
          party={{ label: 'Bill To', name: invoice.client_name, lines: [invoice.client_address, invoice.client_email, invoice.client_phone] }}
          columns={PRICED_COLUMNS}
          rows={invoice.items.map((item) => [
            item.description, formatNumber(item.quantity), formatCurrency(item.unit_price), formatCurrency(item.total),
          ])}
          // Back-calculate the rates from the stored amounts so the saved
          // invoice shows "VAT (X%)" / "PPDA (X%)" like the live preview did.
          totals={pricedTotals(
            invoice,
            invoice.subtotal ? (invoice.vat_amount || 0) / invoice.subtotal : null,
            invoice.subtotal ? (invoice.ppda_amount || 0) / invoice.subtotal : null,
          )}
          showBank
          notes={invoice.notes}
          terms={invoice.terms_conditions}
        />
      )}

      {showDuplicate && invoice.id && (
        <DuplicateInvoiceModal
          invoice={{
            id: invoice.id,
            company_id: invoice.company_id,
            invoice_number: invoice.invoice_number,
            client_name: invoice.client_name,
            grand_total: invoice.grand_total,
          }}
          primary={accentColor}
          onClose={() => setShowDuplicate(false)}
        />
      )}

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
  onUploadProof: (paymentId: number, file: File) => Promise<void>;
  onRemoveProof: (paymentId: number) => Promise<void>;
}> = ({ invoice, payments, loading, isAdmin, currentUserId, canRecord, onAddClick, onEditPayment, onDeletePayment, onUploadProof, onRemoveProof }) => {
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
                <th className="px-5 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Proof</th>
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
                    <td className="px-5 py-2 whitespace-nowrap">
                      <PaymentProofCell
                        url={p.proof_file_url}
                        fileName={p.proof_file_name}
                        uploadedBy={p.proof_uploaded_by_name}
                        canUpload={canAct || !!canRecord}
                        isAdmin={isAdmin}
                        onUpload={(file) => onUploadProof(p.id, file)}
                        onRemove={() => onRemoveProof(p.id)}
                      />
                    </td>
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
