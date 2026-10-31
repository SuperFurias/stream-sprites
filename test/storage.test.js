const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SqliteDriver = require('../server/storage/sqlite-driver');

function makeTempDir() {
  const root = path.join(__dirname, '..', 'Temp');
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, 'sqlite-test-'));
}

test('SQLite upsert and skin assignment preserve display names', async () => {
  const dir = makeTempDir();
  const driver = new SqliteDriver(dir);
  try {
    await driver.init();
    await driver.upsertUser('TestUser', 'TestUser');
    await driver.upsertUser('TestUser', 'TestUserRenamed');
    assert.equal((await driver.getUser('testuser')).display_name, 'TestUserRenamed');

    await driver.assignSkin('TestUser', 'kitty');
    const user = await driver.getUser('testuser');
    assert.equal(user.display_name, 'TestUserRenamed');
    assert.equal(user.assigned_skin, 'kitty');
    assert.equal(driver.getUserSkin('testuser'), 'kitty');

    await driver.upsertUser('TestUser', 'TestUser');
    assert.equal((await driver.getUser('testuser')).assigned_skin, 'kitty');
  } finally {
    await driver.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
