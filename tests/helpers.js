const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

function useTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shp-test-'));
  process.env.PASSWORD_FILE = path.join(dir, 'creds.json');
  delete require.cache[require.resolve('../server/config')];
  return dir;
}

async function startServer() {
  // Ensure fresh credentials per test
  if (process.env.PASSWORD_FILE && fs.existsSync(process.env.PASSWORD_FILE)) {
    fs.rmSync(process.env.PASSWORD_FILE, { force: true });
  }
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

module.exports = { useTempDir, startServer, sessionCookie, login, makeZip };