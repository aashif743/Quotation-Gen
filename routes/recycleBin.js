const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, hasPaymentAccess } = require('../middleware/auth');
const { SPECS, RETENTION_DAYS, restoreFromRecycleBin, purgeExpired, RestoreError } = require('../utils/recycleBin');
const { writeAudit } = require('../utils/audit');

// Recycle bin: records deleted in the last 30 days, restorable by admins of
// the same organization.
const router = express.Router();
router.use(isAuthenticated, isAdmin);

const PAYMENT_TYPES = new Set(['payment', 'vendor_payment', 'account_transaction']);

async function loadEntry(req, id) {
  const [rows] = await db.execute(
    'SELECT * FROM deleted_records WHERE id = ? AND organization_id = ?',
    [id, req.user.organization_id]
  );
  return rows[0] || null;
}

// GET /api/recycle-bin?type=&company_id=&q=
router.get('/', async (req, res) => {
  try {
    if (!req.user.organization_id) return res.json({ rows: [], retention_days: RETENTION_DAYS });
    await purgeExpired();
    const where = ['d.organization_id = ?'];
    const params = [req.user.organization_id];
    if (req.query.type && SPECS[req.query.type]) { where.push('d.entity_type = ?'); params.push(req.query.type); }
    if (req.query.company_id) { where.push('d.company_id = ?'); params.push(Number(req.query.company_id)); }
    if (req.query.q) {
      const like = `%${String(req.query.q).slice(0, 100)}%`;
      where.push('(d.label LIKE ? OR d.summary LIKE ? OR d.deleted_by_name LIKE ?)');
      params.push(like, like, like);
    }
    if (!hasPaymentAccess(req.user)) where.push("d.entity_type NOT IN ('payment', 'vendor_payment', 'account_transaction')");
    const [rows] = await db.query(
      `SELECT d.id, d.company_id, c.name AS company_name, d.entity_type, d.entity_id, d.label, d.summary,
              d.deleted_by, d.deleted_by_name, d.deleted_at,
              GREATEST(0, ${RETENTION_DAYS} - DATEDIFF(NOW(), d.deleted_at)) AS days_left
         FROM deleted_records d
         LEFT JOIN companies c ON c.id = d.company_id
        WHERE ${where.join(' AND ')}
        ORDER BY d.deleted_at DESC, d.id DESC
        LIMIT 500`,
      params
    );
    res.json({
      rows: rows.map((r) => ({ ...r, type_name: SPECS[r.entity_type] ? SPECS[r.entity_type].name : r.entity_type, days_left: Number(r.days_left) })),
      retention_days: RETENTION_DAYS,
    });
  } catch (e) {
    console.error('Error listing recycle bin:', e);
    res.status(500).json({ error: 'Failed to load deleted items' });
  }
});

// POST /api/recycle-bin/:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    const entry = await loadEntry(req, req.params.id);
    if (!entry) return res.status(404).json({ message: 'This item is no longer in the recycle bin.' });
    if (PAYMENT_TYPES.has(entry.entity_type) && !hasPaymentAccess(req.user)) {
      return res.status(403).json({ message: 'You do not have access to payments.' });
    }
    const restored = await restoreFromRecycleBin(entry);
    const name = SPECS[entry.entity_type].name;
    writeAudit({
      user: { ...req.user }, req, action: 'action', entityType: entry.entity_type, entityId: entry.entity_id,
      entityLabel: entry.label, companyId: entry.company_id,
      summary: `Restored ${name.toLowerCase()}${entry.label ? ` ${entry.label}` : ''} from the recycle bin`,
    });
    res.json({ message: `${name} restored.`, ...restored, entity_type: entry.entity_type });
  } catch (e) {
    if (e instanceof RestoreError) return res.status(e.status).json({ message: e.message });
    console.error('Error restoring:', e);
    res.status(500).json({ message: 'Could not restore this item.' });
  }
});

// DELETE /api/recycle-bin/:id — remove for good before the 30 days are up.
router.delete('/:id', async (req, res) => {
  try {
    const entry = await loadEntry(req, req.params.id);
    if (!entry) return res.status(404).json({ message: 'This item is no longer in the recycle bin.' });
    if (PAYMENT_TYPES.has(entry.entity_type) && !hasPaymentAccess(req.user)) {
      return res.status(403).json({ message: 'You do not have access to payments.' });
    }
    await db.execute('DELETE FROM deleted_records WHERE id = ?', [entry.id]);
    const name = SPECS[entry.entity_type] ? SPECS[entry.entity_type].name : entry.entity_type;
    writeAudit({
      user: { ...req.user }, req, action: 'delete', entityType: entry.entity_type, entityId: entry.entity_id,
      entityLabel: entry.label, companyId: entry.company_id,
      summary: `Permanently deleted ${name.toLowerCase()}${entry.label ? ` ${entry.label}` : ''} from the recycle bin`,
    });
    res.json({ message: 'Deleted permanently.' });
  } catch (e) {
    console.error('Error purging recycle bin entry:', e);
    res.status(500).json({ message: 'Could not delete this item.' });
  }
});

module.exports = router;
