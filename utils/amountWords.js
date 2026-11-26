// Amounts in words on the server — the same wording as the app
// (client/src/utils/amountInWords.ts), so Word forms and PDFs agree.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
const UNITS = {
  MWK: ['Kwacha', 'Tambala'], ZMW: ['Kwacha', 'Ngwee'], USD: ['Dollars', 'Cents'], ZAR: ['Rand', 'Cents'],
  GBP: ['Pounds', 'Pence'], EUR: ['Euros', 'Cents'], KES: ['Shillings', 'Cents'], TZS: ['Shillings', 'Cents'],
  UGX: ['Shillings', 'Cents'], NGN: ['Naira', 'Kobo'],
};

function hundreds(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`);
  return parts.join(' ');
}

function numberInWords(n) {
  let x = Math.floor(Math.abs(n));
  if (x === 0) return 'Zero';
  const parts = [];
  for (let i = 0; x > 0 && i < SCALES.length; i++) {
    const chunk = x % 1000;
    if (chunk) parts.unshift(`${hundreds(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`);
    x = Math.floor(x / 1000);
  }
  return parts.join(' ');
}

function amountInWords(amount, currency = 'MWK') {
  const code = String(currency || 'MWK').toUpperCase();
  const [major, minor] = UNITS[code] || [code, 'Cents'];
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${numberInWords(whole)} ${major}${frac ? ` and ${numberInWords(frac)} ${minor}` : ''} Only`;
}

module.exports = { amountInWords, numberInWords };
