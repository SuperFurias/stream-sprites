const storage = require('./storage/index');

// Backward-compatible wrapper — delegates to the active storage driver

async function initDb(serverDir) {
  const driver = await storage.initStorage(serverDir);
  return driver;
}

function getDb() {
  return storage.getDriver();
}

async function getUserSkinFromDB(userId) {
  const driver = storage.getDriver();
  if (!driver) return 'default';
  try {
    return await driver.getUserSkin(userId);
  } catch (e) {
    return 'default';
  }
}

module.exports = {
  initDb,
  getDb,
  getUserSkinFromDB
};
