import jsPDF from 'jspdf';
import { AttendanceEmployee, AttendanceReportRow } from '../types';

// ---------------------------------------------------------------------------
// Attendance reports: turn the server's per-staff-per-day rows (which only
// contain days someone actually scanned) into a full day-by-day picture —
// including ABSENT days — and render it as a native jsPDF table (vector text,
// so a month of staff × days stays small and never hits canvas size limits).
//
// All dates are plain 'YYYY-MM-DD' calendar strings and times are the office's
// naive wall-clock strings; neither is ever passed through `new Date(str)`
// parsing that could shift them by the browser timezone.
// ---------------------------------------------------------------------------

export type ReportType = 'summary' | 'detailed' | 'present' | 'absent' | 'late';
export type DayStatus = 'present' | 'late' | 'absent';

export const REPORT_TYPES: { key: ReportType; label: string; hint: string }[] = [
  { key: 'summary', label: 'Summary', hint: 'Totals per staff: present, late, absent, hours, attendance %' },
  { key: 'detailed', label: 'Daily detail', hint: 'Every working day for every staff member, with status' },
  { key: 'present', label: 'Present', hint: 'Days staff were present (on time or late)' },
  { key: 'absent', label: 'Absent', hint: 'Working days with no scan' },
  { key: 'late', label: 'Late arrivals', hint: 'Days staff checked in after the grace period' },
];

export interface ReportDay {
  employee_id: number;
  name: string;
  date: string;
  status: DayStatus;
  first_in: string | null;
  last_out: string | null;
  hours: number;
}

export interface StaffSummary {
  employee_id: number;
  name: string;
  workingDays: number;
  present: number; // includes late
  late: number;
  absent: number;
  hours: number;
  rate: number; // present / workingDays, 0–100
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date → 'YYYY-MM-DD' (no UTC conversion). */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD' → local Date at noon (noon avoids DST edge cases). */
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export type PeriodKey = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom dates' },
];

/** Date range for a preset period. Weeks run Monday → Sunday. */
export function periodRange(key: PeriodKey, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  switch (key) {
    case 'today': return { from: ymd(today), to: ymd(today) };
    case 'this_week': return { from: ymd(monday), to: ymd(addDays(monday, 6)) };
    case 'last_week': return { from: ymd(addDays(monday, -7)), to: ymd(addDays(monday, -1)) };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
      const last = new Date(today.getFullYear(), today.getMonth(), 0, 12);
      return { from: ymd(first), to: ymd(last) };
    }
    case 'this_month':
    default: {
      const first = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12);
      return { from: ymd(first), to: ymd(last) };
    }
  }
}

export const formatDay = (s: string) => {
  const d = parseYmd(s);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};
export const formatRange = (from: string, to: string) => {
  const f = parseYmd(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const t = parseYmd(to).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return from === to ? f : `${f} – ${t}`;
};

/** 'YYYY-MM-DD HH:MM:SS' → '8:05 AM' (verbatim wall-clock, no timezone maths). */
export const clock = (s: string | null): string => {
  if (!s) return '—';
  const t = (s.includes('T') ? s.split('T')[1] : s.split(' ')[1]) || '';
  const [hh, mm] = t.split(':');
  if (hh === undefined) return s;
  let h = Number(hh);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mm ?? '00'} ${ap}`;
};

/**
 * Expand server rows into one entry per staff per day in [from, to].
 *  - A day with a scan is present / late (even on an off day — they worked).
 *  - A WORKING day (not in `offDays`) without a scan is absent, but only from
 *    the day the staff member was added to the roster, and never in the future.
 */
export function buildDays(
  rows: AttendanceReportRow[],
  employees: AttendanceEmployee[],
  from: string,
  to: string,
  offDays: number[], // 0 = Sunday … 6 = Saturday
  employeeId?: number | null,
): ReportDay[] {
  const today = ymd(new Date());
  const byKey = new Map<string, AttendanceReportRow>();
  rows.forEach((r) => byKey.set(`${r.user_id}|${r.date}`, r));

  // Active staff, plus anyone (even inactive) who has scans in the range.
  const withRows = new Set(rows.map((r) => r.user_id));
  let staff = employees.filter((e) => Number(e.active) === 1 || e.active === true || withRows.has(e.id));
  if (employeeId) staff = staff.filter((e) => e.id === employeeId);
  staff = [...staff].sort((a, b) => a.name.localeCompare(b.name));

  const dates: string[] = [];
  for (let d = parseYmd(from); ymd(d) <= to; d = addDays(d, 1)) dates.push(ymd(d));

  const out: ReportDay[] = [];
  for (const e of staff) {
    // created_at may arrive as an ISO timestamp; its date part is close enough
    // to decide from which day absences start counting.
    const since = e.created_at ? String(e.created_at).slice(0, 10) : '';
    for (const date of dates) {
      const r = byKey.get(`${e.id}|${date}`);
      if (r) {
        out.push({
          employee_id: e.id, name: e.name, date,
          status: r.late ? 'late' : 'present',
          first_in: r.first_in, last_out: r.last_out, hours: Number(r.hours) || 0,
        });
        continue;
      }
      if (date > today) continue;
      if (since && date < since) continue;
      if (offDays.includes(parseYmd(date).getDay())) continue;
      out.push({ employee_id: e.id, name: e.name, date, status: 'absent', first_in: null, last_out: null, hours: 0 });
    }
  }
  return out;
}

export function summarize(days: ReportDay[]): StaffSummary[] {
  const map = new Map<number, StaffSummary>();
  for (const d of days) {
    let s = map.get(d.employee_id);
    if (!s) {
      s = { employee_id: d.employee_id, name: d.name, workingDays: 0, present: 0, late: 0, absent: 0, hours: 0, rate: 0 };
      map.set(d.employee_id, s);
    }
    s.workingDays++;
    if (d.status === 'absent') s.absent++;
    else s.present++;
    if (d.status === 'late') s.late++;
    s.hours += d.hours;
  }
  const list = Array.from(map.values());
  list.forEach((s) => {
    s.hours = Math.round(s.hours * 100) / 100;
    s.rate = s.workingDays ? Math.round((s.present / s.workingDays) * 1000) / 10 : 0;
  });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterDays(days: ReportDay[], type: ReportType): ReportDay[] {
  switch (type) {
    case 'present': return days.filter((d) => d.status !== 'absent');
    case 'absent': return days.filter((d) => d.status === 'absent');
    case 'late': return days.filter((d) => d.status === 'late');
    default: return days;
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [31, 59, 92];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface Column { header: string; width: number; align?: 'left' | 'right' | 'center' }

export interface ReportPdfOptions {
  type: ReportType;
  from: string;
  to: string;
  companyName: string;
  primaryColor?: string;
  staffLabel: string;     // "All staff" or a name
  offDaysLabel: string;   // e.g. "Sundays off"
  days: ReportDay[];      // unfiltered (all statuses) for the range + staff filter
}

const STATUS_LABEL: Record<DayStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent' };
const STATUS_RGB: Record<DayStatus, [number, number, number]> = {
  present: [22, 128, 61], late: [180, 83, 9], absent: [185, 28, 28],
};

export function downloadAttendancePdf(o: ReportPdfOptions): void {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14;
  const primary = hexToRgb(o.primaryColor || '#1f3b5c');
  const typeLabel = REPORT_TYPES.find((t) => t.key === o.type)?.label || 'Report';
  const summaries = summarize(o.days);

  // ---- Header (first page) ----
  let y = M;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(...primary);
  pdf.text(o.companyName, M, y + 5);
  y += 12;
  pdf.setFontSize(12);
  pdf.setTextColor(17, 24, 39);
  pdf.text(`Staff Attendance — ${typeLabel} Report`, M, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(75, 85, 99);
  pdf.text(`Period: ${formatRange(o.from, o.to)}`, M, y);
  pdf.text(`Generated: ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`, W - M, y, { align: 'right' });
  y += 4.5;
  pdf.text(`Staff: ${o.staffLabel}   ·   ${o.offDaysLabel}`, M, y);
  y += 3;
  pdf.setDrawColor(...primary);
  pdf.setLineWidth(0.6);
  pdf.line(M, y, W - M, y);
  y += 6;

  // ---- Totals strip ----
  const tot = summaries.reduce(
    (a, s) => ({ wd: a.wd + s.workingDays, p: a.p + s.present, l: a.l + s.late, ab: a.ab + s.absent, h: a.h + s.hours }),
    { wd: 0, p: 0, l: 0, ab: 0, h: 0 });
  const stats: Array<[string, string]> = [
    ['Staff', String(summaries.length)],
    ['Present', String(tot.p)],
    ['Late', String(tot.l)],
    ['Absent', String(tot.ab)],
    ['Hours', tot.h.toFixed(1)],
    ['Attendance', tot.wd ? `${Math.round((tot.p / tot.wd) * 1000) / 10}%` : '—'],
  ];
  const boxW = (W - 2 * M - 5 * 3) / 6;
  stats.forEach(([label, value], i) => {
    const x = M + i * (boxW + 3);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, boxW, 14, 1.5, 1.5, 'FD');
    pdf.setFontSize(7.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text(label.toUpperCase(), x + 3, y + 5);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(17, 24, 39);
    pdf.text(value, x + 3, y + 11);
    pdf.setFont('helvetica', 'normal');
  });
  y += 20;

  // ---- Table definition ----
  let cols: Column[];
  let body: Array<{ cells: string[]; status?: DayStatus; statusCol?: number }>;
  if (o.type === 'summary') {
    cols = [
      { header: 'Staff', width: 52 },
      { header: 'Working days', width: 22, align: 'right' },
      { header: 'Present', width: 18, align: 'right' },
      { header: 'Late', width: 16, align: 'right' },
      { header: 'Absent', width: 18, align: 'right' },
      { header: 'Hours', width: 20, align: 'right' },
      { header: 'Attendance', width: 36, align: 'right' },
    ];
    body = summaries.map((s) => ({
      cells: [s.name, String(s.workingDays), String(s.present), String(s.late), String(s.absent), s.hours.toFixed(2), `${s.rate}%`],
    }));
  } else {
    const rows = filterDays(o.days, o.type).slice().sort((a, b) =>
      o.type === 'detailed' ? a.name.localeCompare(b.name) || a.date.localeCompare(b.date)
                            : a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    if (o.type === 'absent') {
      cols = [{ header: 'Date', width: 50 }, { header: 'Staff', width: 90 }, { header: 'Status', width: 42 }];
      body = rows.map((d) => ({ cells: [formatDay(d.date), d.name, STATUS_LABEL[d.status]], status: d.status, statusCol: 2 }));
    } else {
      cols = [
        { header: 'Date', width: 38 },
        { header: 'Staff', width: 50 },
        { header: 'Check-in', width: 24 },
        { header: 'Check-out', width: 24 },
        { header: 'Hours', width: 18, align: 'right' },
        { header: 'Status', width: 28 },
      ];
      body = rows.map((d) => ({
        cells: [formatDay(d.date), d.name, clock(d.first_in), clock(d.last_out), d.hours ? d.hours.toFixed(2) : '—', STATUS_LABEL[d.status]],
        status: d.status, statusCol: 5,
      }));
    }
  }
  // Stretch columns to the full content width.
  const scale = (W - 2 * M) / cols.reduce((a, c) => a + c.width, 0);
  cols = cols.map((c) => ({ ...c, width: c.width * scale }));

  const ROW_H = 7;
  const HEAD_H = 8;
  const bottomLimit = H - M - 8; // leave room for the footer

  const drawHead = () => {
    pdf.setFillColor(...primary);
    pdf.rect(M, y, W - 2 * M, HEAD_H, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(255, 255, 255);
    let x = M;
    cols.forEach((c) => {
      const tx = c.align === 'right' ? x + c.width - 2.5 : x + 2.5;
      pdf.text(c.header, tx, y + 5.4, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    });
    pdf.setFont('helvetica', 'normal');
    y += HEAD_H;
  };

  if (body.length === 0) {
    pdf.setFontSize(10);
    pdf.setTextColor(107, 114, 128);
    pdf.text('No records for this period and filter.', W / 2, y + 10, { align: 'center' });
  } else {
    drawHead();
    body.forEach((row, i) => {
      if (y + ROW_H > bottomLimit) {
        pdf.addPage();
        y = M;
        drawHead();
      }
      if (i % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(M, y, W - 2 * M, ROW_H, 'F');
      }
      pdf.setFontSize(8.5);
      let x = M;
      row.cells.forEach((cell, ci) => {
        const c = cols[ci];
        const isStatus = row.status && ci === row.statusCol;
        if (isStatus) {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...STATUS_RGB[row.status!]);
        } else {
          pdf.setFont('helvetica', ci === 0 && o.type === 'summary' ? 'bold' : 'normal');
          pdf.setTextColor(31, 41, 55);
        }
        // Truncate to fit the column.
        let text = cell;
        const maxW = c.width - 5;
        while (text.length > 1 && pdf.getTextWidth(text) > maxW) text = text.slice(0, -2) + '…';
        const tx = c.align === 'right' ? x + c.width - 2.5 : x + 2.5;
        pdf.text(text, tx, y + 4.8, { align: c.align === 'right' ? 'right' : 'left' });
        x += c.width;
      });
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.15);
      pdf.line(M, y + ROW_H, W - M, y + ROW_H);
      y += ROW_H;
    });
  }

  // ---- Footer on every page ----
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(156, 163, 175);
    pdf.text(`${o.companyName} · ${typeLabel} attendance report · ${formatRange(o.from, o.to)}`, M, H - M + 2);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - M + 2, { align: 'right' });
  }

  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  pdf.save(`Attendance_${safe(typeLabel)}_${o.from}_to_${o.to}${o.staffLabel !== 'All staff' ? '_' + safe(o.staffLabel) : ''}.pdf`);
}
