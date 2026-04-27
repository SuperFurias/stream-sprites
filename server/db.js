const storage = require('./storage');

// Backward-compatible wrapper — delegates to the active storage driver

async function initDb(serverDir) {
  const driver = await storage.initStorage(serverDir);
  return driver;
}

function getDb() {
  return storage.getDriver();
}

function getUserSkinFromDB(userId) {
  const driver = storage.getDriver();
  if (!driver) return 'default';
  // Both drivers support getUserSkin synchronously (SQLite) or return promise (Postgres)
  const result = driver.getUserSkin(userId);
  if (result && typeof result.then === 'function') {
    // Async (Postgres) — return default for sync callers, actual value resolved elsewhere
    result.catch(() => {});
    return 'default';
  }
  return result;
}

module.exports = {
  initDb,
  getDb,
  getUserSkinFromDB
};
