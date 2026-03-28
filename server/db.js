const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

function initDb(serverDir) {
  const dbDir = path.join(serverDir, 'db');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbFile = path.join(dbDir, 'sa.db');
  db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  console.log('✓ Database connected');

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    assigned_skin TEXT DEFAULT 'default'
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS excluded_users (
    id TEXT PRIMARY KEY,
    reason TEXT
  )`);

  return db;
}

function getDb() {
  return db;
}

// Get user's assigned skin from database
function getUserSkinFromDB(userId) {
  try {
    const row = db.prepare('SELECT assigned_skin FROM users WHERE id = ?').get(userId.toLowerCase());
    return row ? row.assigned_skin : 'default';
  } catch (e) {
    return 'default';
  }
}

module.exports = {
  initDb,
  getDb,
  getUserSkinFromDB
};
