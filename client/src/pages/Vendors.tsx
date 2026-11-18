import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getVendors, createVendor, deleteVendor } from '../services/api';
import { Vendor } from '../types';
import { formatCurrency } from '../utils/calculations';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import {
  Store,
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  Calendar,
  X,
  AlertCircle,
  DollarSign,
  ArrowUpDown,
} from 'lucide-react';
import FitText from '../components/common/FitText';

const Vendors: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Filter / sort live in the URL (?show=outstanding&sort=owed) so a filtered
  // list can be bookmarked or opened again with Back.
  const [params, setParams] = useSearchParams();
  const show: VendorFilter = (FILTERS.some((f) => f.key === params.get('show')) ? params.get('show') : 'all') as VendorFilter;
  const sort: VendorSort = (SORTS.some((o) => o.key === params.get('sort')) ? params.get('sort') : 'name') as VendorSort;
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newVendor, setNewVendor] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '', tax_id: '', notes: '',
  });

  const [toDelete, setToDelete] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await getVendors(selectedCompany.id);
      setVendors(data);
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load vendors.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  const counts = useMemo(() => {
    const c: Record<VendorFilter, number> = { all: vendors.length, outstanding: 0, settled: 0, none: 0 };
    vendors.forEach((v) => { c[vendorStatus(v)] += 1; });
    return c;
  }, [vendors]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = vendors.filter((v) =>
      (show === 'all' || vendorStatus(v) === show) &&
      (!term || [v.name, v.contact_person, v.email, v.phone].some((f) => (f || '').toLowerCase().includes(term)))
    );
    const owed = (v: Vendor) => Number(v.balance_payable || 0);
    const bought = (v: Vendor) => Number(v.total_purchased || 0);
    const last = (v: Vendor) => (v.last_activity ? new Date(v.last_activity).getTime() : 0);
    const byName = (a: Vendor, b: Vendor) => (a.name || '').localeCompare(b.name || '');
    return list.sort((a, b) =>
      sort === 'owed' ? owed(b) - owed(a) || byName(a, b)
        : sort === 'purchased' ? bought(b) - bought(a) || byName(a, b)
        : sort === 'recent' ? last(b) - last(a) || byName(a, b)
        : byName(a, b)
    );
  }, [vendors, searchTerm, show, sort]);

  const shownTotals = useMemo(() => ({
    purchased: filtered.reduce((s, v) => s + Number(v.total_purchased || 0), 0),
    owed: filtered.reduce((s, v) => s + Number(v.balance_payable || 0), 0),
  }), [filtered]);
  const filteringActive = show !== 'all' || !!searchTerm.trim();

  const stats = useMemo(() => ({
    total: vendors.length,
    totalPurchased: vendors.reduce((s, v) => s + Number(v.total_purchased || 0), 0),
    outstanding: vendors.reduce((s, v) => s + Number(v.balance_payable || 0), 0),
  }), [vendors]);

  const openCreate = () => {
    setNewVendor({ name: '', contact_person: '', email: '', phone: '', address: '', tax_id: '', notes: '' });
    setCreateError('');
    setIsCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!selectedCompany) return;
    if (!newVendor.name.trim()) { setCreateError('Name is required.'); return; }
    setCreating(true);
    setCreateError('');
    try {
      await createVendor({ company_id: selectedCompany.id, ...newVendor });
      setIsCreateOpen(false);
      setMessage({ type: 'success', text: `Added ${newVendor.name}.` });
      await load();
    } catch (e: any) {
      setCreateError(e?.response?.data?.error || 'Could not create the vendor.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteVendor(toDelete.id);
      setMessage({ type: 'success', text: `Removed ${toDelete.name}.` });
      setToDelete(null);
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Could not delete the vendor.' });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-600 mt-2">
            Every supplier {selectedCompany.name} buys from — their purchases and what you still owe them, in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate('/new-purchase')}
            className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 shadow-sm hover:bg-gray-50"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            New Purchase
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90"
            style={{ backgroundColor: primary }}
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Vendor
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
        }`}>
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <SummaryCard label="Total Vendors" value={stats.total.toString()} icon={Store} />
        <SummaryCard label="Total Purchased" value={formatCurrency(stats.totalPurchased)} icon={ShoppingCart} truncate />
        <SummaryCard
          label="Outstanding Payable"
          value={formatCurrency(stats.outstanding)}
          icon={DollarSign}
          truncate
          sub={counts.outstanding ? `Owed to ${counts.outstanding} vendor${counts.outstanding === 1 ? '' : 's'} · view` : undefined}
          onClick={counts.outstanding ? () => setParam('show', 'outstanding', 'all') : undefined}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, contact, email or phone..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <label className="relative sm:w-56 flex-shrink-0">
              <span className="sr-only">Sort vendors</span>
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setParam('sort', e.target.value, 'name')}
                className="w-full pl-9 pr-8 py-2 border rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter vendors">
            {FILTERS.map((f) => {
              const active = show === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam('show', f.key, 'all')}
                  title={f.hint}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'text-white border-transparent shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: primary } : undefined}
                >
                  {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} />}
                  {f.label}
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading vendors...</p>
            </div>
          ) : filtered.length === 0 && vendors.length > 0 ? (
            <div className="p-12 text-center">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No vendors match</h3>
              <p className="text-gray-600 mb-5">
                {show === 'outstanding' ? 'Nothing is owed to any vendor right now.' : 'Try another filter or search.'}
              </p>
              <button
                onClick={() => { setSearchTerm(''); setParam('show', 'all', 'all'); }}
                className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-2" />
                Show all vendors
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Store className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No vendors yet</h3>
              <p className="text-gray-600 mb-6">
                Vendors get created automatically as you record purchases, or you can add one now.
              </p>
              <button
                onClick={openCreate}
                className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90"
                style={{ backgroundColor: primary }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Vendor
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Purchases</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total purchased</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last activity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((v) => (
                  <tr key={v.id} onClick={() => navigate(`/vendors/${v.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold" style={{ color: primary }}>{v.name}</div>
                      {v.address && <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{v.address}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{v.contact_person || '—'}</div>
                      <div className="text-xs text-gray-500">{v.email || v.phone || ''}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center text-xs text-gray-600">
                        <span className="inline-flex items-center" title="Purchases">
                          <ShoppingCart className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {v.purchase_count || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatCurrency(Number(v.total_purchased || 0))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`text-sm font-medium tabular-nums ${Number(v.balance_payable || 0) > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {formatCurrency(Number(v.balance_payable || 0))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                        {v.last_activity ? new Date(v.last_activity).toLocaleDateString() : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setToDelete(v); }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete vendor"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteringActive && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-700" colSpan={3}>
                      {filtered.length} of {vendors.length} vendor{vendors.length === 1 ? '' : 's'} shown
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(shownTotals.purchased)}</td>
                    <td className={`px-6 py-3 text-right text-sm font-bold tabular-nums ${shownTotals.owed > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{formatCurrency(shownTotals.owed)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <VendorFormModal
          title="Add New Vendor"
          values={newVendor}
          onChange={(v) => setNewVendor(v)}
          onCancel={() => setIsCreateOpen(false)}
          onSubmit={submitCreate}
          submitting={creating}
          error={createError}
          primary={primary}
        />
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Delete Vendor</h3>
            <p className="mt-2 text-sm text-gray-600">
              Remove <span className="font-medium">{toDelete.name}</span> from your vendor list?
              Their existing purchases will be kept (just unlinked).
            </p>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type VendorFilter = 'all' | 'outstanding' | 'settled' | 'none';
type VendorSort = 'name' | 'owed' | 'purchased' | 'recent';

const FILTERS: { key: VendorFilter; label: string; hint: string; dot?: string }[] = [
  { key: 'all', label: 'All vendors', hint: 'Every vendor' },
  { key: 'outstanding', label: 'Outstanding', hint: 'Vendors you still owe money to', dot: 'bg-amber-500' },
  { key: 'settled', label: 'Fully paid', hint: 'Vendors with purchases that are all paid', dot: 'bg-emerald-500' },
  { key: 'none', label: 'No purchases yet', hint: 'Vendors with no purchases recorded', dot: 'bg-gray-400' },
];

const SORTS: { key: VendorSort; label: string }[] = [
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'owed', label: 'Highest outstanding' },
  { key: 'purchased', label: 'Most purchased' },
  { key: 'recent', label: 'Latest activity' },
];

const vendorStatus = (v: Vendor): Exclude<VendorFilter, 'all'> =>
  Number(v.balance_payable || 0) > 0.004 ? 'outstanding'
    : Number(v.purchase_count || 0) > 0 || Number(v.total_purchased || 0) > 0 ? 'settled'
    : 'none';

const SummaryCard: React.FC<{
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  truncate?: boolean;
  sub?: string;
  onClick?: () => void;
}> = ({ label, value, icon: Icon, truncate, sub, onClick }) => (
  <div
    className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center ${onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
  >
    <div className="p-3 rounded-lg brand-halo flex-shrink-0">
      <Icon className="h-6 w-6 brand-icon" />
    </div>
    <div className="ml-4 min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <FitText className={`${truncate ? 'text-xl' : 'text-2xl'} font-bold text-gray-900 tabular-nums`} title={value}>{value}</FitText>
      {sub && <p className="text-xs text-amber-700 mt-0.5">{sub}</p>}
    </div>
  </div>
);

interface VendorFormValues {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  notes: string;
}

const VendorFormModal: React.FC<{
  title: string;
  values: VendorFormValues;
  onChange: (v: VendorFormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
  primary: string;
}> = ({ title, values, onChange, onCancel, onSubmit, submitting, error, primary }) => {
  const field = (k: keyof VendorFormValues, val: string) => onChange({ ...values, [k]: val });
  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          <Input label="Vendor name *" value={values.name} onChange={(v) => field('name', v)} placeholder="e.g. City Wholesalers" />
          <Input label="Contact person" value={values.contact_person} onChange={(v) => field('contact_person', v)} placeholder="e.g. John Banda" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" value={values.email} onChange={(v) => field('email', v)} placeholder="vendor@example.com" />
            <Input label="Phone" value={values.phone} onChange={(v) => field('phone', v)} placeholder="+265 ..." />
          </div>
          <TextArea label="Address" value={values.address} onChange={(v) => field('address', v)} rows={2} />
          <Input label="Tax ID / TPIN" value={values.tax_id} onChange={(v) => field('tax_id', v)} />
          <TextArea label="Internal notes" value={values.notes} onChange={(v) => field('notes', v)} rows={2} placeholder="Anything your team should remember about this vendor..." />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {submitting ? 'Saving...' : 'Save Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Input: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

const TextArea: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }> = ({ label, value, onChange, rows = 3, placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

export default Vendors;
