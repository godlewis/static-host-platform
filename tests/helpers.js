// 测试辅助：用临时 DB 启动双端口服务（随机端口）
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// 注意：必须在 require('../server/config') 之前设置，config 模块加载时即读取
function useTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shp-test-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  return dir;
}

async function startServer() {
  const { createApps } = require('../server/app');
  const { adminApp, publicApp } = createApps();
  const adminServer = adminApp.listen(0, '127.0.0.1');
  const publicServer = publicApp.listen(0, '127.0.0.1');
  await new Promise((r) => { adminServer.once('listening', r); });
  return {
    adminUrl: `http://127.0.0.1:${adminServer.address().port}`,
    publicUrl: `http://127.0.0.1:${publicServer.address().port}`,
    close: () => { adminServer.close(); publicServer.close(); },
  };
}

// 从 fetch 响应提取会话 cookie（Node 20 fetch 不自动管理 cookie）
function sessionCookie(res) {
  const cookies = res.headers.getSetCookie();
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function login(adminUrl) {
  const res = await fetch(`${adminUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  return sessionCookie(res);
}

function makeZip(files) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  }
  return zip.toBuffer();
}

module.exports = { useTempDb, startServer, sessionCookie, login, makeZip, randomSlug: () => 'site-' + crypto.randomBytes(4).toString('hex') };