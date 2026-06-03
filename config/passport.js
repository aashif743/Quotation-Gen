const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./database');

// Local Strategy for email/password login
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) {
        return done(null, false, { message: 'Incorrect email or password.' });
      }

      const user = users[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect email or password.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google OAuth 2.0 Strategy (optional - only if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id, displayName, emails } = profile;
        const email = emails[0].value;

        const [existingUsers] = await db.execute('SELECT * FROM users WHERE google_id = ?', [id]);

        if (existingUsers.length > 0) {
          return done(null, existingUsers[0]);
        }

        // If user exists with the same email but hasn't used Google login
        const [usersWithEmail] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (usersWithEmail.length > 0) {
          // Link the Google ID to the existing account
          await db.execute('UPDATE users SET google_id = ? WHERE email = ?', [id, email]);
          return done(null, usersWithEmail[0]);
        }

        // Create a new user
        const [result] = await db.execute(
          'INSERT INTO users (name, email, google_id) VALUES (?, ?, ?)',
          [displayName, email, id]
        );
        const [newUser] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);

        return done(null, newUser[0]);
      } catch (err) {
        return done(err);
      }
    }
  ));
  console.log('Google OAuth enabled');
} else {
  console.log('Google OAuth disabled (no credentials provided)');
}

// Serialize user to store in session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
