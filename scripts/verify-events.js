const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../src/data/db');

async function run() {
  let client;

  try {
    client = await pool.connect();

    // 1. Confirm database is clubevents
    const dbRes = await client.query('SELECT current_database()');
    const dbName = dbRes.rows[0].current_database;
    if (dbName !== 'clubevents') {
      throw new Error(`Expected database clubevents, but got ${dbName}`);
    }

    // 2. Read backup file
    const backupPath = path.join(__dirname, 'events-backup.json');
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at ${backupPath}`);
    }

    const backupEvents = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (!Array.isArray(backupEvents) || backupEvents.length !== 3) {
      throw new Error('Invalid backup file contents: expected 3 events.');
    }

    // 3. Query database events
    const evRes = await client.query(
      `SELECT id, seed_key, start_time::text AS start_time FROM events WHERE seed_key IN ('event-welcome', 'event-workshop', 'event-hackathon') ORDER BY id ASC`
    );
    const dbEvents = evRes.rows;
    if (dbEvents.length !== 3) {
      throw new Error(`Expected 3 events in database, found ${dbEvents.length}`);
    }

    // 4. Match and compare each record by id and seed_key
    for (const backupEv of backupEvents) {
      const match = dbEvents.find(db => db.id === backupEv.id && db.seed_key === backupEv.seed_key);
      if (!match) {
        throw new Error(`Mismatch: event with id ${backupEv.id} and seed_key ${backupEv.seed_key} not found in database.`);
      }
      if (match.start_time !== backupEv.start_time) {
        throw new Error(`Timestamp mismatch for event id ${backupEv.id} (${backupEv.seed_key}): expected ${backupEv.start_time}, got ${match.start_time}`);
      }
    }

    console.log('Verification successful: all 3 demonstration events match backup timestamps exactly.');
  } catch (err) {
    console.error('Verification failed:', err.message);
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
