import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getClient,
  getClientQuotations,
  getClientInvoices,
  getClientDeliveryNotes,
  updateClient,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Client, ClientDocSummary } from '../types';
import { formatCurrency } from '../utils/calculations';
import {
  ArrowLeft,
  FileText,
  Receipt,
  Truck,
  Plus,
  Edit2,
  Save,
  X,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Hash,
  StickyNote,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
} from 'lucide-react';

type Tab = 'quotations' | 'invoices' | 'delivery-notes';

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('quotations');

  // Tab data
  const [quotations, setQuotations] = useState<ClientDocSummary[] | null>(null);
  const [invoices, setInvoices] = useState<ClientDocSummary[] | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<ClientDocSummary[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const cid = id ? parseInt(id, 10) : NaN;

  const reloadClient = async () => {
    try {
      const data = await getClient(cid);
      setClient(data);
      setEditForm({
        name: data.name,
        contact_person: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        tax_id: data.tax_id || '',
        notes: data.notes || '',
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (Number.isNaN(cid)) return;
    setLoading(true);
    reloadClient().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  // Lazily load each tab's data the first time it's opened.
  useEffect(() => {
    if (Number.isNaN(cid)) return;
    if (tab === 'quotations' && quotations === null) {
      setTabLoading(true);
      getClientQuotations(cid).then(setQuotations).finally(() => setTabLoading(false));
    } else if (tab === 'invoices' && invoices === null) {
      setTabLoading(true);
      getClientInvoices(cid).then(setInvoices).finally(() => setTabLoading(false));
    } else if (tab === 'delivery-notes' && deliveryNotes === null) {
      setTabLoading(true);
      getClientDeliveryNotes(cid).then(setDeliveryNotes).finally(() => setTabLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cid]);

  const handleSaveEdit = async () => {
    if (!client) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await updateClient(client.id, editForm);
      setClient((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
    } catch (e: any) {
      setSaveError(e?.response?.data?.error || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Client not found.</p>
        <Link to="/clients" className="text-blue-600 hover:underline">Back to Clients</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </button>

      {/* Top: contact card + summary stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact card */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Briefcase className="h-5 w-5 mr-2 text-gray-500" />
              Client Profile
            </h2>
            {isAdmin && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
              >
                <Edit2 className="h-4 w-4 mr-1.5" />
                Edit
              </button>
            )}
            {editing && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setSaveError('');
                    reloadClient();
                  }}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {saveError && (
            <div className="px-6 py-3 bg-red-50 text-red-700 text-sm border-b border-red-100">
              {saveError}
            </div>
          )}

          <div className="p-6">
            {editing ? (
              <EditForm values={editForm} onChange={setEditForm} />
            ) : (
              <DisplayForm client={client} />
            )}
          </div>
        </div>

        {/* Stats column */}
        <div className="space-y-3">
          <StatCard
            label="Quotations"
            value={(client.quotation_count ?? 0).toString()}
            icon={FileText}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <StatCard
            label="Invoices"
            value={(client.invoice_count ?? 0).toString()}
            icon={Receipt}
            color="text-green-600"
            bg="bg-green-50"
          />
          <StatCard
            label="Delivery Notes"
            value={(client.delivery_note_count ?? 0).toString()}
            icon={Truck}
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <StatCard
            label="Total Invoiced"
            value={formatCurrency(Number(client.total_invoiced || 0))}
            icon={DollarSign}
            color="text-purple-600"
            bg="bg-purple-50"
            truncate
          />
        </div>
      </div>

      {/* CTA */}
      <Link
        to={`/new-quotation?clientId=${client.id}`}
        className="inline-flex items-center px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
      >
        <Plus className="h-5 w-5 mr-2" />
        New Quotation for {client.name}
      </Link>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <TabButton
            active={tab === 'quotations'}
            onClick={() => setTab('quotations')}
            icon={FileText}
            label="Quotations"
            count={client.quotation_count ?? 0}
          />
          <TabButton
            active={tab === 'invoices'}
            onClick={() => setTab('invoices')}
            icon={Receipt}
            label="Invoices"
            count={client.invoice_count ?? 0}
          />
          <TabButton
            active={tab === 'delivery-notes'}
            onClick={() => setTab('delivery-notes')}
            icon={Truck}
            label="Delivery Notes"
            count={client.delivery_note_count ?? 0}
          />
        </div>

        <div>
          {tabLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
            </div>
          ) : tab === 'quotations' ? (
            <DocTable
              docs={quotations || []}
              emptyMessage="No quotations for this client yet."
              detailPathPrefix="/quotation"
              showTotal
            />
          ) : tab === 'invoices' ? (
            <DocTable
              docs={invoices || []}
              emptyMessage="No invoices for this client yet."
              detailPathPrefix="/invoice"
              showTotal
            />
          ) : (
            <DocTable
              docs={deliveryNotes || []}
              emptyMessage="No delivery notes for this client yet."
              detailPathPrefix="/delivery-note"
              showSigned
            />
          )}
        </div>
      </div>
    </div>
  );
};

const DisplayForm: React.FC<{ client: Client }> = ({ client }) => (
  <div className="space-y-3">
    <Row icon={Briefcase} label="Name" value={client.name} primary />
    {client.contact_person && <Row icon={Briefcase} label="Contact person" value={client.contact_person} />}
    {client.email && <Row icon={Mail} label="Email" value={client.email} />}
    {client.phone && <Row icon={Phone} label="Phone" value={client.phone} />}
    {client.address && <Row icon={MapPin} label="Address" value={client.address} multiline />}
    {client.tax_id && <Row icon={Hash} label="Tax ID / TPIN" value={client.tax_id} />}
    {client.notes && <Row icon={StickyNote} label="Notes" value={client.notes} multiline />}
  </div>
);

const Row: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  multiline?: boolean;
  primary?: boolean;
}> = ({ icon: Icon, label, value, multiline, primary }) => (
  <div className="flex items-start space-x-3">
    <Icon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className={`${primary ? 'text-lg font-semibold' : 'text-sm'} text-gray-900 ${
          multiline ? 'whitespace-pre-wrap' : ''
        }`}
      >
        {value}
      </p>
    </div>
  </div>
);

const EditForm: React.FC<{
  values: Partial<Client>;
  onChange: (v: Partial<Client>) => void;
}> = ({ values, onChange }) => {
  const set = (k: keyof Client, v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Name *" value={values.name || ''} onChange={(v) => set('name', v)} />
      <Field label="Contact person" value={values.contact_person || ''} onChange={(v) => set('contact_person', v)} />
      <Field label="Email" value={values.email || ''} onChange={(v) => set('email', v)} />
      <Field label="Phone" value={values.phone || ''} onChange={(v) => set('phone', v)} />
      <div className="md:col-span-2">
        <TextField label="Address" value={values.address || ''} onChange={(v) => set('address', v)} rows={2} />
      </div>
      <Field label="Tax ID / TPIN" value={values.tax_id || ''} onChange={(v) => set('tax_id', v)} />
      <div className="md:col-span-2">
        <TextField label="Internal notes" value={values.notes || ''} onChange={(v) => set('notes', v)} rows={3} />
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

const TextField: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number }> = ({ label, value, onChange, rows = 3 }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  truncate?: boolean;
}> = ({ label, value, icon: Icon, color, bg, truncate }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center">
    <div className={`p-2.5 rounded-lg ${bg} flex-shrink-0`}>
      <Icon className={`h-5 w-5 ${color}`} />
    </div>
    <div className="ml-3 min-w-0 flex-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className={`text-xl font-bold text-gray-900 ${truncate ? 'truncate' : ''}`}
        title={value}
      >
        {value}
      </p>
    </div>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}> = ({ active, onClick, icon: Icon, label, count }) => (
  <button
    onClick={onClick}
    className={`flex-1 px-4 py-3 flex items-center justify-center space-x-2 text-sm font-medium transition-colors border-b-2 ${
      active ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-600 hover:bg-gray-50'
    }`}
  >
    <Icon className="h-4 w-4" />
    <span>{label}</span>
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {count}
    </span>
  </button>
);

const DocTable: React.FC<{
  docs: ClientDocSummary[];
  emptyMessage: string;
  detailPathPrefix: string;
  showTotal?: boolean;
  showSigned?: boolean;
}> = ({ docs, emptyMessage, detailPathPrefix, showTotal, showSigned }) => {
  if (docs.length === 0) {
    return <p className="p-12 text-center text-gray-500 text-sm">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            {showSigned && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signed</th>
            )}
            {showTotal && (
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created by</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {docs.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50">
              <td className="px-6 py-3">
                <Link to={`${detailPathPrefix}/${d.id}`} className="text-sm font-medium text-indigo-700 hover:underline">
                  {d.number}
                </Link>
              </td>
              <td className="px-6 py-3 text-sm text-gray-700">
                <div className="inline-flex items-center">
                  <Calendar className="h-3.5 w-3.5 mr-1 text-gray-400" />
                  {new Date(d.date).toLocaleDateString()}
                </div>
              </td>
              {showSigned && (
                <td className="px-6 py-3">
                  {d.signed_file_url ? (
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Signed
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Pending
                    </span>
                  )}
                </td>
              )}
              {showTotal && (
                <td className="px-6 py-3 text-right text-sm font-medium text-gray-900 tabular-nums">
                  {formatCurrency(Number(d.grand_total || 0))}
                </td>
              )}
              <td className="px-6 py-3 text-sm text-gray-600">{d.created_by_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ClientDetail;
