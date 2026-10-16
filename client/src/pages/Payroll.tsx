import React, { useEffect, useMemo, useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { formatCurrency } from '../utils/calculations';
import { Company } from '../types';
import {
  PayrollSettings, PayrollEmployee, Payslip, PayslipList, PayrollSummary, PayeBand,
} from '../types/payroll';
import {
  getPayrollSettings, updatePayrollSettings, getPayrollEmployees, updatePayrollEmployee,
  getPayslips, generatePayslips, setPayslipStatus, deletePayslip, getPayrollSummary,
} from '../services/payrollApi';
import {
  currentPeriod, periodLabel, todayYmd, formatYmd, DEFAULT_PAYE_BANDS, progressiveTax,
} from '../utils/payroll';
import PayslipDocument from '../components/Payroll/PayslipDocument';
import PayslipEditor from '../components/Payroll/PayslipEditor';
import { downloadPayslipPdf, downloadPayrollSummaryPdf } from '../components/Payroll/payslipPdf';
import {
  card, th, td, inputCls, btnOutline, Field, Spinner, Modal, ConfirmModal, LinesEditor, LineDraft,
  toDrafts, fromDrafts, Flash,
} from '../components/Payroll/ui';
import {
  HandCoins, FileText, Users, Settings as SettingsIcon, AlertCircle, Download, Eye, Edit2, Trash2,
  CheckCircle2, RotateCcw, Loader2, Wand2, Plus, Info,
} from 'lucide-react';

type Tab = 'payslips' | 'staff' | 'settings';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'payslips', label: 'Pay Slips', icon: FileText },
  { key: 'staff', label: 'Staff Salaries', icon: Users },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const Payroll: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const companyId = selectedCompany?.id;

  const [tab, setTab] = useState<Tab>('payslips');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const flash: Flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Shared across tabs: settings (bands/pension) and the staff roster.
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const loadEmployees = () => {
    if (!companyId) return;
    getPayrollEmployees(companyId).then(setEmployees).catch(() => flash('error', 'Failed to load staff.'));
  };
  useEffect(() => {
    if (!companyId) return;
    setSettings(null);
    getPayrollSettings(companyId).then(setSettings).catch(() => flash('error', 'Failed to load payroll settings.'));
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: primary }}>
          <HandCoins size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Payroll</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Staff salaries &amp; monthly pay slips {selectedCompany ? `· ${selectedCompany.name}` : ''}
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

      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-current' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
              style={active ? { color: primary } : undefined}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {!selectedCompany ? (
        <p className="text-gray-500 dark:text-gray-400">Select a company to manage payroll.</p>
      ) : (
        <>
          {tab === 'payslips' && <PayslipsTab company={selectedCompany} primary={primary} settings={settings} employees={employees} flash={flash} />}
          {tab === 'staff' && <StaffTab primary={primary} employees={employees} reload={loadEmployees} flash={flash} />}
          {tab === 'settings' && (settings
            ? <SettingsTab companyId={selectedCompany.id} primary={primary} settings={settings} onSaved={(s) => { setSettings(s); flash('success', 'Payroll settings saved.'); }} flash={flash} />
            : <Spinner />)}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
type RowStatus = 'none' | 'draft' | 'paid';

const StatusPill: React.FC<{ status: RowStatus }> = ({ status }) => {
  const map: Record<RowStatus, [string, string]> = {
    none: ['Not generated', 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'],
    draft: ['Draft', 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'],
    paid: ['Paid', 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'],
  };
  const [label, cls] = map[status];
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>{label}</span>;
};

const iconBtn = 'p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40';

const PayslipsTab: React.FC<{
  company: Company; primary: string; settings: PayrollSettings | null; employees: PayrollEmployee[]; flash: Flash;
}> = ({ company, primary, settings, employees, flash }) => {
  const companyId = company.id;
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<PayslipList | null>(null);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | 'summary' | null>(null);
  const [viewing, setViewing] = useState<Payslip | null>(null);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [paying, setPaying] = useState<Payslip | null>(null);
  const [reopening, setReopening] = useState<Payslip | null>(null);
  const [toDel, setToDel] = useState<Payslip | null>(null);

  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

  const load = async (silent = false) => {
    if (!validPeriod) return;
    if (!silent) setLoading(true);
    try {
      const [d, s] = await Promise.all([getPayslips(companyId, period), getPayrollSummary(companyId, period)]);
      setData(d); setSummary(s);
    } catch {
      flash('error', 'Failed to load pay slips.');
    } finally { if (!silent) setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [companyId, period]);

  const tpinOf = (empId: number | null) => employees.find((e) => e.id === empId)?.employee_tpin || null;

  // One row per pay slip, plus active staff who don't have one yet.
  const rows = useMemo(() => {
    if (!data) return [];
    const r: { key: string; name: string; position: string | null; slip: Payslip | null; emp: PayrollEmployee | null }[] = [
      ...data.payslips.map((s) => ({ key: `s${s.id}`, name: s.employee_name, position: s.position, slip: s, emp: null })),
      ...data.missing.map((e) => ({ key: `e${e.id}`, name: e.name, position: e.position, slip: null, emp: e })),
    ];
    return r.sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await generatePayslips(companyId, period);
      flash('success', r.created
        ? `Generated ${r.created} draft pay slip${r.created === 1 ? '' : 's'} for ${periodLabel(period)}.`
        : (r.message || 'No new pay slips to generate.'));
      load(true);
    } catch (e: any) {
      flash('error', e?.response?.data?.error || 'Failed to generate pay slips.');
    } finally { setGenerating(false); }
  };

  const downloadSlip = async (s: Payslip) => {
    setBusyId(s.id);
    try { await downloadPayslipPdf(s, company, tpinOf(s.employee_id)); }
    catch { flash('error', 'Failed to generate PDF.'); }
    finally { setBusyId(null); }
  };

  const downloadSummary = async () => {
    if (!data) return;
    setBusyId('summary');
    try { await downloadPayrollSummaryPdf(period, data.payslips, company); }
    catch { flash('error', 'Failed to generate PDF.'); }
    finally { setBusyId(null); }
  };

  const reopen = async () => {
    if (!reopening) return;
    try { await setPayslipStatus(reopening.id, { status: 'draft' }); flash('success', 'Pay slip reopened as draft.'); load(true); }
    catch (e: any) { flash('error', e?.response?.data?.error || 'Failed to reopen.'); }
    finally { setReopening(null); }
  };

  const del = async () => {
    if (!toDel) return;
    try { await deletePayslip(toDel.id); flash('success', 'Draft pay slip deleted.'); load(true); }
    catch (e: any) { flash('error', e?.response?.data?.error || 'Failed to delete.'); }
    finally { setToDel(null); }
  };

  const missingCount = data?.missing.length || 0;
  const money = (n: number) => formatCurrency(n);

  return (
    <div>
      <div className={`${card} p-3 mb-4 flex flex-wrap items-end gap-3`}>
        <Field label="Month">
          <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex-1" />
        <button onClick={downloadSummary} disabled={!data || !data.payslips.length || busyId === 'summary'} className={btnOutline}>
          {busyId === 'summary' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Payroll summary PDF
        </button>
        <button onClick={generate} disabled={generating || loading || !missingCount}
          title={missingCount ? 'Creates drafts for staff without a pay slip; existing slips are never overwritten' : 'Every active staff member already has a pay slip'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}>
          {generating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          Generate pay slips for {periodLabel(period)}{missingCount ? ` (${missingCount})` : ''}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {([
          ['Staff', summary ? `${summary.count}${summary.count ? ` · ${summary.paid_count} paid` : ''}` : '—'],
          ['Gross pay', summary ? money(summary.gross) : '—'],
          ['PAYE', summary ? money(summary.paye) : '—'],
          ['Deductions', summary ? money(summary.total_deductions) : '—'],
          ['Net pay', summary ? money(summary.net) : '—'],
        ] as const).map(([label, value]) => (
          <div key={label} className={`${card} px-4 py-3`}>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate" title={value}>{value}</div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className={th}>Staff</th>
                <th className={`${th} text-right`}>Basic</th>
                <th className={`${th} text-right`}>Gross</th>
                <th className={`${th} text-right`}>PAYE</th>
                <th className={`${th} text-right`}>Deductions</th>
                <th className={`${th} text-right`}>Net pay</th>
                <th className={th}>Days P / A</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {rows.length === 0 ? (
                <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={9}>No active staff. Add staff in Attendance → Staff.</td></tr>
              ) : rows.map(({ key, name, position, slip, emp }) => (
                <tr key={key}>
                  <td className={td}>
                    <div className="font-medium">{name}</div>
                    {position && <div className="text-xs text-gray-500 dark:text-gray-400">{position}</div>}
                  </td>
                  {slip ? (
                    <>
                      <td className={`${td} text-right tabular-nums`}>{money(slip.basic_salary)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(slip.gross_pay)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(slip.paye)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(slip.total_deductions)}</td>
                      <td className={`${td} text-right tabular-nums font-semibold`}>{money(slip.net_pay)}</td>
                      <td className={td}>{slip.days_present ?? '—'} / {slip.days_absent ?? '—'}</td>
                      <td className={td}>
                        <StatusPill status={slip.status} />
                        {slip.status === 'paid' && slip.payment_date && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">{formatYmd(slip.payment_date)}</div>
                        )}
                      </td>
                      <td className={td}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewing(slip)} title="View" className={iconBtn}><Eye size={16} /></button>
                          <button onClick={() => setEditing(slip)} title="Edit" className={iconBtn}><Edit2 size={16} /></button>
                          {slip.status === 'draft' ? (
                            <button onClick={() => setPaying(slip)} title="Mark paid" className="p-1.5 text-gray-400 hover:text-green-600"><CheckCircle2 size={16} /></button>
                          ) : (
                            <button onClick={() => setReopening(slip)} title="Reopen as draft" className="p-1.5 text-gray-400 hover:text-amber-600"><RotateCcw size={16} /></button>
                          )}
                          <button onClick={() => downloadSlip(slip)} disabled={busyId === slip.id} title="Download PDF" className={iconBtn}>
                            {busyId === slip.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                          </button>
                          <button onClick={() => setToDel(slip)} disabled={slip.status !== 'draft'}
                            title={slip.status === 'draft' ? 'Delete draft' : 'Reopen before deleting'}
                            className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`${td} text-right tabular-nums text-gray-400`}>{emp ? money(emp.basic_salary) : '—'}</td>
                      <td className={`${td} text-gray-400`} colSpan={5}>—</td>
                      <td className={td}><StatusPill status="none" /></td>
                      <td className={td}></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <PayslipViewModal slip={viewing} company={company} employeeTpin={tpinOf(viewing.employee_id)} primary={primary}
          busy={busyId === viewing.id}
          onDownload={() => downloadSlip(viewing)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onClose={() => setViewing(null)} />
      )}
      {editing && (
        <PayslipEditor slip={editing} settings={settings} primary={primary} flash={flash}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('success', 'Pay slip saved.'); load(true); }} />
      )}
      {paying && (
        <MarkPaidModal slip={paying} primary={primary} flash={flash}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); flash('success', 'Marked as paid.'); load(true); }} />
      )}
      {reopening && (
        <ConfirmModal title="Reopen pay slip?" danger={false} confirmLabel="Reopen"
          body={`${reopening.employee_name} · ${periodLabel(reopening.period)} will go back to draft so it can be edited or deleted.`}
          onCancel={() => setReopening(null)} onConfirm={reopen} />
      )}
      {toDel && (
        <ConfirmModal title="Delete draft pay slip?"
          body={`${toDel.employee_name} · ${periodLabel(toDel.period)}. You can generate it again afterwards.`}
          onCancel={() => setToDel(null)} onConfirm={del} />
      )}
    </div>
  );
};

// Preview uses a different root class so the off-screen PDF render is the only
// `.payslip-document` in the DOM during capture.
const PayslipViewModal: React.FC<{
  slip: Payslip; company: Company; employeeTpin: string | null; primary: string; busy: boolean;
  onDownload: () => void; onEdit: () => void; onClose: () => void;
}> = ({ slip, company, employeeTpin, primary, busy, onDownload, onEdit, onClose }) => (
  <Modal title={`${slip.employee_name} · ${periodLabel(slip.period)}`} onClose={onClose} wide="4xl">
    <div className="flex justify-end gap-2 mb-3">
      <button onClick={onEdit} className={btnOutline}><Edit2 size={15} /> Edit</button>
      <button onClick={onDownload} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download PDF
      </button>
    </div>
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div style={{ width: 820 }} className="mx-auto shadow-sm">
        <PayslipDocument slip={slip} company={company} employeeTpin={employeeTpin} rootClassName="payslip-preview" />
      </div>
    </div>
  </Modal>
);

const MarkPaidModal: React.FC<{ slip: Payslip; primary: string; flash: Flash; onClose: () => void; onSaved: () => void }> = ({ slip, primary, flash, onClose, onSaved }) => {
  const [date, setDate] = useState(slip.payment_date || todayYmd());
  const [method, setMethod] = useState(slip.payment_method || (slip.bank_account ? 'Bank transfer' : 'Cash'));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await setPayslipStatus(slip.id, { status: 'paid', payment_date: date || undefined, payment_method: method.trim() || undefined }); onSaved(); }
    catch (e: any) { flash('error', e?.response?.data?.error || 'Failed to mark paid.'); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={`Mark paid · ${slip.employee_name}`} onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Net pay <strong>{formatCurrency(slip.net_pay)}</strong> for {periodLabel(slip.period)}.</p>
      <div className="space-y-3">
        <Field label="Payment date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-full`} /></Field>
        <Field label="Payment method">
          <input list="payroll-pay-methods" value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} w-full`} />
          <datalist id="payroll-pay-methods">
            <option value="Bank transfer" /><option value="Cash" /><option value="Mobile money" /><option value="Cheque" />
          </datalist>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : 'Mark paid'}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
const StaffTab: React.FC<{ primary: string; employees: PayrollEmployee[]; reload: () => void; flash: Flash }> = ({ primary, employees, reload, flash }) => {
  const [editing, setEditing] = useState<PayrollEmployee | null>(null);
  const money = (n: number) => formatCurrency(n);
  const linesSummary = (e: PayrollEmployee) => {
    const a = e.salary_lines.filter((l) => l.type === 'allowance').reduce((s, l) => s + l.amount, 0);
    const d = e.salary_lines.filter((l) => l.type === 'deduction').reduce((s, l) => s + l.amount, 0);
    return { a, d };
  };

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2.5 text-sm text-indigo-800 dark:text-indigo-200">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <span>Staff are added in <strong>Attendance → Staff</strong>. Set each person's basic salary and recurring allowances / deductions here — they prefill every month's pay slip.</span>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className={th}>Name</th><th className={th}>Position</th><th className={`${th} text-right`}>Basic salary</th>
              <th className={`${th} text-right`}>Allowances</th><th className={`${th} text-right`}>Deductions</th>
              <th className={th}>Bank</th><th className={th}>Status</th><th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {employees.length === 0 ? (
              <tr><td className={`${td} text-center text-gray-400 py-10`} colSpan={8}>No staff yet. Add staff in Attendance → Staff.</td></tr>
            ) : employees.map((e) => {
              const { a, d } = linesSummary(e);
              return (
                <tr key={e.id} className={e.active ? '' : 'opacity-60'}>
                  <td className={td}>
                    <div className="font-medium">{e.name}</div>
                    {e.code && <div className="text-xs text-gray-500 dark:text-gray-400">{e.code}</div>}
                  </td>
                  <td className={td}>{e.position || '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{e.basic_salary ? money(e.basic_salary) : <span className="text-gray-400">Not set</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{a ? money(a) : '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{d ? money(d) : '—'}</td>
                  <td className={td}>
                    {e.bank_name || e.bank_account
                      ? <><div>{e.bank_name || '—'}</div><div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{e.bank_account || ''}</div></>
                      : '—'}
                  </td>
                  <td className={td}>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${e.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {e.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={td}>
                    <button onClick={() => setEditing(e)} className="text-sm hover:underline" style={{ color: primary }}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <SalaryModal employee={editing} primary={primary} flash={flash}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('success', 'Salary details saved.'); reload(); }} />
      )}
    </div>
  );
};

const SalaryModal: React.FC<{ employee: PayrollEmployee; primary: string; flash: Flash; onClose: () => void; onSaved: () => void }> = ({ employee, primary, flash, onClose, onSaved }) => {
  const [position, setPosition] = useState(employee.position || '');
  const [basic, setBasic] = useState(employee.basic_salary ? String(employee.basic_salary) : '');
  const [bankName, setBankName] = useState(employee.bank_name || '');
  const [bankAccount, setBankAccount] = useState(employee.bank_account || '');
  const [tpin, setTpin] = useState(employee.employee_tpin || '');
  const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(employee.salary_lines));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const b = basic.trim() === '' ? 0 : Number(basic);
    if (!Number.isFinite(b) || b < 0) return flash('error', 'Enter a valid basic salary.');
    setSaving(true);
    try {
      await updatePayrollEmployee(employee.id, {
        position: position.trim() || null,
        basic_salary: b,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        employee_tpin: tpin.trim() || null,
        salary_lines: fromDrafts(lines),
      });
      onSaved();
    } catch (e: any) {
      flash('error', e?.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  };

  return (
    <Modal title={`Salary · ${employee.name}`} onClose={onClose} wide="xl">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Position"><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Technician" className={`${inputCls} w-full`} /></Field>
        <Field label="Basic salary (monthly)"><input type="number" min={0} step="0.01" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="0.00" className={`${inputCls} w-full`} /></Field>
        <Field label="Bank name"><input value={bankName} onChange={(e) => setBankName(e.target.value)} className={`${inputCls} w-full`} /></Field>
        <Field label="Account number"><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={`${inputCls} w-full`} /></Field>
        <Field label="Employee TPIN"><input value={tpin} onChange={(e) => setTpin(e.target.value)} className={`${inputCls} w-full`} /></Field>
      </div>
      <div className="mt-4">
        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Recurring allowances &amp; deductions (prefill each month)</span>
        <LinesEditor lines={lines} onChange={setLines} primary={primary} />
      </div>
      <p className="text-xs text-gray-400 mt-3">Changes apply to pay slips generated from now on — existing pay slips keep their own figures.</p>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
interface BandDraft { upTo: string; rate: string }
const toBandDrafts = (bands: PayeBand[]): BandDraft[] =>
  bands.map((b) => ({ upTo: b.upTo === null ? '' : String(b.upTo), rate: String(b.rate) }));

const SettingsTab: React.FC<{ companyId: number; primary: string; settings: PayrollSettings; onSaved: (s: PayrollSettings) => void; flash: Flash }> = ({ companyId, primary, settings, onSaved, flash }) => {
  // The last row is always the open-ended top band ("and above").
  const [bands, setBands] = useState<BandDraft[]>(() => toBandDrafts(settings.paye_bands));
  const [empPct, setEmpPct] = useState(String(settings.pension_employee_percent));
  const [erPct, setErPct] = useState(String(settings.pension_employer_percent));
  const [saving, setSaving] = useState(false);
  const [testAmount, setTestAmount] = useState('1000000');

  const setBand = (i: number, patch: Partial<BandDraft>) => setBands(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addBand = () => setBands([...bands.slice(0, -1), { upTo: '', rate: '' }, bands[bands.length - 1]]);
  const removeBand = (i: number) => setBands(bands.filter((_, j) => j !== i));

  const parsed: PayeBand[] = bands.map((b, i) => ({
    upTo: i === bands.length - 1 ? null : Number(b.upTo),
    rate: Number(b.rate),
  }));
  const valid = parsed.every((b, i) =>
    Number.isFinite(b.rate) && b.rate >= 0 && b.rate <= 100 && bands[i].rate.trim() !== ''
    && (b.upTo === null || (Number.isFinite(b.upTo) && b.upTo > 0 && (i === 0 || b.upTo > (parsed[i - 1].upTo as number)))));

  const save = async () => {
    if (!valid) return flash('error', 'Check the bands: thresholds must increase and rates must be 0–100.');
    setSaving(true);
    try {
      const s = await updatePayrollSettings({
        company_id: companyId, paye_bands: parsed,
        pension_employee_percent: Number(empPct) || 0, pension_employer_percent: Number(erPct) || 0,
      });
      setBands(toBandDrafts(s.paye_bands));
      onSaved(s);
    } catch (e: any) {
      flash('error', e?.response?.data?.error || 'Failed to save settings.');
    } finally { setSaving(false); }
  };

  const fromOf = (i: number) => (i === 0 ? 0 : Number(bands[i - 1].upTo) || 0);
  const money = (n: number) => formatCurrency(n);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className={`${card} p-4`}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">PAYE tax bands (monthly)</h3>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Verify bands with current MRA rates. Defaults are the Malawi monthly bands{settings.is_default ? ' (not yet saved for this company)' : ''}.</span>
        </div>
        <table className="min-w-full">
          <thead>
            <tr><th className={th}>From</th><th className={th}>Up to</th><th className={th}>Rate %</th><th className={th}></th></tr>
          </thead>
          <tbody>
            {bands.map((b, i) => {
              const last = i === bands.length - 1;
              return (
                <tr key={i}>
                  <td className={`${td} tabular-nums text-gray-500`}>{money(fromOf(i))}</td>
                  <td className={td}>
                    {last ? <span className="text-gray-500 dark:text-gray-400">and above</span> : (
                      <input type="number" min={0} value={b.upTo} onChange={(e) => setBand(i, { upTo: e.target.value })} className={`${inputCls} w-40`} />
                    )}
                  </td>
                  <td className={td}><input type="number" min={0} max={100} step="0.01" value={b.rate} onChange={(e) => setBand(i, { rate: e.target.value })} className={`${inputCls} w-24`} /></td>
                  <td className={td}>
                    {!last && bands.length > 1 && (
                      <button onClick={() => removeBand(i)} className="text-gray-400 hover:text-red-500" title="Remove band"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button onClick={addBand} className="flex items-center gap-1 text-sm hover:underline" style={{ color: primary }}><Plus size={14} /> Add band</button>
          <button onClick={() => setBands(toBandDrafts(DEFAULT_PAYE_BANDS))} className="text-sm text-gray-500 hover:underline">Reset to Malawi defaults</button>
        </div>
        {valid && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>Check: PAYE on taxable pay of</span>
            <input type="number" min={0} value={testAmount} onChange={(e) => setTestAmount(e.target.value)} className={`${inputCls} w-36`} />
            <span>= <strong>{money(progressiveTax(Number(testAmount) || 0, parsed))}</strong></span>
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Pension</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Percent of basic salary. The employee share is deducted from pay (and reduces taxable pay); the employer share is shown on the pay slip for information only.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Employee %"><input type="number" min={0} max={100} step="0.01" value={empPct} onChange={(e) => setEmpPct(e.target.value)} className={`${inputCls} w-28`} /></Field>
          <Field label="Employer %"><input type="number" min={0} max={100} step="0.01" value={erPct} onChange={(e) => setErPct(e.target.value)} className={`${inputCls} w-28`} /></Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <span className="text-xs text-gray-400">Applies to pay slips generated or edited after saving.</span>
      </div>
    </div>
  );
};

export default Payroll;
