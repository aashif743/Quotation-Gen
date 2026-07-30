import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getPurchase, recordVendorPayment, deleteVendorPayment, deletePurchase } from '../services/api';
import { Purchase } from '../types';
import { ArrowLeft, Trash2, Plus, Loader2, TrendingUp, Link as LinkIcon, X } from 'lucide-react';

const statusPill = (s?: string) => {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    partial: 'bg-amber-100 text-amber-800',
    pending: 'bg-gray-100 text-gray-700',
  };
  return map[s || 'pending'] || map.pending;
};

const PurchaseView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const data = await getPurchase(Number(id));
      setPurchase(data);
    } catch {
      setPurchase(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!purchase) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Purchase not found</p>
        <button onClick={() => navigate('/purchases')} className="text-blue-600 hover:underline">Back to Purchases</button>
      </div>
    );
  }

  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const canEdit = isAdmin || (user && purchase.created_by === user.id);
  const grand = Number(purchase.grand_total || 0);
  const paid = Number(purchase.amount_paid || 0);
  const balance = Number(purchase.balance_due ?? grand - paid);

  const handleDelete = async () => {
    if (!purchase.id) return;
    try {
      await deletePurchase(purchase.id);
      navigate('/purchases');
    } catch {
      setConfirmDelete(false);
    }
  };

  const linkedNumber = purchase.invoice_number || purchase.quotation_number;
  const linkedHref = purchase.invoice_id ? `/invoice/${purchase.invoice_id}` : purchase.quotation_id ? `/quotation/${purchase.quotation_id}` : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </button>
        {isAdmin && (
          <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </button>
        )}
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{purchase.purchase_number}</h1>
          <p className="text-gray-600 mt-1">
            {purchase.vendor_name} · {new Date(purchase.date).toLocaleDateString()}
            {purchase.created_by_name ? ` · recorded by ${purchase.created_by_name}` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusPill(purchase.payment_status)}`}>
          {purchase.payment_status === 'paid' ? 'Paid' : purchase.payment_status === 'partial' ? 'Partially paid' : 'Unpaid'}
        </span>
      </div>

      {/* Profit card (only when linked to a client order) */}
      {purchase.profit && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Profit on this order</h2>
            {linkedNumber && linkedHref && (
              <Link to={linkedHref} className="inline-flex items-center text-sm ml-1" style={{ color: primary }}>
                <LinkIcon className="h-3.5 w-3.5 mr-1" />{linkedNumber}
              </Link>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <Metric label="Sale (client)" value={formatCurrency(purchase.profit.sale_value)} />
            <Metric label="Cost (all purchases)" value={formatCurrency(purchase.profit.order_cost)} />
            <Metric
              label="Profit"
              value={formatCurrency(purchase.profit.profit)}
              valueClass={purchase.profit.profit >= 0 ? 'text-green-600' : 'text-red-600'}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left font-medium px-6 py-3">Description</th>
              <th className="text-right font-medium px-6 py-3">Qty</th>
              <th className="text-right font-medium px-6 py-3">Unit cost</th>
              <th className="text-right font-medium px-6 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(purchase.items || []).map((it) => (
              <tr key={it.id}>
                <td className="px-6 py-3 text-sm text-gray-900">{it.description}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{Number(it.quantity)}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right tabular-nums">{formatCurrency(Number(it.unit_cost))}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right tabular-nums">{formatCurrency(Number(it.total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-600">Total cost</td>
              <td className="px-6 py-3 text-right text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(grand)}</td>
            </tr>
          </tfoot>
        </table>
        {purchase.notes && (
          <div className="px-6 py-4 border-t border-gray-100 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Notes: </span>{purchase.notes}
          </div>
        )}
      </div>

      {/* Payments out */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Payments to vendor</h2>
            <p className="text-sm text-gray-500">
              Paid {formatCurrency(paid)} of {formatCurrency(grand)} ·{' '}
              <span className={balance > 0 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                {balance > 0 ? `${formatCurrency(balance)} outstanding` : 'Fully paid'}
              </span>
            </p>
          </div>
          {canEdit && balance > 0 && (
            <button onClick={() => setPayOpen(true)} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
              <Plus className="h-4 w-4 mr-1.5" /> Record payment
            </button>
          )}
        </div>

        {(purchase.payments || []).length === 0 ? (
          <p className="text-sm text-gray-500">No payments recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(purchase.payments || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 tabular-nums">{formatCurrency(Number(p.amount))}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(p.payment_date).toLocaleDateString()}
                    {p.method ? ` · ${p.method}` : ''}{p.reference ? ` · ${p.reference}` : ''}
                    {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={async () => { if (purchase.id) { await deleteVendorPayment(purchase.id, p.id); load(); } }}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                    title="Remove payment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {payOpen && purchase.id && (
        <PaymentModal
          purchaseId={purchase.id}
          maxAmount={balance}
          primary={primary}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); load(); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Purchase</h3>
            <p className="mt-2 text-sm text-gray-600">Delete {purchase.purchase_number}? This also removes its payment records.</p>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div>
    <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
    <p className={`text-xl font-bold tabular-nums ${valueClass || 'text-gray-900'}`}>{value}</p>
  </div>
);

const PaymentModal: React.FC<{
  purchaseId: number;
  maxAmount: number;
  primary: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ purchaseId, maxAmount, primary, onClose, onSaved }) => {
  const [amount, setAmount] = useState(maxAmount > 0 ? String(maxAmount) : '');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a positive amount.'); return; }
    setSaving(true);
    setError('');
    try {
      await recordVendorPayment(purchaseId, { amount: amt, payment_date: paymentDate, method, reference, notes });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to record payment.');
      setSaving(false);
    }
  };

  const cls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Record payment to vendor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input type="number" min="0" className={cls} value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.currentTarget.blur()} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" className={cls} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <input className={cls} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, bank, ..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
              <input className={cls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt #" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea className={cls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primary }}>
            {saving ? 'Saving...' : 'Save payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseView;
