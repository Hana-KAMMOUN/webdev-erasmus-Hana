function validatePool(targetPool) {
  if (!targetPool || typeof targetPool.query !== 'function') {
    throw new Error('A valid database pool is required.');
  }
}

async function findUserByEmail(email, targetPool) {
  validatePool(targetPool);
  const result = await targetPool.query(
    'SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id, targetPool) {
  validatePool(targetPool);
  const result = await targetPool.query(
    'SELECT id, email, role, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  findUserByEmail,
  findUserById
};
