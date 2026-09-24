// 公开静态服务：从 uploads/site/ 提供站点文件，带路径逃逸防护
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const router = express.Router();

function resolveSafe(relativePath) {
  const basePath = path.resolve(config.SITE_DIR);
  // Strip leading / if present (Express wildcard * captures it)
  const cleanRel = (relativePath || 'index.html').replace(/^\/+/, '');
  const requestedPath = path.resolve(basePath, cleanRel);
  if (requestedPath !== basePath && !requestedPath.startsWith(basePath + path.sep)) {
    return null;
  }
  return requestedPath;
}

router.get('/', (req, res) => {
  const filePath = resolveSafe('index.html');
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

router.get(/^\/(.*)/, (req, res) => {
  const rel = req.params[0] || 'index.html';
  const filePath = resolveSafe(rel);
  if (!filePath) {
    return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

module.exports = router;