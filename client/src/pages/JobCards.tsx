import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getJobCards, deleteJobCard } from '../services/jobCardsApi';
import { JobCard, JobCardStatus, JOB_CARD_STATUSES, JOB_CARD_STATUS_LABELS } from '../types/jobCards';
import JobCardStatusBadge from '../components/JobCard/JobCardStatusBadge';
import { ClipboardList, Search, Calendar, User, Eye, Trash2, Filter, Plus, Users } from 'lucide-react';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

/** Due date passed and the job is still open. */
const isOverdue = (jc: JobCard) => {
  if (!jc.due_date || jc.status === 'completed' || jc.status === 'cancelled') return false;
  const due = new Date(jc.due_date);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
};

const JobCards: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobCardStatus | 'all' | 'open'>('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const load = async () => {
      if (!selectedCompany) return;
      setLoading(true);
      try {
        const data = await getJobCards(selectedCompany.id);
        setItems(data);
      } catch (error) {
        console.error('Error loading job cards:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCompany]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let result = items.filter(
      (jc) =>
        !term ||
        jc.client_name.toLowerCase().includes(term) ||
        jc.job_card_number.toLowerCase().includes(term) ||
        (jc.assigned_to || '').toLowerCase().includes(term)
    );
    if (statusFilter === 'open') {
      result = result.filter((jc) => jc.status === 'pending' || jc.status === 'in_progress');
    } else if (statusFilter !== 'all') {
      result = result.filter((jc) => jc.status === statusFilter);
    }
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime();
        case 'oldest':
          return new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime();
        case 'due': {
          const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return ad - bd;
        }
        case 'client':
          return a.client_name.localeCompare(b.client_name);
        default:
          return 0;
      }
    });
    return result;
  }, [items, searchTerm, statusFilter, sortBy]);

  const handleDelete = async (jc: JobCard) => {
    if (!jc.id) return;
    if (!window.confirm(`Delete job card ${jc.job_card_number}? Invoices generated from it are kept.`)) return;
    try {
      await deleteJobCard(jc.id);
      setItems((prev) => prev.filter((x) => x.id !== jc.id));
    } catch (error: any) {
      console.error('Error deleting job card:', error);
      alert(error?.response?.data?.error || 'Failed to delete job card. Please try again.');
    }
  };

  // Brightened in dark mode so dark company palettes stay readable.
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const hexToRgba = (hex: string, a: number) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!r) return `rgba(79, 70, 229, ${a})`;
    return `rgba(${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}, ${a})`;
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;

  const th = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Cards</h1>
          <p className="text-gray-600 mt-2">
            {isAdmin ? `All job cards for ${selectedCompany.name}` : `Your job cards for ${selectedCompany.name}`}
          </p>
        </div>
        <Link
          to="/job-cards/new"
          className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm hover:opacity-90"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Job Card
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-lg relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by client, JC number or assignee..."
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
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as JobCardStatus | 'all' | 'open')}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                  style={{ borderColor: hexToRgba(primary, 0.3) }}
                  title="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open (Pending + In Progress)</option>
                  {JOB_CARD_STATUSES.map((s) => (
                    <option key={s} value={s}>{JOB_CARD_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                style={{ borderColor: hexToRgba(primary, 0.3) }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="due">Due Date</option>
                <option value="client">Client Name</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading job cards...</p>
            </div>
          ) : filtered.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Job Card</th>
                  <th className={th}>Client</th>
                  <th className={th}>Date</th>
                  <th className={th}>Due</th>
                  <th className={th}>Status</th>
                  <th className={th}>Assigned To</th>
                  <th className={th}>Linked</th>
                  {isAdmin && <th className={th}>Created By</th>}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((jc) => (
                  <tr key={jc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primary, 0.15) }}>
                          <ClipboardList className="h-4 w-4" style={{ color: primary }} />
                        </div>
                        <div className="ml-4">
                          <Link
                            to={`/job-cards/${jc.id}`}
                            className="text-sm font-medium text-gray-900 hover:underline"
                          >
                            {jc.job_card_number}
                          </Link>
                          {jc.item_count != null && (
                            <div className="text-xs text-gray-500">
                              {jc.item_count} item{Number(jc.item_count) === 1 ? '' : 's'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {jc.client_id ? (
                          <Link to={`/clients/${jc.client_id}`} className="hover:underline" style={{ color: primary }}>
                            {jc.client_name}
                          </Link>
                        ) : (
                          jc.client_name
                        )}
                      </div>
                      {jc.client_phone && <div className="text-sm text-gray-500">{jc.client_phone}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {fmtDate(jc.date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm ${isOverdue(jc) ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                        {fmtDate(jc.due_date)}
                        {isOverdue(jc) && <span className="ml-1 text-xs">(overdue)</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <JobCardStatusBadge status={jc.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900 max-w-[12rem]">
                        {jc.assigned_to ? (
                          <>
                            <Users className="h-4 w-4 mr-1 text-gray-400 shrink-0" />
                            <span className="truncate" title={jc.assigned_to}>{jc.assigned_to}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="space-y-0.5">
                        {jc.quotation_id && (
                          <div>
                            <span className="text-gray-500">Quote: </span>
                            <Link to={`/quotation/${jc.quotation_id}`} className="hover:underline" style={{ color: primary }}>
                              {jc.quotation_number || `#${jc.quotation_id}`}
                            </Link>
                          </div>
                        )}
                        {jc.first_invoice_id && (
                          <div>
                            <span className="text-gray-500">Invoice: </span>
                            <Link to={`/invoice/${jc.first_invoice_id}`} className="hover:underline" style={{ color: primary }}>
                              {jc.first_invoice_number}
                            </Link>
                            {Number(jc.invoice_count) > 1 && (
                              <span className="text-xs text-gray-500"> +{Number(jc.invoice_count) - 1} more</span>
                            )}
                          </div>
                        )}
                        {!jc.quotation_id && !jc.first_invoice_id && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          {jc.created_by_name || 'Unknown'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/job-cards/${jc.id}`}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          style={{ color: primary }}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(jc)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center">
              <ClipboardList className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No job cards found</h3>
              <p className="text-gray-600 mb-6">
                Create a new job card, or generate one from a quotation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobCards;
