import React, { useEffect, useRef, useState } from 'react';
import { recordPayment, updatePayment } from '../../services/api';
import { formatCurrency } from '../../utils/calculations';
import CurrencyInput from '../common/CurrencyInput';
import { Payment } from '../../types';
import { X, CreditCard, CheckCircle2 } from 'lucide-react';

const METHODS = [
  'Cash',
  'Bank Transfer',
  'Mobile Money',
  'Cheque',
  'Card',
  'Other',
] as const;

interface InvoiceSummary {
  id: number;
  invoice_number: string;
  grand_total: number | string;
  amount_paid?: number | string;
  balance_due?: number | string;
  client_name?: string;
}

interface RecordPaymentModalProps {
  invoice: InvoiceSummary;
  onClose: () => void;
  onRecorded?: () => void;
  /**
   * When provided, the modal switches to edit mode: it pre-fills with the
   * payment's existing values and PUTs to /api/payments/:id on save instead
   * of POSTing a new record.
   */
  existingPayment?: Payment;
}

const todayIso = () => new Date().toISOString().split('T')[0];

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  invoice,
  onClose,
  onRecorded,
  existingPayment,
}) => {
  const isEdit = !!existingPayment;
  const total = Number(invoice.grand_total || 0);
  const paid = Number(invoice.amount_paid || 0);
  const balance = Number(invoice.balance_due ?? total - paid);

  // For edit mode, the "balance" we compare against has the existing payment's
  // amount added back (since the user is restating it), so we don't flag a
  // legitimate edit as an overpayment.
  const balanceForCheck = isEdit
    ? balance + Number(existingPayment!.amount || 0)
    : balance;

  const [amount, setAmount] = useState<number>(
    isEdit
      ? Number(existingPayment!.amount || 0)
      : balance > 0
        ? balance
        : 0
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    isEdit ? (existingPayment!.payment_date || '').slice(0, 10) || todayIso() : todayIso()
  );
  const [method, setMethod] = useState<string>(
    isEdit ? existingPayment!.method || 'Cash' : 'Cash'
  );
  const [reference, setReference] = useState<string>(
    isEdit ? existingPayment!.reference || '' : ''
  );
  const [notes, setNotes] = useState<string>(
    isEdit ? existingPayment!.notes || '' : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const amountRef = useRef<HTMLInputElement>(null);

  // Auto-focus the amount field so the user can start typing immediately.
  useEffect(() => {
    setTimeout(() => amountRef.current?.focus(), 50);
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const validAmount = amount > 0;
  const overpaying = validAmount && amount > balanceForCheck + 0.01;

  const handleSubmit = async () => {
    if (!validAmount) {
      setError('Enter a payment amount greater than 0.');
      return;
    }
    if (!paymentDate) {
      setError('Payment date is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updatePayment(existingPayment!.id, {
          amount: amount,
          payment_date: paymentDate,
          method: method || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
        });
      } else {
        await recordPayment({
          invoice_id: invoice.id,
          amount: amount,
          payment_date: paymentDate,
          method: method || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
        });
      }
      if (onRecorded) onRecorded();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          (isEdit
            ? 'Could not save the payment. Please try again.'
            : 'Could not record the payment. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  // Smart placeholder for the reference field based on chosen method.
  const referencePlaceholder =
    method === 'Cheque'
      ? 'Cheque number'
      : method === 'Bank Transfer'
        ? 'Transaction ID'
        : method === 'Mobile Money'
          ? 'Confirmation code'
          : 'Receipt / reference number';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Gradient header — compact */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-green-600 text-white px-5 py-3 flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1 rounded-md text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center space-x-2.5">
            <div className="bg-white/20 backdrop-blur rounded-lg p-2">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight">
                {isEdit ? 'Edit Payment' : 'Record Payment'}
              </h2>
              <p className="text-xs text-white/85 mt-0.5 truncate">
                Invoice {invoice.invoice_number}
                {invoice.client_name && <span> · {invoice.client_name}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Balance summary — single compact row */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <SummaryStat label="Total" value={total} />
            <SummaryStat label="Paid" value={paid} color="text-green-700" />
            <SummaryStat
              label="Balance"
              value={balance}
              color={balance > 0 ? 'text-red-600' : 'text-gray-900'}
              bold
            />
          </div>
        </div>

        {/* Form body — scrolls if needed so the footer is always visible */}
        <div className="px-5 py-3 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {error}
            </div>
          )}

          {/* Amount — hero field */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-900">Amount</label>
              {balanceForCheck > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(balanceForCheck)}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Pay full balance
                </button>
              )}
            </div>
            <div
              className={`relative rounded-lg border-2 transition-colors ${
                overpaying
                  ? 'border-amber-400 bg-amber-50/50'
                  : 'border-gray-200 focus-within:border-emerald-500 bg-white'
              }`}
            >
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none">
                MWK
              </span>
              <CurrencyInput
                ref={amountRef}
                value={amount}
                onChange={setAmount}
                placeholder="0.00"
                className="w-full bg-transparent pl-14 pr-3 py-2.5 text-xl font-bold text-right tabular-nums focus:outline-none"
              />
            </div>
            {overpaying && (
              <p className="mt-1 text-xs text-amber-700">
                ⚠️ More than the outstanding balance. The invoice will still be marked paid.
              </p>
            )}
          </div>

          {/* Date + Method on the same line */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-gray-900 mb-1">Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-900 mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              Reference <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={referencePlaceholder}
              className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any extra context..."
              className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* Footer — pinned, always visible */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !validAmount}
            className="inline-flex items-center px-4 py-2 text-sm rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white font-semibold shadow-sm hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-2" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {isEdit ? 'Save Changes' : 'Record Payment'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
}> = ({ label, value, color = 'text-gray-900', bold }) => (
  <div className="min-w-0 flex-1">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
    <p
      className={`${bold ? 'font-bold text-sm' : 'font-semibold text-xs'} ${color} truncate tabular-nums`}
      title={formatCurrency(value)}
    >
      {formatCurrency(value)}
    </p>
  </div>
);

export default RecordPaymentModal;
