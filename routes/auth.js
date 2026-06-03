const express = require('express');
const passport = require('passport');
const db = require('../config/database');

const router = express.Router();

// Public self-signup is intentionally disabled. Staff and admin accounts are
// created by an admin from the User Management page (see routes/users.js).

// POST /api/auth/login
router.post('/login', passport.authenticate('local'), (req, res) => {
  // If this function gets called, authentication was successful.
  // `req.user` contains the authenticated user.
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
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
    const { id, name, email, role } = req.user;
    res.json({ isAuthenticated: true, user: { id, name, email, role } });
  } else {
    res.json({ isAuthenticated: false, user: null });
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
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  });
});

module.exports = router;
