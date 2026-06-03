import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { getQuotations, deleteQuotation } from '../services/api';
import { Quotation } from '../types';
import { formatCurrency } from '../utils/calculations';
import { 
  FileText, 
  Search, 
  Calendar, 
  User, 
  Eye, 
  Trash2, 
  Download,
  Filter,
  Plus
} from 'lucide-react';

const QuotationHistory: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [filteredQuotations, setFilteredQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const loadQuotations = async () => {
      if (!selectedCompany) return;
      
      try {
        const data = await getQuotations(selectedCompany.id);
        setQuotations(data);
        setFilteredQuotations(data);
      } catch (error) {
        console.error('Error loading quotations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadQuotations();
  }, [selectedCompany]);

  useEffect(() => {
    let filtered = quotations.filter(quotation => 
      quotation.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quotation.quote_number.toLowerCase().includes(searchTerm.toLowerCase())
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
        filtered = filtered.filter(quotation => new Date(quotation.date) >= filterDate);
      } else {
        filtered = filtered.filter(quotation => {
          const quotationDate = new Date(quotation.date);
          quotationDate.setHours(0, 0, 0, 0);
          return quotationDate.getTime() === filterDate.getTime();
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

    setFilteredQuotations(filtered);
  }, [quotations, searchTerm, dateFilter, sortBy]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) {
      return;
    }

    try {
      await deleteQuotation(id);
      setQuotations(quotations.filter(q => q.id !== id));
    } catch (error) {
      console.error('Error deleting quotation:', error);
      alert('Failed to delete quotation. Please try again.');
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

  const getButtonStyle = (): React.CSSProperties => ({
    backgroundColor: primaryColor,
  });

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
    const totalValue = filteredQuotations.reduce((sum, q) => sum + q.grand_total, 0);
    const averageValue = filteredQuotations.length > 0 ? totalValue / filteredQuotations.length : 0;
    
    return {
      total: filteredQuotations.length,
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
          <h1 className="text-3xl font-bold text-gray-900">Quotation History</h1>
          <p className="text-gray-600 mt-2">
            {isAdmin
              ? `All quotations for ${selectedCompany.name}`
              : `Your quotations for ${selectedCompany.name}`}
          </p>
        </div>
        <Link
          to="/new-quotation"
          className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all"
          style={getButtonStyle()}
        >
          <Plus className="h-5 w-5 mr-2" />
          New Quotation
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg" style={getIconBgStyle()}>
              <FileText className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Quotations</p>
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
                  placeholder="Search by client name or quote number..."
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
              <p className="text-gray-600 mt-2">Loading quotations...</p>
            </div>
          ) : filteredQuotations.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quote Details
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQuotations.map((quotation) => (
                  <tr key={quotation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg" style={getIconBgStyle()}>
                          <FileText className="h-4 w-4" style={getTextStyle()} />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {quotation.quote_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {quotation.items?.length || 0} items
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{quotation.client_name}</div>
                      {quotation.client_email && (
                        <div className="text-sm text-gray-500">{quotation.client_email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                        {new Date(quotation.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        Valid for {quotation.expiry_days} days
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <User className="h-4 w-4 mr-1 text-gray-400" />
                          {quotation.created_by_name || 'Unknown'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(quotation.grand_total)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/quotation/${quotation.id}`}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          style={getTextStyle()}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(quotation.id!)}
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">No quotations found</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || dateFilter !== 'all' 
                  ? 'Try adjusting your search or filter criteria' 
                  : 'Get started by creating your first quotation'}
              </p>
              <Link
                to="/new-quotation"
                className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all"
                style={getButtonStyle()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New Quotation
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuotationHistory;