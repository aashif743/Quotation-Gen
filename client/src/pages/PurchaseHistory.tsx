import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { getPurchases } from '../services/api';
import { PurchaseDocSummary } from '../types';
import { ShoppingCart, Search, Plus, Calendar } from 'lucide-react';

const statusPill = (s?: string) => ({
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  pending: 'bg-gray-100 text-gray-700',
}[s || 'pending'] || 'bg-gray-100 text-gray-700');

const PurchaseHistory: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [purchases, setPurchases] = useState<PurchaseDocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getPurchases({ company_id: selectedCompany.id })
      .then(setPurchases)
      .catch(() => setPurchases([]))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return purchases;
    return purchases.filter((p) =>
      [p.number, p.vendor_name].some((f) => (f || '').toLowerCase().includes(term))
    );
  }, [purchases, searchTerm]);

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Purchases</h1>
          <p className="text-gray-600 mt-2">Everything {selectedCompany.name} has bought from vendors.</p>
        </div>
        <button
          onClick={() => navigate('/new-purchase')}
          className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-5 w-5 mr-2" /> New Purchase
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by purchase number or vendor..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading purchases...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No purchases yet</h3>
              <p className="text-gray-600 mb-6">Record what you buy from vendors to track costs and profit.</p>
              <button onClick={() => navigate('/new-purchase')} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                <Plus className="h-4 w-4 mr-2" /> New Purchase
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/purchase/${p.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: primary }}>{p.number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{p.vendor_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                        {new Date(p.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 tabular-nums">
                      {formatCurrency(Number(p.grand_total || 0))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPill(p.payment_status)}`}>
                        {p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseHistory;
