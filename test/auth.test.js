const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const bcrypt = require('bcrypt');
const { createTestPool } = require('../src/data/db');
const { runMigrations } = require('../src/data/migrate');
const { createApp } = require('../src/app');

function extractCookie(res, name) {
  const setCookieHeaders = res.headers.getSetCookie();
  if (!setCookieHeaders) return null;
  for (const cookieStr of setCookieHeaders) {
    const parts = cookieStr.split(';');
    const mainPart = parts[0].trim();
    const [cookieName, ...valParts] = mainPart.split('=');
    if (cookieName.trim() === name) {
      return valParts.join('=').trim();
    }
  }
  return null;
}

function extractRawSetCookie(res, name) {
  const setCookieHeaders = res.headers.getSetCookie();
  if (!setCookieHeaders) return null;
  for (const cookieStr of setCookieHeaders) {
    const mainPart = cookieStr.split(';')[0].trim();
    const cookieName = mainPart.split('=')[0].trim();
    if (cookieName === name) {
      return cookieStr;
    }
  }
  return null;
}

test('HTTP integration tests: authentication, sessions, CSRF, and protection', async () => {
  let testPool;
  let server;

  const cleanup = async () => {
    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      if (testPool) {
        await testPool.end();
      }
    }
  };

  try {
    testPool = createTestPool();

    // Verify database name is strictly clubevents_test
    const dbRes = await testPool.query('SELECT current_database()');
    assert.strictEqual(dbRes.rows[0].current_database, 'clubevents_test');

    await runMigrations(testPool);

    // Upsert test user
    const testEmail = 'test@club.test';
    const testPassword = 'TestPassword123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const userRes = await testPool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
    if (userRes.rows.length === 0) {
      await testPool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        [testEmail, passwordHash, 'member']
      );
    } else {
      await testPool.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2',
        [passwordHash, testEmail]
      );
    }

    const app = createApp({
      pool: testPool,
      secret: 'test-session-secret-key-12345',
      secureCookies: false,
      trustProxy: false
    });

    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // 1. Unauthenticated /events redirects to /login
    const resRedirect = await fetch(`${baseUrl}/events`, { redirect: 'manual' });
    assert.strictEqual(resRedirect.status, 302);
    assert.strictEqual(resRedirect.headers.get('location'), '/login');

    // 2. Protected static/view bypass tests (/events.html returns 404)
    const resHtmlBypass = await fetch(`${baseUrl}/events.html`);
    assert.strictEqual(resHtmlBypass.status, 404);

    const resAssetBypass = await fetch(`${baseUrl}/assets/events.html`);
    assert.strictEqual(resAssetBypass.status, 404);

    // 3. Invalid login
    const tokenResPre = await fetch(`${baseUrl}/api/csrf-token`);
    assert.strictEqual(tokenResPre.status, 200);
    const tokenDataPre = await tokenResPre.json();
    const csrfPre = tokenDataPre.csrfToken;
    assert.ok(typeof csrfPre === 'string' && csrfPre.length > 0);

    const cookiePreLogin = extractCookie(tokenResPre, 'connect.sid');
    assert.ok(cookiePreLogin, 'Pre-login session cookie must be present');

    const resInvalid = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfPre,
        'Cookie': `connect.sid=${cookiePreLogin}`
      },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword' })
    });
    assert.strictEqual(resInvalid.status, 401);
    const invalidJson = await resInvalid.json();
    assert.strictEqual(invalidJson.error, 'Invalid email or password');

    // 4. Pre-login cookie cannot access /events
    const resPreEvents = await fetch(`${baseUrl}/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookiePreLogin}`
      },
      redirect: 'manual'
    });
    assert.strictEqual(resPreEvents.status, 302);
    assert.strictEqual(resPreEvents.headers.get('location'), '/login');

    // 5. Valid login
    const tokenResLogin = await fetch(`${baseUrl}/api/csrf-token`);
    const tokenDataLogin = await tokenResLogin.json();
    const csrfLogin = tokenDataLogin.csrfToken;
    const cookieForLogin = extractCookie(tokenResLogin, 'connect.sid');
    assert.ok(cookieForLogin, 'Cookie for login must be present');

    const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfLogin,
        'Cookie': `connect.sid=${cookieForLogin}`
      },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert.strictEqual(resLogin.status, 200);
    const loginData = await resLogin.json();
    assert.ok(loginData.user);
    assert.strictEqual(loginData.user.email, testEmail);
    assert.strictEqual(loginData.user.password_hash, undefined);

    const cookieLogin = extractCookie(resLogin, 'connect.sid');
    assert.ok(cookieLogin, 'Authenticated session cookie must be present');
    assert.notStrictEqual(cookieLogin, cookieForLogin);

    // Verify session used for successful login can access /events (200 status and contains page content)
    const resEventsAuth = await fetch(`${baseUrl}/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      },
      redirect: 'manual'
    });
    assert.strictEqual(resEventsAuth.status, 200);
    const eventsHtml = await resEventsAuth.text();
    assert.ok(eventsHtml.includes('Upcoming Events'));
    assert.ok(eventsHtml.includes('Sign Out'));

    // Authenticated GET /api/events returns 200 and JSON array of events
    const resApiEvents = await fetch(`${baseUrl}/api/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      }
    });
    assert.strictEqual(resApiEvents.status, 200);
    const apiEventsJson = await resApiEvents.json();
    assert.ok(Array.isArray(apiEventsJson));

    // 6. CSRF rejection for state-changing request (logout without CSRF token)
    const resCsrfFail = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      }
    });
    assert.strictEqual(resCsrfFail.status, 403);

    // Confirm session still valid after failed CSRF request
    const resStillValid = await fetch(`${baseUrl}/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      },
      redirect: 'manual'
    });
    assert.strictEqual(resStillValid.status, 200);

    // 7. Successful logout
    const tokenResLogout = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      }
    });
    const tokenDataLogout = await tokenResLogout.json();
    const csrfLogout = tokenDataLogout.csrfToken;

    const resLogout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': csrfLogout,
        'Cookie': `connect.sid=${cookieLogin}`
      }
    });
    assert.strictEqual(resLogout.status, 200);

    // Verify logout cookie expiration
    const rawSetCookieLogout = extractRawSetCookie(resLogout, 'connect.sid');
    assert.ok(rawSetCookieLogout, 'Logout must send a session cookie deletion header');
    assert.strictEqual(rawSetCookieLogout.split(';')[0].trim(), 'connect.sid=');

    const expiresMatch = rawSetCookieLogout.match(/(?:^|;)\s*Expires=([^;]+)/i);
    const hasExpiredDate = expiresMatch !== null &&
      Date.parse(expiresMatch[1]) < Date.now();
    const hasZeroMaxAge = /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(rawSetCookieLogout);
    assert.ok(hasZeroMaxAge || hasExpiredDate, 'Logout cookie must be expired');

    // 8. Former authenticated cookie now receives redirect to /login for /events and 401 for /api/events
    const resPostLogoutEvents = await fetch(`${baseUrl}/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      },
      redirect: 'manual'
    });
    assert.strictEqual(resPostLogoutEvents.status, 302);
    assert.strictEqual(resPostLogoutEvents.headers.get('location'), '/login');

    const resPostLogoutApi = await fetch(`${baseUrl}/api/events`, {
      method: 'GET',
      headers: {
        'Cookie': `connect.sid=${cookieLogin}`
      }
    });
    assert.strictEqual(resPostLogoutApi.status, 401);

  } finally {
    await cleanup();
  }
});
