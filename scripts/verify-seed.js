const { execFileSync } = require('node:child_process');
const { pool } = require('../src/data/db');

async function verifySeed() {
  let snapshot1;
  try {
    const usersRes = await pool.query('SELECT id, email, role, password_hash FROM users ORDER BY id');
    const clubsRes = await pool.query('SELECT id, name, description, seed_key FROM clubs ORDER BY id');
    const eventsRes = await pool.query('SELECT id, club_id, organizer_id, seed_key, title, description, start_time, location, capacity FROM events ORDER BY id');
    snapshot1 = {
      users: usersRes.rows,
      clubs: clubsRes.rows,
      events: eventsRes.rows
    };
  } catch {
    throw new Error('Failed to capture initial data snapshot.');
  }

  if (snapshot1.users.length !== 2) {
    throw new Error('Verification failed: expected 2 users.');
  }
  const member = snapshot1.users.find(u => u.email === 'member@club.test');
  const organizer = snapshot1.users.find(u => u.email === 'organizer@club.test');
  if (!member || member.role !== 'member' || !organizer || organizer.role !== 'organizer') {
    throw new Error('Verification failed: expected member and organizer demonstration users.');
  }

  if (snapshot1.clubs.length !== 1 || snapshot1.clubs[0].seed_key !== 'club-main') {
    throw new Error('Verification failed: expected 1 club with seed_key club-main.');
  }

  if (snapshot1.events.length !== 3) {
    throw new Error('Verification failed: expected 3 events.');
  }

  const expectedEventKeys = ['event-welcome', 'event-workshop', 'event-hackathon'];
  const now = Date.now();
  for (const ev of snapshot1.events) {
    if (ev.organizer_id !== organizer.id || ev.club_id !== snapshot1.clubs[0].id) {
      throw new Error('Verification failed: event ownership mismatch.');
    }
    if (!expectedEventKeys.includes(ev.seed_key)) {
      throw new Error('Verification failed: unexpected event seed key.');
    }
    const eventTime = new Date(ev.start_time).getTime();
    if (isNaN(eventTime) || eventTime <= now) {
      throw new Error('Verification failed: event start time is not strictly in the future.');
    }
  }

  try {
    execFileSync('npm', ['run', 'db:seed'], { stdio: 'inherit', shell: false });
  } catch {
    throw new Error('Second seed execution failed.');
  }

  let snapshot2;
  try {
    const usersRes2 = await pool.query('SELECT id, email, role, password_hash FROM users ORDER BY id');
    const clubsRes2 = await pool.query('SELECT id, name, description, seed_key FROM clubs ORDER BY id');
    const eventsRes2 = await pool.query('SELECT id, club_id, organizer_id, seed_key, title, description, start_time, location, capacity FROM events ORDER BY id');
    snapshot2 = {
      users: usersRes2.rows,
      clubs: clubsRes2.rows,
      events: eventsRes2.rows
    };
  } catch {
    throw new Error('Failed to capture second data snapshot.');
  }

  if (snapshot1.users.length !== snapshot2.users.length ||
      snapshot1.clubs.length !== snapshot2.clubs.length ||
      snapshot1.events.length !== snapshot2.events.length) {
    throw new Error('Verification failed: snapshot lengths differ after second seed.');
  }

  for (let i = 0; i < snapshot1.users.length; i++) {
    const u1 = snapshot1.users[i];
    const u2 = snapshot2.users[i];
    if (u1.id !== u2.id || u1.email !== u2.email || u1.role !== u2.role) {
      throw new Error('Verification failed: user record mismatch.');
    }
    const hashesEqual = u1.password_hash === u2.password_hash;
    console.log(`User password hash unchanged: ${hashesEqual}`);
    if (!hashesEqual) {
      throw new Error('Verification failed: user password hash changed.');
    }
  }

  for (let i = 0; i < snapshot1.clubs.length; i++) {
    const c1 = snapshot1.clubs[i];
    const c2 = snapshot2.clubs[i];
    if (c1.id !== c2.id || c1.name !== c2.name || c1.description !== c2.description || c1.seed_key !== c2.seed_key) {
      throw new Error('Verification failed: club record mismatch.');
    }
  }

  for (let i = 0; i < snapshot1.events.length; i++) {
    const e1 = snapshot1.events[i];
    const e2 = snapshot2.events[i];
    if (e1.id !== e2.id ||
        e1.club_id !== e2.club_id ||
        e1.organizer_id !== e2.organizer_id ||
        e1.seed_key !== e2.seed_key ||
        e1.title !== e2.title ||
        e1.description !== e2.description ||
        e1.location !== e2.location ||
        e1.capacity !== e2.capacity ||
        new Date(e1.start_time).getTime() !== new Date(e2.start_time).getTime()) {
      throw new Error('Verification failed: event record mismatch.');
    }
  }

  console.log('Seed verification passed successfully: idempotency and data integrity confirmed.');
}

if (require.main === module) {
  (async () => {
    try {
      await verifySeed();
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    } finally {
      try {
        await pool.end();
      } catch {
        // ignore pool end error
      }
    }
  })();
}

module.exports = { verifySeed };
