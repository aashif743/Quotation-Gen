import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { Client } from '../types';
import { JobCard, JobCardItem, JOB_CARD_STATUSES, JOB_CARD_STATUS_LABELS } from '../types/jobCards';
import { getClient } from '../services/api';
import { getJobCard, createJobCard, updateJobCard, getNextJobCardNumber } from '../services/jobCardsApi';
import ClientPicker from '../components/Quotation/ClientPicker';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';

/** Today as a local 'YYYY-MM-DD' (toISOString would use UTC). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyItem = (): JobCardItem => ({ description: '', quantity: 1, unit_price: 0 });

/**
 * Create / edit page for job cards (internal work orders).
 * `/job-cards/new` creates a standalone job card (optionally `?clientId=`);
 * `/job-cards/:id/edit` edits an existing one. Item prices are internal —
 * used only when generating an invoice, never printed on the job card.
 */
const JobCardForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompany } = useCompany();

  const [data, setData] = useState<Partial<JobCard>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) {
      if (!selectedCompany) return;
      let alive = true;
      setInitialLoading(true);
      setData({
        company_id: selectedCompany.id,
        job_card_number: '',
        client_name: '',
        date: localToday(),
        status: 'pending',
        items: [emptyItem()],
      });
      getNextJobCardNumber(selectedCompany.id)
        .then(({ jobCardNumber }) => {
          if (alive) setData((prev) => ({ ...prev, job_card_number: prev.job_card_number || jobCardNumber }));
        })
        .catch(() => { /* user can type a number */ })
        .finally(() => { if (alive) setInitialLoading(false); });
      return () => { alive = false; };
    }
    (async () => {
      try {
        const jc = await getJobCard(parseInt(id!, 10));
        setData(jc);
      } catch (e) {
        console.error(e);
        setError('Failed to load job card.');
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [id, isNew, selectedCompany]);

  // `/job-cards/new?clientId=123` (e.g. from a client page) prefills the client.
  useEffect(() => {
    if (!isNew || !selectedCompany) return;
    const clientIdParam = searchParams.get('clientId');
    if (!clientIdParam) return;
    (async () => {
      try {
        const client = await getClient(parseInt(clientIdParam, 10));
        handleClientSelected(client);
      } catch {
        /* ignore — user can pick a client manually */
      } finally {
        searchParams.delete('clientId');
        setSearchParams(searchParams, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, selectedCompany?.id]);

  // Picking an existing client fills their details and links client_id so the
  // backend doesn't create a duplicate client record.
  const handleClientSelected = (client: Client) => {
    setData((prev) => ({
      ...prev,
      client_id: client.id,
      client_name: client.name,
      client_address: client.address || prev.client_address || '',
      client_email: client.email || prev.client_email || '',
      client_phone: client.phone || prev.client_phone || '',
    }));
  };

  const handleChange = (field: keyof JobCard, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (idx: number, field: keyof JobCardItem, value: any) => {
    setData((prev) => {
      const items = [...(prev.items || [])];
      const next: JobCardItem = {
        ...items[idx],
        [field]: field === 'quantity' || field === 'unit_price' ? parseFloat(value) || 0 : value,
      };
      // Letterhead design: size (e.g. "2 x 3") × cost per square metre fills
      // in the cost per item. The cost stays editable afterwards.
      if (field === 'size' || field === 'rate_per_sqm') {
        const area = sizeArea(next.size);
        const rate = parseFloat(String(next.rate_per_sqm ?? ''));
        if (area && rate > 0) next.unit_price = Math.round(area * rate * 100) / 100;
      }
      items[idx] = next;
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setData((prev) => ({ ...prev, items: [...(prev.items || []), emptyItem()] }));
  };

  const removeItem = (idx: number) => {
    setData((prev) => ({ ...prev, items: (prev.items || []).filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.job_card_number?.trim()) {
      alert('Please enter a job card number.');
      return;
    }
    if (!data.client_name?.trim()) {
      alert('Please enter a client name.');
      return;
    }
    if (!data.date) {
      alert('Please enter a date.');
      return;
    }
    if (!data.items || data.items.length === 0) {
      alert('Please add at least one item.');
      return;
    }
    if (data.items.some((it) => !String(it.description || '').trim())) {
      alert('Please enter a description for every item.');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await createJobCard({ ...data, company_id: selectedCompany!.id });
        navigate(`/job-cards/${created.id}`);
      } else {
        await updateJobCard(parseInt(id!, 10), data);
        navigate(`/job-cards/${id}`);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        `Failed to ${isNew ? 'create' : 'update'} job card. Please try again.`;
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  // Client-specific letterhead design: the job card prints costs, size and
  // service, plus sign-off names — so the form shows those fields too.
  const isSupreme = selectedCompany?.template === 'supreme';

  if (isNew && !selectedCompany) {
    return <div className="text-center py-12 text-gray-600">Select a company to create a job card.</div>;
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={() => navigate('/job-cards')} className="text-blue-600 hover:underline">
          Back to Job Cards
        </button>
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{isNew ? 'New Job Card' : 'Edit Job Card'}</h1>
            <p className="text-gray-600 mt-1">
              {isNew ? `For ${selectedCompany!.name}` : `Editing ${data.job_card_number}`}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isNew ? 'Create Job Card' : 'Save Changes'}
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job card details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Job Card Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field
              label="Job Card Number *"
              value={data.job_card_number || ''}
              onChange={(v) => handleChange('job_card_number', v)}
              placeholder="e.g. EH-JC-0001"
              required
            />
            <Field
              label="Date *"
              type="date"
              value={data.date?.split('T')[0] || ''}
              onChange={(v) => handleChange('date', v)}
              required
            />
            <Field
              label="Due Date"
              type="date"
              value={data.due_date?.split('T')[0] || ''}
              onChange={(v) => handleChange('due_date', v || null)}
            />
            <Field
              label="Assigned To"
              value={data.assigned_to || ''}
              onChange={(v) => handleChange('assigned_to', v)}
              placeholder="e.g. John, Mike"
            />
            {!isNew && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={data.status || 'pending'}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className={inputCls}
                  >
                    {JOB_CARD_STATUSES.map((s) => (
                      <option key={s} value={s}>{JOB_CARD_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <Field
                  label="Completed Date"
                  type="date"
                  value={data.completed_date?.split('T')[0] || ''}
                  onChange={(v) => handleChange('completed_date', v || null)}
                />
              </>
            )}
          </div>
          {isSupreme && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Job Card Type</label>
                <select
                  value={data.card_type || 'job'}
                  onChange={(e) => handleChange('card_type', e.target.value)}
                  className={inputCls}
                >
                  <option value="job">Job Card</option>
                  <option value="interiors">Interiors Job Card</option>
                </select>
              </div>
              <Field label="Job Card Prepared By" value={data.prepared_by || ''} onChange={(v) => handleChange('prepared_by', v)} />
              <Field label="Job Card Checked By" value={data.checked_by || ''} onChange={(v) => handleChange('checked_by', v)} />
              <Field label="Job Card Approved By" value={data.approved_by || ''} onChange={(v) => handleChange('approved_by', v)} />
              <Field label="Business Link Person" value={data.link_person || ''} onChange={(v) => handleChange('link_person', v)} />
            </div>
          )}
          <div className="mt-6">
            <TextField
              label="Job Description / Instructions"
              value={data.description || ''}
              onChange={(v) => handleChange('description', v)}
              rows={4}
              placeholder="What needs to be done, site details, special instructions..."
            />
          </div>
        </div>

        {/* Client info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isNew ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Client Name *</label>
                <ClientPicker
                  companyId={selectedCompany!.id}
                  value={data.client_name || ''}
                  onChange={(name) => {
                    // Typing a new name breaks any picked-client link.
                    setData((prev) => ({ ...prev, client_id: null, client_name: name }));
                  }}
                  onSelect={handleClientSelected}
                  required
                />
              </div>
            ) : (
              <Field
                label="Client Name *"
                value={data.client_name || ''}
                onChange={(v) => handleChange('client_name', v)}
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={data.client_email || ''}
              onChange={(v) => handleChange('client_email', v)}
            />
            <Field
              label="Phone"
              type="tel"
              value={data.client_phone || ''}
              onChange={(v) => handleChange('client_phone', v)}
            />
            <TextField
              label="Address"
              value={data.client_address || ''}
              onChange={(v) => handleChange('client_address', v)}
              rows={3}
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Items / Tasks</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Item
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            {isSupreme
              ? 'Costs are printed on the job card and used when generating an invoice. Enter a size like "2 x 3" and a cost per square metre to fill in the cost per item.'
              : 'Prices are internal — they are used only when generating an invoice and are never printed on the job card.'}
          </p>

          <div className="space-y-3">
            {(data.items || []).map((item, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700">
                    Item {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={(data.items || []).length === 1}
                    className="p-1.5 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-7">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
                      Description *
                    </label>
                    <textarea
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      rows={2}
                      className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="1"
                      min="0"
                      step="any"
                      required
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label
                      className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5"
                      title={isSupreme ? 'Printed on the job card and used for the invoice.' : 'Used when generating an invoice. Not printed on the job card.'}
                    >
                      {isSupreme ? 'Cost per item' : 'Price (for invoice — not printed)'}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={!item.unit_price ? '' : item.unit_price}
                      onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                      min="0"
                      step="any"
                    />
                  </div>
                  {isSupreme && (
                    <>
                      {data.card_type !== 'interiors' && (
                        <div className="col-span-6 sm:col-span-3">
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Size (m)</label>
                          <input
                            value={item.size || ''}
                            onChange={(e) => updateItem(idx, 'size', e.target.value)}
                            placeholder="e.g. 2 x 3"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      )}
                      <div className={`col-span-6 ${data.card_type !== 'interiors' ? 'sm:col-span-5' : 'sm:col-span-7'}`}>
                        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Service</label>
                        <input
                          value={item.service || ''}
                          onChange={(e) => updateItem(idx, 'service', e.target.value)}
                          placeholder="e.g. Printing & installation"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      {data.card_type !== 'interiors' && (
                        <div className="col-span-6 sm:col-span-4">
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Cost per square metre</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={item.rate_per_sqm ?? ''}
                            onChange={(e) => updateItem(idx, 'rate_per_sqm', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="0.00"
                            min="0"
                            step="any"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {(!data.items || data.items.length === 0) && (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-600 mb-3">No items on this job card</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Item
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Notes</h2>
          <TextField
            label="Notes (printed on the job card)"
            value={data.notes || ''}
            onChange={(v) => handleChange('notes', v)}
            rows={3}
          />
        </div>
      </form>
    </div>
  );
};

// "2 x 3", "2.4×1.2 m", "2 by 3" → area in square metres (null if not a size).
const sizeArea = (size?: string | null): number | null => {
  const m = String(size || '').match(/(\d+(?:\.\d+)?)\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1]) * parseFloat(m[2]);
  return a > 0 ? a : null;
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}> = ({ label, value, onChange, type = 'text', placeholder, required }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    />
  </div>
);

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}> = ({ label, value, onChange, rows = 3, placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    />
  </div>
);

export default JobCardForm;
