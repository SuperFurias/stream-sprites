const { Pool } = require('pg');
const path = require('path');

class PostgresDriver {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
  }

  async init() {
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.connectionString.includes('supabase') || this.connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false
    });

    // Test connection
    const client = await this.pool.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS ss_users (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        assigned_skin TEXT DEFAULT 'default'
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ss_excluded_users (
        id TEXT PRIMARY KEY,
        reason TEXT
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ss_config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ss_assets (
        path TEXT PRIMARY KEY,
        data BYTEA NOT NULL,
        mime_type TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      console.log('✓ PostgreSQL/Supabase database connected');
    } finally {
      client.release();
    }
    return this;
  }

  getRawDb() {
    return this;
  }

  // Unified query interface (matches SQLite prepare().get/.all/.run pattern)
  async query(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result;
  }

  async getUserSkin(userId) {
    try {
      const result = await this.pool.query(
        'SELECT assigned_skin FROM ss_users WHERE id = $1',
        [userId.toLowerCase()]
      );
      return result.rows.length > 0 ? result.rows[0].assigned_skin : 'default';
    } catch (e) {
      return 'default';
    }
  }

  async upsertUser(id, displayName, assignedSkin) {
    await this.pool.query(`
      INSERT INTO ss_users (id, display_name, assigned_skin)
      VALUES ($1, $2, 'default')
      ON CONFLICT (id) DO UPDATE SET display_name = $2
    `, [id.toLowerCase(), displayName]);
  }

  async assignSkin(userId, skinId) {
    await this.pool.query(`
      INSERT INTO ss_users (id, display_name, assigned_skin)
      VALUES ($1, $1, $2)
      ON CONFLICT (id) DO UPDATE SET assigned_skin = $2
    `, [userId.toLowerCase(), skinId]);
  }

  async getUser(userId) {
    const result = await this.pool.query(
      'SELECT id, display_name, assigned_skin FROM ss_users WHERE id = $1',
      [userId.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  async listUsers(limit = 100) {
    const result = await this.pool.query(
      'SELECT id, display_name, assigned_skin FROM ss_users ORDER BY id LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  async getStats() {
    const result = await this.pool.query(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE assigned_skin != 'default' AND assigned_skin IS NOT NULL) as custom
      FROM ss_users`);
    const row = result.rows[0] || { total: 0, custom: 0 };
    const total = parseInt(row.total) || 0;
    const custom = parseInt(row.custom) || 0;
    return {
      total_users: total,
      custom_skins: custom,
      default_skins: total - custom
    };
  }

  async deleteUser(userId) {
    await this.pool.query('DELETE FROM ss_users WHERE id = $1', [userId.toLowerCase()]);
  }

  async deleteAllUsers() {
    await this.pool.query('DELETE FROM ss_users');
  }

  async getExcluded(userId) {
    const result = await this.pool.query(
      'SELECT id FROM ss_excluded_users WHERE id = $1',
      [userId.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  async listExcluded(limit = 100) {
    const result = await this.pool.query(
      'SELECT id, reason FROM ss_excluded_users ORDER BY id LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  async excludeUser(userId, reason) {
    await this.pool.query(`
      INSERT INTO ss_excluded_users (id, reason)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET reason = $2
    `, [userId.toLowerCase(), reason || '']);
  }

  async unexcludeUser(userId) {
    await this.pool.query('DELETE FROM ss_excluded_users WHERE id = $1', [userId.toLowerCase()]);
  }

  async updateExclusionReason(userId, reason) {
    await this.pool.query(
      'UPDATE ss_excluded_users SET reason = $1 WHERE id = $2',
      [reason || '', userId.toLowerCase()]
    );
  }

  // Config storage (DB-backed)
  async loadConfig() {
    const result = await this.pool.query(
      "SELECT value FROM ss_config WHERE key = 'main'"
    );
    if (result.rows.length > 0) {
      return result.rows[0].value;
    }
    return null;
  }

  async saveConfig(_cfgPath, cfg) {
    await this.pool.query(`
      INSERT INTO ss_config (key, value, updated_at)
      VALUES ('main', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify(cfg)]);
  }

  // Asset storage (DB-backed blobs)
  async listAssets() {
    const result = await this.pool.query('SELECT path FROM ss_assets ORDER BY path');
    return result.rows.map(r => r.path);
  }

  async readAsset(assetPath) {
    const result = await this.pool.query(
      'SELECT data FROM ss_assets WHERE path = $1',
      [assetPath]
    );
    if (result.rows.length === 0) return null;
    return Buffer.from(result.rows[0].data);
  }

  async writeAsset(assetPath, data, mimeType) {
    await this.pool.query(`
      INSERT INTO ss_assets (path, data, mime_type, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (path) DO UPDATE SET data = $2, mime_type = $3, updated_at = NOW()
    `, [assetPath, data, mimeType || null]);
  }

  async deleteAsset(assetPath) {
    await this.pool.query('DELETE FROM ss_assets WHERE path = $1', [assetPath]);
  }

  async assetExists(assetPath) {
    const result = await this.pool.query(
      'SELECT 1 FROM ss_assets WHERE path = $1',
      [assetPath]
    );
    return result.rows.length > 0;
  }

  getType() {
    return 'postgres';
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = PostgresDriver;
