import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getClient,
  getClientQuotations,
  getClientInvoices,
  getClientDeliveryNotes,
  updateClient,
  getPaymentsForInvoice,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Client, ClientDocSummary, Payment } from '../types';
import { formatCurrency } from '../utils/calculations';
import RecordPaymentModal from '../components/Payment/RecordPaymentModal';
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
  AlertCircle,
} from 'lucide-react';

type Tab = 'quotations' | 'invoices' | 'delivery-notes';

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('quotations');

  // Tab data
  const [quotations, setQuotations] = useState<ClientDocSummary[] | null>(null);
  const [invoices, setInvoices] = useState<ClientDocSummary[] | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<ClientDocSummary[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // The invoice the user is currently recording a payment for.
  const [payingInvoice, setPayingInvoice] = useState<ClientDocSummary | null>(null);
  // For editing the latest payment when the user clicks the Paid pill.
  const [editingPaymentFor, setEditingPaymentFor] = useState<{
    doc: ClientDocSummary;
    payment: Payment;
  } | null>(null);
  const [loadingPaymentForDocId, setLoadingPaymentForDocId] = useState<number | null>(null);

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Profile details are collapsed by default — the tabs are the primary focus.
  const [showProfile, setShowProfile] = useState(false);

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

  // Decides what to do when the user clicks the status pill on an invoice
  // row: open the record modal for pending/partial, or fetch the latest
  // payment and open the edit modal when already paid.
  const handlePaymentPillClick = async (doc: ClientDocSummary) => {
    const status = doc.payment_status || 'pending';
    if (status !== 'paid') {
      setPayingInvoice(doc);
      return;
    }
    setLoadingPaymentForDocId(doc.id);
    try {
      const list = await getPaymentsForInvoice(doc.id);
      if (!list.length) {
        alert('No payments are recorded for this invoice yet.');
        return;
      }
      setEditingPaymentFor({ doc, payment: list[0] });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Could not load payments.');
    } finally {
      setLoadingPaymentForDocId(null);
    }
  };

  // After a payment is recorded, refresh both the client totals (Total Paid /
  // Outstanding stat cards) and the invoices tab so the new status pill shows.
  const refreshAfterPayment = async () => {
    if (Number.isNaN(cid)) return;
    try {
      const [c, inv] = await Promise.all([
        getClient(cid),
        getClientInvoices(cid),
      ]);
      setClient(c);
      setInvoices(inv);
    } catch (e) {
      console.error('Error refreshing client after payment:', e);
    }
  };

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

  const outstanding = Math.max(
    0,
    Number(client.total_invoiced || 0) - Number(client.total_paid || 0)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back
      </button>

      {/* Compact header: name + contact line + actions, with a mini stats strip
          underneath and an expandable details section. Keeps the screen real
          estate for the documents tabs below. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
              <Briefcase className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-900 truncate">{client.name}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-600">
                {client.contact_person && <span>{client.contact_person}</span>}
                {client.email && (
                  <span className="inline-flex items-center">
                    <Mail className="h-3 w-3 mr-1 text-gray-400" />
                    {client.email}
                  </span>
                )}
                {client.phone && (
                  <span className="inline-flex items-center">
                    <Phone className="h-3 w-3 mr-1 text-gray-400" />
                    {client.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowProfile((v) => !v)}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
            >
              {showProfile ? 'Hide details' : 'Show details'}
            </button>
            <Link
              to={`/clients/${client.id}/statement`}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Statement
            </Link>
            <Link
              to={`/new-quotation?clientId=${client.id}`}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Quotation
            </Link>
            {isAdmin && !editing && (
              <button
                onClick={() => {
                  setEditing(true);
                  setShowProfile(true);
                }}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Compact stats strip — six tiles in one horizontal row on desktop. */}
        <div className="grid grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-gray-200 border-t border-gray-200 bg-gray-50/40">
          <MiniStat label="Quotations" value={(client.quotation_count ?? 0).toString()} icon={FileText} color="text-blue-600" />
          <MiniStat label="Invoices" value={(client.invoice_count ?? 0).toString()} icon={Receipt} color="text-green-600" />
          <MiniStat label="Delivery Notes" value={(client.delivery_note_count ?? 0).toString()} icon={Truck} color="text-amber-600" />
          <MiniStat label="Invoiced" value={formatCurrency(Number(client.total_invoiced || 0))} icon={DollarSign} color="text-purple-600" />
          <MiniStat label="Paid" value={formatCurrency(Number(client.total_paid || 0))} icon={CheckCircle2} color="text-emerald-600" />
          <MiniStat
            label="Outstanding"
            value={formatCurrency(outstanding)}
            icon={AlertCircle}
            color={outstanding > 0 ? 'text-red-600' : 'text-gray-600'}
          />
        </div>

        {/* Expandable details — only rendered when the user opens it or starts editing. */}
        {showProfile && (
          <div className="border-t border-gray-200 px-5 py-4 bg-white">
            {editing && (
              <div className="mb-3 flex items-center justify-end space-x-2">
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
            {saveError && (
              <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {saveError}
              </div>
            )}
            {editing ? (
              <EditForm values={editForm} onChange={setEditForm} />
            ) : (
              <DisplayForm client={client} />
            )}
          </div>
        )}
      </div>

      {/* Documents tabs — the primary content area. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto bg-gradient-to-b from-gray-50 to-white">
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

        {payingInvoice && (
          <RecordPaymentModal
            invoice={{
              id: payingInvoice.id,
              invoice_number: payingInvoice.number,
              grand_total: payingInvoice.grand_total ?? 0,
              amount_paid: payingInvoice.amount_paid,
              balance_due: payingInvoice.balance_due,
              client_name: client.name,
            }}
            onClose={() => setPayingInvoice(null)}
            onRecorded={refreshAfterPayment}
          />
        )}

        {editingPaymentFor && (
          <RecordPaymentModal
            invoice={{
              id: editingPaymentFor.doc.id,
              invoice_number: editingPaymentFor.doc.number,
              grand_total: editingPaymentFor.doc.grand_total ?? 0,
              amount_paid: editingPaymentFor.doc.amount_paid,
              balance_due: editingPaymentFor.doc.balance_due,
              client_name: client.name,
            }}
            existingPayment={editingPaymentFor.payment}
            onClose={() => setEditingPaymentFor(null)}
            onRecorded={refreshAfterPayment}
          />
        )}

        <div className="min-h-[60vh]">
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
              showPayment
              onRecordPayment={handlePaymentPillClick}
              canRecord={(doc) => isAdmin || (!!user && doc.created_by === user.id)}
              loadingPaymentForDocId={loadingPaymentForDocId}
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

// Compact horizontal stat tile used inside the header strip.
const MiniStat: React.FC<{
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = ({ label, value, icon: Icon, color }) => (
  <div className="px-3 py-2 min-w-0">
    <div className="flex items-center space-x-1.5">
      <Icon className={`h-3.5 w-3.5 ${color} flex-shrink-0`} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 truncate">
        {label}
      </p>
    </div>
    <p
      className="text-sm font-bold text-gray-900 truncate tabular-nums mt-0.5"
      title={value}
    >
      {value}
    </p>
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
    className={`flex-1 px-6 py-4 flex items-center justify-center space-x-2.5 text-base font-semibold transition-colors border-b-2 ${
      active ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-600 hover:bg-gray-50'
    }`}
  >
    <Icon className="h-5 w-5" />
    <span>{label}</span>
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
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
  showPayment?: boolean;
  onRecordPayment?: (doc: ClientDocSummary) => void;
  canRecord?: (doc: ClientDocSummary) => boolean;
  loadingPaymentForDocId?: number | null;
}> = ({ docs, emptyMessage, detailPathPrefix, showTotal, showSigned, showPayment, onRecordPayment, canRecord, loadingPaymentForDocId }) => {
  const navigate = useNavigate();
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
            {showPayment && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created by</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {docs.map((d) => (
            <tr
              key={d.id}
              onClick={() => navigate(`${detailPathPrefix}/${d.id}`)}
              className="hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-6 py-3">
                <span className="text-sm font-medium text-indigo-700">{d.number}</span>
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
              {showPayment && (
                <td className="px-6 py-3">
                  <PaymentStatusPill
                    status={d.payment_status || 'pending'}
                    canRecord={!!onRecordPayment && (canRecord ? canRecord(d) : true)}
                    loading={loadingPaymentForDocId === d.id}
                    onClick={() => onRecordPayment && onRecordPayment(d)}
                  />
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

// Status pill that doubles as the payment trigger. Clicking it (when the
// user has permission) opens the modal — in create mode for pending/partial
// invoices, or in edit mode against the latest payment for paid invoices.
// Stops propagation so it doesn't bubble to the row navigation.
const PaymentStatusPill: React.FC<{
  status: 'pending' | 'partial' | 'paid';
  canRecord: boolean;
  loading?: boolean;
  onClick: () => void;
}> = ({ status, canRecord, loading, onClick }) => {
  const styles =
    status === 'paid'
      ? 'bg-green-100 text-green-700'
      : status === 'partial'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';
  const label = status[0].toUpperCase() + status.slice(1);
  const interactive = canRecord;
  return (
    <button
      type="button"
      disabled={!interactive || loading}
      onClick={(e) => {
        e.stopPropagation();
        if (interactive) onClick();
      }}
      title={
        interactive
          ? status === 'paid'
            ? 'Click to edit the latest payment'
            : 'Click to record a payment'
          : undefined
      }
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${styles} ${
        interactive ? 'cursor-pointer hover:brightness-95 hover:shadow-sm' : 'cursor-default'
      } ${loading ? 'opacity-60' : ''}`}
    >
      {loading && (
        <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
      )}
      {label}
    </button>
  );
};

export default ClientDetail;
