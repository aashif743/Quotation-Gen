import { QuotationItem } from '../types';

export const calculateSubtotal = (items: QuotationItem[]): number => {
  return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
};

export const calculateVAT = (subtotal: number, vatRate: number): number => {
  return subtotal * vatRate;
};

export const calculatePPDA = (subtotal: number, ppdaRate: number): number => {
  return subtotal * ppdaRate;
};

export const calculateGrandTotal = (
  subtotal: number, 
  vatAmount: number, 
  ppdaAmount: number
): number => {
  return subtotal + vatAmount + ppdaAmount;
};

/** Discount in currency for a subtotal; never negative or more than the subtotal. */
export const calculateDiscount = (
  subtotal: number,
  type?: 'amount' | 'percent' | null,
  value?: number | null
): number => {
  const v = Number(value) || 0;
  if (!type || v <= 0 || subtotal <= 0) return 0;
  const d = type === 'percent' ? (subtotal * Math.min(v, 100)) / 100 : v;
  return Math.round(Math.min(Math.max(d, 0), subtotal) * 100) / 100;
};

/**
 * All document totals in one place. The discount comes off the subtotal
 * before VAT and PPDA are worked out.
 */
export const computeTotals = (
  items: QuotationItem[],
  vatRate: number,
  ppdaRate: number,
  discountType?: 'amount' | 'percent' | null,
  discountValue?: number | null
) => {
  const subtotal = calculateSubtotal(items);
  const discount_amount = calculateDiscount(subtotal, discountType, discountValue);
  const taxable = subtotal - discount_amount;
  const vat_amount = calculateVAT(taxable, vatRate || 0);
  const ppda_amount = calculatePPDA(taxable, ppdaRate || 0);
  return { subtotal, discount_amount, vat_amount, ppda_amount, grand_total: taxable + vat_amount + ppda_amount };
};

// Active display currency (ISO 4217). It's set from the selected company (see
// CompanyContext) so every formatCurrency() call across the app reflects that
// company's currency — without threading a currency argument through the ~110
// call sites. Defaults to Malawi Kwacha for backward compatibility.
let activeCurrency = 'MWK';

export const setActiveCurrency = (code?: string | null): void => {
  activeCurrency = code && /^[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : 'MWK';
};

export const getActiveCurrency = (): string => activeCurrency;

// Locales chosen so common currencies render a short, familiar symbol.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  MWK: 'en-MW', ZMW: 'en-ZM', USD: 'en-US', ZAR: 'en-ZA', GBP: 'en-GB',
  EUR: 'en-IE', KES: 'en-KE', TZS: 'en-TZ', NGN: 'en-NG', UGX: 'en-UG',
  ZWL: 'en-ZW', BWP: 'en-BW', RWF: 'en-RW', INR: 'en-IN',
};

export const formatCurrency = (amount: number, currency?: string): string => {
  const code = (currency || activeCurrency || 'MWK').toUpperCase();
  const locale = LOCALE_BY_CURRENCY[code] || 'en';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Invalid/unknown currency code — fall back to a plain number + the code.
    return `${code} ${formatNumber(amount)}`;
  }
};

// Compact currency for tight spaces (KPI cards): e.g. "MK 183.6B", "MK 84.6M".
// Large financial figures don't fit a card at full precision; show the full
// value in a tooltip alongside this.
export const formatCompactCurrency = (amount: number, currency?: string): string => {
  const code = (currency || activeCurrency || 'MWK').toUpperCase();
  const locale = LOCALE_BY_CURRENCY[code] || 'en';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${code} ${formatNumber(amount, 0)}`;
  }
};

export const formatNumber = (num: number, decimals: number = 2): string => {
  return new Intl.NumberFormat('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};