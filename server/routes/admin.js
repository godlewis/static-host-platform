// 管理 API：公开路由（登录/登出/找回密码）+ 受保护路由（站点管理）
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');
const { sendResetEmail } = require('../email');

const router = express.Router();

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

// 找回密码：生成令牌并尝试发邮件；无论邮箱是否存在都返回 200（防枚举）
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (admin) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + config.RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reset_tokens (email, token, expires_at) VALUES (?, ?, ?)')
      .run(email, token, expiresAt);
    await sendResetEmail(email, token, `http://localhost:${config.ADMIN_PORT}`);
  }
  res.json({ success: true });
});

// 重置密码：校验令牌（存在 + 未过期 + 邮箱匹配）→ 更新密码 → 删除令牌
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  const row = db.prepare('SELECT * FROM reset_tokens WHERE token = ?').get(token);
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ success: false, message: 'INVALID_TOKEN' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
    .run(hash, row.email);
  db.prepare('DELETE FROM reset_tokens WHERE token = ?').run(token);
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