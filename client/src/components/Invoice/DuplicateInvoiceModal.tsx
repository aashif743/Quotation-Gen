import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duplicateInvoice, getNextInvoiceNumber } from '../../services/api';
import { formatCurrency } from '../../utils/calculations';
import { Copy, X, Loader2, Info } from 'lucide-react';

/** Local 'YYYY-MM-DD' (toISOString would use UTC and can be off by a day). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  invoice: {
    id: number;
    company_id: number;
    invoice_number: string;
    client_name?: string;
    grand_total?: number | string;
  };
  primary?: string;
  onClose: () => void;
}

/**
 * Duplicate an invoice for a recurring client (e.g. the same monthly bill).
 * The copy gets the next invoice number (editable) and today's date
 * (editable); items, client, taxes and notes are copied; payments are not.
 * On success it opens the new invoice.
 */
const DuplicateInvoiceModal: React.FC<Props> = ({ invoice, primary = '#4f46e5', onClose }) => {
  const navigate = useNavigate();
  const [date, setDate] = useState(localToday());
  const [number, setNumber] = useState('');
  const [loadingNumber, setLoadingNumber] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getNextInvoiceNumber(invoice.company_id)
      .then((r) => { if (alive) setNumber(r.invoiceNumber); })
      .catch(() => { /* leave blank — the server assigns the next number */ })
      .finally(() => { if (alive) setLoadingNumber(false); });
    return () => { alive = false; };
  }, [invoice.company_id]);

  const submit = async () => {
    if (!date) { setError('Please choose the invoice date.'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await duplicateInvoice(invoice.id, { date, invoice_number: number.trim() || undefined });
      onClose();
      navigate(`/invoice/${created.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not duplicate the invoice. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-gray-900/60" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: primary }}>
              <Copy className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Duplicate invoice</h3>
              <p className="text-xs text-gray-500">
                Copy of {invoice.invoice_number}
                {invoice.client_name ? ` · ${invoice.client_name}` : ''}
                {invoice.grand_total != null ? ` · ${formatCurrency(Number(invoice.grand_total))}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New invoice number</label>
            <div className="relative">
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={loadingNumber ? 'Loading next number…' : 'Next number is assigned automatically'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {loadingNumber && <Loader2 className="h-4 w-4 animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 p-3 rounded-lg bg-gray-50 text-xs text-gray-600">
            <Info className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span>
              Client, items, taxes and notes are copied. Payments are not — the new invoice starts unpaid.
              You can edit it after it's created.
            </span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {saving ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateInvoiceModal;
