import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { getQuotations, getInvoices } from '../services/api';
import { Quotation, Invoice } from '../types';
import { formatCurrency } from '../utils/calculations';
import {
  FileText,
  Plus,
  TrendingUp,
  Receipt,
  DollarSign,
  Calendar,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { selectedCompany } = useCompany();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!selectedCompany) return;
      try {
        const [q, i] = await Promise.all([
          getQuotations(selectedCompany.id),
          getInvoices(selectedCompany.id),
        ]);
        setQuotations(q);
        setInvoices(i);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedCompany]);

  const getStats = () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    const within30 = (dateStr?: string) => {
      if (!dateStr) return false;
      return new Date(dateStr) >= cutoff;
    };

    return {
      totalQuotations: quotations.length,
      last30Quotations: quotations.filter((q) => within30(q.date)).length,
      last30Invoices: invoices.filter((i) => within30(i.date)).length,
      totalInvoiceValue: invoices.reduce((sum, i) => sum + Number(i.grand_total || 0), 0),
    };
  };

  const stats = getStats();
  const recentQuotations = quotations.slice(0, 5);

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

  if (!selectedCompany) {
    return <div className="text-center">Please select a company</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome to your {selectedCompany.name} quotation dashboard
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg flex-shrink-0" style={getIconBgStyle()}>
              <FileText className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4 min-w-0">
              <p className="text-sm font-medium text-gray-600">Total Quotations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalQuotations}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg flex-shrink-0" style={getIconBgStyle()}>
              <TrendingUp className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4 min-w-0">
              <p className="text-sm font-medium text-gray-600">Last 30 Days Quotations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.last30Quotations}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg flex-shrink-0" style={getIconBgStyle()}>
              <Receipt className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4 min-w-0">
              <p className="text-sm font-medium text-gray-600">Last 30 Days Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{stats.last30Invoices}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg flex-shrink-0" style={getIconBgStyle()}>
              <DollarSign className="h-6 w-6" style={getTextStyle()} />
            </div>
            <div className="ml-4 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600">Total Invoice Value</p>
              <p
                className="text-xl font-bold text-gray-900 truncate"
                title={formatCurrency(stats.totalInvoiceValue)}
              >
                {formatCurrency(stats.totalInvoiceValue)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Quotations</h2>
            <Link
              to="/history"
              className="text-sm hover:underline"
              style={getTextStyle()}
            >
              View all
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading quotations...</p>
            </div>
          ) : recentQuotations.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quote Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentQuotations.map((quotation) => (
                  <tr key={quotation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">
                          {quotation.quote_number}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{quotation.client_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1" />
                        {new Date(quotation.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(quotation.grand_total)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        to={`/quotation/${quotation.id}`}
                        className="hover:underline"
                        style={getTextStyle()}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No quotations found</p>
              <Link
                to="/new-quotation"
                className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all"
                style={getButtonStyle()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Quotation
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;