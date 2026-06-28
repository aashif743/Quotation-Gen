const express = require('express');
const compression = require('compression');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
const path = require('path');
const { initializeDatabase } = require('./database/init');
const { UPLOADS_ROOT } = require('./config/paths');

// Load environment variables
require('dotenv').config();
// Load passport configuration
require('./config/passport');

const app = express();
const PORT = process.env.PORT || 5001;
const isProd = process.env.NODE_ENV === 'production';

// When deployed behind Hostinger's HTTPS reverse proxy the request looks
// like plain HTTP to Node; trusting the proxy lets `secure` cookies and
// `req.protocol` work correctly.
if (isProd) {
  app.set('trust proxy', 1);
}

// gzip all eligible responses — big win for the React JS/CSS bundles
// (typically 70%+ size reduction) and JSON API responses.
app.use(compression());

// In production the React build is served from this same origin so CORS is
// not needed at all. In development the React dev server runs on a different
// port and needs cross-origin credentials.
if (!isProd) {
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  }));
}

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistent session store backed by the same MySQL DB the app uses for
// everything else. Sessions now survive Node process restarts (no more
// silent 401s after Hostinger restarts the app, deploys, scales, etc.).
// The library auto-creates a small `sessions` table on first connection.
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Sweep expired rows once an hour so the table stays small.
  clearExpired: true,
  checkExpirationInterval: 60 * 60 * 1000,
  // Match the cookie maxAge below; sessions are removed 7 days after their
  // last write.
  expiration: 7 * 24 * 60 * 60 * 1000,
});

// Session middleware.
// `rolling: true` refreshes the cookie's expiration on every response, so
// the 7-day clock resets every time the user is active. Users are only
// signed out after **7 days of inactivity** — not 7 days from sign-in.
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: isProd,           // requires HTTPS in production
    httpOnly: true,
    sameSite: isProd ? 'lax' : false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days from the *last* activity
  },
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Static files: admin-uploaded assets. A 7-day cache stops the browser from
// re-fetching the same logos on every page load — uploads are immutable for
// practical purposes (a new upload gets a new filename via multer).
app.use('/uploads', express.static(UPLOADS_ROOT, {
  maxAge: '7d',
  etag: true,
}));

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const quotationRoutes = require('./routes/quotations');
const invoiceRoutes = require('./routes/invoices');
const deliveryRoutes = require('./routes/deliveries');
const clientRoutes = require('./routes/clients');
const paymentRoutes = require('./routes/payments');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/delivery-notes', deliveryRoutes);
app.use('/api/payments', paymentRoutes);

// Serve the React build in production. Express 5 tightened path syntax, so
// the catch-all uses a regular expression that excludes API/uploads paths
// and falls through to the SPA `index.html` for everything else.
if (isProd) {
  const buildDir = path.join(__dirname, 'client/build');
  // CRA hashes its JS/CSS bundles in /static/, so they can be cached for a
  // year. The Company_Logos bundled with the app are also content-addressed
  // (the path changes when admin replaces the file), so 7 days is safe.
  app.use(express.static(buildDir, {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      if (filePath.includes('/static/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
    // Never cache the SPA shell so users always get the latest deploy.
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

async function startServer() {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT} (${isProd ? 'production' : 'development'})`);
      console.log(`📱 API available at http://localhost:${PORT}/api`);
      // Make the uploads location obvious in the logs — if this ever points
      // inside the deployed app folder in production, files are at risk.
      console.log(`📁 Uploads stored at: ${UPLOADS_ROOT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
