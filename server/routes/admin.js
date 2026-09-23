// 管理 API：公开路由（登录/登出/找回密码）+ 受保护路由（站点管理）
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

// ── 公开路由 ─────────────────────────────────────────────

// 登录：bcrypt 校验，建立 Session；失败统一 401，不区分用户名/密码
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  const ok = row && bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  req.session.adminId = row.id;
  res.json({ success: true });
});

// ── 受保护路由（以下全部需要登录）────────────────────────
router.use(requireAuth);

// 登出：销毁 Session（按设计文档要求需登录后才能登出）
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});

// 占位：站点管理路由在 Task 4/5 实现
router.get('/sites', (req, res) => res.json({ success: true, sites: [] }));

// Multer/解压错误统一处理（Task 4 会往这里补错误码）
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Admin]', err.message);
  res.status(500).json({ success: false, message: 'INTERNAL_ERROR' });
});

module.exports = router;