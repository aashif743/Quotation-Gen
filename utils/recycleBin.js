const db = require('../config/database');

// Recycle bin. Deleting a record moves it here instead of losing it: the row,
// its child rows (items, payments) and the links other records had to it are
// snapshotted into `deleted_records` in the same transaction as the DELETE,
// and can be restored exactly (same id, same numbers) for 30 days.
//
// Spec per type:
//   table     – main table
//   label     – column shown as the record's name
//   children  – rows deleted with it by ON DELETE CASCADE: { table, fk }
//   refs      – links other tables lose (ON DELETE SET NULL): [table, column]
//   parent    – for rows that live under another record (payments): { table, fk }
const RETENTION_DAYS = 30;

const SPECS = {
  quotation: {
    table: 'quotations', label: 'quote_number', name: 'Quotation',
    children: [{ table: 'quotation_items', fk: 'quotation_id' }],
    refs: [['invoices', 'quotation_id'], ['delivery_notes', 'quotation_id'], ['job_cards', 'quotation_id'], ['purchases', 'quotation_id'], ['purchase_orders', 'quotation_id']],
  },
  invoice: {
    table: 'invoices', label: 'invoice_number', name: 'Invoice',
    children: [{ table: 'invoice_items', fk: 'invoice_id' }, { table: 'payments', fk: 'invoice_id' }],
    refs: [['delivery_notes', 'invoice_id'], ['purchases', 'invoice_id']],
  },
  delivery_note: {
    table: 'delivery_notes', label: 'delivery_note_number', name: 'Delivery note',
    children: [{ table: 'delivery_note_items', fk: 'delivery_note_id' }],
  },
  job_card: {
    table: 'job_cards', label: 'job_card_number', name: 'Job card',
    children: [{ table: 'job_card_items', fk: 'job_card_id' }],
    refs: [['invoices', 'job_card_id'], ['purchase_orders', 'job_card_id']],
  },
  lpo: {
    table: 'purchase_orders', label: 'lpo_number', name: 'LPO',
    children: [{ table: 'purchase_order_items', fk: 'purchase_order_id' }],
  },
  purchase: {
    table: 'purchases', label: 'purchase_number', name: 'Purchase',
    children: [{ table: 'purchase_items', fk: 'purchase_id' }, { table: 'vendor_payments', fk: 'purchase_id' }],
    refs: [['purchase_orders', 'purchase_id']],
  },
  expense: { table: 'expenses', label: 'expense_number', name: 'Expense' },
  petty_cash: { table: 'petty_cash', label: 'entry_number', name: 'Petty cash entry' },
  donation: {
    table: 'donations', label: 'donation_number', name: 'Donation',
    children: [{ table: 'donation_items', fk: 'donation_id' }],
  },
  contract: { table: 'contracts', label: 'contract_number', name: 'Contract' },
  client: {
    table: 'clients', label: 'name', name: 'Client',
    refs: [['quotations', 'client_id'], ['invoices', 'client_id'], ['delivery_notes', 'client_id'], ['job_cards', 'client_id'], ['contracts', 'client_id']],
  },
  vendor: {
    table: 'vendors', label: 'name', name: 'Vendor',
    refs: [['purchases', 'vendor_id'], ['purchase_orders', 'vendor_id'], ['expenses', 'vendor_id']],
  },
  payment: { table: 'payments', label: null, name: 'Payment', parent: { table: 'invoices', fk: 'invoice_id', label: 'invoice_number' } },
  vendor_payment: { table: 'vendor_payments', label: null, name: 'Vendor payment', parent: { table: 'purchases', fk: 'purchase_id', label: 'purchase_number' } },
  account_transaction: { table: 'account_transactions', label: null, name: 'Account transaction' },
};

// Columns that point at a money account. If the account has since been
// deleted, a restored record comes back unlinked rather than failing.
const ACCOUNT_LINKS = ['account_id', 'transfer_account_id'];

// Dates and times come back exactly as stored (no time-zone shifts), so a
// restore writes back the same values.
const asStored = (field, next) =>
  (['DATE', 'DATETIME', 'TIMESTAMP', 'NEWDATE'].includes(field.type) ? field.string() : next());

async function rowsOf(conn, sql, values) {
  const [rows] = await conn.query({ sql, values, typeCast: asStored });
  return rows;
}

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function describe(type, row, parentRow) {
  switch (type) {
    case 'quotation':
    case 'invoice':
      return [row.client_name, row.grand_total != null ? money(row.grand_total) : null].filter(Boolean).join(' · ');
    case 'delivery_note':
    case 'job_card':
      return row.client_name || '';
    case 'lpo':
    case 'purchase':
      return [row.vendor_name, row.grand_total != null ? money(row.grand_total) : null].filter(Boolean).join(' · ');
    case 'expense':
    case 'petty_cash':
      return [row.description || row.category, money(row.amount)].filter(Boolean).join(' · ');
    case 'donation':
      return [row.recipient_name, money(row.amount)].filter(Boolean).join(' · ');
    case 'contract':
      return [row.client_name, row.title].filter(Boolean).join(' · ');
    case 'client':
    case 'vendor':
      return [row.contact_person, row.phone || row.email].filter(Boolean).join(' · ');
    case 'account_transaction':
      return `${row.kind === 'transfer' ? 'Transfer' : row.kind === 'deposit' ? 'Money in' : 'Money out'}${row.category ? ` (${row.category})` : ''} of ${money(row.amount)}`;
    case 'payment':
    case 'vendor_payment':
      return `${row.is_discount ? 'Discount' : row.method || 'Payment'} of ${money(row.amount)}${parentRow ? ` on ${parentRow[SPECS[type].parent.label]}` : ''}`;
    default:
      return '';
  }
}

/**
 * Snapshot a record into the recycle bin, then delete it — one transaction.
 * Returns { affectedRows } like a plain DELETE (0 = record not found).
 */
async function moveToRecycleBin(type, id, req) {
  const spec = SPECS[type];
  if (!spec) throw new Error(`Unknown recycle-bin type: ${type}`);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [row] = await rowsOf(conn, `SELECT * FROM \`${spec.table}\` WHERE id = ? FOR UPDATE`, [id]);
    if (!row) { await conn.rollback(); return { affectedRows: 0 }; }

    let companyId = row.company_id ?? null;
    let parentRow = null;
    if (spec.parent) {
      [parentRow] = await rowsOf(conn, `SELECT * FROM \`${spec.parent.table}\` WHERE id = ?`, [row[spec.parent.fk]]);
      companyId = parentRow ? parentRow.company_id : null;
    }
    const [[company]] = companyId
      ? await conn.query('SELECT organization_id FROM companies WHERE id = ?', [companyId])
      : [[null]];

    const children = {};
    for (const c of spec.children || []) {
      children[c.table] = await rowsOf(conn, `SELECT * FROM \`${c.table}\` WHERE \`${c.fk}\` = ? ORDER BY id`, [id]);
    }
    const refs = {};
    for (const [t, col] of spec.refs || []) {
      const r = await rowsOf(conn, `SELECT id FROM \`${t}\` WHERE \`${col}\` = ?`, [id]);
      if (r.length) refs[`${t}.${col}`] = r.map((x) => x.id);
    }

    const label = spec.label ? row[spec.label] : (parentRow ? `${spec.name} · ${parentRow[spec.parent.label]}` : spec.name);
    await conn.execute(
      `INSERT INTO deleted_records
         (organization_id, company_id, entity_type, entity_id, label, summary, data, deleted_by, deleted_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company ? company.organization_id : (req.user && req.user.organization_id) || null,
        companyId, type, Number(id),
        label != null ? String(label).slice(0, 255) : null,
        describe(type, row, parentRow).slice(0, 500),
        JSON.stringify({ row, children, refs }),
        (req.user && req.user.id) || null,
        (req.user && req.user.name) || null,
      ]
    );
    const [result] = await conn.execute(`DELETE FROM \`${spec.table}\` WHERE id = ?`, [id]);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

class RestoreError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

/** Put a deleted record (and its children / links) back. */
async function restoreFromRecycleBin(entry) {
  const spec = SPECS[entry.entity_type];
  if (!spec) throw new RestoreError('This item type cannot be restored.', 400);
  const { row, children = {}, refs = {} } = JSON.parse(entry.data);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [exists] = await conn.query(`SELECT id FROM \`${spec.table}\` WHERE id = ?`, [row.id]);
    if (exists.length) throw new RestoreError('This item is already back in the system.');
    if (spec.parent) {
      const [p] = await conn.query(`SELECT id FROM \`${spec.parent.table}\` WHERE id = ?`, [row[spec.parent.fk]]);
      if (!p.length) {
        throw new RestoreError(`The ${spec.parent.table === 'invoices' ? 'invoice' : 'purchase'} this payment belonged to has been deleted. Restore it first.`);
      }
    }
    if (row.company_id != null) {
      const [c] = await conn.query('SELECT id FROM companies WHERE id = ?', [row.company_id]);
      if (!c.length) throw new RestoreError('The company this item belonged to no longer exists.');
    }

    const [accRows] = await conn.query('SELECT id FROM accounts WHERE company_id = ?', [row.company_id ?? -1]);
    const accountIds = new Set(accRows.map((a) => a.id));
    const relink = async (r) => {
      for (const col of ACCOUNT_LINKS) {
        if (r[col] == null) continue;
        const [a] = await conn.query('SELECT id FROM accounts WHERE id = ?', [r[col]]);
        if (!a.length) r[col] = null;
      }
      return r;
    };
    if (entry.entity_type === 'account_transaction') {
      for (const col of ['from_account_id', 'to_account_id']) {
        if (row[col] != null && !accountIds.has(row[col])) throw new RestoreError('An account this transaction used has been deleted.');
      }
    }

    await conn.query(`INSERT INTO \`${spec.table}\` SET ?`, [await relink(row)]);
    for (const c of spec.children || []) {
      for (const child of children[c.table] || []) {
        await conn.query(`INSERT INTO \`${c.table}\` SET ?`, [await relink(child)]);
      }
    }
    // Re-link records that pointed at it (only where nothing else was set since).
    for (const [key, ids] of Object.entries(refs)) {
      const [t, col] = key.split('.');
      if (!(spec.refs || []).some(([rt, rc]) => rt === t && rc === col) || !ids.length) continue;
      await conn.query(`UPDATE \`${t}\` SET \`${col}\` = ? WHERE id IN (?) AND \`${col}\` IS NULL`, [row.id, ids]);
    }
    await conn.execute('DELETE FROM deleted_records WHERE id = ?', [entry.id]);
    await conn.commit();
    return { id: row.id, label: entry.label };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new RestoreError(`Can't restore: its number${entry.label ? ` (${entry.label})` : ''} or name is now used by another record.`);
    }
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new RestoreError('Something this item depends on has since been deleted.');
    }
    throw err;
  } finally {
    conn.release();
  }
}

// Drop entries older than the retention period.
async function purgeExpired() {
  await db.execute(`DELETE FROM deleted_records WHERE deleted_at < NOW() - INTERVAL ${RETENTION_DAYS} DAY`);
}

module.exports = { SPECS, RETENTION_DAYS, moveToRecycleBin, restoreFromRecycleBin, purgeExpired, RestoreError };
