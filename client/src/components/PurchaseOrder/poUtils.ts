import { PurchaseOrderStatus } from '../../types/purchaseOrders';

/** Today as a local 'YYYY-MM-DD' (toISOString would use UTC). */
export const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Format a 'YYYY-MM-DD' (or ISO) date for display without timezone drift. */
export const formatPoDate = (value?: string | null): string => {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

/** Quantities are counts: "60", not "60.00" (keep decimals only if used). */
export const formatQty = (n: number | string | undefined | null): string =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const poStatusPill = (s?: string): string =>
  ({
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-800',
    received: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
  }[s || 'draft'] || 'bg-gray-100 text-gray-700');
