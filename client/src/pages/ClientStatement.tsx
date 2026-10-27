import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClientStatement as StatementData, getClientStatement } from '../services/api';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import StatementDocument from '../components/Statement/StatementDocument';
import { ArrowLeft, Printer, Download, Loader2 } from 'lucide-react';

type Preset =
  | '1d'
  | '3d'
  | '7d'
  | '30d'
  | '6mo'
  | '1yr'
  | 'custom';

const PRESETS: { id: Preset; label: string; days?: number; months?: number; years?: number }[] = [
  { id: '1d',  label: 'Last 1 day',    days: 1 },
  { id: '3d',  label: 'Last 3 days',   days: 3 },
  { id: '7d',  label: 'Last 7 days',   days: 7 },
  { id: '30d', label: 'Last 30 days',  days: 30 },
  { id: '6mo', label: 'Last 6 months', months: 6 },
  { id: '1yr', label: 'Last 1 year',   years: 1 },
  { id: 'custom', label: 'Custom range' },
];

// Local calendar date (toISOString would shift to UTC and can land on the
// previous day shortly after midnight).
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const computeRange = (preset: Preset, customFrom: string, customTo: string) => {
  const today = new Date();
  const to = toIso(today);
  if (preset === 'custom') return { from: customFrom, to: customTo };
  const def = PRESETS.find((p) => p.id === preset)!;
  const from = new Date(today);
  if (def.days) from.setDate(today.getDate() - def.days);
  if (def.months) from.setMonth(today.getMonth() - def.months);
  if (def.years) from.setFullYear(today.getFullYear() - def.years);
  return { from: toIso(from), to };
};

const ClientStatementPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cid = id ? parseInt(id, 10) : NaN;

  const [preset, setPreset] = useState<Preset>('30d');
  // Custom range — separate state so it persists when user toggles back
  const today = toIso(new Date());
  const oneMonthAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toIso(d);
  })();
  const [customFrom, setCustomFrom] = useState<string>(oneMonthAgo);
  const [customTo, setCustomTo] = useState<string>(today);

  const [statement, setStatement] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (Number.isNaN(cid)) return;
    const { from, to } = computeRange(preset, customFrom, customTo);
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const data = await getClientStatement(cid, from, to);
      setStatement(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load statement.');
    } finally {
      setLoading(false);
    }
  }, [cid, preset, customFrom, customTo]);

  useEffect(() => {
    if (preset !== 'custom') load();
    // For custom range, wait until the user clicks "Apply".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const handlePrint = () => window.print();

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (!statement) return;
    setDownloading(true);
    try {
      const { from: f, to: t } = statement.period;
      await generateDocumentPDF('.statement-document', `Statement_${pdfFileSegment(statement.client?.name || 'client')}_${f}_to_${t}.pdf`);
    } catch {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            disabled={!statement || loading}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </button>
          <button
            onClick={handleDownload}
            disabled={!statement || loading || downloading}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </button>
        </div>
      </div>

      {/* Range picker */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 no-print">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mt-4 flex flex-col sm:flex-row items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={customTo}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom}
                max={today}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
          <p className="text-gray-600 mt-3 text-sm">Loading statement...</p>
        </div>
      )}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>
      )}

      {/* Statement document */}
      {statement && !loading && !error && (
        <div className="shadow-lg rounded-lg overflow-hidden bg-white">
          <StatementDocument statement={statement} rootClassName="statement-document" />
        </div>
      )}
    </div>
  );
};

export default ClientStatementPage;
