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

// Attendance section: any admin, OR a staff member explicitly granted the
// `can_manage_attendance` permission. Lets one trusted staffer run attendance
// without being made a full admin.
function canManageAttendance(req, res, next) {
  if (req.isAuthenticated() &&
      (req.user.role === 'admin' ||
       req.user.can_manage_attendance === 1 || req.user.can_manage_attendance === true)) {
    return next();
  }
  res.status(403).json({ message: 'You do not have access to attendance.' });
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
  canManageAttendance,
  isSuperAdmin,
};
