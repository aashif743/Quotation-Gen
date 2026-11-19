// An amount written out in words, as printed on receipts:
//   amountInWords(131062.5, 'MWK') → "One Hundred Thirty-One Thousand Sixty-Two
//   Kwacha and Fifty Tambala Only"

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

// Main unit and the hundredth, per currency code.
const UNITS: Record<string, [string, string]> = {
  MWK: ['Kwacha', 'Tambala'],
  ZMW: ['Kwacha', 'Ngwee'],
  USD: ['Dollars', 'Cents'],
  ZAR: ['Rand', 'Cents'],
  GBP: ['Pounds', 'Pence'],
  EUR: ['Euros', 'Cents'],
  KES: ['Shillings', 'Cents'],
  TZS: ['Shillings', 'Cents'],
  UGX: ['Shillings', 'Cents'],
  NGN: ['Naira', 'Kobo'],
};

/** 0–999 in words. */
function hundreds(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`);
  return parts.join(' ');
}

/** A whole number in words ("Zero" for 0). */
export function numberInWords(n: number): string {
  let x = Math.floor(Math.abs(n));
  if (x === 0) return 'Zero';
  const parts: string[] = [];
  for (let i = 0; x > 0 && i < SCALES.length; i++) {
    const chunk = x % 1000;
    if (chunk) parts.unshift(`${hundreds(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`);
    x = Math.floor(x / 1000);
  }
  return parts.join(' ');
}

export function amountInWords(amount: number, currency = 'MWK'): string {
  const code = (currency || 'MWK').toUpperCase();
  const [major, minor] = UNITS[code] || [code, 'Cents'];
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${numberInWords(whole)} ${major}${frac ? ` and ${numberInWords(frac)} ${minor}` : ''} Only`;
}
