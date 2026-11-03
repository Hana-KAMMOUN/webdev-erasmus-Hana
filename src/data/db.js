const { Pool } = require('pg');

function validatePostgresUrl(urlStr, expectedDbName) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Database connection configuration is missing or invalid.');
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('Invalid database URL protocol.');
    }
    const pathname = parsed.pathname || '';
    const dbName = decodeURIComponent(pathname.replace(/^\//, ''));
    if (!dbName || dbName !== expectedDbName) {
      throw new Error('Invalid database name in connection string.');
    }
    if (parsed.searchParams.has('database') || parsed.searchParams.has('dbname')) {
      throw new Error('Database override query parameters are not allowed.');
    }
    return true;
  } catch {
    throw new Error('Database connection configuration is missing or invalid.');
  }
}

let devPoolConfig;

if (process.env.DATABASE_URL) {
  validatePostgresUrl(process.env.DATABASE_URL, 'clubevents');
  devPoolConfig = { connectionString: process.env.DATABASE_URL };
} else {
  if (!process.env.POSTGRES_PASSWORD) {
    throw new Error('Database configuration requires POSTGRES_PASSWORD or DATABASE_URL.');
  }
  devPoolConfig = {
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'clubevents'
  };
}

const pool = new Pool(devPoolConfig);

function createTestPool() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('Test database configuration (DATABASE_URL_TEST) is missing.');
  }
  validatePostgresUrl(testUrl, 'clubevents_test');

  if (process.env.DATABASE_URL) {
    validatePostgresUrl(process.env.DATABASE_URL, 'clubevents');
  }

  return new Pool({ connectionString: testUrl });
}

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
  createTestPool,
  validatePostgresUrl
};
