const bcrypt = require('bcrypt');
const { findUserByEmail } = require('../data/users');

function validatePool(targetPool) {
  if (!targetPool || typeof targetPool.query !== 'function') {
    throw new Error('A valid database pool is required.');
  }
}

async function authenticateUser(email, password, targetPool) {
  validatePool(targetPool);
  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail || password.length === 0) {
    return null;
  }
  const user = await findUserByEmail(trimmedEmail, targetPool);
  if (!user) {
    return null;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

module.exports = {
  authenticateUser
};
