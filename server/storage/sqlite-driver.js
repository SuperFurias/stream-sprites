const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class SqliteDriver {
  constructor(serverDir) {
    this.serverDir = serverDir;
    this.db = null;
  }

  async init() {
    const dbDir = path.join(this.serverDir, 'db');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'sa.db');
    this.db = new Database(dbFile);
    this.db.pragma('journal_mode = WAL');
    console.log('✓ SQLite database connected');

    this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      assigned_skin TEXT DEFAULT 'default'
    )`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS excluded_users (
      id TEXT PRIMARY KEY,
      reason TEXT
    )`);
    return this.db;
  }

  getRawDb() {
    return this.db;
  }

  getUserSkin(userId) {
    try {
      const row = this.db.prepare('SELECT assigned_skin FROM users WHERE id = ?').get(userId.toLowerCase());
      return row ? row.assigned_skin : 'default';
    } catch (e) {
      return 'default';
    }
  }

  async upsertUser(id, displayName, assignedSkin) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO users (id, display_name, assigned_skin)
      VALUES (?, ?, COALESCE((SELECT assigned_skin FROM users WHERE id = ?), 'default'))
    `);
    stmt.run(id.toLowerCase(), displayName, id.toLowerCase());
  }

  async assignSkin(userId, skinId) {
    this.db.prepare('INSERT OR REPLACE INTO users (id, display_name, assigned_skin) VALUES (?,?,?)')
      .run(userId.toLowerCase(), userId.toLowerCase(), skinId);
  }

  async getUser(userId) {
    return this.db.prepare('SELECT id, display_name, assigned_skin FROM users WHERE id = ?').get(userId.toLowerCase());
  }

  async listUsers(limit = 100) {
    return this.db.prepare('SELECT id, display_name, assigned_skin FROM users ORDER BY id LIMIT ?').all(limit);
  }

  async getStats() {
    const row = this.db.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN assigned_skin != 'default' AND assigned_skin IS NOT NULL THEN 1 ELSE 0 END) as custom
      FROM users`).get();
    const result = row || { total: 0, custom: 0 };
    return {
      total_users: result.total || 0,
      custom_skins: result.custom || 0,
      default_skins: (result.total || 0) - (result.custom || 0)
    };
  }

  async deleteUser(userId) {
    this.db.prepare('DELETE FROM users WHERE id=?').run(userId.toLowerCase());
  }

  async deleteAllUsers() {
    this.db.prepare('DELETE FROM users').run();
  }

  async getExcluded(userId) {
    return this.db.prepare('SELECT id FROM excluded_users WHERE id = ?').get(userId.toLowerCase());
  }

  async listExcluded(limit = 100) {
    return this.db.prepare('SELECT id, reason FROM excluded_users ORDER BY id LIMIT ?').all(limit);
  }

  async excludeUser(userId, reason) {
    this.db.prepare('INSERT OR REPLACE INTO excluded_users (id, reason) VALUES (?,?)')
      .run(userId.toLowerCase(), reason || '');
  }

  async unexcludeUser(userId) {
    this.db.prepare('DELETE FROM excluded_users WHERE id=?').run(userId.toLowerCase());
  }

  async updateExclusionReason(userId, reason) {
    this.db.prepare('UPDATE excluded_users SET reason = ? WHERE id = ?')
      .run(reason || '', userId.toLowerCase());
  }

  // Config storage (file-based for SQLite mode)
  async loadConfig(cfgPath) {
    if (!fs.existsSync(cfgPath)) return null;
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }

  async saveConfig(cfgPath, cfg) {
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  }

  // Asset storage (filesystem for SQLite mode)
  async listAssets(assetsDir) {
    if (!assetsDir || !fs.existsSync(assetsDir)) return [];
    return fs.readdirSync(assetsDir);
  }

  async readAsset(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  async writeAsset(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data);
  }

  async deleteAsset(filePath) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async assetExists(filePath) {
    return fs.existsSync(filePath);
  }

  getType() {
    return 'sqlite';
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = SqliteDriver;
