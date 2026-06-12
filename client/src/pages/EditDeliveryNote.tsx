import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeliveryNote, DeliveryNoteItem } from '../types';
import { getDeliveryNote, updateDeliveryNote } from '../services/api';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';

/**
 * Minimal edit page for delivery notes. DN don't carry money (no totals,
 * no taxes, no terms), so the form is just: number / date / client info /
 * line items. Items are { description, quantity }.
 */
const EditDeliveryNote: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<Partial<DeliveryNote>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const dn = await getDeliveryNote(parseInt(id, 10));
        setData(dn);
      } catch (e) {
        console.error(e);
        setError('Failed to load delivery note.');
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [id]);

  const handleChange = (field: keyof DeliveryNote, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (idx: number, field: keyof DeliveryNoteItem, value: any) => {
    setData((prev) => {
      const items = [...(prev.items || [])];
      items[idx] = {
        ...items[idx],
        [field]: field === 'quantity' ? parseFloat(value) || 0 : value,
      };
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setData((prev) => ({
      ...prev,
      items: [...(prev.items || []), { description: '', quantity: 1 }],
    }));
  };

  const removeItem = (idx: number) => {
    setData((prev) => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!data.delivery_note_number?.trim()) {
      alert('Please enter a delivery note number.');
      return;
    }
    if (!data.client_name?.trim()) {
      alert('Please enter a client name.');
      return;
    }
    if (!data.items || data.items.length === 0) {
      alert('Please add at least one item.');
      return;
    }

    setSaving(true);
    try {
      await updateDeliveryNote(parseInt(id, 10), data);
      navigate(`/delivery-note/${id}`);
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Failed to update delivery note. Please try again.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

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
        <button onClick={() => navigate('/delivery-history')} className="text-blue-600 hover:underline">
          Back to Delivery Notes
        </button>
      </div>
    );
  }

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
            <h1 className="text-3xl font-bold text-gray-900">Edit Delivery Note</h1>
            <p className="text-gray-600 mt-1">Editing {data.delivery_note_number}</p>
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
              Save Changes
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Delivery Note details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Delivery Note Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field
              label="Delivery Note Number *"
              value={data.delivery_note_number || ''}
              onChange={(v) => handleChange('delivery_note_number', v)}
              placeholder="e.g. EH-DN-0001"
              required
            />
            <Field
              label="Date *"
              type="date"
              value={data.date?.split('T')[0] || ''}
              onChange={(v) => handleChange('date', v)}
              required
            />
          </div>
        </div>

        {/* Client info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field
              label="Client Name *"
              value={data.client_name || ''}
              onChange={(v) => handleChange('client_name', v)}
              required
            />
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {(data.items || []).map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-200 bg-gray-50/40 p-4"
              >
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
                  <div className="col-span-12 sm:col-span-9">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
                      Description *
                    </label>
                    <textarea
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-3">
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
                </div>
              </div>
            ))}

            {(!data.items || data.items.length === 0) && (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-600 mb-3">No items in this delivery note</p>
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
      </form>
    </div>
  );
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
}> = ({ label, value, onChange, rows = 3 }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    />
  </div>
);

export default EditDeliveryNote;
