// 应用工厂：构建管理端与公开端两个 Express 实例（不监听，便于测试）
const express = require('express');
const path = require('path');
const session = require('express-session');
const config = require('./config');
const { initDb } = require('./db');

function createApps() {
  initDb();

  // ── 管理端 ──────────────────────────────────────────────
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use(session({
    secret: config.SESSION_SECRET,
    name: config.SESSION_NAME,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  }));
  adminApp.use('/api', require('./routes/admin'));
  adminApp.use(express.static(config.CLIENT_DIR));
  // 单页 fallback
  adminApp.get('*', (req, res) => {
    res.sendFile(path.join(config.CLIENT_DIR, 'admin.html'));
  });

  // ── 公开端 ──────────────────────────────────────────────
  const publicApp = express();
  publicApp.use('/sites', require('./routes/public'));

  return { adminApp, publicApp };
}

module.exports = { createApps };