import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getInvoices, deleteInvoice, getPaymentsForInvoice } from '../services/api';
import { Invoice, Payment } from '../types';
import { formatCurrency } from '../utils/calculations';
import RecordPaymentModal from '../components/Payment/RecordPaymentModal';
import {
  FileText,
  Search,
  Calendar,
  User,
  Eye,
  Trash2,
  Filter
} from 'lucide-react';

const InvoiceHistory: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin, user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  // Which invoice the user is recording a payment for (null = modal closed).
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  // For editing the most recent payment on an already-paid invoice.
  const [editingPaymentFor, setEditingPaymentFor] = useState<{
    invoice: Invoice;
    payment: Payment;
  } | null>(null);
  // Set while we fetch the payment list for a given invoice so the pill can
  // show a tiny spinner instead of flickering.
  const [loadingPaidInvoiceId, setLoadingPaidInvoiceId] = useState<number | null>(null);

  // Reload the list silently after a payment so the status pill + balance refresh.
  const reloadInvoices = async () => {
    if (!selectedCompany) return;
    try {
      const data = await getInvoices(selectedCompany.id);
      setInvoices(data);
    } catch (err) {
      console.error('Error reloading invoices:', err);
    }
  };

  // Click handler for the status pill on a fully-paid invoice: fetch its
  // payments and open the modal in edit mode for the most recent one so the
  // user can correct an entry without leaving the list.
  const openEditForPaidInvoice = async (invoice: Invoice) => {
    if (!invoice.id) return;
    setLoadingPaidInvoiceId(invoice.id);
    try {
      const list = await getPaymentsForInvoice(invoice.id);
      if (!list.length) {
        alert('No payments are recorded for this invoice yet.');
        return;
      }
      setEditingPaymentFor({ invoice, payment: list[0] });
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not load payments.');
    } finally {
      setLoadingPaidInvoiceId(null);
    }
  };

  useEffect(() => {
    const loadInvoices = async () => {
      if (!selectedCompany) return;

      try {
        const data = await getInvoices(selectedCompany.id);
        setInvoices(data);
        setFilteredInvoices(data);
      } catch (error) {
        console.error('Error loading invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [selectedCompany]);

  useEffect(() => {
    let filtered = invoices.filter(invoice =>
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          filterDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      if (dateFilter !== 'today') {
        filtered = filtered.filter(invoice => new Date(invoice.date) >= filterDate);
      } else {
        filtered = filtered.filter(invoice => {
          const invoiceDate = new Date(invoice.date);
          invoiceDate.setHours(0, 0, 0, 0);
          return invoiceDate.getTime() === filterDate.getTime();
        });
      }
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime();
        case 'oldest':
          return new Date(a.created_at || a.date).getTime() - new Date(b.created_at || b.date).getTime();
        case 'amount_high':
          return b.grand_total - a.grand_total;
        case 'amount_low':
          return a.grand_total - b.grand_total;
        case 'client':
          return a.client_name.localeCompare(b.client_name);
        default:
          return 0;
      }
    });

    setFilteredInvoices(filtered);
  }, [invoices, searchTerm, dateFilter, sortBy]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) {
      return;
    }

    try {
      await deleteInvoice(id);
      setInvoices(invoices.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Failed to delete invoice. Please try again.');
    }
  };

  // Get the primary color from the selected company
  const primaryColor = selectedCompany?.primary_color || '#4f46e5';

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(79, 70, 229, ${alpha})`;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  };

  const getIconBgStyle = (): React.CSSProperties => ({
    backgroundColor: hexToRgba(primaryColor, 0.15),
  });

  const getTextStyle = (): React.CSSProperties => ({
    color: primaryColor,
  });

  const getInputStyle = (): React.CSSProperties => ({
    borderColor: hexToRgba(primaryColor, 0.3),
  });

  const getStats = () => {
    const totalValue = filteredInvoices.reduce((sum, i) => sum + i.grand_total, 0);
    const averageValue = filteredInvoices.length > 0 ? totalValue / filteredInvoices.length : 0;

    return {
      total: filteredInvoices.length,
      totalValue,
      averageValue
    };
  };

  const stats = getStats();

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoice History</h1>
          <p className="text-gray-600 mt-2">
            {isAdmin
              ? `All invoices for ${selectedCompany.name}`
              : `Your invoices for ${selectedCompany.name}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg" style={getIconBgStyle()}>
              <FileText className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg" style={getIconBgStyle()}>
              <Calendar className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg" style={getIconBgStyle()}>
              <User className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Average Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.averageValue)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search by client name or invoice number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={getInputStyle()}
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                  style={getInputStyle()}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last Month</option>
                  <option value="year">Last Year</option>
                </select>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                style={getInputStyle()}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount_high">Highest Amount</option>
                <option value="amount_low">Lowest Amount</option>
                <option value="client">Client Name</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg" style={getIconBgStyle()}>
                          <FileText className="h-4 w-4" style={getTextStyle()} />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.invoice_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {invoice.items?.length || 0} items
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {invoice.client_id ? (
                          <Link
                            to={`/clients/${invoice.client_id}`}
                            className="hover:underline"
                            style={{ color: primaryColor }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {invoice.client_name}
                          </Link>
                        ) : (
                          invoice.client_name
                        )}
                      </div>
                      {invoice.client_email && (
                        <div className="text-sm text-gray-500">{invoice.client_email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {new Date(invoice.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        Due in {invoice.due_days} days
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          {invoice.created_by_name || 'Unknown'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(invoice.grand_total)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const status = invoice.payment_status || 'pending';
                        const styles =
                          status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : status === 'partial'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700';
                        const label = status[0].toUpperCase() + status.slice(1);
                        // Same access rule as the detail page: admin or the user
                        // who created the invoice may record or edit payments.
                        const canRecord = isAdmin || (user && invoice.created_by === user.id);
                        const interactive = !!canRecord;
                        const isLoadingThis = loadingPaidInvoiceId === invoice.id;
                        return (
                          <button
                            type="button"
                            disabled={!interactive || isLoadingThis}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!interactive) return;
                              if (status === 'paid') {
                                openEditForPaidInvoice(invoice);
                              } else {
                                setPayingInvoice(invoice);
                              }
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
                            } ${isLoadingThis ? 'opacity-60' : ''}`}
                          >
                            {isLoadingThis && (
                              <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                            )}
                            {label}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/invoice/${invoice.id}`}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          style={getTextStyle()}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(invoice.id!)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || dateFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria'
                  : 'Generate invoices from your quotations to get started'}
              </p>
            </div>
          )}
        </div>
      </div>

      {payingInvoice && payingInvoice.id && (
        <RecordPaymentModal
          invoice={{
            id: payingInvoice.id,
            invoice_number: payingInvoice.invoice_number,
            grand_total: payingInvoice.grand_total,
            amount_paid: payingInvoice.amount_paid,
            balance_due: payingInvoice.balance_due,
            client_name: payingInvoice.client_name,
          }}
          onClose={() => setPayingInvoice(null)}
          onRecorded={reloadInvoices}
        />
      )}

      {editingPaymentFor && editingPaymentFor.invoice.id && (
        <RecordPaymentModal
          invoice={{
            id: editingPaymentFor.invoice.id,
            invoice_number: editingPaymentFor.invoice.invoice_number,
            grand_total: editingPaymentFor.invoice.grand_total,
            amount_paid: editingPaymentFor.invoice.amount_paid,
            balance_due: editingPaymentFor.invoice.balance_due,
            client_name: editingPaymentFor.invoice.client_name,
          }}
          existingPayment={editingPaymentFor.payment}
          onClose={() => setEditingPaymentFor(null)}
          onRecorded={reloadInvoices}
        />
      )}
    </div>
  );
};

export default InvoiceHistory;
