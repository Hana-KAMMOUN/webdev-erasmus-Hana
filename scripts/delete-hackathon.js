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

    // 2. Read backup file and locate event-hackathon (id 3)
    const backupPath = path.join(__dirname, 'events-backup.json');
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at ${backupPath}`);
    }

    const backupEvents = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const targetBackup = backupEvents.find(ev => ev.seed_key === 'event-hackathon');
    if (!targetBackup) {
      throw new Error('event-hackathon not found in backup file.');
    }

    // 3. Verify event exists in DB and matches backup exactly
    const dbResEvent = await client.query(
      `SELECT id, club_id, organizer_id, title, description, start_time::text AS start_time, location, capacity, seed_key, created_at::text AS created_at
       FROM events WHERE id = $1 AND seed_key = $2`,
      [targetBackup.id, targetBackup.seed_key]
    );

    if (dbResEvent.rows.length !== 1) {
      throw new Error('Target event not found in database.');
    }

    const dbEvent = dbResEvent.rows[0];
    for (const key of Object.keys(targetBackup)) {
      if (dbEvent[key] !== targetBackup[key]) {
        throw new Error(`Field mismatch for ${key}: expected ${targetBackup[key]}, got ${dbEvent[key]}`);
      }
    }

    // 4. Verify zero registrations for this event
    const regRes = await client.query(
      'SELECT COUNT(*) FROM registrations WHERE event_id = $1',
      [targetBackup.id]
    );
    const regCount = parseInt(regRes.rows[0].count, 10);
    if (regCount > 0) {
      throw new Error(`Cannot delete event: found ${regCount} registrations.`);
    }

    // 5. Delete event within transaction
    await client.query('BEGIN');
    txStarted = true;

    const delRes = await client.query(
      'DELETE FROM events WHERE id = $1 AND seed_key = $2',
      [targetBackup.id, targetBackup.seed_key]
    );
    if (delRes.rowCount !== 1) {
      throw new Error('Failed to delete target event.');
    }

    await client.query('COMMIT');
    txStarted = false;
    console.log('Successfully deleted Weekend Hackathon (event-id 3) from database.');
    console.log('Please verify in your browser at /events that Weekend Hackathon is removed.');
  } catch (err) {
    if (txStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
    }
    console.error('Error during event deletion:', err.message);
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
