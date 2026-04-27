const fs = require('fs');
const path = require('path');
const SqliteDriver = require('./sqlite-driver');
const PostgresDriver = require('./postgres-driver');

let driver = null;
let storageConfig = null;

const STORAGE_CONFIG_PATH = path.join(__dirname, '..', 'storage.json');

function loadStorageConfig() {
  try {
    if (fs.existsSync(STORAGE_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(STORAGE_CONFIG_PATH, 'utf8'));
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

async function switchToPostgres(connectionString, serverDir) {
  // Test connection first
  const test = await testConnection(connectionString);
  if (!test.ok) return test;

  // Close current driver
  if (driver) await driver.close();

  // Switch
  driver = new PostgresDriver(connectionString);
  await driver.init();
  storageConfig = { type: 'postgres', connectionString };
  saveStorageConfig(storageConfig);

  console.log('✓ Switched to PostgreSQL storage');
  return { ok: true, message: 'Switched to PostgreSQL' };
}

async function switchToSqlite(serverDir) {
  if (driver) await driver.close();

  driver = new SqliteDriver(serverDir);
  await driver.init();
  storageConfig = { type: 'sqlite' };
  saveStorageConfig(storageConfig);

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
