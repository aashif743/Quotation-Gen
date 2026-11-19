import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Download, Printer, Edit2, Trash2, Loader2, AlertCircle, Receipt, CheckCircle2, Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { CashSale, deleteCashSale, getCashSale } from '../services/cashSalesApi';
import CashSaleDocument, { paidByText } from '../components/CashSale/CashSaleDocument';
import { formatCurrency } from '../utils/calculations';
import { brandColorFor } from '../utils/colors';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** /cash-sales/:id */
const CashSaleView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [sale, setSale] = useState<CashSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getCashSale(Number(id))
      .then(setSale)
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the cash sale.'))
      .finally(() => setLoading(false));
  }, [id]);

  useDocumentTitle(sale ? `Cash Sale ${sale.invoice_number} — ${sale.client_name}` : null);

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!sale) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-4 rounded-lg bg-red-50 text-red-700 flex items-center gap-2">
        <AlertCircle size={18} /> {error || 'Cash sale not found.'}
      </div>
    );
  }

  const primary = brandColorFor(sale.primary_color || '#4f46e5', theme === 'dark');
  const canEdit = isAdmin || sale.created_by === user?.id;

  const download = async () => {
    setBusy('pdf');
    setError('');
    try {
      await generateDocumentPDF('.cash-sale-document', `${sale.invoice_number}_${pdfFileSegment(sale.client_name)}.pdf`);
    } catch {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await deleteCashSale(sale.id);
      navigate('/cash-sales');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not delete the cash sale.');
      setBusy('');
      setConfirmDelete(false);
    }
  };

  const btn = 'inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
  const outline = `${btn} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50`;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/cash-sales')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Back to cash sales"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              Cash Sale {sale.invoice_number}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Paid
              </span>
            </h1>
            <p className="text-sm text-gray-500 truncate">
              {sale.client_name} · {formatCurrency(Number(sale.grand_total))} · {paidByText(sale.payment_method, sale.payment_reference)}
              {sale.payment_account_name ? ` into ${sale.payment_account_name}` : ''}
              {sale.created_by_name ? ` · by ${sale.created_by_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sale.payment_id && (
            <Link to={`/receipts/${sale.payment_id}`} className={outline}>
              <Receipt className="h-4 w-4 mr-1.5" /> Receipt
            </Link>
          )}
          {canEdit && (
            <Link to={`/cash-sales/${sale.id}/edit`} className={outline}>
              <Edit2 className="h-4 w-4 mr-1.5" /> Edit
            </Link>
          )}
          <button onClick={() => window.print()} className={outline}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </button>
          <button onClick={download} disabled={!!busy} className={`${btn} text-white`} style={{ backgroundColor: primary }}>
            {busy === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Download PDF
          </button>
          <Link to="/cash-sales/new" className={outline} title="New cash sale">
            <Plus className="h-4 w-4" />
          </Link>
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)} disabled={!!busy} className={`${btn} text-red-600 hover:bg-red-50`} title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700 no-print"><AlertCircle size={16} /> {error}</div>}

      <div className="shadow-lg rounded-lg overflow-hidden bg-white">
        <CashSaleDocument
          rootClassName="invoice-document cash-sale-document"
          data={{ ...sale, date: sale.sale_date }}
          company={{
            name: sale.company_name,
            address: sale.company_address,
            tpin: sale.company_tpin,
            bank_details: sale.company_bank_details,
            logo_url: sale.company_quote_logo || sale.company_logo,
            primary_color: sale.primary_color,
            secondary_color: sale.secondary_color,
            template: sale.company_template,
            letterhead: sale.company_letterhead,
            currency: sale.company_currency,
          }}
        />
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4 no-print" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Delete cash sale {sale.invoice_number}?</h3>
            <p className="mt-2 text-sm text-gray-600">
              The sale and its payment of {formatCurrency(Number(sale.grand_total))} are removed
              {sale.payment_account_name ? ` (and taken off ${sale.payment_account_name})` : ''}.
              You can restore it from Recently Deleted for 30 days.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
              <button onClick={remove} disabled={busy === 'delete'} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashSaleView;
