const express = require('express');
const db = require('../config/database');
const { isAuthenticated, canViewAudit } = require('../middleware/auth');

// Read-only audit trail API. Visible to super-admins and to users granted
// `can_view_audit` (e.g. MD / Co-MD). Everything is scoped to the caller's
// organization; a super-admin who has not entered an organization sees all
// organizations (optionally filtered by ?organization_id=).
const router = express.Router();
router.use(isAuthenticated, canViewAudit);

const AUTH_ACTIONS = ['login', 'logout', 'login_failed'];
const ONLINE_MINUTES = 5;

// The platform owner's own activity (signing in, entering an organization,
// anything they change while inside one) is never shown to an organization:
// only other super-admins can see it. This also keeps the public demo's log
// down to its sample entries.
const OWNER_HIDDEN = `a.acting_super_admin = 0
  AND (a.user_id IS NULL OR a.user_id NOT IN (SELECT su.id FROM users su WHERE su.is_super_admin = 1))`;

function scope(req) {
  const orgId = req.user.organization_id;
  if (orgId) {
    return req.user.is_super_admin
      ? { sql: 'a.organization_id = ?', params: [orgId] }
      : { sql: `a.organization_id = ? AND ${OWNER_HIDDEN}`, params: [orgId] };
  }
  if (req.user.is_super_admin) {
    const f = Number(req.query.organization_id);
    return f ? { sql: 'a.organization_id = ?', params: [f] } : { sql: '1 = 1', params: [] };
  }
  return { sql: '1 = 0', params: [] };
}

// GET /api/audit-logs?user_id=&kind=auth|changes&action=&entity_type=&from=&to=&q=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const s = scope(req);
    const where = [s.sql];
    const params = [...s.params];
    const { user_id, kind, action, entity_type, from, to, q } = req.query;

    if (user_id) { where.push('a.user_id = ?'); params.push(Number(user_id)); }
    if (kind === 'auth' || kind === 'changes') {
      where.push(`a.action ${kind === 'auth' ? 'IN' : 'NOT IN'} (${AUTH_ACTIONS.map(() => '?').join(',')})`);
      params.push(...AUTH_ACTIONS);
    }
    if (action) { where.push('a.action = ?'); params.push(String(action)); }
    if (entity_type) { where.push('a.entity_type = ?'); params.push(String(entity_type)); }
    if (from) { where.push('a.created_at >= ?'); params.push(`${String(from).slice(0, 10)} 00:00:00`); }
    if (to) { where.push('a.created_at <= ?'); params.push(`${String(to).slice(0, 10)} 23:59:59`); }
    if (q) {
      where.push('(a.summary LIKE ? OR a.entity_label LIKE ? OR a.user_name LIKE ? OR a.user_email LIKE ? OR a.ip LIKE ?)');
      const like = `%${String(q).slice(0, 100)}%`;
      params.push(like, like, like, like, like);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 1000);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const whereSql = where.join(' AND ');

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${whereSql}`, params);
    const [rows] = await db.query(
      `SELECT a.id, a.organization_id, o.name AS organization_name, a.user_id, a.user_name, a.user_email,
              a.acting_super_admin, a.action, a.entity_type, a.entity_id, a.entity_label, a.company_id,
              c.name AS company_name, a.summary, a.details, a.ip, a.user_agent, a.created_at
         FROM audit_logs a
         LEFT JOIN organizations o ON o.id = a.organization_id
         LEFT JOIN companies c ON c.id = a.company_id
        WHERE ${whereSql}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    res.json({
      rows: rows.map((r) => {
        let details = null;
        try { details = r.details ? JSON.parse(r.details) : null; } catch { details = null; }
        return { ...r, details, acting_super_admin: !!r.acting_super_admin };
      }),
      total, page, limit,
    });
  } catch (e) {
    console.error('Error fetching audit logs:', e);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/audit-logs/users — people in scope with last sign-in / activity.
router.get('/users', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const params = [];
    let where = '1 = 1';
    if (orgId) { where = 'u.organization_id = ?'; params.push(orgId); }
    else if (!req.user.is_super_admin) where = '1 = 0';
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.organization_id, o.name AS organization_name,
              u.last_login_at, u.last_seen_at,
              (u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL ${ONLINE_MINUTES} MINUTE) AS online,
              (SELECT COUNT(*) FROM audit_logs a WHERE a.user_id = u.id AND a.action NOT IN ('login','logout','login_failed')
                 AND a.created_at >= CURDATE()) AS changes_today,
              (SELECT COUNT(*) FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'login_failed'
                 AND a.created_at >= NOW() - INTERVAL 7 DAY) AS failed_7d
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE ${where}
        ORDER BY online DESC, u.last_seen_at IS NULL, u.last_seen_at DESC, u.name`,
      params
    );
    res.json(rows.map((r) => ({ ...r, online: !!r.online })));
  } catch (e) {
    console.error('Error fetching audit users:', e);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/audit-logs/stats — today's headline numbers.
router.get('/stats', async (req, res) => {
  try {
    const s = scope(req);
    const [[row]] = await db.query(
      `SELECT
         COALESCE(SUM(a.action = 'login'), 0) AS logins_today,
         COALESCE(SUM(a.action = 'login_failed'), 0) AS failed_today,
         COALESCE(SUM(a.action NOT IN ('login','logout','login_failed')), 0) AS changes_today,
         COALESCE(SUM(a.action IN ('delete','remove')), 0) AS deletions_today
         FROM audit_logs a
        WHERE ${s.sql} AND a.created_at >= CURDATE()`,
      s.params
    );
    const orgId = req.user.organization_id;
    const [[online]] = await db.query(
      `SELECT COUNT(*) AS n FROM users u
        WHERE ${orgId ? 'u.organization_id = ?' : '1 = 1'}
          AND u.last_seen_at >= NOW() - INTERVAL ${ONLINE_MINUTES} MINUTE`,
      orgId ? [orgId] : []
    );
    res.json({
      logins_today: Number(row.logins_today), failed_today: Number(row.failed_today),
      changes_today: Number(row.changes_today), deletions_today: Number(row.deletions_today),
      online_now: Number(online.n),
    });
  } catch (e) {
    console.error('Error fetching audit stats:', e);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

module.exports = router;
