import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getClients, createClient, deleteClient } from '../services/api';
import { Client } from '../types';
import { formatCurrency } from '../utils/calculations';
import {
  Users as UsersIcon,
  Search,
  Plus,
  Trash2,
  FileText,
  Receipt,
  Truck,
  Calendar,
  X,
  AlertCircle,
  DollarSign,
} from 'lucide-react';

const Clients: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newClient, setNewClient] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    notes: '',
  });

  const [toDelete, setToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await getClients(selectedCompany.id);
      setClients(data);
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load clients.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) =>
      [c.name, c.contact_person, c.email, c.phone].some((f) =>
        (f || '').toLowerCase().includes(term)
      )
    );
  }, [clients, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: clients.length,
      totalQuotations: clients.reduce((s, c) => s + (c.quotation_count || 0), 0),
      totalInvoiced: clients.reduce((s, c) => s + Number(c.total_invoiced || 0), 0),
    };
  }, [clients]);

  const openCreate = () => {
    setNewClient({
      name: '', contact_person: '', email: '', phone: '', address: '', tax_id: '', notes: '',
    });
    setCreateError('');
    setIsCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!selectedCompany) return;
    if (!newClient.name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await createClient({ company_id: selectedCompany.id, ...newClient });
      setIsCreateOpen(false);
      setMessage({ type: 'success', text: `Added ${newClient.name}.` });
      await load();
    } catch (e: any) {
      setCreateError(e?.response?.data?.error || 'Could not create the client.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteClient(toDelete.id);
      setMessage({ type: 'success', text: `Removed ${toDelete.name}.` });
      setToDelete(null);
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Could not delete the client.' });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const primary = selectedCompany?.primary_color || '#4f46e5';

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-2">
            Every customer of {selectedCompany.name} — all their quotations, invoices, and delivery
            notes in one place.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Client
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center space-x-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <SummaryCard label="Total Clients" value={stats.total.toString()} icon={UsersIcon} />
        <SummaryCard label="Total Quotations" value={stats.totalQuotations.toString()} icon={FileText} />
        <SummaryCard
          label="Total Invoiced"
          value={formatCurrency(stats.totalInvoiced)}
          icon={DollarSign}
          truncate
        />
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, contact, email or phone..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading clients...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <UsersIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
              <p className="text-gray-600 mb-6">
                Clients get created automatically as you save quotations, or you can add one now.
              </p>
              <button
                onClick={openCreate}
                className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90"
                style={{ backgroundColor: primary }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Docs</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total invoiced</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last activity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        to={`/clients/${c.id}`}
                        className="text-sm font-semibold text-gray-900 hover:underline"
                        style={{ color: primary }}
                      >
                        {c.name}
                      </Link>
                      {c.address && <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{c.address}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{c.contact_person || '—'}</div>
                      <div className="text-xs text-gray-500">
                        {c.email || c.phone || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-3 text-xs text-gray-600">
                        <span className="inline-flex items-center" title="Quotations">
                          <FileText className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {c.quotation_count || 0}
                        </span>
                        <span className="inline-flex items-center" title="Invoices">
                          <Receipt className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {c.invoice_count || 0}
                        </span>
                        <span className="inline-flex items-center" title="Delivery notes">
                          <Truck className="h-3.5 w-3.5 mr-1 text-gray-400" />
                          {c.delivery_note_count || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-medium text-gray-900 tabular-nums">
                        {formatCurrency(Number(c.total_invoiced || 0))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                        {c.last_activity && new Date(c.last_activity).getFullYear() > 1971
                          ? new Date(c.last_activity).toLocaleDateString()
                          : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin && (
                        <button
                          onClick={() => setToDelete(c)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete client"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <ClientFormModal
          title="Add New Client"
          values={newClient}
          onChange={(v) => setNewClient(v)}
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
            <h3 className="text-lg font-semibold text-gray-900">Delete Client</h3>
            <p className="mt-2 text-sm text-gray-600">
              Remove <span className="font-medium">{toDelete.name}</span> from your client list?
              Their existing quotations, invoices and delivery notes will be kept (just unlinked).
            </p>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setToDelete(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
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

const SummaryCard: React.FC<{
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  truncate?: boolean;
}> = ({ label, value, icon: Icon, truncate }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
    <div className="p-3 rounded-lg bg-green-100 flex-shrink-0">
      <Icon className="h-6 w-6 text-green-700" />
    </div>
    <div className="ml-4 min-w-0 flex-1">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p
        className={`text-2xl font-bold text-gray-900 ${truncate ? 'truncate text-xl' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  </div>
);

interface ClientFormValues {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  notes: string;
}

const ClientFormModal: React.FC<{
  title: string;
  values: ClientFormValues;
  onChange: (v: ClientFormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
  primary: string;
}> = ({ title, values, onChange, onCancel, onSubmit, submitting, error, primary }) => {
  const field = (k: keyof ClientFormValues, val: string) =>
    onChange({ ...values, [k]: val });

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
          <Input label="Client name *" value={values.name} onChange={(v) => field('name', v)} placeholder="e.g. Acme Co." />
          <Input label="Contact person" value={values.contact_person} onChange={(v) => field('contact_person', v)} placeholder="e.g. John Banda" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" value={values.email} onChange={(v) => field('email', v)} placeholder="acme@example.com" />
            <Input label="Phone" value={values.phone} onChange={(v) => field('phone', v)} placeholder="+265 ..." />
          </div>
          <TextArea label="Address" value={values.address} onChange={(v) => field('address', v)} rows={2} />
          <Input label="Tax ID / TPIN" value={values.tax_id} onChange={(v) => field('tax_id', v)} />
          <TextArea label="Internal notes" value={values.notes} onChange={(v) => field('notes', v)} rows={2} placeholder="Anything your team should remember about this client..." />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {submitting ? 'Saving...' : 'Save Client'}
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

export default Clients;
