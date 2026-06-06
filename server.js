const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const { initializeDatabase } = require('./database/init');

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

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,           // requires HTTPS in production
    httpOnly: true,
    sameSite: isProd ? 'lax' : false,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
  },
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Static files: admin-uploaded assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const quotationRoutes = require('./routes/quotations');
const invoiceRoutes = require('./routes/invoices');
const deliveryRoutes = require('./routes/deliveries');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/delivery-notes', deliveryRoutes);
app.use('/api/admin', adminRoutes);

// Serve the React build in production. Express 5 tightened path syntax, so
// the catch-all uses a regular expression that excludes API/uploads paths
// and falls through to the SPA `index.html` for everything else.
if (isProd) {
  const buildDir = path.join(__dirname, 'client/build');
  app.use(express.static(buildDir));

  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

async function startServer() {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT} (${isProd ? 'production' : 'development'})`);
      console.log(`📱 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
