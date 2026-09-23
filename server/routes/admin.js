// 管理 API：公开路由（登录/登出/找回密码）+ 受保护路由（站点管理）
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');
const upload = require('../middleware/upload');
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

// 上传新站点：ZIP 校验 → 解压 → 入库
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

router.post('/sites', upload.single('file'), (req, res, next) => {
  const { title, slug } = req.body || {};
  if (!title || !slug || !req.file) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ success: false, message: 'INVALID_SLUG' });
  }

  // 解压前逐个校验 entry 路径安全（必须在任何解压动作之前完成整包校验）
  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'INVALID_ZIP' });
  }
  for (const entry of zip.getEntries()) {
    const normalized = path.normalize(entry.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
    }
  }

  // 预检：slug 已存在直接拒绝，避免覆盖已有文件
  if (db.prepare('SELECT 1 FROM sites WHERE slug = ?').get(slug)) {
    return res.status(409).json({ success: false, message: 'DUPLICATE_SLUG' });
  }

  const dest = path.join(config.UPLOAD_DIR, slug);
  const createdDir = !fs.existsSync(dest);
  fs.mkdirSync(dest, { recursive: true });
  try {
    zip.extractAllTo(dest, true);
  } catch (e) {
    // 解压失败回滚：半解压目录不落盘
    if (createdDir) fs.rmSync(dest, { recursive: true, force: true });
    return next(e);
  }

  let site;
  try {
    site = db.prepare('INSERT INTO sites (slug, title, description) VALUES (?, ?, ?)')
      .run(slug, title, req.body.description || '');
  } catch (e) {
    // 极端并发下两请求都通过预检：唯一约束兜底，仅回滚本请求新建的目录
    if (String(e.message).includes('UNIQUE')) {
      if (createdDir) fs.rmSync(dest, { recursive: true, force: true });
      return res.status(409).json({ success: false, message: 'DUPLICATE_SLUG' });
    }
    if (createdDir) fs.rmSync(dest, { recursive: true, force: true });
    return next(e);
  }

  const created = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.lastInsertRowid);
  res.status(201).json({ success: true, site: created });
});

// Multer 与上传校验错误统一处理
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, message: 'INVALID_FILE_TYPE' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'FILE_TOO_LARGE' });
  }
  console.error('[Admin]', err.message);
  res.status(500).json({ success: false, message: 'INTERNAL_ERROR' });
});

module.exports = router;