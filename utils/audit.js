const db = require('../config/database');

// Audit trail. Two entry points:
//  - writeAudit(): record one event (used directly for login / logout).
//  - auditMiddleware: mounted on /api; records every SUCCESSFUL mutating
//    request (POST / PUT / PATCH / DELETE) made by a signed-in user, with
//    who / what / when, a field-level before→after diff for edits and a
//    snapshot of anything deleted. It never blocks or fails a request: all
//    lookups and writes are best-effort and errors are only logged.

// Fields never written to the audit trail.
const SENSITIVE = /pass(word)?|api_key|token|secret|google_id|session/i;
// Noise that changes on every save.
const IGNORED_DIFF = new Set(['updated_at', 'created_at']);
const MAX_VALUE = 300;

// URL segment → entity. `table` / `label` let the middleware look up the
// record before and after the change; `nested` entities live one level deeper
// (e.g. /payroll/payslips/12).
const ENTITIES = {
  quotations:        { type: 'quotation',     table: 'quotations',      label: 'quote_number' },
  invoices:          { type: 'invoice',       table: 'invoices',        label: 'invoice_number' },
  'delivery-notes':  { type: 'delivery_note', table: 'delivery_notes',  label: 'delivery_note_number' },
  'job-cards':       { type: 'job_card',      table: 'job_cards',       label: 'job_card_number' },
  'purchase-orders': { type: 'lpo',           table: 'purchase_orders', label: 'lpo_number' },
  contracts:         { type: 'contract',      table: 'contracts',       label: 'contract_number' },
  clients:           { type: 'client',        table: 'clients',         label: 'name' },
  vendors:           { type: 'vendor',        table: 'vendors',         label: 'name' },
  purchases:         { type: 'purchase',      table: 'purchases',       label: 'purchase_number' },
  expenses:          { type: 'expense',       table: 'expenses',        label: 'expense_number' },
  'petty-cash':      { type: 'petty_cash',    table: 'petty_cash',      label: 'entry_number' },
  payments:          { type: 'payment',       table: 'payments',        label: null },
  users:             { type: 'user',          table: 'users',           label: 'name' },
  companies:         { type: 'company',       table: 'companies',       label: 'name' },
  organizations:     { type: 'organization',  table: 'organizations',   label: 'name' },
  donations:         { type: 'donation',      table: 'donations',       label: 'donation_number' },
  payroll: {
    nested: {
      payslips:  { type: 'payslip',          table: 'payslips',             label: 'employee_name' },
      employees: { type: 'employee_salary',  table: 'attendance_employees', label: 'name' },
      settings:  { type: 'payroll_settings' },
    },
  },
  attendance: {
    nested: {
      devices:   { type: 'attendance_device',   table: 'attendance_devices',   label: 'name' },
      employees: { type: 'attendance_employee', table: 'attendance_employees', label: 'name' },
      settings:  { type: 'attendance_settings' },
      manual:    { type: 'attendance_punch' },
      punch:     { type: 'attendance_punch' },
    },
  },
};

// Sub-actions (the segment after the id) → readable verbs.
const SUB_VERBS = {
  proof:      { POST: 'Uploaded proof for', DELETE: 'Removed proof from' },
  signature:  { POST: 'Uploaded signature for', DELETE: 'Removed signature from' },
  signed:     { POST: 'Uploaded signed copy for', DELETE: 'Removed signed copy from' },
  receipt:    { POST: 'Uploaded receipt for', DELETE: 'Removed receipt from' },
  duplicate:  { POST: 'Duplicated' },
  payments:   { POST: 'Recorded payment on', DELETE: 'Deleted payment on' },
  status:     { PATCH: 'Changed status of', PUT: 'Changed status of' },
  enter:      { POST: 'Entered' },
  regenerate: { POST: 'Regenerated key of' },
  convert:    { POST: 'Converted' },
  approve:    { POST: 'Approved' },
  generate:   { POST: 'Generated' },
  template:   { PUT: 'Saved default template for' },
  exit:       { POST: 'Left' },
};

const clientIp = (req) => {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.ip || (req.socket && req.socket.remoteAddress) || '';
  return ip.replace(/^::ffff:/, '').slice(0, 64) || null;
};

const clip = (v) => {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') v = JSON.stringify(v);
  const s = String(v);
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
};

// Shallow, size-limited copy without secrets. Arrays of line items are
// reduced to a count so the log stays small.
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.test(k)) continue;
    if (Array.isArray(v)) { out[k] = `[${v.length} item${v.length === 1 ? '' : 's'}]`; continue; }
    out[k] = clip(v);
  }
  return out;
}

function diffRows(before, after) {
  if (!before || !after) return null;
  const changes = {};
  for (const k of Object.keys(after)) {
    if (IGNORED_DIFF.has(k) || SENSITIVE.test(k)) continue;
    const a = before[k] instanceof Date ? before[k].toISOString() : before[k];
    const b = after[k] instanceof Date ? after[k].toISOString() : after[k];
    if (String(a ?? '') !== String(b ?? '')) changes[k] = [clip(a), clip(b)];
  }
  return Object.keys(changes).length ? changes : null;
}

async function writeAudit(e) {
  try {
    const u = e.user || {};
    await db.execute(
      `INSERT INTO audit_logs
         (organization_id, user_id, user_name, user_email, acting_super_admin, action,
          entity_type, entity_id, entity_label, company_id, summary, details, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.organizationId ?? u.organization_id ?? null,
        u.id ?? null,
        u.name ?? e.userName ?? null,
        u.email ?? e.userEmail ?? null,
        u.is_super_admin && u.acting_organization ? 1 : 0,
        String(e.action).slice(0, 40),
        e.entityType || null,
        Number.isInteger(Number(e.entityId)) && e.entityId != null ? Number(e.entityId) : null,
        e.entityLabel != null ? String(e.entityLabel).slice(0, 255) : null,
        e.companyId != null && Number.isInteger(Number(e.companyId)) ? Number(e.companyId) : null,
        e.summary ? String(e.summary).slice(0, 500) : null,
        e.details ? JSON.stringify(e.details) : null,
        e.req ? clientIp(e.req) : null,
        e.req ? String(e.req.headers['user-agent'] || '').slice(0, 255) || null : null,
      ]
    );
  } catch (err) {
    console.error('Audit write failed:', err.message);
  }
}

const isId = (s) => /^\d+$/.test(String(s || ''));

// Work out entity / id / sub-action from the URL (relative to /api).
function parsePath(p) {
  const seg = p.split('?')[0].split('/').filter(Boolean);
  let def = ENTITIES[seg[0]];
  let rest = seg.slice(1);
  if (def && def.nested) {
    def = def.nested[rest[0]];
    rest = rest.slice(1);
  }
  if (!def) return null;
  const id = isId(rest[0]) ? Number(rest[0]) : null;
  const tail = id != null ? rest.slice(1) : rest;
  return { def, id, sub: tail.filter((s) => !isId(s)).join('/') || null, raw: seg.join('/') };
}

async function loadRow(def, id) {
  if (!def.table || id == null) return null;
  try {
    const [rows] = await db.query(`SELECT * FROM \`${def.table}\` WHERE id = ?`, [id]);
    return rows[0] || null;
  } catch { return null; }
}

const labelOf = (def, row) => {
  if (!row) return null;
  if (def.label && row[def.label] != null) return row[def.label];
  if (def.type === 'payment' && row.amount != null) return `Payment of ${Number(row.amount).toLocaleString('en')}`;
  return null;
};

const typeWord = (t) => String(t || 'record').replace(/_/g, ' ');

// Express middleware (mount on /api, after passport).
function auditMiddleware(req, res, next) {
  const method = req.method;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  if (!req.user || req.path.startsWith('/auth')) return next();
  const parsed = parsePath(req.path);
  if (!parsed) return next();

  const { def, id, sub } = parsed;
  // Snapshot before the handler runs (edits / deletes of an existing record).
  const needBefore = id != null && (method === 'PUT' || method === 'PATCH' || method === 'DELETE');
  const beforeP = needBefore ? loadRow(def, id) : Promise.resolve(null);

  let body;
  const origJson = res.json.bind(res);
  res.json = (b) => { body = b; return origJson(b); };
  const user = { ...req.user };
  const reqBody = req.body;

  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    try {
      const before = await beforeP;
      const respId = body && typeof body === 'object'
        ? (body.id ?? body.payment_id ?? body.insertId ?? (body.invoice && body.invoice.id) ?? null)
        : null;

      let action;
      let verb;
      if (sub && SUB_VERBS[sub.split('/')[0]] && SUB_VERBS[sub.split('/')[0]][method]) {
        verb = SUB_VERBS[sub.split('/')[0]][method];
        action = method === 'DELETE' ? 'remove' : sub.split('/')[0] === 'status' ? 'status' : 'action';
      } else if (method === 'DELETE') { action = 'delete'; verb = 'Deleted'; }
      else if (method === 'POST' && id == null) {
        action = 'create';
        verb = sub && /^from-/.test(sub) ? `Created (${sub.replace(/-/g, ' ')})` : sub ? `${sub.replace(/[-/]/g, ' ')}:` : 'Created';
      } else { action = 'update'; verb = 'Updated'; }

      const entityId = id != null ? id : (isId(respId) ? Number(respId) : null);
      // After-state for edits (field diff) and for creates (label / company).
      const after = (action === 'update' || action === 'status' || action === 'create') && entityId != null
        ? await loadRow(def, entityId) : null;
      const label = labelOf(def, after) || labelOf(def, before) || (body && def.label ? body[def.label] : null);

      let details = null;
      if (action === 'update' || action === 'status') {
        const changes = diffRows(before, after);
        details = changes ? { changes } : null;
        if (reqBody && Array.isArray(reqBody.items)) details = { ...(details || {}), items: `${reqBody.items.length} line item(s) saved` };
      } else if (action === 'delete' || action === 'remove') {
        details = before ? { deleted: sanitize(before) } : null;
      } else {
        details = sanitize(reqBody);
      }
      // Updates that changed nothing aren't worth a row.
      if (action === 'update' && !details) return;

      const companyId = (after && after.company_id) ?? (before && before.company_id) ?? (reqBody && reqBody.company_id) ?? null;
      const orgId = def.type === 'organization' ? entityId : user.organization_id;
      await writeAudit({
        user, req, organizationId: orgId, action,
        entityType: def.type, entityId, entityLabel: label, companyId,
        summary: `${verb} ${typeWord(def.type)}${label ? ` ${label}` : entityId != null ? ` #${entityId}` : ''}`.trim(),
        details,
      });
    } catch (err) {
      console.error('Audit middleware error:', err.message);
    }
  });
  next();
}

// Keep users.last_seen_at roughly current (at most once a minute per user)
// so the audit page can show who is active right now.
const lastTouch = new Map();
function touchLastSeen(req, res, next) {
  if (req.user && req.user.id) {
    const now = Date.now();
    if ((lastTouch.get(req.user.id) || 0) < now - 60_000) {
      lastTouch.set(req.user.id, now);
      db.execute('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [req.user.id]).catch(() => {});
    }
  }
  next();
}

module.exports = { writeAudit, auditMiddleware, touchLastSeen, clientIp };
