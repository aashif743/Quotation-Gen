import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Loader2, AlertCircle, FileText } from 'lucide-react';
import { getReceipt, ReceiptData } from '../services/cashSalesApi';
import ReceiptDocument from '../components/Receipt/ReceiptDocument';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';

/** /receipts/:paymentId — the printable receipt for one payment. */
const ReceiptView: React.FC = () => {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReceipt(Number(paymentId))
      .then(setReceipt)
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the receipt.'))
      .finally(() => setLoading(false));
  }, [paymentId]);

  useDocumentTitle(receipt ? `Receipt ${receipt.receipt_number || ''} — ${receipt.invoice.client_name}` : null);

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!receipt) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-4 rounded-lg bg-red-50 text-red-700 flex items-center gap-2">
        <AlertCircle size={18} /> {error || 'Receipt not found.'}
      </div>
    );
  }

  const inv = receipt.invoice;
  const isSale = inv.doc_type === 'cash_sale';
  const primary = brandColorFor(inv.primary_color || '#4f46e5', theme === 'dark');
  const docPath = isSale ? `/cash-sales/${inv.id}` : `/invoice/${inv.id}`;

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await generateDocumentPDF('.receipt-document', `Receipt_${receipt.receipt_number || receipt.id}_${pdfFileSegment(inv.client_name)}.pdf`);
    } catch {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Back"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">Receipt {receipt.receipt_number}</h1>
            <p className="text-sm text-gray-500 truncate">
              {inv.client_name} · {isSale ? 'Cash sale' : 'Invoice'} {inv.invoice_number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(docPath)} className={`${btn} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50`}>
            <FileText className="h-4 w-4 mr-1.5" /> Open {isSale ? 'cash sale' : 'invoice'}
          </button>
          <button onClick={() => window.print()} className={`${btn} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50`}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </button>
          <button onClick={download} disabled={busy} className={`${btn} text-white`} style={{ backgroundColor: primary }}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Download PDF
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700 no-print"><AlertCircle size={16} /> {error}</div>}

      <div className="shadow-lg rounded-lg overflow-hidden bg-white">
        <ReceiptDocument receipt={receipt} rootClassName="receipt-document" />
      </div>
    </div>
  );
};

export default ReceiptView;
