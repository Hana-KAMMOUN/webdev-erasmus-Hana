const { pool } = require('./data/db');
const { createApp } = require('./app');

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error('Error: SESSION_SECRET environment variable is missing.');
  process.exit(1);
}

const port = process.env.PORT || 3000;
const secureCookies = process.env.NODE_ENV === 'production' || process.env.CODESPACES === 'true';
const trustProxy = process.env.CODESPACES === 'true' || process.env.NODE_ENV === 'production';

const app = createApp({
  pool,
  secret: sessionSecret,
  secureCookies,
  trustProxy
});

app.listen(port, () => {
  console.log(`ClubEvents server running on port ${port}`);
});
