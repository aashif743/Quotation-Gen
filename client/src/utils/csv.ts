// Minimal, dependency-free CSV export that Excel opens cleanly.
type Cell = string | number | null | undefined;

const escapeCell = (v: Cell): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers: string[], rows: Cell[][]): string =>
  [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');

export const downloadCsv = (filename: string, csv: string): void => {
  // A leading BOM makes Excel interpret the file as UTF-8 (so symbols/accents
  // don't get mangled).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
