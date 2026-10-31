const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { hashPassword, verifyPassword } = require('./lib/password');

const ACTIVE_FILE = 'active-profile.json';
const ACCOUNTS_FILE = 'accounts.db';
const PROFILES_DIR = 'profiles';
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
const MIN_PASSWORD_LENGTH = 6;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function readBasePort(configPath, fallback = 8080) {
  const cfg = readJson(configPath);
  const port = Number(cfg && cfg.serverPort);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile() && !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
    }
  }
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim() : '';
}

function validateCredentials(username, password) {
  if (!USERNAME_RE.test(username)) {
    throw new Error('Username must be 3-24 characters and use letters, numbers, _ or -.');
  }
  if (username.toLowerCase() === 'guest') {
    throw new Error('That username is reserved.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

function profileLayout(baseDir, profileId) {
  const profileDir = path.join(baseDir, PROFILES_DIR, profileId);
  return {
    profileDir,
    configPath: path.join(profileDir, 'config.json'),
    assetsDir: path.join(profileDir, 'assets'),
    storageConfigPath: path.join(profileDir, 'storage-config.json'),
    logDir: path.join(profileDir, 'logs')
  };
}

class AccountStore {
  constructor(baseDir) {
    this.baseDir = path.resolve(baseDir);
    this.profilesDir = path.join(this.baseDir, PROFILES_DIR);
    this.activePath = path.join(this.baseDir, ACTIVE_FILE);
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.mkdirSync(this.profilesDir, { recursive: true });

    this.db = new Database(path.join(this.baseDir, ACCOUNTS_FILE));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);
  }

  close() {
    try { this.db.close(); } catch (e) { /* already closed */ }
  }

  listAccounts() {
    return this.db.prepare(`
      SELECT id, username, created_at, last_login_at
      FROM accounts
      ORDER BY username COLLATE NOCASE
    `).all();
  }

  createAccount(rawUsername, password, basePort, baseAssetsDir) {
    const username = normalizeUsername(rawUsername);
    validateCredentials(username, password);

    const now = Date.now();
    const accountId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const layout = profileLayout(this.baseDir, profileId);

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO accounts (id, username, password_hash, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(accountId, username, passwordHash, now, now);
      this.db.prepare(`
        INSERT INTO profiles (id, account_id, name, created_at)
        VALUES (?, ?, ?, ?)
      `).run(profileId, accountId, 'Main', now);
    });

    transaction();

    try {
      fs.mkdirSync(path.join(layout.profileDir, 'db'), { recursive: true });
      fs.mkdirSync(layout.logDir, { recursive: true });
      copyDirectory(path.join(baseAssetsDir, 'skins'), path.join(layout.assetsDir, 'skins'));
      if (!fs.existsSync(layout.configPath)) {
        writeJsonAtomic(layout.configPath, { serverPort: basePort });
      }
    } catch (e) {
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
      try { fs.rmSync(layout.profileDir, { recursive: true, force: true }); } catch (cleanupError) { /* best effort */ }
      throw new Error(`Could not create the account profile: ${e.message}`);
    }

    return {
      id: accountId,
      username,
      profileId,
      profileName: 'Main',
      profileDir: layout.profileDir
    };
  }

  authenticate(rawUsername, password) {
    const username = normalizeUsername(rawUsername);
    if (!username || typeof password !== 'string') return null;
    const row = this.db.prepare(`
      SELECT id, username, password_hash
      FROM accounts
      WHERE username = ? COLLATE NOCASE
    `).get(username);
    if (!row || !verifyPassword(password, row.password_hash)) return null;

    const profile = this.db.prepare(`
      SELECT id, name
      FROM profiles
      WHERE account_id = ?
      ORDER BY created_at
      LIMIT 1
    `).get(row.id);
    if (!profile) return null;

    this.db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(Date.now(), row.id);
    return {
      id: row.id,
      username: row.username,
      profileId: profile.id,
      profileName: profile.name,
      profileDir: profileLayout(this.baseDir, profile.id).profileDir
    };
  }

  activeProfile() {
    return readActiveProfile(this.baseDir);
  }

  setActiveGuest() {
    const active = { type: 'guest', username: 'Guest', activatedAt: new Date().toISOString() };
    writeJsonAtomic(this.activePath, active);
    return active;
  }

  setActiveAccount(account) {
    const active = {
      type: 'account',
      accountId: account.id,
      username: account.username,
      profileId: account.profileId,
      profileName: account.profileName,
      activatedAt: new Date().toISOString()
    };
    writeJsonAtomic(this.activePath, active);
    return active;
  }

  clearActive() {
    clearActiveProfile(this.baseDir);
  }
}

function clearActiveProfile(baseDir) {
  try { fs.unlinkSync(path.join(baseDir, ACTIVE_FILE)); } catch (e) { /* already absent */ }
}

function readActiveProfile(baseDir) {
  const active = readJson(path.join(baseDir, ACTIVE_FILE));
  if (!active || (active.type !== 'guest' && active.type !== 'account')) return null;
  if (active.type === 'guest') return active;
  if (typeof active.accountId !== 'string' ||
      typeof active.profileId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(active.profileId) ||
      !fs.existsSync(profileLayout(baseDir, active.profileId).profileDir)) {
    return null;
  }
  return active;
}

function accountModeEnabled(env = process.env) {
  return env.STREAM_SPRITES_ACCOUNTS !== '0';
}

function applyProfileEnvironment(active, context) {
  const baseDir = context.baseDataDir;
  const basePort = context.basePort;
  process.env.STREAM_SPRITES_BASE_DATA_DIR = baseDir;
  process.env.STREAM_SPRITES_ACCOUNT_MODE = '1';
  process.env.STREAM_SPRITES_PORT_OVERRIDE = String(basePort);

  if (active && active.type === 'account') {
    const layout = profileLayout(baseDir, active.profileId);
    if (!fs.existsSync(layout.profileDir)) {
      throw new Error('The selected account profile no longer exists.');
    }
    fs.mkdirSync(path.join(layout.profileDir, 'db'), { recursive: true });
    fs.mkdirSync(layout.logDir, { recursive: true });
    process.env.STREAM_SPRITES_DATA_DIR = layout.profileDir;
    process.env.STREAM_SPRITES_CONFIG = layout.configPath;
    process.env.STREAM_SPRITES_ASSETS_DIR = layout.assetsDir;
    process.env.STREAM_SPRITES_STORAGE_CONFIG = layout.storageConfigPath;
    process.env.STREAM_SPRITES_LOG_DIR = layout.logDir;
    process.env.STREAM_SPRITES_ACCOUNT_PROFILE_ID = active.profileId;
    process.env.STREAM_SPRITES_ACTIVE_ACCOUNT = active.username;
    return layout;
  }

  process.env.STREAM_SPRITES_DATA_DIR = baseDir;
  process.env.STREAM_SPRITES_CONFIG = context.baseConfigPath;
  process.env.STREAM_SPRITES_ASSETS_DIR = context.baseAssetsDir;
  process.env.STREAM_SPRITES_STORAGE_CONFIG = context.baseStorageConfigPath;
  process.env.STREAM_SPRITES_LOG_DIR = context.baseLogDir;
  process.env.STREAM_SPRITES_ACCOUNT_PROFILE_ID = 'guest';
  process.env.STREAM_SPRITES_ACTIVE_ACCOUNT = 'Guest';
  return null;
}

module.exports = {
  AccountStore,
  accountModeEnabled,
  readActiveProfile,
  clearActiveProfile,
  applyProfileEnvironment,
  readBasePort,
  profileLayout
};
