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

    // 2. Read backup file
    const backupPath = path.join(__dirname, 'events-backup.json');
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found at ${backupPath}`);
    }

    const backupEvents = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (!Array.isArray(backupEvents) || backupEvents.length !== 3) {
      throw new Error('Invalid backup file contents.');
    }

    // 3. Begin transaction and restore start times
    await client.query('BEGIN');
    txStarted = true;

    for (const ev of backupEvents) {
      const updateRes = await client.query(
        `UPDATE events SET start_time = $1 WHERE id = $2 AND seed_key = $3`,
        [ev.start_time, ev.id, ev.seed_key]
      );
      if (updateRes.rowCount !== 1) {
        throw new Error(`Failed to restore event id ${ev.id} (${ev.seed_key})`);
      }
    }

    await client.query('COMMIT');
    txStarted = false;
    console.log('Successfully restored all 3 demonstration events to their original start times.');
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
