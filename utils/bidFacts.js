const { amountInWords } = require('./amountWords');

// Everything a bid's forms need, worked out once from the bid, the company's
// Bid Profile and the company — the same rules as the app's PDF forms
// (client/src/services/bidsApi.ts bidTotals, components/Bid/BidForms.tsx).

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const lineTotal = (it) => r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));

function totalsOf(d) {
  const subtotal = (d.items || []).reduce((s, it) => s + lineTotal(it), 0);
  const o = d.options || {};
  if (o.tax_mode !== 'separate') return { subtotal, vat: 0, levy: 0, grand: subtotal, separate: false };
  const vat = r2(subtotal * (Number(o.vat_rate ?? 0.165) || 0));
  const levy = r2(subtotal * (Number(o.levy_rate ?? 0.01) || 0));
  return { subtotal, vat, levy, grand: subtotal + vat + levy, separate: true };
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

function buildFacts(data, profile, company) {
  const t = data.tender || {};
  const o = data.options || {};
  const p = profile || {};
  const cur = /kwacha/i.test(t.currency || '') || !company.currency ? 'MWK' : String(company.currency).toUpperCase();
  const totals = totalsOf(data);
  const money = (n) => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const withWords = (n) => `${money(n)} (${amountInWords(n, cur)})`;
  const date = o.bid_date && /^\d{4}-\d{2}-\d{2}/.test(o.bid_date) ? new Date(`${o.bid_date.slice(0, 10)}T00:00:00`) : new Date();
  const pct = Number(t.performance_security_percent) || 0;
  const address = [p.physical_address, p.postal_address].filter(Boolean).join(', ').replace(/\s*\n\s*/g, ', ');
  return {
    bidderName: p.legal_name || company.name || '',
    registrationNo: p.registration_number || '',
    tpin: p.tpin || company.tpin || '',
    address,
    phone: p.phone || '',
    email: p.email || '',
    nationality: o.nationality || p.nationality || '',
    signatoryName: p.signatory_name || '',
    signatoryTitle: p.signatory_title || '',
    date,
    dateText: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    day: date.getDate(),
    dayOrdinal: ordinal(date.getDate()),
    monthName: date.toLocaleDateString('en-GB', { month: 'long' }),
    year: date.getFullYear(),
    reference: t.reference_number || '',
    alternativeNo: o.alternative_no || 'N/A',
    addenda: o.addenda || 'N/A',
    entity: t.procuring_entity || '',
    addressee: t.addressee || '',
    title: t.title || '',
    currency: cur,
    totals,
    totalText: money(totals.grand),
    totalWithWords: `${withWords(totals.grand)}${o.prices_include && !totals.separate ? `, ${o.prices_include}` : ''}`,
    validityDays: Number(o.validity_days || p.validity_days || 0) || '',
    performanceText: pct > 0 ? `${withWords(r2(totals.grand * pct / 100))}, being ${pct}% of the contract price` : (t.performance_security || ''),
    warranty: o.warranty || p.warranty || '',
    delivery: o.delivery || p.delivery || '',
    paymentTerms: o.payment_terms || p.payment_terms || '',
    discounts: o.discounts || '',
    commissions: (o.commissions || []).filter((c) => c && c.name),
    directors: (p.directors || []).filter((d) => d && d.name),
    owners: (p.beneficial_owners || []).filter((b) => b && b.name),
    items: data.items || [],
    specs: data.specs || [],
    dutyText: totals.separate ? '' : 'Included',
    lineTotal,
    num: (n, digits = 2) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })),
  };
}

/** Facts in plain words for the AI (no functions, no long lists). */
function factsForAi(f) {
  return {
    bidder: f.bidderName, registration_number: f.registrationNo, tpin: f.tpin, address: f.address, phone: f.phone, email: f.email,
    nationality: f.nationality, signatory_name: f.signatoryName, signatory_position: f.signatoryTitle,
    bid_date: f.dateText, procurement_reference: f.reference, procuring_entity: f.entity, addressed_to: f.addressee,
    subject: f.title, total_bid_price: f.totalWithWords, bid_validity_days: f.validityDays, performance_security: f.performanceText,
    warranty: f.warranty, delivery: f.delivery, payment_terms: f.paymentTerms, discounts: f.discounts || 'N/A',
    commissions: f.commissions.length ? f.commissions : 'None', addenda: f.addenda, alternative_no: f.alternativeNo,
    directors: f.directors.map((d) => `${d.name} (${d.address})`), beneficial_owners: f.owners.map((o) => o.name),
  };
}

module.exports = { buildFacts, factsForAi, totalsOf };
