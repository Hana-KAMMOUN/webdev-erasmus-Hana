const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../src/data/db');

async function run() {
  let client;
  let txStarted = false;

  try {
    client = await pool.connect();

    // 1. Confirm database is clubevents
    const dbRes = await client.query('SELECT current_database()');
    const dbName = dbRes.rows[0].current_database;
    if (dbName !== 'clubevents') {
      throw new Error(`Expected database clubevents, but got ${dbName}`);
    }

    // 2. Check registrations count
    const regRes = await client.query('SELECT COUNT(*) FROM registrations');
    if (parseInt(regRes.rows[0].count, 10) > 0) {
      console.warn('Warning: Registrations exist. Proceeding with temporary shift.');
    }

    // 3. Select events with precise timestamp strings
    const evRes = await client.query(
      `SELECT id, club_id, organizer_id, title, description, start_time::text AS start_time, location, capacity, seed_key, created_at::text AS created_at
       FROM events
       WHERE seed_key IN ('event-welcome', 'event-workshop', 'event-hackathon')
       ORDER BY id ASC`
    );

    const events = evRes.rows;
    if (events.length !== 3) {
      throw new Error(`Expected exactly 3 demonstration events, found ${events.length}`);
    }

    const expectedKeys = ['event-welcome', 'event-workshop', 'event-hackathon'];
    for (const ev of events) {
      if (!expectedKeys.includes(ev.seed_key)) {
        throw new Error(`Unexpected event seed_key: ${ev.seed_key}`);
      }
    }

    // 4. Create durable local backup with exclusive flag 'wx'
    const backupPath = path.join(__dirname, 'events-backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(events, null, 2), { flag: 'wx' });
    console.log(`Backup successfully created at ${backupPath}`);

    // 5. Read back and verify backup contents
    const readBack = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (!Array.isArray(readBack) || readBack.length !== 3) {
      throw new Error('Backup verification failed: invalid content.');
    }
    console.log('Backup verified successfully.');

    // 6. Begin transaction and shift events into the past
    await client.query('BEGIN');
    txStarted = true;

    for (const ev of events) {
      const updateRes = await client.query(
        `UPDATE events SET start_time = NOW() - INTERVAL '1 day' WHERE id = $1 AND seed_key = $2`,
        [ev.id, ev.seed_key]
      );
      if (updateRes.rowCount !== 1) {
        throw new Error(`Failed to update event id ${ev.id} (${ev.seed_key})`);
      }
    }

    await client.query('COMMIT');
    txStarted = false;
    console.log('Successfully shifted 3 demonstration events into the past.');
    console.log('Please verify the empty state ("No upcoming events.") at /events in your browser.');
  } catch (err) {
    if (txStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
    }
    console.error('Error during empty-state check setup:', err.message);
    process.exitCode = 1;
  } finally {
    if (client) {
      try {
        client.release();
      } catch {
        // ignore
      }
    }
    try {
      await pool.end();
    } catch {
      // ignore
    }
  }
}

run();
