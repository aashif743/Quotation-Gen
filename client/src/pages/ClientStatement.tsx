import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClientStatement as StatementData, getClientStatement } from '../services/api';
import { formatCurrency } from '../utils/calculations';
import {
  ArrowLeft,
  Printer,
  Calendar,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';

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

const toIso = (d: Date) => d.toISOString().split('T')[0];

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

  const { from, to } = computeRange(preset, customFrom, customTo);

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
        <button
          onClick={handlePrint}
          disabled={!statement || loading}
          className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </button>
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
        <div className="statement-document bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-200 bg-gray-50">
            <h1 className="text-2xl font-bold text-gray-900">Client Statement</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Client</p>
                <p className="text-base font-semibold text-gray-900">
                  {statement.client?.name || '—'}
                </p>
                {statement.client?.email && (
                  <p className="text-sm text-gray-600">{statement.client.email}</p>
                )}
                {statement.client?.phone && (
                  <p className="text-sm text-gray-600">{statement.client.phone}</p>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Period</p>
                <p className="text-base font-semibold text-gray-900 inline-flex items-center sm:justify-end">
                  <Calendar className="h-4 w-4 mr-1.5 text-gray-400" />
                  {new Date(from).toLocaleDateString()} → {new Date(to).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Generated {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 border-b border-gray-200">
            <SummaryTile label="Opening balance" value={statement.opening_balance} />
            <SummaryTile label="Invoiced in period" value={statement.total_invoiced} color="text-blue-700" />
            <SummaryTile label="Paid in period" value={statement.total_paid} color="text-green-700" />
            <SummaryTile
              label="Closing balance"
              value={statement.closing_balance}
              color={statement.closing_balance > 0 ? 'text-red-700' : 'text-gray-900'}
              bold
            />
          </div>

          {/* Invoices section */}
          <div className="px-8 py-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <FileText className="h-4 w-4 mr-2 text-gray-500" />
              Invoices in this period ({statement.invoices.length})
            </h2>
            {statement.invoices.length === 0 ? (
              <p className="text-sm text-gray-500">No invoices issued in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">#</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Date</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-gray-500">Total</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-gray-500">Paid</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-gray-500">Balance</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {statement.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(inv.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums text-gray-900">
                          {formatCurrency(Number(inv.grand_total))}
                        </td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums text-green-700">
                          {formatCurrency(Number(inv.amount_paid))}
                        </td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums">
                          {Number(inv.balance_due) > 0 ? (
                            <span className="text-red-700 font-medium">{formatCurrency(Number(inv.balance_due))}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2"><StatusPill s={inv.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payments section */}
          <div className="px-8 py-6 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <CreditCard className="h-4 w-4 mr-2 text-gray-500" />
              Payments received in this period ({statement.payments.length})
            </h2>
            {statement.payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments received in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Invoice</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Method</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Reference</th>
                      <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-gray-500">Amount</th>
                      <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500">Recorded by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {statement.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                          {new Date(p.payment_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{p.invoice_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{p.method || '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{p.reference || '—'}</td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums font-semibold text-green-700">
                          {formatCurrency(Number(p.amount))}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">{p.recorded_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: number; color?: string; bold?: boolean }> = ({
  label,
  value,
  color = 'text-gray-900',
  bold,
}) => (
  <div className="px-5 py-4">
    <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`mt-0.5 text-base ${bold ? 'font-bold' : 'font-semibold'} ${color} truncate tabular-nums`}
       title={formatCurrency(value)}>
      {formatCurrency(value)}
    </p>
  </div>
);

const StatusPill: React.FC<{ s: 'pending' | 'partial' | 'paid' }> = ({ s }) => {
  const styles =
    s === 'paid'
      ? { bg: 'bg-green-100', text: 'text-green-700', Icon: CheckCircle2 }
      : s === 'partial'
        ? { bg: 'bg-amber-100', text: 'text-amber-700', Icon: AlertCircle }
        : { bg: 'bg-red-100', text: 'text-red-700', Icon: XCircle };
  const Icon = styles.Icon;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}
    >
      <Icon className="h-3.5 w-3.5 mr-1" />
      {s[0].toUpperCase() + s.slice(1)}
    </span>
  );
};

export default ClientStatementPage;
