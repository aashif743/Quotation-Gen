import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getPurchaseOrders, deletePurchaseOrder } from '../services/purchaseOrdersApi';
import { PurchaseOrder, PurchaseOrderStatus } from '../types/purchaseOrders';
import { formatPoDate, poStatusPill, PO_STATUS_LABEL } from '../components/PurchaseOrder/poUtils';
import { PackageCheck, Search, Plus, Calendar, Trash2 } from 'lucide-react';

const STATUS_FILTERS: { value: '' | PurchaseOrderStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PurchaseOrders: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | PurchaseOrderStatus>('');
  const [toDelete, setToDelete] = useState<PurchaseOrder | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getPurchaseOrders({ company_id: selectedCompany.id })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!term) return true;
      return [o.lpo_number, o.vendor_name, o.purchase_number].some((f) => (f || '').toLowerCase().includes(term));
    });
  }, [orders, searchTerm, statusFilter]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deletePurchaseOrder(toDelete.id);
      setOrders((prev) => prev.filter((o) => o.id !== toDelete.id));
      setToDelete(null);
      setDeleteError('');
    } catch (e: any) {
      setDeleteError(e?.response?.data?.error || 'Failed to delete the LPO.');
    }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Local Purchase Orders</h1>
          <p className="text-gray-600 mt-2">Orders {selectedCompany.name} has issued to suppliers.</p>
        </div>
        <button
          onClick={() => navigate('/lpos/new')}
          className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-5 w-5 mr-2" /> New LPO
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by LPO number or supplier..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | PurchaseOrderStatus)}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading LPOs...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <PackageCheck className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {orders.length === 0 ? 'No LPOs yet' : 'No LPOs match your filters'}
              </h3>
              <p className="text-gray-600 mb-6">Issue a purchase order to a supplier, then convert it to a purchase when the goods arrive.</p>
              {orders.length === 0 && (
                <button onClick={() => navigate('/lpos/new')} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                  <Plus className="h-4 w-4 mr-2" /> New LPO
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LPO No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase</th>
                  {isAdmin && <th className="px-6 py-3 w-12" />}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/lpos/${o.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm font-medium whitespace-nowrap" style={{ color: primary }}>{o.lpo_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {o.vendor_name}
                      {isAdmin && o.created_by_name && <div className="text-xs text-gray-500">by {o.created_by_name}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600 whitespace-nowrap">
                        <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                        {formatPoDate(o.date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{formatPoDate(o.delivery_date) || '—'}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 tabular-nums whitespace-nowrap">
                      {formatCurrency(Number(o.grand_total || 0))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${poStatusPill(o.status)}`}>
                        {PO_STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      {o.purchase_id && o.purchase_number ? (
                        <Link
                          to={`/purchase/${o.purchase_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                          style={{ color: primary }}
                        >
                          {o.purchase_number}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteError(''); setToDelete(o); }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="Delete LPO"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete LPO</h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete {toDelete.lpo_number}?
              {toDelete.purchase_number ? ` The converted purchase ${toDelete.purchase_number} will be kept.` : ''}
            </p>
            {deleteError && <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{deleteError}</div>}
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
