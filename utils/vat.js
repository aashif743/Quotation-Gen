// Per-document VAT rate (quotations / invoices), a fraction such as 0.165.
// 0 means the document was made without VAT on purpose; NULL means an older
// document saved before the rate was stored (its rate is worked out from the
// amounts when needed).
function vatRateOf(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, 1) * 10000) / 10000;
}

const SET_VAT_RATE_SQL = (table) => `UPDATE ${table} SET vat_rate = ? WHERE id = ?`;

module.exports = { vatRateOf, SET_VAT_RATE_SQL };
