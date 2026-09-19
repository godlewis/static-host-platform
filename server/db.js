const Database = require('better-sqlite3');
const config = require('./config');
const fs = require('fs');
const path = require('path');

// 确保目录存在
fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

const db = new Database(config.DB_PATH);

// 启用 WAL 模式以提高并发性能
db.pragma('journal_mode = WAL');

// 初始化表结构
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );
  `);

  // 如果管理员表为空，创建默认管理员
  const existing = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (existing.count === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(config.DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare(
      'INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)'
    ).run(config.DEFAULT_ADMIN_USER, hash, 'admin@example.com');
  }

  return db;
}

module.exports = {
  initDb,
  getDb: () => db,
  db,
};
