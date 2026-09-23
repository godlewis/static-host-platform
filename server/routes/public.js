// 公开静态服务：从 uploads/{slug}/ 提供站点文件，带路径逃逸防护
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

// 路径安全：resolve 后必须仍位于站点目录内
function resolveSafe(slug, relativePath) {
  const basePath = path.resolve(config.UPLOAD_DIR, slug);
  const requestedPath = path.resolve(basePath, relativePath);
  if (requestedPath !== basePath && !requestedPath.startsWith(basePath + path.sep)) {
    return null;
  }
  return requestedPath;
}

// 根路径 → index.html
router.get('/:slug', (req, res) => {
  const filePath = resolveSafe(req.params.slug, 'index.html');
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

// 子路径文件
router.get('/:slug/*', (req, res) => {
  const filePath = resolveSafe(req.params.slug, req.params[0] || 'index.html');
  if (!filePath) {
    return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

module.exports = router;
