const fs = require('fs');
const path = require('path');
const SqliteDriver = require('./sqlite-driver');
const PostgresDriver = require('./postgres-driver');

let driver = null;
let storageConfig = null;

// NOTE: This filename must not be "storage.json": it would shadow the
// server/storage directory during Node module resolution and break startup.
const STORAGE_CONFIG_PATH = path.join(__dirname, '..', 'storage-config.json');
const LEGACY_STORAGE_CONFIG_PATH = path.join(__dirname, '..', 'storage.json');

function loadStorageConfig() {
  try {
    if (fs.existsSync(STORAGE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(STORAGE_CONFIG_PATH, 'utf8'));
    }

    // Migrate the old filename if it exists.
    if (fs.existsSync(LEGACY_STORAGE_CONFIG_PATH)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_STORAGE_CONFIG_PATH, 'utf8'));
      fs.writeFileSync(STORAGE_CONFIG_PATH, JSON.stringify(legacy, null, 2));
      try {
        fs.renameSync(LEGACY_STORAGE_CONFIG_PATH, `${LEGACY_STORAGE_CONFIG_PATH}.bak`);
      } catch (e) {
        console.warn('⚠ Could not rename legacy storage.json:', e.message);
      }
      return legacy;
    }
  } catch (e) {
    console.warn('⚠ Failed to load storage config:', e.message);
  }
  return { type: 'sqlite' };
}

function saveStorageConfig(config) {
  try {
    fs.writeFileSync(STORAGE_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('✗ Failed to save storage config:', e.message);
  }
}

async function initStorage(serverDir) {
  storageConfig = loadStorageConfig();

  if (storageConfig.type === 'postgres' && storageConfig.connectionString) {
    console.log('→ Connecting to PostgreSQL/Supabase...');
    driver = new PostgresDriver(storageConfig.connectionString);
    try {
      await driver.init();
    } catch (e) {
      console.error('✗ PostgreSQL connection failed:', e.message);
      console.log('→ Falling back to SQLite');
      driver = new SqliteDriver(serverDir);
      await driver.init();
      storageConfig.type = 'sqlite';
    }
  } else {
    driver = new SqliteDriver(serverDir);
    await driver.init();
  }

  return driver;
}

function getDriver() {
  return driver;
}

function getStorageConfig() {
  return storageConfig;
}

function getStorageType() {
  return driver ? driver.getType() : 'sqlite';
}

async function testConnection(connectionString) {
  const testDriver = new PostgresDriver(connectionString);
  try {
    await testDriver.init();
    await testDriver.close();
    return { ok: true, message: 'Connection successful' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function reopenPreviousDriver(serverDir, previousConfig) {
  try {
    if (previousConfig?.type === 'postgres' && previousConfig.connectionString) {
      const previous = new PostgresDriver(previousConfig.connectionString);
      await previous.init();
      return previous;
    }
  } catch (e) {
    console.warn('⚠ Could not reopen previous PostgreSQL driver:', e.message);
  }
  const sqlite = new SqliteDriver(serverDir);
  await sqlite.init();
  return sqlite;
}

async function switchToPostgres(connectionString, serverDir) {
  // Test connection first
  const test = await testConnection(connectionString);
  if (!test.ok) return test;

  const previousConfig = storageConfig;

  // Close current driver
  try {
    if (driver) await driver.close();
  } catch (e) {
    console.warn('⚠ Error closing previous storage driver:', e.message);
  }

  // Switch, restoring the previous backend if initialization fails
  const next = new PostgresDriver(connectionString);
  try {
    await next.init();
    driver = next;
    storageConfig = { type: 'postgres', connectionString };
    saveStorageConfig(storageConfig);
  } catch (e) {
    try { await next.close(); } catch (closeError) { /* ignore */ }
    driver = await reopenPreviousDriver(serverDir, previousConfig);
    storageConfig = previousConfig || { type: 'sqlite' };
    saveStorageConfig(storageConfig);
    throw e;
  }

  console.log('✓ Switched to PostgreSQL storage');
  return { ok: true, message: 'Switched to PostgreSQL' };
}

async function switchToSqlite(serverDir) {
  const previousConfig = storageConfig;

  try {
    if (driver) await driver.close();
  } catch (e) {
    console.warn('⚠ Error closing previous storage driver:', e.message);
  }

  const next = new SqliteDriver(serverDir);
  try {
    await next.init();
    driver = next;
    storageConfig = { type: 'sqlite' };
    saveStorageConfig(storageConfig);
  } catch (e) {
    try { await next.close(); } catch (closeError) { /* ignore */ }
    driver = await reopenPreviousDriver(serverDir, previousConfig);
    storageConfig = previousConfig || { type: 'sqlite' };
    saveStorageConfig(storageConfig);
    throw e;
  }

  console.log('✓ Switched to SQLite storage');
  return { ok: true, message: 'Switched to SQLite' };
}

module.exports = {
  initStorage,
  getDriver,
  getStorageConfig,
  getStorageType,
  testConnection,
  switchToPostgres,
  switchToSqlite,
  saveStorageConfig,
  loadStorageConfig
};
