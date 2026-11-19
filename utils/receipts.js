const { getCompanyPrefix } = require('./quotePrefix');

// Payment receipts and cash sales.
//
// Every money payment (not a settlement discount) gets a receipt number from
// the company's counter (companies.receipt_seq), e.g. "CM-RCT-0042". The
// counter only goes up, so a number is never given out twice — not even after
// a payment is deleted. Cash sales are numbered like invoices ("CM-CS-0007"):
// the highest number used so far plus one.

const receiptPrefix = (companyName) => `${getCompanyPrefix(companyName)}-RCT`;
const cashSalePrefix = (companyName) => `${getCompanyPrefix(companyName)}-CS`;

/**
 * The next receipt number for a company. Call inside the transaction that
 * inserts the payment: the company row is locked until it commits, so two
 * payments recorded at the same moment can't get the same number.
 */
async function nextReceiptNumber(conn, companyId) {
  const [[co]] = await conn.query('SELECT name, receipt_seq FROM companies WHERE id = ? FOR UPDATE', [companyId]);
  if (!co) return null;
  const seq = (Number(co.receipt_seq) || 0) + 1;
  await conn.query('UPDATE companies SET receipt_seq = ? WHERE id = ?', [seq, companyId]);
  return `${receiptPrefix(co.name)}-${String(seq).padStart(4, '0')}`;
}

/** The next cash sale number for a company (suggested; it can be edited). */
async function nextCashSaleNumber(conn, companyId) {
  const [[co]] = await conn.query('SELECT name FROM companies WHERE id = ?', [companyId]);
  if (!co) return null;
  const prefix = cashSalePrefix(co.name);
  const [[r]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_num
       FROM invoices WHERE company_id = ? AND invoice_number LIKE ?`,
    [companyId, `${prefix}-%`]
  );
  return `${prefix}-${String((Number(r.max_num) || 0) + 1).padStart(4, '0')}`;
}

module.exports = { receiptPrefix, cashSalePrefix, nextReceiptNumber, nextCashSaleNumber };
