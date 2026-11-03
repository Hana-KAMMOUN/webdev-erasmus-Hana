const fs = require('node:fs');
const path = require('node:path');

function validatePool(targetPool) {
  if (!targetPool || typeof targetPool.query !== 'function') {
    throw new Error('A valid database pool is required.');
  }
}

async function runMigrations(targetPool) {
  validatePool(targetPool);
  const migrationsDir = path.join(__dirname, '../../migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error('Migrations directory not found.');
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error('No migration files found.');
  }

  let client;
  let txStarted = false;
  let currentMigration = null;

  try {
    client = await targetPool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const res = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(res.rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      currentMigration = file;
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        txStarted = true;

        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );

        await client.query('COMMIT');
        txStarted = false;
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        if (txStarted) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // ignore rollback failure
          }
          txStarted = false;
        }
        const errCode = err.code || 'UNKNOWN';
        throw new Error(`Migration failed at ${file} (code: ${errCode})`);
      }
    }
  } catch (err) {
    if (err.message.includes('Migration failed at')) {
      throw err;
    }
    const errCode = err.code || 'UNKNOWN';
    const contextInfo = currentMigration ? ` while processing ${currentMigration}` : '';
    throw new Error(`Migration execution error${contextInfo} (code: ${errCode})`);
  } finally {
    if (client) {
      try {
        client.release();
      } catch {
        // ignore release error
      }
    }
  }
}

if (require.main === module) {
  const { pool } = require('./db');
  runMigrations(pool)
    .then(async () => {
      try {
        await pool.end();
      } catch {
        // ignore pool end error
      }
    })
    .catch(async (err) => {
      console.error(err.message);
      try {
        await pool.end();
      } catch {
        // ignore pool end error
      }
      process.exitCode = 1;
    });
}

module.exports = { runMigrations };
