const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { isAuthenticated, hasPayrollAccess, hasAuditAccess } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();

// Public self-signup is intentionally disabled. Staff and admin accounts are
// created by an admin from the User Management page (see routes/users.js).

// Audit every sign-in attempt once the response is sent: success, wrong
// password / unknown email, or blocked (suspended organization).
async function recordLogin(req, ok, blocked) {
  if (ok && req.user) {
    db.execute('UPDATE users SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = ?', [req.user.id]).catch(() => {});
    return writeAudit({ user: req.user, req, action: 'login', summary: 'Signed in' });
  }
  const email = String((req.body && req.body.email) || '').trim().slice(0, 255);
  let known = null;
  if (email) {
    try {
      const [rows] = await db.execute('SELECT id, name, email, organization_id FROM users WHERE email = ?', [email]);
      known = rows[0] || null;
    } catch { /* ignore */ }
  }
  return writeAudit({
    user: known ? { id: known.id, name: known.name, email: known.email, organization_id: known.organization_id } : null,
    userEmail: email || null,
    req,
    action: 'login_failed',
    summary: blocked ? 'Sign-in blocked (organization suspended)' : known ? 'Failed sign-in (wrong password)' : 'Failed sign-in (unknown email)',
  });
}

const auditLoginAttempt = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode === 200) recordLogin(req, true);
    else if (res.statusCode === 401 || res.statusCode === 403) recordLogin(req, false, res.statusCode === 403);
  });
  next();
};

// POST /api/auth/login
router.post('/login', auditLoginAttempt, passport.authenticate('local'), async (req, res) => {
  // If this function gets called, authentication was successful.
  // Block login when the user's organization is suspended (super-admins exempt).
  if (!req.user.is_super_admin && req.user.organization_id) {
    const [orgs] = await db.execute('SELECT status FROM organizations WHERE id = ?', [req.user.organization_id]);
    if (orgs.length > 0 && orgs[0].status === 'suspended') {
      return req.session.destroy(() => {
        res.status(403).json({ message: 'Your organization has been suspended. Please contact support.' });
      });
    }
  }
  const { id, name, email, role, organization_id } = req.user;
  res.json({ id, name, email, role, organization_id, is_super_admin: !!req.user.is_super_admin, can_manage_attendance: !!req.user.can_manage_attendance, can_access_payroll: hasPayrollAccess(req.user), can_view_audit: hasAuditAccess(req.user), acting_organization: req.user.acting_organization || null, has_password: !!req.user.password });
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
  if (req.user) writeAudit({ user: { ...req.user }, req, action: 'logout', summary: 'Signed out' });
  req.logout((err) => {
    if (err) { return next(err); }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Could not log out, please try again.' });
      }
      res.clearCookie('connect.sid'); // The default session cookie name
      res.status(200).json({ message: 'Logged out successfully.' });
    });
  });
});

// GET /api/auth/status
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    // Treat a suspended org as logged-out so the app sends them back to login.
    if (req.user.org_status === 'suspended' && !req.user.is_super_admin) {
      return res.json({ isAuthenticated: false, user: null });
    }
    const { id, name, email, role, organization_id } = req.user;
    res.json({ isAuthenticated: true, user: { id, name, email, role, organization_id, is_super_admin: !!req.user.is_super_admin, can_manage_attendance: !!req.user.can_manage_attendance, can_access_payroll: hasPayrollAccess(req.user), can_view_audit: hasAuditAccess(req.user), acting_organization: req.user.acting_organization || null, has_password: !!req.user.password } });
  } else {
    res.json({ isAuthenticated: false, user: null });
  }
});

// PUT /api/auth/me - any signed-in user updates their own name, login email
// and/or password. Changing the email or password requires the current
// password (unless the account has none yet, e.g. Google-only sign-in).
// A password change signs the account out everywhere else.
router.put('/me', isAuthenticated, async (req, res) => {
  try {
    const [[me]] = await db.execute('SELECT id, name, email, password FROM users WHERE id = ?', [req.user.id]);
    if (!me) return res.status(404).json({ message: 'Account not found.' });

    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : me.name;
    const email = body.email != null ? String(body.email).trim() : me.email;
    const newPassword = body.new_password ? String(body.new_password) : '';
    const currentPassword = body.current_password ? String(body.current_password) : '';

    if (!name) return res.status(400).json({ message: 'Name is required.' });
    if (name.length > 255) return res.status(400).json({ message: 'Name is too long.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const emailChanged = email.toLowerCase() !== String(me.email || '').toLowerCase();
    // The platform owner's email is fixed in the server config (ADMIN_EMAIL);
    // changing it here would make the next migration recreate that account.
    if (emailChanged && req.user.is_super_admin) {
      return res.status(400).json({ message: 'The platform owner email is set in the server configuration and cannot be changed here.' });
    }
    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ message: 'The new password must be at least 6 characters.' });
    }
    if ((emailChanged || newPassword) && me.password) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, me.password))) {
        return res.status(400).json({ message: 'Your current password is incorrect.' });
      }
    }
    if (emailChanged) {
      const [dupe] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [email, me.id]);
      if (dupe.length) return res.status(400).json({ message: 'Another account already uses this email.' });
    }

    const fields = ['name = ?', 'email = ?'];
    const params = [name, email];
    if (newPassword) {
      fields.push('password = ?');
      params.push(await bcrypt.hash(newPassword, await bcrypt.genSalt(10)));
    }
    params.push(me.id);
    await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

    if (newPassword) {
      await db.execute(
        "DELETE FROM sessions WHERE session_id <> ? AND JSON_EXTRACT(data, '$.passport.user') = ?",
        [req.sessionID, me.id]
      ).catch((e) => console.error('Could not clear other sessions:', e.message));
    }

    const changes = {};
    if (name !== me.name) changes.name = [me.name, name];
    if (email !== me.email) changes.email = [me.email, email];
    const what = [...Object.keys(changes), ...(newPassword ? ['password'] : [])];
    if (what.length) {
      writeAudit({
        user: { ...req.user, name, email }, req, action: 'update',
        entityType: 'user', entityId: me.id, entityLabel: name,
        summary: `Updated own ${what.join(', ')}`,
        details: Object.keys(changes).length ? { changes } : null,
      });
    }

    req.user.name = name;
    req.user.email = email;
    const { id, role, organization_id } = req.user;
    res.json({ id, name, email, role, organization_id, is_super_admin: !!req.user.is_super_admin, can_manage_attendance: !!req.user.can_manage_attendance, can_access_payroll: hasPayrollAccess(req.user), can_view_audit: hasAuditAccess(req.user), acting_organization: req.user.acting_organization || null, has_password: !!(newPassword || me.password) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Could not update your profile.' });
  }
});

// GET /api/auth/providers - Check available auth providers
router.get('/providers', (req, res) => {
  res.json({
    local: true,
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// GET /api/auth/google - The route to start the Google authentication flow
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ message: 'Google OAuth is not configured' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback - The callback route after Google has authenticated the user
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`);
  }
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
  })(req, res, () => {
    if (req.user) recordLogin(req, true);
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  });
});

module.exports = router;
