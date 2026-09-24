// 管理 API：登录/登出/上传/改密
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { loadCredentials, saveCredentials, verifyPassword } = require('../credentials');
const requireAuth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deployZip } = require('../services/deploy');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  const creds = loadCredentials();
  if (username !== creds.username || !verifyPassword(password)) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  req.session.adminId = username;
  res.json({ success: true });
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  try {
    await deployZip(req.file.buffer);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.message === 'PATH_TRAVERSAL' || err.message === 'INVALID_ZIP' || err.message === 'EMPTY_ZIP') {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.put('/password', requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'INVALID_PASSWORD' });
  }
  const creds = loadCredentials();
  creds.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveCredentials(creds);
  res.json({ success: true });
});

router.use((err, req, res, next) => {
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