const crypto = require('crypto');

const PREFIX = 'scrypt$';
const KEY_LENGTH = 64;

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    // Still hash-compare to avoid leaking the length.
    const leftHash = crypto.createHash('sha256').update(left).digest();
    const rightHash = crypto.createHash('sha256').update(right).digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
  }
  return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  return `${PREFIX}${salt}$${derived.toString('hex')}`;
}

// Supports legacy plaintext passwords so existing installs keep working.
// Successful plaintext logins are upgraded to scrypt by the caller.
function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || stored.length === 0) return false;

  if (!stored.startsWith(PREFIX)) {
    return timingSafeStringEqual(password, stored);
  }

  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const actual = crypto.scryptSync(String(password), salt, KEY_LENGTH);
    return crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

function isHashedPassword(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHashedPassword
};
