const db = require('../config/database');

// Public demo ("Try the live demo"). One organization is flagged
// organizations.is_demo = 1 and filled with sample data. Visitors are signed
// into its admin account without a password and are strictly READ-ONLY: they
// can open every page and document (and use client-side previews / PDF
// downloads) but every write to the API is refused here, so one visitor can't
// change, delete or lock the demo for the next one. A super admin who has
// entered the demo organization can still maintain it.

const DEMO_MESSAGE =
  'This is the QuoteFlow demo, so changes are not saved. Contact Orbital IT Solutions to get your own system.';

const isDemoUser = (user) => !!(user && user.org_is_demo && !user.is_super_admin);

// Writes still allowed for demo visitors: signing out, or signing in again
// (to a real account, or to a fresh demo session).
const ALLOWED_WRITES = new Set(['/auth/logout', '/auth/login', '/auth/demo']);

function demoReadOnly(req, res, next) {
  if (!isDemoUser(req.user)) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (ALLOWED_WRITES.has(req.path)) return next();
  return res.status(403).json({ message: DEMO_MESSAGE, demo: true });
}

// The account visitors are signed into: the demo organization's first admin.
async function findDemoUser() {
  const [rows] = await db.execute(
    `SELECT u.* FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE o.is_demo = 1 AND o.status <> 'suspended' AND u.role = 'admin'
      ORDER BY u.id LIMIT 1`
  );
  return rows[0] || null;
}

// Light per-IP limit on demo sign-ins (each creates a session row).
const hits = new Map();
function demoRateLimited(ip, limit = 40, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => t > now - windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

module.exports = { DEMO_MESSAGE, isDemoUser, demoReadOnly, findDemoUser, demoRateLimited };
