const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('node:path');
const crypto = require('node:crypto');
const { authenticateUser } = require('./services/auth');
const { getUpcomingEvents } = require('./services/events');

function createApp(options = {}) {
  const {
    pool,
    sessionStore,
    secret,
    secureCookies = false,
    trustProxy = false
  } = options;

  if (!pool || typeof pool.query !== 'function') {
    throw new Error('A valid database pool is required.');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('A session secret is required.');
  }

  const app = express();

  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Serve static assets from public/assets only
  app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

  const store = sessionStore || new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false
  });

  app.use(session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    proxy: trustProxy,
    cookie: {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  // CSRF protection middleware
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      }
      return next();
    }
    const clientToken = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
    if (!clientToken || clientToken !== req.session.csrfToken) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    next();
  });

  // Auth middleware
  function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  // Routes
  app.get('/login', (req, res, next) => {
    if (req.session && req.session.userId) {
      return res.redirect('/events');
    }
    res.sendFile(path.join(__dirname, 'views/login.html'), (err) => {
      if (err) next(err);
    });
  });

  app.get('/events', requireAuth, (req, res, next) => {
    res.sendFile(path.join(__dirname, 'views/events.html'), (err) => {
      if (err) next(err);
    });
  });

  app.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.json({ csrfToken: req.session.csrfToken });
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const user = await authenticateUser(email, password, pool);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');

        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.json({ user });
        });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  app.get('/api/events', requireAuth, async (req, res, next) => {
    try {
      const events = await getUpcomingEvents(pool);
      res.json(events);
    } catch (err) {
      next(err);
    }
  });

  // Final error handler
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    if (err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'))) {
      return res.status(404).json({ error: 'Page not found' });
    }
    const status = err.status || err.statusCode || 500;
    let message = 'Internal server error';
    if (status === 400) {
      message = 'Invalid request';
    } else if (status === 413) {
      message = 'Request too large';
    } else if (status === 415) {
      message = 'Unsupported content type';
    } else if (status === 404) {
      message = 'Page not found';
    }
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
