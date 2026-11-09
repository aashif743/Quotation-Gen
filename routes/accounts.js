const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, canHandlePayments } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');
const { moveToRecycleBin } = require('../utils/recycleBin');
const {
  TYPES, METHOD_FOR, AccountError, ensurePettyCashAccount, listAccounts, accountBalance, accountLedger, accountInUse,
} = require('../utils/accounts');

// Money accounts (bank, mobile money, cash, petty cash). Admins (with payment
// access) manage accounts and see balances and ledgers; anyone who records
// payments can pick an account from /options, without seeing balances.
const router = express.Router();
router.use(isAuthenticated, canHandlePayments, requireCompanyAccess);
router.param('id', companyTableParamGuard('accounts'));

const EDITABLE_TYPES = ['bank', 'mobile', 'cash'];
const str = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fail = (res, e, fallback) => {
  if (e instanceof AccountError) return res.status(e.status).json({ message: e.message });
  if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account with this name already exists.' });
  console.error(fallback, e);
  return res.status(500).json({ message: fallback });
};

async function loadAccount(id) {
  const [rows] = await db.execute(
    "SELECT a.*, DATE_FORMAT(a.opening_date, '%Y-%m-%d') opening_date FROM accounts a WHERE a.id = ?", [id]
  );
  return rows[0] || null;
}

// GET /api/accounts/options?company_id=&include_petty=1
// Open accounts to choose from when recording money. Balances only for admins
// (to warn before taking an account below zero).
router.get('/options', async (req, res) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!companyId) return res.status(400).json({ message: 'company_id is required.' });
    const admin = req.user.role === 'admin';
    const rows = admin
      ? await listAccounts(companyId, { userId: req.user.id, includeClosed: false })
      : (await db.execute(
          "SELECT * FROM accounts WHERE company_id = ? AND is_active = 1 ORDER BY FIELD(type, 'bank', 'mobile', 'cash', 'petty_cash'), name",
          [companyId]
        ))[0];
    res.json(
      rows
        .filter((a) => req.query.include_petty === '1' || a.type !== 'petty_cash')
        .map((a) => ({
          id: a.id, name: a.name, type: a.type, type_name: TYPES[a.type] || a.type,
          bank_name: a.bank_name, account_number: a.account_number, method: METHOD_FOR[a.type] || null,
          ...(admin ? { balance: a.balance } : {}),
        }))
    );
  } catch (e) { fail(res, e, 'Failed to load accounts'); }
});

// GET /api/accounts?company_id= (admin) — all accounts with balances.
router.get('/', isAdmin, async (req, res) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!companyId) return res.status(400).json({ message: 'company_id is required.' });
    res.json(await listAccounts(companyId, { userId: req.user.id }));
  } catch (e) { fail(res, e, 'Failed to load accounts'); }
});

function readAccountBody(b, existing) {
  const name = str(b.name, 120);
  if (!name) throw new AccountError('Account name is required.');
  const type = existing ? existing.type : b.type;
  if (!existing && !EDITABLE_TYPES.includes(type)) throw new AccountError('Choose bank account, mobile money or cash.');
  if (b.opening_date != null && b.opening_date !== '' && !isYmd(b.opening_date)) throw new AccountError('Opening date must be a valid date.');
  const petty = type === 'petty_cash';
  return {
    name,
    type,
    bank_name: str(b.bank_name, 120),
    branch: str(b.branch, 120),
    account_number: str(b.account_number, 60),
    // The petty cash account's balance is the petty cash book itself.
    opening_balance: petty ? 0 : money(b.opening_balance),
    opening_date: petty ? null : (isYmd(b.opening_date) ? b.opening_date : null),
    notes: str(b.notes, 255),
  };
}

// POST /api/accounts (admin)
router.post('/', isAdmin, async (req, res) => {
  try {
    const companyId = Number(req.body.company_id);
    if (!companyId) return res.status(400).json({ message: 'company_id is required.' });
    const a = readAccountBody(req.body);
    const [r] = await db.execute(
      `INSERT INTO accounts (company_id, name, type, bank_name, branch, account_number, opening_balance, opening_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, a.name, a.type, a.bank_name, a.branch, a.account_number, a.opening_balance, a.opening_date, a.notes, req.user.id]
    );
    const row = await loadAccount(r.insertId);
    res.status(201).json({ ...row, ...(await accountBalance(row)) });
  } catch (e) { fail(res, e, 'Failed to create account'); }
});

// PUT /api/accounts/:id (admin) — details, opening balance, open / closed.
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const existing = await loadAccount(req.params.id);
    // Fields not sent keep their current value.
    const a = readAccountBody({ ...existing, ...req.body }, existing);
    const active = req.body.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0);
    if (existing.type === 'petty_cash' && !active) throw new AccountError('The petty cash account cannot be closed.');
    await db.execute(
      `UPDATE accounts SET name = ?, bank_name = ?, branch = ?, account_number = ?, opening_balance = ?, opening_date = ?,
              notes = ?, is_active = ? WHERE id = ?`,
      [a.name, a.bank_name, a.branch, a.account_number, a.opening_balance, a.opening_date, a.notes, active, req.params.id]
    );
    const row = await loadAccount(req.params.id);
    res.json({ ...row, ...(await accountBalance(row)) });
  } catch (e) { fail(res, e, 'Failed to update account'); }
});

// DELETE /api/accounts/:id (admin) — only an account nothing is linked to;
// otherwise it should be closed so its history stays.
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const existing = await loadAccount(req.params.id);
    if (existing.type === 'petty_cash') throw new AccountError('The petty cash account cannot be deleted.');
    if (await accountInUse(existing)) {
      throw new AccountError('This account has transactions, so it can\'t be deleted. Close it instead to hide it from new payments.', 409);
    }
    await db.execute('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Account deleted.' });
  } catch (e) { fail(res, e, 'Failed to delete account'); }
});

// GET /api/accounts/:id/ledger?from=&to= (admin)
router.get('/:id/ledger', isAdmin, async (req, res) => {
  try {
    const account = await loadAccount(req.params.id);
    const from = isYmd(req.query.from) ? req.query.from : null;
    const to = isYmd(req.query.to) ? req.query.to : null;
    const [[company]] = await db.execute(
      `SELECT id, name, logo_url, quote_logo_url, address, tpin, bank_details,
              primary_color, secondary_color, currency, template, letterhead
         FROM companies WHERE id = ?`, [account.company_id]
    );
    res.json({
      account: { ...account, opening_balance: Number(account.opening_balance), type_name: TYPES[account.type] || account.type },
      company,
      from, to,
      balance: (await accountBalance(account)).balance,
      ...(await accountLedger(account, { from, to })),
    });
  } catch (e) { fail(res, e, 'Failed to load the account ledger'); }
});

// ---------------------------------------------------------------------------
// Transfers between accounts and other money in / out (mounted separately at
// /api/account-transactions so the audit log names them properly).
// ---------------------------------------------------------------------------
const txRouter = express.Router();
txRouter.use(isAuthenticated, canHandlePayments, requireCompanyAccess, isAdmin);
txRouter.param('id', companyTableParamGuard('account_transactions'));

const KINDS = ['transfer', 'deposit', 'withdrawal'];

async function readTransaction(b, companyId) {
  const kind = KINDS.includes(b.kind) ? b.kind : 'transfer';
  const amount = money(b.amount);
  if (!(amount > 0)) throw new AccountError('Enter an amount greater than 0.');
  if (!isYmd(b.date)) throw new AccountError('Date is required.');
  const need = { transfer: ['from_account_id', 'to_account_id'], deposit: ['to_account_id'], withdrawal: ['from_account_id'] }[kind];
  const ids = { from_account_id: null, to_account_id: null };
  for (const key of need) {
    const id = Number(b[key]);
    if (!id) throw new AccountError(key === 'from_account_id' ? 'Choose the account the money comes from.' : 'Choose the account the money goes to.');
    const [[acc]] = await db.execute('SELECT id, type, is_active, name FROM accounts WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!acc) throw new AccountError('That account does not belong to this company.');
    if (acc.type === 'petty_cash') throw new AccountError('Use a petty cash top-up (Petty Cash page) to move money into or out of petty cash.');
    ids[key] = id;
  }
  if (kind === 'transfer' && ids.from_account_id === ids.to_account_id) throw new AccountError('Choose two different accounts.');
  return {
    kind, amount, date: b.date, ...ids,
    category: kind === 'transfer' ? null : str(b.category, 100),
    reference: str(b.reference, 100),
    notes: str(b.notes, 2000),
  };
}

// POST /api/account-transactions { company_id, kind, from_account_id, to_account_id, amount, date, category, reference, notes }
txRouter.post('/', async (req, res) => {
  try {
    const companyId = Number(req.body.company_id);
    if (!companyId) return res.status(400).json({ message: 'company_id is required.' });
    const t = await readTransaction(req.body, companyId);
    const [r] = await db.execute(
      `INSERT INTO account_transactions (company_id, kind, from_account_id, to_account_id, amount, date, category, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, t.kind, t.from_account_id, t.to_account_id, t.amount, t.date, t.category, t.reference, t.notes, req.user.id]
    );
    const [[row]] = await db.execute('SELECT * FROM account_transactions WHERE id = ?', [r.insertId]);
    res.status(201).json(row);
  } catch (e) { fail(res, e, 'Failed to save the transaction'); }
});

// GET /api/account-transactions/:id
txRouter.get('/:id', async (req, res) => {
  try {
    const [[row]] = await db.execute(
      "SELECT t.*, DATE_FORMAT(t.date, '%Y-%m-%d') date FROM account_transactions t WHERE t.id = ?", [req.params.id]
    );
    res.json(row);
  } catch (e) { fail(res, e, 'Failed to load the transaction'); }
});

// PUT /api/account-transactions/:id
txRouter.put('/:id', async (req, res) => {
  try {
    const [[existing]] = await db.execute('SELECT company_id FROM account_transactions WHERE id = ?', [req.params.id]);
    const t = await readTransaction(req.body, existing.company_id);
    await db.execute(
      `UPDATE account_transactions SET kind = ?, from_account_id = ?, to_account_id = ?, amount = ?, date = ?, category = ?,
              reference = ?, notes = ? WHERE id = ?`,
      [t.kind, t.from_account_id, t.to_account_id, t.amount, t.date, t.category, t.reference, t.notes, req.params.id]
    );
    const [[row]] = await db.execute('SELECT * FROM account_transactions WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (e) { fail(res, e, 'Failed to save the transaction'); }
});

// DELETE /api/account-transactions/:id — to the recycle bin.
txRouter.delete('/:id', async (req, res) => {
  try {
    const r = await moveToRecycleBin('account_transaction', req.params.id, req);
    if (!r.affectedRows) return res.status(404).json({ message: 'Transaction not found.' });
    res.json({ message: 'Transaction deleted.' });
  } catch (e) { fail(res, e, 'Failed to delete the transaction'); }
});

module.exports = router;
module.exports.transactions = txRouter;
module.exports.ensurePettyCashAccount = ensurePettyCashAccount;
