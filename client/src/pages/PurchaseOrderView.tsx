import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  getPurchaseOrder, updatePurchaseOrderStatus, convertPurchaseOrder, deletePurchaseOrder,
} from '../services/purchaseOrdersApi';
import { PurchaseOrder, PurchaseOrderStatus } from '../types/purchaseOrders';
import PurchaseOrderDocument from '../components/PurchaseOrder/PurchaseOrderDocument';
import { poStatusPill, PO_STATUS_LABEL } from '../components/PurchaseOrder/poUtils';
import {
  ArrowLeft, Edit2, Download, Printer, Send, XCircle, PackageCheck, Trash2, Loader2, Link as LinkIcon, RotateCcw,
} from 'lucide-react';

type ConfirmKind = 'convert' | 'cancel' | 'delete' | null;

const PurchaseOrderView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    getPurchaseOrder(parseInt(id, 10))
      .then((data) => { if (alive) setPo(data); })
      .catch(() => { if (alive) setPo(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  useDocumentTitle(po ? `LPO ${po.lpo_number}${po.vendor_name ? ` — ${po.vendor_name}` : ''}` : null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!po) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">LPO not found</p>
        <button onClick={() => navigate('/lpos')} className="text-blue-600 hover:underline">Back to LPOs</button>
      </div>
    );
  }

  const primary = brandColorFor(po.primary_color || '#4f46e5', theme === 'dark');
  const isOwner = !!user && po.created_by === user.id;
  const canEdit = (isAdmin || isOwner) && (po.status !== 'received' || isAdmin);
  const isConverted = !!po.purchase_id;
  const canConvert = (isAdmin || isOwner) && !isConverted && po.status !== 'received' && po.status !== 'cancelled';

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      await generateDocumentPDF('.lpo-document', `${po.lpo_number}_${pdfFileSegment(po.vendor_name)}.pdf`);
    } catch {
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (status: PurchaseOrderStatus) => {
    setBusy(true);
    setActionError('');
    try {
      await updatePurchaseOrderStatus(po.id, status);
      setPo((prev) => (prev ? { ...prev, status } : prev));
      setConfirm(null);
    } catch (e: any) {
      setActionError(e?.response?.data?.error || 'Failed to update status.');
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async () => {
    setBusy(true);
    setActionError('');
    try {
      const { purchase_id } = await convertPurchaseOrder(po.id);
      navigate(`/purchase/${purchase_id}`);
    } catch (e: any) {
      const existing = e?.response?.data?.purchase_id;
      setActionError(e?.response?.data?.error || 'Failed to convert the LPO.');
      if (existing) setPo((prev) => (prev ? { ...prev, purchase_id: existing } : prev));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setActionError('');
    try {
      await deletePurchaseOrder(po.id);
      navigate('/lpos');
    } catch (e: any) {
      setActionError(e?.response?.data?.error || 'Failed to delete the LPO.');
      setBusy(false);
    }
  };

  const btn = 'inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button onClick={() => navigate(`/lpos/${po.id}/edit`)} className={btn}>
              <Edit2 className="h-4 w-4 mr-1.5" /> Edit
            </button>
          )}
          {(isAdmin || isOwner) && po.status === 'draft' && (
            <button onClick={() => setStatus('sent')} disabled={busy} className={btn}>
              <Send className="h-4 w-4 mr-1.5" /> Mark as Sent
            </button>
          )}
          {(isAdmin || isOwner) && (po.status === 'draft' || po.status === 'sent') && (
            <button onClick={() => { setActionError(''); setConfirm('cancel'); }} disabled={busy} className={`${btn} text-red-600`}>
              <XCircle className="h-4 w-4 mr-1.5" /> Cancel LPO
            </button>
          )}
          {(isAdmin || isOwner) && po.status === 'cancelled' && (
            <button onClick={() => setStatus('draft')} disabled={busy} className={btn}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Reopen as Draft
            </button>
          )}
          <button onClick={() => window.print()} className={btn}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            {generating ? 'Generating...' : 'Download PDF'}
          </button>
          {canConvert && (
            <button
              onClick={() => { setActionError(''); setConfirm('convert'); }}
              disabled={busy}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              <PackageCheck className="h-4 w-4 mr-1.5" /> Convert to Purchase
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setActionError(''); setConfirm('delete'); }}
              className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Status + links */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm no-print">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${poStatusPill(po.status)}`}>
          {PO_STATUS_LABEL[po.status] || po.status}
        </span>
        {po.created_by_name && <span className="text-gray-500">Prepared by {po.created_by_name}</span>}
        {isConverted && (
          <Link to={`/purchase/${po.purchase_id}`} className="inline-flex items-center hover:underline" style={{ color: primary }}>
            <LinkIcon className="h-3.5 w-3.5 mr-1" /> Purchase {po.purchase_number || `#${po.purchase_id}`}
          </Link>
        )}
        {po.quotation_id && (
          <Link to={`/quotation/${po.quotation_id}`} className="inline-flex items-center hover:underline" style={{ color: primary }}>
            <LinkIcon className="h-3.5 w-3.5 mr-1" /> Quotation {po.quotation_number || `#${po.quotation_id}`}
          </Link>
        )}
        {po.job_card_id && (
          <Link to={`/job-cards/${po.job_card_id}`} className="inline-flex items-center hover:underline" style={{ color: primary }}>
            <LinkIcon className="h-3.5 w-3.5 mr-1" /> Job card {po.job_card_number || `#${po.job_card_id}`}
          </Link>
        )}
      </div>

      {actionError && !confirm && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm no-print">{actionError}</div>
      )}

      <div className="overflow-x-auto print:overflow-visible">
        <div className="min-w-[794px] print:min-w-0">
          <PurchaseOrderDocument po={po} rootClassName="lpo-document shadow-lg rounded-lg print:shadow-none print:rounded-none" />
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {confirm === 'convert' ? 'Convert to Purchase' : confirm === 'cancel' ? 'Cancel LPO' : 'Delete LPO'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {confirm === 'convert' &&
                `Goods for ${po.lpo_number} have arrived? This records a purchase (vendor bill) from ${po.vendor_name} with the same items and total, and marks the LPO as received.`}
              {confirm === 'cancel' && `Mark ${po.lpo_number} as cancelled? You can reopen it later.`}
              {confirm === 'delete' &&
                `Delete ${po.lpo_number}? This cannot be undone.${po.purchase_number ? ` The converted purchase ${po.purchase_number} will be kept.` : ''}`}
            </p>
            {actionError && <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{actionError}</div>}
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setConfirm(null)} disabled={busy} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                Back
              </button>
              <button
                onClick={confirm === 'convert' ? handleConvert : confirm === 'cancel' ? () => setStatus('cancelled') : handleDelete}
                disabled={busy}
                className={`inline-flex items-center px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                  confirm === 'convert' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {confirm === 'convert' ? 'Convert' : confirm === 'cancel' ? 'Cancel LPO' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderView;
