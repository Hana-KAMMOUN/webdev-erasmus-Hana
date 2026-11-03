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

test('Events integration tests: AC-1, AC-11, AC-12, AC-14', async () => {
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

    const dbRes = await testPool.query('SELECT current_database()');
    assert.strictEqual(dbRes.rows[0].current_database, 'clubevents_test');

    await runMigrations(testPool);

    // Clean test tables (events, registrations, users, clubs)
    await testPool.query('DELETE FROM registrations');
    await testPool.query('DELETE FROM events');
    await testPool.query('DELETE FROM clubs');
    await testPool.query('DELETE FROM users');

    // Create test user
    const testEmail = 'member@club.test';
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const userRes = await testPool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [testEmail, passwordHash, 'member']
    );
    const userId = userRes.rows[0].id;

    // Create test organizer
    const organizerRes = await testPool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      ['organizer@club.test', passwordHash, 'organizer']
    );
    const organizerId = organizerRes.rows[0].id;

    // Create club
    const clubRes = await testPool.query(
      'INSERT INTO clubs (name, description, seed_key) VALUES ($1, $2, $3) RETURNING id',
      ['Test Club', 'Test Club Description', 'club-test']
    );
    const clubId = clubRes.rows[0].id;

    const app = createApp({
      pool: testPool,
      secret: 'test-session-secret-events-12345',
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

    // 1. Unauthenticated request to GET /api/events returns 401 (AC-11)
    const resUnauth = await fetch(`${baseUrl}/api/events`);
    assert.strictEqual(resUnauth.status, 401);

    // Login user
    const tokenRes = await fetch(`${baseUrl}/api/csrf-token`);
    const tokenData = await tokenRes.json();
    const cookie = extractCookie(tokenRes, 'connect.sid');

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': tokenData.csrfToken,
        'Cookie': `connect.sid=${cookie}`
      },
      body: JSON.stringify({ email: testEmail, password: 'Password123!' })
    });
    assert.strictEqual(loginRes.status, 200);
    const sessionCookie = extractCookie(loginRes, 'connect.sid');

    // 2. Empty events list returns 200 and empty array
    const resEmpty = await fetch(`${baseUrl}/api/events`, {
      headers: { 'Cookie': `connect.sid=${sessionCookie}` }
    });
    assert.strictEqual(resEmpty.status, 200);
    const emptyJson = await resEmpty.json();
    assert.deepStrictEqual(emptyJson, []);

    // 3. Insert past event, future event 2, future event 1 (same time, different id), and check filtering and ordering (AC-1)
    await testPool.query(
      `INSERT INTO events (club_id, organizer_id, title, description, start_time, location, capacity, seed_key)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 day', $5, $6, $7)`,
      [clubId, organizerId, 'Past Event', 'Desc', 'Loc', 30, 'past-1']
    );

    const ev2Res = await testPool.query(
      `INSERT INTO events (club_id, organizer_id, title, description, start_time, location, capacity, seed_key)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 days', $5, $6, $7) RETURNING id`,
      [clubId, organizerId, 'Future Later', 'Desc', 'Loc 2', 20, 'future-2']
    );
    const ev2Id = ev2Res.rows[0].id;

    const ev1Res = await testPool.query(
      `INSERT INTO events (club_id, organizer_id, title, description, start_time, location, capacity, seed_key)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 days', $5, $6, $7) RETURNING id`,
      [clubId, organizerId, 'Future Sooner', 'Desc', 'Loc 1', 25, 'future-1']
    );
    const ev1Id = ev1Res.rows[0].id;

    const resFuture = await fetch(`${baseUrl}/api/events`, {
      headers: { 'Cookie': `connect.sid=${sessionCookie}` }
    });
    assert.strictEqual(resFuture.status, 200);
    const events = await resFuture.json();
    assert.strictEqual(events.length, 2);
    // Ordered by start_time ASC: Future Sooner first, then Future Later
    assert.strictEqual(events[0].id, ev1Id);
    assert.strictEqual(events[1].id, ev2Id);
    assert.strictEqual(events[0].available_places, 25);

    // Add a registration to Future Sooner and check available places decreases
    await testPool.query(
      'INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)',
      [userId, ev1Id]
    );

    const resReg = await fetch(`${baseUrl}/api/events`, {
      headers: { 'Cookie': `connect.sid=${sessionCookie}` }
    });
    const eventsReg = await resReg.json();
    assert.strictEqual(eventsReg[0].available_places, 24);

    // 4. Deleting one event directly from DB removes it from GET /api/events (AC-14)
    await testPool.query('DELETE FROM events WHERE id = $1', [ev2Id]);
    const resDeleted = await fetch(`${baseUrl}/api/events`, {
      headers: { 'Cookie': `connect.sid=${sessionCookie}` }
    });
    const eventsDeleted = await resDeleted.json();
    assert.strictEqual(eventsDeleted.length, 1);
    assert.strictEqual(eventsDeleted[0].id, ev1Id);

  } finally {
    await cleanup();
  }
});
