import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { brandColorFor } from '../utils/colors';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import { getJobCard, updateJobCardStatus, createInvoiceFromJobCard } from '../services/jobCardsApi';
import { JobCard, JobCardStatus } from '../types/jobCards';
import JobCardDocument from '../components/JobCard/JobCardDocument';
import JobCardStatusBadge from '../components/JobCard/JobCardStatusBadge';
import {
  ArrowLeft,
  Edit2,
  Download,
  Printer,
  FileText,
  Play,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';

const JobCardView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [jc, setJc] = useState<JobCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [statusSaving, setStatusSaving] = useState<JobCardStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        setJc(await getJobCard(parseInt(id, 10)));
      } catch (error) {
        console.error('Error loading job card:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useDocumentTitle(
    jc ? `Job Card ${jc.job_card_number}${jc.client_name ? ` — ${jc.client_name}` : ''}` : null
  );

  const handleDownloadPDF = async () => {
    if (!jc) return;
    setGenerating(true);
    try {
      await generateDocumentPDF('.job-card-document', `${jc.job_card_number}_${pdfFileSegment(jc.client_name)}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleStatus = async (status: JobCardStatus) => {
    if (!jc?.id) return;
    if (status === 'cancelled' && !window.confirm('Cancel this job card?')) return;
    setStatusSaving(status);
    try {
      const updated = await updateJobCardStatus(jc.id, status);
      setJc((prev) => (prev ? { ...prev, status: updated.status, completed_date: updated.completed_date } : prev));
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update status.');
    } finally {
      setStatusSaving(null);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!jc?.id) return;
    const existing = jc.invoices || [];
    if (existing.length > 0) {
      const list = existing.map((i) => i.invoice_number).join(', ');
      if (!window.confirm(`This job card already has invoice(s): ${list}.\n\nGenerate another invoice anyway?`)) return;
    }
    const hasPrices = (jc.items || []).some((it) => Number(it.unit_price) > 0);
    if (!hasPrices && !window.confirm('No item on this job card has a price, so the invoice will total 0. Continue?')) {
      return;
    }
    setGeneratingInvoice(true);
    try {
      const invoice = await createInvoiceFromJobCard(jc.id);
      navigate(`/invoice/${invoice.id}`);
    } catch (error: any) {
      console.error('Error generating invoice:', error);
      alert(error?.response?.data?.error || 'Failed to generate invoice. Please try again.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300" />
      </div>
    );
  }

  if (!jc) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Job card not found</p>
        <button onClick={() => navigate('/job-cards')} className="text-blue-600 hover:underline">
          Back to Job Cards
        </button>
      </div>
    );
  }

  const primary = brandColorFor(jc.primary_color || '#111827', theme === 'dark');
  const canEdit = isAdmin || (!!user && jc.created_by === user.id);
  const invoices = jc.invoices || [];
  const outlineBtn =
    'inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50';

  const statusButton = (
    status: JobCardStatus,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    cls: string
  ) => (
    <button
      onClick={() => handleStatus(status)}
      disabled={statusSaving !== null}
      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium border rounded-lg bg-white transition-colors disabled:opacity-50 ${cls}`}
    >
      {statusSaving === status ? (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-1.5" />
      ) : (
        <Icon className="h-4 w-4 mr-1.5" />
      )}
      {label}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button onClick={() => navigate(`/job-cards/${jc.id}/edit`)} className={outlineBtn}>
              <Edit2 className="h-4 w-4 mr-1.5" />
              Edit
            </button>
          )}
          <button onClick={() => window.print()} className={outlineBtn}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </button>
          {canEdit && (
            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInvoice}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-blue-500 text-blue-600 rounded-lg bg-white hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {generatingInvoice ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-1.5" />
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-1.5" />
                  Generate Invoice
                </>
              )}
            </button>
          )}
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1.5" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status + workflow links */}
      <div className="mb-6 no-print bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <JobCardStatusBadge status={jc.status} />
          </div>
          {jc.quotation_id && (
            <div>
              <span className="text-gray-500">From Quotation </span>
              <Link to={`/quotation/${jc.quotation_id}`} className="font-medium hover:underline" style={{ color: primary }}>
                {jc.quotation_number || `#${jc.quotation_id}`}
              </Link>
            </div>
          )}
          {invoices.length > 0 && (
            <div>
              <span className="text-gray-500">Invoice{invoices.length > 1 ? 's' : ''}: </span>
              {invoices.map((inv, i) => (
                <React.Fragment key={inv.id}>
                  {i > 0 && ', '}
                  <Link to={`/invoice/${inv.id}`} className="font-medium hover:underline" style={{ color: primary }}>
                    {inv.invoice_number}
                  </Link>
                </React.Fragment>
              ))}
            </div>
          )}
          {jc.created_by_name && <div className="text-gray-500">Prepared by {jc.created_by_name}</div>}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {jc.status === 'pending' &&
              statusButton('in_progress', 'Start', Play, 'border-blue-500 text-blue-600 hover:bg-blue-50')}
            {(jc.status === 'pending' || jc.status === 'in_progress') &&
              statusButton('completed', 'Complete', CheckCircle2, 'border-green-500 text-green-700 hover:bg-green-50')}
            {(jc.status === 'pending' || jc.status === 'in_progress') &&
              statusButton('cancelled', 'Cancel', XCircle, 'border-red-400 text-red-600 hover:bg-red-50')}
            {(jc.status === 'completed' || jc.status === 'cancelled') &&
              statusButton('in_progress', 'Reopen', RotateCcw, 'border-gray-300 text-gray-700 hover:bg-gray-50')}
          </div>
        )}
      </div>

      <JobCardDocument
        rootClassName="job-card-document shadow-lg rounded-lg"
        data={jc}
        company={{
          name: jc.company_name || '',
          address: jc.company_address,
          tpin: jc.company_tpin,
          logo_url: jc.company_quote_logo || jc.company_logo,
          primary_color: jc.primary_color,
          secondary_color: jc.secondary_color,
          template: jc.company_template,
          letterhead: jc.company_letterhead,
        }}
      />
    </div>
  );
};

export default JobCardView;
