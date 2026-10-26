import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useCompany } from '../context/CompanyContext';
import { brandColorFor } from '../utils/colors';
import { getAuditLogs, getAuditStats, getAuditUsers } from '../services/auditApi';
import { AuditFilters, AuditLog as AuditRow, AuditStats, AuditUser } from '../types/audit';
import { toCsv, downloadCsv } from '../utils/csv';
import {
  ScrollText, Search, Download, LogIn, LogOut, ShieldAlert, PlusCircle, Pencil, Trash2,
  RefreshCw, ChevronDown, ChevronRight, Users as UsersIcon, Activity, Loader2, Circle, Zap,
} from 'lucide-react';

// Audit log: who signed in (and failed to), and every change made in the
// system — with a before → after view for edits and a snapshot of deletions.
// Visible to super-admins and users granted audit access (MD, Co-MD, …).

type Tab = 'all' | 'auth' | 'changes' | 'people';
const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  quotation: 'Quotation', invoice: 'Invoice', delivery_note: 'Delivery note', job_card: 'Job card', lpo: 'LPO',
  contract: 'Contract', client: 'Client', vendor: 'Vendor', purchase: 'Purchase', expense: 'Expense',
  petty_cash: 'Petty cash', payment: 'Payment', user: 'User', company: 'Company', organization: 'Organization',
  donation: 'Donation', payslip: 'Pay slip', employee_salary: 'Staff salary', payroll_settings: 'Payroll settings',
  attendance_device: 'Attendance device', attendance_employee: 'Attendance staff', attendance_settings: 'Attendance settings',
  attendance_punch: 'Attendance record',
};

const ENTITY_ROUTES: Record<string, (id: number) => string> = {
  quotation: (id) => `/quotation/${id}`, invoice: (id) => `/invoice/${id}`, delivery_note: (id) => `/delivery-note/${id}`,
  job_card: (id) => `/job-cards/${id}`, lpo: (id) => `/lpos/${id}`, contract: (id) => `/contracts/${id}`,
  client: (id) => `/clients/${id}`, vendor: (id) => `/vendors/${id}`, purchase: (id) => `/purchase/${id}`,
  donation: (id) => `/donations/${id}`,
};

const ACTION_STYLE: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  login: { label: 'Sign in', cls: 'bg-emerald-100 text-emerald-700', icon: LogIn },
  logout: { label: 'Sign out', cls: 'bg-gray-100 text-gray-600', icon: LogOut },
  login_failed: { label: 'Failed sign-in', cls: 'bg-red-100 text-red-700', icon: ShieldAlert },
  create: { label: 'Created', cls: 'bg-blue-100 text-blue-700', icon: PlusCircle },
  update: { label: 'Edited', cls: 'bg-amber-100 text-amber-800', icon: Pencil },
  status: { label: 'Status', cls: 'bg-violet-100 text-violet-700', icon: RefreshCw },
  action: { label: 'Action', cls: 'bg-indigo-100 text-indigo-700', icon: Zap },
  delete: { label: 'Deleted', cls: 'bg-red-100 text-red-700', icon: Trash2 },
  remove: { label: 'Removed', cls: 'bg-red-50 text-red-600', icon: Trash2 },
};

const pretty = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (s?: string | null) => {
  if (!s) return 'never';
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : fmtTime(s);
};
const device = (ua?: string | null) => {
  if (!ua) return '';
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' · ');
};
const show = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));

const AuditLog: React.FC = () => {
  const { theme } = useTheme();
  const { selectedCompany } = useCompany();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');

  const [tab, setTab] = useState<Tab>('all');
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [people, setPeople] = useState<AuditUser[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const [userId, setUserId] = useState<number | ''>('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setQDebounced(q), 350); return () => clearTimeout(t); }, [q]);

  const filters: AuditFilters = useMemo(() => ({
    user_id: userId, kind: tab === 'auth' || tab === 'changes' ? tab : '', entity_type: tab === 'auth' ? '' : entityType,
    from, to, q: qDebounced,
  }), [userId, tab, entityType, from, to, qDebounced]);

  const loadSide = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getAuditStats(), getAuditUsers()]);
      setStats(s); setPeople(p);
    } catch { /* the main list shows the error */ }
  }, []);

  const load = useCallback(async (pg: number) => {
    setLoading(true); setError('');
    try {
      const res = await getAuditLogs({ ...filters, page: pg, limit: PAGE_SIZE });
      setRows(res.rows); setTotal(res.total); setPage(pg);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadSide(); }, [loadSide]);
  useEffect(() => { if (tab !== 'people') load(1); }, [load, tab]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await getAuditLogs({ ...filters, page: 1, limit: 1000 });
      const csv = toCsv(
        ['Time', 'User', 'Email', 'Action', 'Summary', 'Type', 'Reference', 'Company', 'IP', 'Device', 'Details'],
        res.rows.map((r) => [
          fmtTime(r.created_at), r.user_name || '', r.user_email || '', ACTION_STYLE[r.action]?.label || r.action,
          r.summary || '', ENTITY_LABELS[r.entity_type || ''] || r.entity_type || '', r.entity_label || '',
          r.company_name || '', r.ip || '', device(r.user_agent), r.details ? JSON.stringify(r.details) : '',
        ])
      );
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entityOptions = Object.entries(ENTITY_LABELS).sort((a, b) => a[1].localeCompare(b[1]));

  const statCards = [
    { label: 'Online now', value: stats?.online_now, icon: Circle, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Sign-ins today', value: stats?.logins_today, icon: LogIn, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Failed sign-ins today', value: stats?.failed_today, icon: ShieldAlert, tone: 'text-red-600 bg-red-50' },
    { label: 'Changes today', value: stats?.changes_today, icon: Activity, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Deletions today', value: stats?.deletions_today, icon: Trash2, tone: 'text-rose-600 bg-rose-50' },
  ];

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All activity', icon: Activity },
    { id: 'auth', label: 'Sign-ins', icon: LogIn },
    { id: 'changes', label: 'Changes', icon: Pencil },
    { id: 'people', label: 'People', icon: UsersIcon },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="h-7 w-7" style={{ color: primary }} /> Audit Log
          </h1>
          <p className="text-gray-600 mt-1">Who signed in, and every change made in the system.</p>
        </div>
        {tab !== 'people' && (
          <button onClick={exportCsv} disabled={exporting}
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Export CSV
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${c.tone}`}>
              <c.icon className={`h-4 w-4 ${c.label === 'Online now' ? 'fill-current' : ''}`} />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{c.value ?? '—'}</div>
            <div className="text-xs text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null); }}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            style={tab === t.id ? { color: primary } : {}}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'people' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Person</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Last sign-in</th>
                <th className="px-5 py-3 text-center">Changes today</th>
                <th className="px-5 py-3 text-center">Failed sign-ins (7 days)</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.email} · {p.role}{p.organization_name ? ` · ${p.organization_name}` : ''}</div>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {p.online ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Online</span>
                    ) : (
                      <span className="text-gray-500">Last active {ago(p.last_seen_at)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700" title={fmtTime(p.last_login_at)}>{p.last_login_at ? ago(p.last_login_at) : 'Never'}</td>
                  <td className="px-5 py-3 text-sm text-center text-gray-700">{p.changes_today}</td>
                  <td className={`px-5 py-3 text-sm text-center ${p.failed_7d > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{p.failed_7d}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => { setUserId(p.id); setTab('all'); }} className="text-sm font-medium hover:underline" style={{ color: primary }}>
                      View activity
                    </button>
                  </td>
                </tr>
              ))}
              {people.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">No people to show.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="relative md:col-span-2">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, number, person, IP…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <select value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} disabled={tab === 'auth'}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50">
              <option value="">All record types</option>
              {entityOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">What</th>
                  <th className="px-4 py-3">Where from</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No activity matches these filters.</td></tr>
                ) : rows.map((r) => {
                  const st = ACTION_STYLE[r.action] || ACTION_STYLE.action;
                  const open = expanded === r.id;
                  const hasDetails = !!r.details && Object.keys(r.details).length > 0;
                  const route = r.entity_type && r.entity_id && !['delete'].includes(r.action) ? ENTITY_ROUTES[r.entity_type] : undefined;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`hover:bg-gray-50 ${hasDetails ? 'cursor-pointer' : ''}`} onClick={() => hasDetails && setExpanded(open ? null : r.id)}>
                        <td className="px-4 py-3 text-gray-400">
                          {hasDetails && (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap" title={fmtTime(r.created_at)}>
                          <div>{fmtTime(r.created_at)}</div>
                          <div className="text-xs text-gray-400">{ago(r.created_at)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{r.user_name || r.user_email || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">
                            {r.user_email}
                            {r.acting_super_admin && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase">Platform admin</span>}
                          </div>
                          {r.organization_name && !selectedCompany && <div className="text-xs text-gray-400">{r.organization_name}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${st.cls}`}>
                            <st.icon className="h-3 w-3" /> {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800">
                          {route ? (
                            <Link to={route(r.entity_id as number)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                              {r.summary}
                            </Link>
                          ) : r.summary}
                          {r.company_name && <div className="text-xs text-gray-400">{r.company_name}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div>{r.ip || '—'}</div>
                          <div>{device(r.user_agent)}</div>
                        </td>
                      </tr>
                      {open && hasDetails && (
                        <tr className="bg-gray-50/70">
                          <td />
                          <td colSpan={5} className="px-4 pb-4 pt-1">
                            <Details row={r} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>{total.toLocaleString()} event{total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => load(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-40">Previous</button>
              <span>Page {page} of {pages}</span>
              <button disabled={page >= pages || loading} onClick={() => load(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Expanded row: field-level changes, the deleted record, or what was submitted.
const Details: React.FC<{ row: AuditRow }> = ({ row }) => {
  const d = row.details || {};
  if (d.changes) {
    return (
      <div>
        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden bg-white">
          <thead className="bg-gray-100 text-xs text-gray-500 uppercase">
            <tr><th className="text-left px-3 py-2 w-1/4">Field</th><th className="text-left px-3 py-2">Before</th><th className="text-left px-3 py-2">After</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(d.changes as Record<string, [any, any]>).map(([k, [a, b]]) => (
              <tr key={k}>
                <td className="px-3 py-2 font-medium text-gray-700">{pretty(k)}</td>
                <td className="px-3 py-2 text-red-700 line-through decoration-red-300 break-all">{show(a)}</td>
                <td className="px-3 py-2 text-emerald-700 break-all">{show(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.items && <p className="text-xs text-gray-500 mt-2">{d.items}</p>}
      </div>
    );
  }
  const obj = (d.deleted || d) as Record<string, any>;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{d.deleted ? 'Record as it was before deletion' : 'Submitted details'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm bg-white border border-gray-200 rounded-lg p-3">
        {Object.entries(obj).filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
          <div key={k} className="flex gap-2 min-w-0">
            <span className="text-gray-500 shrink-0">{pretty(k)}:</span>
            <span className="text-gray-800 truncate" title={String(v)}>{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuditLog;
