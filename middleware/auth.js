function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    // A suspended organization is locked out entirely (super-admins exempt).
    if (req.user.org_status === 'suspended' && !req.user.is_super_admin) {
      return res.status(403).json({ message: 'Your organization has been suspended. Please contact support.' });
    }
    return next();
  }
  res.status(401).json({ message: 'You are not authorized to view this resource.' });
}

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'Admin access is required for this action.' });
}

// Platform owner — manages organizations (tenants). Distinct from an org-admin.
function isSuperAdmin(req, res, next) {
  if (req.isAuthenticated() && (req.user.is_super_admin === 1 || req.user.is_super_admin === true)) {
    return next();
  }
  res.status(403).json({ message: 'Super-admin access is required for this action.' });
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isSuperAdmin,
};
