const db = require('../config/database');

// Multi-tenancy helpers. Every request is scoped to the caller's organization
// (tenant). A company (and therefore all of its documents) is only accessible
// if it belongs to the caller's organization.

// True if `companyId` belongs to `orgId`.
async function companyInOrg(companyId, orgId) {
  if (companyId == null || orgId == null) return false;
  const [rows] = await db.execute(
    'SELECT 1 FROM companies WHERE id = ? AND organization_id = ? LIMIT 1',
    [companyId, orgId]
  );
  return rows.length > 0;
}

// All company ids in an organization (used to scope list queries that don't
// take an explicit company_id).
async function orgCompanyIds(orgId) {
  if (orgId == null) return [];
  const [rows] = await db.execute('SELECT id FROM companies WHERE organization_id = ?', [orgId]);
  return rows.map((r) => r.id);
}

// Middleware for company-scoped routers: whenever a request carries a
// `company_id` (in the body or query — i.e. list and create endpoints), verify
// it belongs to the caller's organization before the handler runs. This is the
// primary guard against cross-tenant access on those endpoints. `:id` detail
// routes additionally verify ownership per-handler via `companyInOrg`.
async function requireCompanyAccess(req, res, next) {
  try {
    const orgId = req.user && req.user.organization_id;
    if (!orgId) {
      return res.status(403).json({ error: 'Your account is not linked to an organization.' });
    }
    const raw = (req.body && req.body.company_id) != null ? req.body.company_id : (req.query && req.query.company_id);
    if (raw != null && String(raw) !== '') {
      const ok = await companyInOrg(raw, orgId);
      if (!ok) {
        return res.status(403).json({ error: 'That company is not in your organization.' });
      }
    }
    next();
  } catch (err) {
    console.error('requireCompanyAccess error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

// router.param('id', …) guard: 404s any :id whose underlying record does not
// belong to the caller's organization. Registering it on a router protects
// EVERY `/:id` and `/:id/sub` route at once (detail, update, delete, receipt,
// payments, …) — no per-handler edits, so it can't be forgotten. `sql` must
// select at least one row given the bind params [id, orgId].
function orgParamGuard(sql) {
  return async (req, res, next, id) => {
    try {
      const orgId = req.user && req.user.organization_id;
      if (!orgId) {
        return res.status(403).json({ error: 'Your account is not linked to an organization.' });
      }
      const [rows] = await db.execute(sql, [id, orgId]);
      if (rows.length === 0) {
        // 404 (not 403) so we never reveal that a record exists in another org.
        return res.status(404).json({ error: 'Not found' });
      }
      next();
    } catch (err) {
      console.error('orgParamGuard error:', err);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

// Convenience guard for any table that has a `company_id` column: the record
// is in the org iff its company is in the org.
function companyTableParamGuard(table) {
  return orgParamGuard(
    `SELECT 1 FROM \`${table}\` t JOIN companies c ON t.company_id = c.id WHERE t.id = ? AND c.organization_id = ? LIMIT 1`
  );
}

module.exports = { companyInOrg, orgCompanyIds, requireCompanyAccess, orgParamGuard, companyTableParamGuard };
