import React, { useEffect, useMemo, useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import {
  getAttendanceToday, getAttendanceRecords, getAttendanceReport,
  addManualPunch, deletePunch,
  getAttendanceDevices, createAttendanceDevice, updateAttendanceDevice,
  regenerateDeviceKey, deleteAttendanceDevice,
  getAttendanceEmployees, createAttendanceEmployee, updateAttendanceEmployee, deleteAttendanceEmployee,
  getAttendanceSettings, updateAttendanceSettings,
} from '../services/api';
import {
  AttendanceDevice, AttendanceEmployee, AttendancePunch, AttendanceTodayStaff,
  AttendanceReportRow, AttendanceSettings,
} from '../types';
import { toCsv, downloadCsv } from '../utils/csv';
import {
  Fingerprint, Clock, CalendarDays, Users, Cpu, RefreshCw, Plus, Trash2, X,
  Download, Copy, Check, KeyRound, AlertCircle, Loader2, Settings as SettingsIcon,
} from 'lucide-react';

type Tab = 'today' | 'records' | 'report' | 'staff' | 'devices';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'records', label: 'Records', icon: CalendarDays },
  { key: 'report', label: 'Report', icon: Download },
  { key: 'staff', label: 'Staff', icon: Users },
  { key: 'devices', label: 'Devices', icon: Cpu },
];

// Attendance datetimes come back as naive wall-clock strings ("YYYY-MM-DD HH:MM:SS")
// so they must be shown verbatim — never fed through `new Date()` (which would
// apply the browser timezone and shift the office's real clock).
const timePart = (s: string | null): string => {
  if (!s) return '—';
  const t = (s.includes('T') ? s.split('T')[1] : s.split(' ')[1]) || '';
  const [hh, mm] = t.split(':');
  if (hh === undefined) return s;
  let h = Number(hh);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mm ?? '00'} ${ap}`;
};
const datePart = (s: string | null): string => (s ? s.slice(0, 10) : '—');
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

const Attendance: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const companyId = selectedCompany?.id;

  const [tab, setTab] = useState<Tab>('today');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Shared: the attendance roster (people who clock in/out) for this company —
  // used by the manual-punch dropdown and the records filter.
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const loadEmployees = () => {
    if (!companyId) return;
    getAttendanceEmployees(companyId).then(setEmployees).catch(() => {});
  };
  useEffect(() => { loadEmployees(); /* eslint-disable-next-line */ }, [companyId]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
             style={{ background: primary }}>
          <Fingerprint size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Staff Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Biometric check-in / check-out {selectedCompany ? `· ${selectedCompany.name}` : ''}
          </p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          <AlertCircle size={16} /> {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-current'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
              style={active ? { color: primary } : undefined}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {!selectedCompany ? (
        <p className="text-gray-500 dark:text-gray-400">Select a company to manage attendance.</p>
      ) : (
        <>
          {tab === 'today' && <TodayTab companyId={companyId!} primary={primary} />}
          {tab === 'records' && <RecordsTab companyId={companyId!} primary={primary} employees={employees} flash={flash} />}
          {tab === 'report' && <ReportTab companyId={companyId!} primary={primary} />}
          {tab === 'staff' && <StaffTab companyId={companyId!} primary={primary} employees={employees} reload={loadEmployees} flash={flash} />}
          {tab === 'devices' && <DevicesTab companyId={companyId!} primary={primary} flash={flash} />}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
const card = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700';
const th = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
const td = 'px-4 py-3 text-sm text-gray-800 dark:text-gray-200';

const StatusPill: React.FC<{ status: 'present' | 'late' | 'absent' }> = ({ status }) => {
  const map = {
    present: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    absent: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${map[status]}`}>{status}</span>;
};

const Spinner = () => (
  <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>
);

// ---------------------------------------------------------------------------
const TodayTab: React.FC<{ companyId: number; primary: string }> = ({ companyId, primary }) => {
  const [rows, setRows] = useState<AttendanceTodayStaff[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await getAttendanceToday(companyId);
      setRows(d.staff); setSettings(d.settings);
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } finally { if (!silent) setLoading(false); }
  };

  // Load now, then auto-refresh every 20s so new scans appear without a manual
  // refresh. The silent reload doesn't flash the spinner.
  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [companyId]);

  const counts = useMemo(() => ({
    present: rows.filter((r) => r.status === 'present').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
  }), [rows]);

  const todayLabel = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Today · {todayLabel}</h2>
        <div className="flex items-center gap-3">
          {settings && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Work {settings.work_start.slice(0, 5)}–{settings.work_end.slice(0, 5)} · {settings.late_grace_minutes}m grace
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Auto-updating
          </span>
          <button onClick={() => load()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>
      {updatedAt && <p className="text-xs text-gray-400 mb-4">Last updated {updatedAt}</p>}

      <div className="flex gap-3 mb-4">
        {([['Present', counts.present, 'text-green-600'], ['Late', counts.late, 'text-amber-600'], ['Absent', counts.absent, 'text-gray-500']] as const).map(([l, n, c]) => (
          <div key={l} className={`${card} px-4 py-2 min-w-[92px]`}>
            <div className={`text-2xl font-bold ${c}`}>{n}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{l}</div>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr><th className={th}>Staff</th><th className={th}>Status</th><th className={th}>Check-in (In)</th><th className={th}>Check-out (Out)</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rows.length === 0 ? (
              <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={4}>No staff yet. Add staff in the Staff tab.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.user_id}>
                <td className={`${td} font-medium`}>{r.name}</td>
                <td className={td}><StatusPill status={r.status} /></td>
                <td className={td}>
                  {r.first_in
                    ? <span className="font-medium text-green-700 dark:text-green-400">{timePart(r.first_in)}</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className={td}>
                  {r.last_out
                    ? <span className="font-medium text-indigo-700 dark:text-indigo-400">{timePart(r.last_out)}</span>
                    : <span className="text-gray-400">{r.first_in ? 'Still in' : '—'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
const RecordsTab: React.FC<{ companyId: number; primary: string; employees: AttendanceEmployee[]; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, primary, employees, flash }) => {
  const [rows, setRows] = useState<AttendancePunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [empId, setEmpId] = useState('');
  const [modal, setModal] = useState(false);
  const [toDel, setToDel] = useState<AttendancePunch | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getAttendanceRecords(companyId, { from, to, employee_id: empId ? Number(empId) : undefined });
      setRows(d);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Time', 'Staff', 'Source', 'Note'],
      rows.map((r) => [
        datePart(r.punch_time), timePart(r.punch_time),
        r.user_name || `(unmatched #${r.device_user_id})`, r.source, r.note || '',
      ]),
    );
    downloadCsv(`attendance-${from}_to_${to}.csv`, csv);
  };

  const del = async () => {
    if (!toDel) return;
    try { await deletePunch(toDel.id); setToDel(null); flash('success', 'Punch deleted.'); load(); }
    catch { flash('error', 'Failed to delete.'); }
  };

  return (
    <div>
      <div className={`${card} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
        <Field label="Staff">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
            <option value="">All staff</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <button onClick={load} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: primary }}>Apply</button>
        <div className="flex-1" />
        <button onClick={() => setModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Plus size={15} /> Manual</button>
        <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"><Download size={15} /> CSV</button>
      </div>

      {loading ? <Spinner /> : (
        <div className={`${card} overflow-hidden`}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr><th className={th}>Date</th><th className={th}>Time</th><th className={th}>Staff</th><th className={th}>Source</th><th className={th}>Note</th><th className={th}></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {rows.length === 0 ? (
                <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={6}>No punches in this range.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{datePart(r.punch_time)}</td>
                  <td className={`${td} font-medium`}>{timePart(r.punch_time)}</td>
                  <td className={td}>{r.user_name || <span className="text-gray-400">unmatched #{r.device_user_id}</span>}</td>
                  <td className={td}><span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 capitalize">{r.source}</span></td>
                  <td className={td}>{r.note || '—'}</td>
                  <td className={td}>
                    <button onClick={() => setToDel(r)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ManualPunchModal companyId={companyId} employees={employees} primary={primary}
        onClose={() => setModal(false)} onSaved={() => { setModal(false); flash('success', 'Punch added.'); load(); }} flash={flash} />}
      {toDel && <ConfirmModal title="Delete punch?" body={`${datePart(toDel.punch_time)} ${timePart(toDel.punch_time)} · ${toDel.user_name || 'unmatched'}`} onCancel={() => setToDel(null)} onConfirm={del} />}
    </div>
  );
};

const ManualPunchModal: React.FC<{ companyId: number; employees: AttendanceEmployee[]; primary: string; onClose: () => void; onSaved: () => void; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, employees, primary, onClose, onSaved, flash }) => {
  const [empId, setEmpId] = useState('');
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!empId) return flash('error', 'Select a staff member.');
    setSaving(true);
    try {
      await addManualPunch({ company_id: companyId, employee_id: Number(empId), punch_time: when, note: note || undefined });
      onSaved();
    } catch { flash('error', 'Failed to add punch.'); } finally { setSaving(false); }
  };

  return (
    <Modal title="Add manual punch" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Staff">
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
            <option value="">Select staff…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Date & time"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. forgot to scan" className={inputCls} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : 'Add punch'}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
const ReportTab: React.FC<{ companyId: number; primary: string }> = ({ companyId, primary }) => {
  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());

  const load = async () => {
    setLoading(true);
    try { const d = await getAttendanceReport(companyId, from, to); setRows(d.rows); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCsv = () => {
    const csv = toCsv(
      ['Staff', 'Date', 'Check-in', 'Check-out', 'Hours', 'Late'],
      rows.map((r) => [
        r.name, r.date, timePart(r.first_in), timePart(r.last_out), r.hours, r.late ? 'Yes' : 'No',
      ]),
    );
    downloadCsv(`attendance-report-${from}_to_${to}.csv`, csv);
  };

  return (
    <div>
      <div className={`${card} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
        <button onClick={load} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: primary }}>Run report</button>
        <div className="flex-1" />
        <button onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"><Download size={15} /> CSV</button>
      </div>

      {loading ? <Spinner /> : (
        <div className={`${card} overflow-hidden`}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr><th className={th}>Staff</th><th className={th}>Date</th><th className={th}>Check-in</th><th className={th}>Check-out</th><th className={th}>Hours</th><th className={th}>Late</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {rows.length === 0 ? (
                <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={6}>No attendance in this range.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.user_id}-${r.date}-${i}`}>
                  <td className={`${td} font-medium`}>{r.name}</td>
                  <td className={td}>{r.date}</td>
                  <td className={td}>{timePart(r.first_in)}</td>
                  <td className={td}>{timePart(r.last_out)}</td>
                  <td className={td}>{r.hours ? r.hours.toFixed(2) : '—'}</td>
                  <td className={td}>{r.late ? <span className="text-amber-600 font-medium">Late</span> : <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Staff = the attendance roster (people who clock in/out). These are NOT login
// accounts — add anyone by name and they get a Fingerprint ID for the reader.
const StaffTab: React.FC<{ companyId: number; primary: string; employees: AttendanceEmployee[]; reload: () => void; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, primary, employees, reload, flash }) => {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<AttendanceEmployee | null>(null);
  const [toDel, setToDel] = useState<AttendanceEmployee | null>(null);

  const openAdd = () => { setEditing(null); setModal(true); };
  const openEdit = (e: AttendanceEmployee) => { setEditing(e); setModal(true); };

  const del = async () => {
    if (!toDel) return;
    try { await deleteAttendanceEmployee(toDel.id); setToDel(null); flash('success', 'Staff removed.'); reload(); }
    catch { flash('error', 'Failed to remove.'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          Add each person who should clock in/out. They get a <strong>Fingerprint ID</strong> automatically — use it when
          enrolling their finger on the reader PC (<span className="font-mono">http://localhost:5580</span>).
        </p>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium whitespace-nowrap" style={{ background: primary }}><Plus size={15} /> Add Staff</button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr><th className={th}>Name</th><th className={th}>Code</th><th className={th}>Fingerprint ID</th><th className={th}>Status</th><th className={th}></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {employees.length === 0 ? (
              <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={5}>No staff yet. Click “Add Staff” to start.</td></tr>
            ) : employees.map((e) => (
              <tr key={e.id}>
                <td className={`${td} font-medium`}>{e.name}</td>
                <td className={td}>{e.code || '—'}</td>
                <td className={td}><span className="font-mono text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{e.device_user_id}</span></td>
                <td className={td}>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${e.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {e.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={td}>
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(e)} className="text-sm hover:underline" style={{ color: primary }}>Edit</button>
                    <button onClick={() => setToDel(e)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <EmployeeModal companyId={companyId} primary={primary} editing={editing}
        onClose={() => setModal(false)} onSaved={() => { setModal(false); reload(); }} flash={flash} />}
      {toDel && <ConfirmModal title="Remove staff?" body={`"${toDel.name}" and their attendance links will be removed. Past punch records stay.`} onCancel={() => setToDel(null)} onConfirm={del} />}
    </div>
  );
};

const EmployeeModal: React.FC<{ companyId: number; primary: string; editing: AttendanceEmployee | null; onClose: () => void; onSaved: () => void; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, primary, editing, onClose, onSaved, flash }) => {
  const [name, setName] = useState(editing?.name || '');
  const [code, setCode] = useState(editing?.code || '');
  const [duid, setDuid] = useState(editing?.device_user_id || '');
  const [active, setActive] = useState(editing ? !!editing.active : true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return flash('error', 'Enter a name.');
    setSaving(true);
    try {
      if (editing) {
        await updateAttendanceEmployee(editing.id, { name: name.trim(), code: code.trim(), device_user_id: duid.trim() || undefined, active });
        flash('success', 'Staff updated.');
      } else {
        await createAttendanceEmployee({ company_id: companyId, name: name.trim(), code: code.trim() || undefined, device_user_id: duid.trim() || undefined });
        flash('success', 'Staff added.');
      }
      onSaved();
    } catch (e: any) {
      flash('error', e?.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={editing ? 'Edit staff' : 'Add staff'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Phiri" className={`${inputCls} w-full`} /></Field>
        <Field label="Staff code (optional)"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. EMP-004 / department" className={`${inputCls} w-full`} /></Field>
        <Field label="Fingerprint ID">
          <input value={duid} onChange={(e) => setDuid(e.target.value)} placeholder={editing ? '' : 'Auto-assigned if left blank'} className={`${inputCls} w-full`} />
        </Field>
        <p className="text-xs text-gray-500 dark:text-gray-400">The Fingerprint ID is the number you enroll on the reader PC. Leave blank to let the system pick the next free number.</p>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Active (uncheck to stop tracking without deleting history)
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : editing ? 'Save' : 'Add staff'}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
const DevicesTab: React.FC<{ companyId: number; primary: string; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, primary, flash }) => {
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [toDel, setToDel] = useState<AttendanceDevice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([getAttendanceDevices(companyId), getAttendanceSettings(companyId)]);
      setDevices(d); setSettings(s);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const create = async () => {
    if (!newName.trim()) return flash('error', 'Give the device a name.');
    setCreating(true);
    try {
      const d = await createAttendanceDevice({ company_id: companyId, name: newName.trim() });
      setNewName(''); setReveal((r) => ({ ...r, [d.id]: true })); flash('success', 'Device registered. Copy its API key into the agent.'); load();
    } catch { flash('error', 'Failed to register device.'); } finally { setCreating(false); }
  };

  const copy = (id: number, key: string) => {
    navigator.clipboard.writeText(key).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); });
  };

  const toggle = async (d: AttendanceDevice) => {
    try { await updateAttendanceDevice(d.id, { active: !d.active }); load(); }
    catch { flash('error', 'Failed to update.'); }
  };

  const regen = async (id: number) => {
    try { await regenerateDeviceKey(id); setReveal((r) => ({ ...r, [id]: true })); flash('success', 'New key generated. Update the agent.'); load(); }
    catch { flash('error', 'Failed to regenerate.'); }
  };

  const del = async () => {
    if (!toDel) return;
    try { await deleteAttendanceDevice(toDel.id); setToDel(null); flash('success', 'Device removed.'); load(); }
    catch { flash('error', 'Failed to remove.'); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Register */}
      <div className={`${card} p-4`}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2"><KeyRound size={16} /> Register a device / PC agent</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Each fingerprint reader (via the PC agent) gets its own API key. Paste the key into the agent's config so its punches are trusted.
        </p>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Front Desk Reader" className={`${inputCls} flex-1`} />
          <button onClick={create} disabled={creating} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}><Plus size={15} /> Register</button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2.5 text-sm text-indigo-800 dark:text-indigo-200">
          <Fingerprint size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Enrolling fingerprints (USB reader):</strong> on the office PC where the reader is plugged in,
            start the bridge and open{' '}
            <a href="http://localhost:5580" target="_blank" rel="noreferrer" className="font-mono underline">http://localhost:5580</a>{' '}
            to enroll staff with a click. First assign each person a <strong>Device User ID</strong> in the{' '}
            <strong>Staff</strong> tab. See <span className="font-mono">agent/zk6500/README.md</span> for setup.
          </span>
        </div>
      </div>

      {/* Device list */}
      <div className={`${card} overflow-hidden`}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr><th className={th}>Device</th><th className={th}>API Key</th><th className={th}>Last seen</th><th className={th}>Status</th><th className={th}></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {devices.length === 0 ? (
              <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={5}>No devices yet.</td></tr>
            ) : devices.map((d) => (
              <tr key={d.id}>
                <td className={`${td} font-medium`}>{d.name}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <code className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 font-mono">
                      {reveal[d.id] ? d.api_key : `${d.api_key.slice(0, 8)}••••••••`}
                    </code>
                    <button onClick={() => setReveal((r) => ({ ...r, [d.id]: !r[d.id] }))} className="text-xs text-gray-500 hover:underline">{reveal[d.id] ? 'Hide' : 'Show'}</button>
                    <button onClick={() => copy(d.id, d.api_key)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                      {copied === d.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </td>
                <td className={td}>{d.last_seen_at ? `${datePart(d.last_seen_at)} ${timePart(d.last_seen_at)}` : <span className="text-gray-400">never</span>}</td>
                <td className={td}>
                  <button onClick={() => toggle(d)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${d.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {d.active ? 'Active' : 'Disabled'}
                  </button>
                </td>
                <td className={td}>
                  <div className="flex gap-3">
                    <button onClick={() => regen(d.id)} title="Regenerate key" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><RefreshCw size={15} /></button>
                    <button onClick={() => setToDel(d)} title="Delete" className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Work-hours settings */}
      {settings && <WorkHoursCard companyId={companyId} primary={primary} settings={settings} onSaved={(s) => { setSettings(s); flash('success', 'Settings saved.'); }} flash={flash} />}

      {toDel && <ConfirmModal title="Remove device?" body={`"${toDel.name}" will stop being able to send punches.`} onCancel={() => setToDel(null)} onConfirm={del} />}
    </div>
  );
};

const WorkHoursCard: React.FC<{ companyId: number; primary: string; settings: AttendanceSettings; onSaved: (s: AttendanceSettings) => void; flash: (t: 'success' | 'error', m: string) => void }> = ({ companyId, primary, settings, onSaved, flash }) => {
  const [start, setStart] = useState(settings.work_start.slice(0, 5));
  const [end, setEnd] = useState(settings.work_end.slice(0, 5));
  const [grace, setGrace] = useState(String(settings.late_grace_minutes));
  const [gap, setGap] = useState(String(settings.min_gap_minutes ?? 5));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const s = await updateAttendanceSettings({
        company_id: companyId, work_start: start + ':00', work_end: end + ':00',
        late_grace_minutes: Number(grace) || 0, min_gap_minutes: Number(gap) || 0,
      });
      onSaved(s);
    } catch { flash('error', 'Failed to save settings.'); } finally { setSaving(false); }
  };

  return (
    <div className={`${card} p-4`}>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2"><SettingsIcon size={16} /> Work hours &amp; scanning</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Work hours mark staff on-time or late. The scan gap ignores accidental repeat scans.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Start"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
        <Field label="End"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
        <Field label="Late grace (min)"><input type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} className={`${inputCls} w-28`} /></Field>
        <Field label="Min gap between scans (min)"><input type="number" min={0} value={gap} onChange={(e) => setGap(e.target.value)} className={`${inputCls} w-44`} /></Field>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Example: with a 5-minute gap, if someone scans again within 5 minutes it's treated as the same tap — so one check-in
        won't accidentally become a check-out. Their real check-out (hours later) is unaffected.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small shared UI bits
const inputCls = 'px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>
    {children}
  </label>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className={`${card} w-full max-w-md p-5`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

const ConfirmModal: React.FC<{ title: string; body: string; onCancel: () => void; onConfirm: () => void }> = ({ title, body, onCancel, onConfirm }) => (
  <Modal title={title} onClose={onCancel}>
    <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">{body}</p>
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700">Cancel</button>
      <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-red-600 hover:bg-red-700">Delete</button>
    </div>
  </Modal>
);

export default Attendance;
