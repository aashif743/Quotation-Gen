const db = require('../config/database');

// Money accounts: bank accounts, mobile money wallets, cash on hand and the
// petty cash fund. An account's balance is never stored — it is the opening
// balance plus every record linked to it, so editing, deleting or restoring a
// payment / expense automatically corrects the balance.
//
// What moves an account:
//   in  – client payments (not settlement discounts), transfers / deposits in,
//         petty cash paid back into it
//   out – vendor payments, expenses, donations marked given, paid pay slips,
//         transfers / withdrawals out, petty cash top-ups taken from it
// The petty cash account is the company's existing petty cash book (all
// top-ups and payouts), so its balance always equals the Petty Cash page.

const TYPES = {
  bank: 'Bank account',
  mobile: 'Mobile money',
  cash: 'Cash',
  petty_cash: 'Petty cash',
};

// The payment method an account implies (still editable, e.g. a cheque into
// the bank).
const METHOD_FOR = { bank: 'Bank Transfer', mobile: 'Mobile Money', cash: 'Cash', petty_cash: 'Cash' };

const PETTY_NAME = 'Petty Cash';

class AccountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** The company's petty cash account, created the first time it is needed. */
async function ensurePettyCashAccount(companyId, userId) {
  const [rows] = await db.execute("SELECT id FROM accounts WHERE company_id = ? AND type = 'petty_cash' LIMIT 1", [companyId]);
  if (rows.length) return rows[0].id;
  for (const name of [PETTY_NAME, 'Petty Cash Fund', `Petty Cash ${Date.now()}`]) {
    try {
      const [r] = await db.execute(
        "INSERT INTO accounts (company_id, name, type, opening_balance, created_by) VALUES (?, ?, 'petty_cash', 0, ?)",
        [companyId, name, userId || null]
      );
      return r.insertId;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
      // Another request may have just created it.
      const [again] = await db.execute("SELECT id FROM accounts WHERE company_id = ? AND type = 'petty_cash' LIMIT 1", [companyId]);
      if (again.length) return again[0].id;
    }
  }
  return null;
}

/**
 * Validate an `account_id` sent with a record.
 *   undefined → { skip: true } (not sent: leave as it is)
 *   null / '' → { id: null }   (unlink)
 * The account must belong to the record's company, be open (unless it is the
 * record's current account) and not be the petty cash fund (petty cash is
 * spent from the Petty Cash page).
 */
async function pickAccount(companyId, raw, { current = null } = {}) {
  if (raw === undefined) return { skip: true };
  if (raw === null || raw === '' || raw === 0 || raw === '0') return { id: null, account: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AccountError('Choose a valid account.');
  const [rows] = await db.execute('SELECT * FROM accounts WHERE id = ? AND company_id = ?', [id, companyId]);
  const account = rows[0];
  if (!account) throw new AccountError('That account does not belong to this company.');
  if (account.type === 'petty_cash') throw new AccountError('Petty cash is spent from the Petty Cash page. Choose a bank, mobile money or cash account.');
  if (!account.is_active && Number(current) !== id) throw new AccountError(`"${account.name}" is closed. Choose another account.`);
  return { id, account };
}

/** The method to store when one wasn't given but an account was. */
const methodFor = (account, method) => (method ? method : account ? METHOD_FOR[account.type] || null : null);

// One row per money movement on an account:
//   d (YYYY-MM-DD), dir ('in'|'out'), amount, source, source_id, number,
//   description, reference, created_at.
// Pay slips are summed per month and payment date, so the ledger never shows
// individual salaries.
function movementsSql(account) {
  const parts = [];
  const params = [];
  const add = (sql, ...p) => { parts.push(sql); params.push(...p); };
  const id = account.id;

  add(`SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') d, 'in' dir, p.amount, 'payment' source, i.id source_id,
              i.invoice_number number, CONCAT('Payment from ', IFNULL(NULLIF(i.client_name, ''), 'client')) description,
              p.reference, p.created_at
         FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE p.account_id = ? AND p.is_discount = 0`, id);
  add(`SELECT DATE_FORMAT(vp.payment_date, '%Y-%m-%d'), 'out', vp.amount, 'vendor_payment', pu.id,
              pu.purchase_number, CONCAT('Paid ', IFNULL(NULLIF(pu.vendor_name, ''), 'vendor')), vp.reference, vp.created_at
         FROM vendor_payments vp JOIN purchases pu ON pu.id = vp.purchase_id
        WHERE vp.account_id = ?`, id);
  add(`SELECT DATE_FORMAT(e.date, '%Y-%m-%d'), 'out', e.amount, 'expense', e.id, e.expense_number,
              CONCAT('Expense', IFNULL(CONCAT(': ', NULLIF(e.category, '')), ''), IFNULL(CONCAT(' — ', NULLIF(e.description, '')), '')),
              e.reference, e.created_at
         FROM expenses e WHERE e.account_id = ?`, id);
  add(`SELECT DATE_FORMAT(dn.date, '%Y-%m-%d'), 'out', dn.amount, 'donation', dn.id, dn.donation_number,
              CONCAT('Donation to ', dn.recipient_name), dn.reference, dn.created_at
         FROM donations dn WHERE dn.account_id = ? AND dn.status = 'given' AND dn.amount > 0`, id);
  add(`SELECT DATE_FORMAT(IFNULL(ps.payment_date, CONCAT(ps.period, '-01')), '%Y-%m-%d'), 'out', SUM(ps.net_pay), 'payroll', NULL,
              ps.period, CONCAT('Salaries for ', ps.period, ' (', COUNT(*), ' pay slip', IF(COUNT(*) = 1, '', 's'), ')'),
              NULL, MAX(ps.updated_at)
         FROM payslips ps WHERE ps.account_id = ? AND ps.status = 'paid'
        GROUP BY ps.period, ps.payment_date`, id);
  add(`SELECT DATE_FORMAT(t.date, '%Y-%m-%d'), 'out', t.amount, 'transaction', t.id, NULL,
              CASE WHEN t.kind = 'transfer' THEN CONCAT('Transfer to ', IFNULL(ta.name, 'another account'))
                   ELSE IFNULL(NULLIF(t.category, ''), 'Money out') END,
              t.reference, t.created_at
         FROM account_transactions t LEFT JOIN accounts ta ON ta.id = t.to_account_id
        WHERE t.from_account_id = ?`, id);
  add(`SELECT DATE_FORMAT(t.date, '%Y-%m-%d'), 'in', t.amount, 'transaction', t.id, NULL,
              CASE WHEN t.kind = 'transfer' THEN CONCAT('Transfer from ', IFNULL(fa.name, 'another account'))
                   ELSE IFNULL(NULLIF(t.category, ''), 'Money in') END,
              t.reference, t.created_at
         FROM account_transactions t LEFT JOIN accounts fa ON fa.id = t.from_account_id
        WHERE t.to_account_id = ?`, id);
  add(`SELECT DATE_FORMAT(pc.date, '%Y-%m-%d'), IF(pc.type = 'in', 'out', 'in'), pc.amount, 'petty_cash', pc.id, pc.entry_number,
              IF(pc.type = 'in', 'Petty cash top-up', 'Paid back from petty cash'), pc.reference, pc.created_at
         FROM petty_cash pc WHERE pc.transfer_account_id = ?`, id);
  if (account.type === 'petty_cash') {
    add(`SELECT DATE_FORMAT(pc.date, '%Y-%m-%d'), pc.type, pc.amount, 'petty_cash', pc.id, pc.entry_number,
                CONCAT(IF(pc.type = 'in', 'Top-up', 'Payout'),
                       IFNULL(CONCAT(': ', NULLIF(pc.description, '')), IFNULL(CONCAT(': ', NULLIF(pc.category, '')), ''))),
                pc.reference, pc.created_at
           FROM petty_cash pc WHERE pc.company_id = ?`, account.company_id);
  }
  return { sql: parts.join('\nUNION ALL\n'), params };
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** { total_in, total_out, balance } for one account (all time). */
async function accountBalance(account) {
  const { sql, params } = movementsSql(account);
  const [[row]] = await db.query(
    `SELECT IFNULL(SUM(IF(m.dir = 'in', m.amount, 0)), 0) total_in, IFNULL(SUM(IF(m.dir = 'out', m.amount, 0)), 0) total_out
       FROM (${sql}) m`,
    params
  );
  const totalIn = round2(row.total_in);
  const totalOut = round2(row.total_out);
  return { total_in: totalIn, total_out: totalOut, balance: round2(Number(account.opening_balance) + totalIn - totalOut) };
}

/** Accounts of a company with their balances (petty cash fund first created if missing). */
async function listAccounts(companyId, { userId, includeClosed = true } = {}) {
  await ensurePettyCashAccount(companyId, userId);
  const [rows] = await db.execute(
    `SELECT a.*, DATE_FORMAT(a.opening_date, '%Y-%m-%d') opening_date
       FROM accounts a WHERE a.company_id = ?${includeClosed ? '' : ' AND a.is_active = 1'}
      ORDER BY a.is_active DESC, FIELD(a.type, 'bank', 'mobile', 'cash', 'petty_cash'), a.name`,
    [companyId]
  );
  const out = [];
  for (const a of rows) {
    out.push({ ...a, opening_balance: Number(a.opening_balance), type_name: TYPES[a.type] || a.type, ...(await accountBalance(a)) });
  }
  return out;
}

/**
 * Ledger for one account between two dates (inclusive), with a running
 * balance. `opening` is the balance at the start of `from`.
 */
async function accountLedger(account, { from, to } = {}) {
  const { sql, params } = movementsSql(account);
  const [rows] = await db.query(
    `SELECT m.* FROM (${sql}) m ORDER BY m.d, m.created_at, m.source, m.source_id`,
    params
  );
  let running = Number(account.opening_balance);
  let opening = running;
  const lines = [];
  let totalIn = 0;
  let totalOut = 0;
  for (const r of rows) {
    const amount = Number(r.amount);
    const delta = r.dir === 'in' ? amount : -amount;
    if (from && r.d < from) { running += delta; opening = running; continue; }
    if (to && r.d > to) continue;
    running += delta;
    if (r.dir === 'in') totalIn += amount; else totalOut += amount;
    lines.push({
      date: r.d, dir: r.dir, amount: round2(amount), source: r.source, source_id: r.source_id,
      number: r.number, description: r.description, reference: r.reference, balance: round2(running),
    });
  }
  return {
    opening: round2(opening),
    total_in: round2(totalIn),
    total_out: round2(totalOut),
    closing: round2(opening + totalIn - totalOut),
    lines,
  };
}

/** Whether anything is linked to the account (it can then only be closed, not deleted). */
async function accountInUse(account) {
  const { sql, params } = movementsSql(account);
  const [[row]] = await db.query(`SELECT COUNT(*) n FROM (${sql}) m`, params);
  if (Number(row.n) > 0) return true;
  // Draft pay slips and non-given donations aren't movements yet but still point at it.
  for (const t of ['payslips', 'donations']) {
    const [[r]] = await db.query(`SELECT COUNT(*) n FROM \`${t}\` WHERE account_id = ?`, [account.id]);
    if (Number(r.n) > 0) return true;
  }
  return false;
}

module.exports = {
  TYPES, METHOD_FOR, AccountError, ensurePettyCashAccount, pickAccount, methodFor,
  accountBalance, listAccounts, accountLedger, accountInUse,
};
