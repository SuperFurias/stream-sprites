const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword, isHashedPassword } = require('../server/lib/password');

test('passwords are stored as salted scrypt hashes', () => {
  const first = hashPassword('correct horse battery staple');
  const second = hashPassword('correct horse battery staple');

  assert.equal(isHashedPassword(first), true);
  assert.notEqual(first, second, 'each hash must use a fresh salt');
  assert.equal(first.includes('correct horse'), false);
  assert.equal(verifyPassword('correct horse battery staple', first), true);
  assert.equal(verifyPassword('wrong password', first), false);
});

test('legacy plaintext passwords still verify and can be upgraded', () => {
  assert.equal(verifyPassword('legacy-password', 'legacy-password'), true);
  assert.equal(verifyPassword('wrong', 'legacy-password'), false);
  assert.equal(isHashedPassword('legacy-password'), false);
  assert.equal(verifyPassword('anything', ''), false);
  assert.equal(verifyPassword('anything', 'scrypt$bad'), false);
  assert.equal(verifyPassword('anything', 'scrypt$abc$def'), false);
});
