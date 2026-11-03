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

    // 3. Begin transaction and perform plain INSERT
    await client.query('BEGIN');
    txStarted = true;

    const insertRes = await client.query(
      `INSERT INTO events (id, club_id, organizer_id, title, description, start_time, location, capacity, seed_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        targetBackup.id,
        targetBackup.club_id,
        targetBackup.organizer_id,
        targetBackup.title,
        targetBackup.description,
        targetBackup.start_time,
        targetBackup.location,
        targetBackup.capacity,
        targetBackup.seed_key,
        targetBackup.created_at
      ]
    );

    if (insertRes.rowCount !== 1) {
      throw new Error('Failed to insert target event.');
    }

    // 4. Read back inserted event and compare every field with targetBackup
    const verifyRes = await client.query(
      `SELECT id, club_id, organizer_id, title, description, start_time::text AS start_time, location, capacity, seed_key, created_at::text AS created_at
       FROM events WHERE id = $1 AND seed_key = $2`,
      [targetBackup.id, targetBackup.seed_key]
    );

    if (verifyRes.rows.length !== 1) {
      throw new Error('Verification query failed to find inserted event.');
    }

    const insertedEvent = verifyRes.rows[0];
    for (const key of Object.keys(targetBackup)) {
      if (insertedEvent[key] !== targetBackup[key]) {
        throw new Error(`Field mismatch for ${key} during restoration: expected ${targetBackup[key]}, got ${insertedEvent[key]}`);
      }
    }

    await client.query('COMMIT');
    txStarted = false;
    console.log('Successfully restored Weekend Hackathon (event-id 3) with exact original fields.');
  } catch (err) {
    if (txStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
    }
    console.error('Error during event restoration:', err.message);
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
