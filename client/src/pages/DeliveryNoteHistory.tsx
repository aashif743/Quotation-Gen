import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getDeliveryNotes, deleteDeliveryNote, uploadSignedDeliveryNote } from '../services/api';
import { DeliveryNote } from '../types';
import { Truck, Search, Calendar, User, Eye, Trash2, Filter, CheckCircle2, Clock, Upload, Loader2 } from 'lucide-react';

const DeliveryNoteHistory: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<DeliveryNote[]>([]);
  const [filtered, setFiltered] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [signedFilter, setSignedFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [sortBy, setSortBy] = useState('newest');

  // Single hidden file input shared by every "Upload signed copy" row button.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!selectedCompany) return;
      try {
        const data = await getDeliveryNotes(selectedCompany.id);
        setItems(data);
        setFiltered(data);
      } catch (error) {
        console.error('Error loading delivery notes:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCompany]);

  useEffect(() => {
    let result = items.filter(
      (d) =>
        d.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.delivery_note_number.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (signedFilter !== 'all') {
      result = result.filter((d) =>
        signedFilter === 'signed' ? !!d.signed_file_url : !d.signed_file_url
      );
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      switch (dateFilter) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          cutoff.setFullYear(now.getFullYear() - 1);
          break;
      }
      if (dateFilter === 'today') {
        result = result.filter((d) => {
          const dd = new Date(d.date);
          dd.setHours(0, 0, 0, 0);
          return dd.getTime() === cutoff.getTime();
        });
      } else {
        result = result.filter((d) => new Date(d.date) >= cutoff);
      }
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime();
        case 'oldest':
          return new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime();
        case 'client':
          return a.client_name.localeCompare(b.client_name);
        default:
          return 0;
      }
    });

    setFiltered(result);
  }, [items, searchTerm, dateFilter, signedFilter, sortBy]);

  const handleUploadClick = (id: number) => {
    setUploadError(null);
    setUploadTargetId(id);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = uploadTargetId;
    setUploadTargetId(null);
    if (!file || !targetId) return;

    setUploadingId(targetId);
    setUploadError(null);
    try {
      const updated = await uploadSignedDeliveryNote(targetId, file);
      setItems((prev) =>
        prev.map((d) =>
          d.id === targetId
            ? {
                ...d,
                signed_file_url: updated.signed_file_url,
                signed_at: updated.signed_at,
                signed_by: updated.signed_by,
                signed_by_name: updated.signed_by_name,
              }
            : d
        )
      );
    } catch (err: any) {
      setUploadError({ id: targetId, message: err?.response?.data?.error || 'Upload failed.' });
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this delivery note?')) return;
    try {
      await deleteDeliveryNote(id);
      setItems(items.filter((d) => d.id !== id));
    } catch (error) {
      console.error('Error deleting delivery note:', error);
      alert('Failed to delete delivery note. Please try again.');
    }
  };

  const primary = selectedCompany?.primary_color || '#4f46e5';
  const hexToRgba = (hex: string, a: number) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!r) return `rgba(79, 70, 229, ${a})`;
    return `rgba(${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}, ${a})`;
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Note History</h1>
          <p className="text-gray-600 mt-2">
            {isAdmin
              ? `All delivery notes for ${selectedCompany.name}`
              : `Your delivery notes for ${selectedCompany.name}`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-lg relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by client name or DN number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: hexToRgba(primary, 0.3) }}
              />
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                  style={{ borderColor: hexToRgba(primary, 0.3) }}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last Month</option>
                  <option value="year">Last Year</option>
                </select>
              </div>
              <select
                value={signedFilter}
                onChange={(e) => setSignedFilter(e.target.value as 'all' | 'signed' | 'pending')}
                className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: hexToRgba(primary, 0.3) }}
                title="Filter by signed status"
              >
                <option value="all">All Status</option>
                <option value="signed">Signed</option>
                <option value="pending">Pending Signature</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: hexToRgba(primary, 0.3) }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="client">Client Name</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading delivery notes...</p>
            </div>
          ) : filtered.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery Note
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Signed
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primary, 0.15) }}>
                          <Truck className="h-4 w-4" style={{ color: primary }} />
                        </div>
                        <div className="ml-4 text-sm font-medium text-gray-900">
                          {d.delivery_note_number}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{d.client_name}</div>
                      {d.client_email && <div className="text-sm text-gray-500">{d.client_email}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {new Date(d.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {d.signed_file_url ? (
                        <span className="inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Signed
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                          <Clock className="h-3.5 w-3.5 mr-1" />
                          Pending
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          {d.created_by_name || 'Unknown'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {!d.signed_file_url && (
                          <button
                            onClick={() => handleUploadClick(d.id!)}
                            disabled={uploadingId === d.id}
                            className="p-2 hover:bg-amber-50 rounded-lg text-amber-700 disabled:opacity-50"
                            title="Upload signed copy"
                          >
                            {uploadingId === d.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        <Link
                          to={`/delivery-note/${d.id}`}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          style={{ color: primary }}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(d.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {uploadError && uploadError.id === d.id && (
                        <p className="text-xs text-red-600 mt-1 font-normal">{uploadError.message}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center">
              <Truck className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No delivery notes found</h3>
              <p className="text-gray-600 mb-6">
                Generate a delivery note from a quotation to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeliveryNoteHistory;
