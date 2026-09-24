const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { useTempDir, startServer, login, makeZip } = require('./helpers');
const { makeRawZip } = require('./zipbuilder');

useTempDir();

async function uploadZip(adminUrl, cookie, { files, filename = 'site.zip' }) {
  const form = new FormData();
  const buf = files ? makeZip(files) : Buffer.alloc(0);
  form.append('file', new Blob([buf]), filename);
  return fetch(`${adminUrl}/api/upload`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
}

test('合法 ZIP 201，文件落盘 uploads/site/', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const res = await uploadZip(adminUrl, cookie, {
      files: { 'index.html': '<h1>hello</h1>', 'css/style.css': 'body{}' },
    });
    assert.strictEqual(res.status, 201);
    const config = require('../server/config');
    assert.ok(fs.existsSync(path.join(config.SITE_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(config.SITE_DIR, 'css', 'style.css')));
  } finally { close(); }
});

test('路径遍历 entry 400，不动 uploads/site/', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const zipBuf = makeRawZip('../evil.txt', 'pwned');
    const form = new FormData();
    form.append('file', new Blob([zipBuf]), 'evil.zip');
    const res = await fetch(`${adminUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
    const config = require('../server/config');
    assert.ok(!fs.existsSync(path.join(config.SITE_DIR, 'evil.txt')));
  } finally { close(); }
});

test('第二次上传覆盖前次内容', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'v1' } });
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'v2' } });
    const config = require('../server/config');
    assert.strictEqual(fs.readFileSync(path.join(config.SITE_DIR, 'index.html'), 'utf8'), 'v2');
  } finally { close(); }
});

test('解压失败回滚：旧内容保留', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    // First deploy a good site
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'good' } });
    // Then craft a zip with an entry whose normalized path is OK but content causes AdmZip to throw
    // Easiest: send a totally invalid (non-zip) buffer
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a zip')]), 'bad.zip');
    const res = await fetch(`${adminUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    // Multer fileFilter accepts .zip by extension only; invalid zip bytes get 400 from deployZip
    assert.ok(res.status === 400 || res.status === 500);
    const config = require('../server/config');
    assert.strictEqual(fs.readFileSync(path.join(config.SITE_DIR, 'index.html'), 'utf8'), 'good');
  } finally { close(); }
});

test('非 .zip 文件 400 INVALID_FILE_TYPE', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a zip')]), 'evil.exe');
    const res = await fetch(`${adminUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'INVALID_FILE_TYPE');
  } finally { close(); }
});

test('未登录上传 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const form = new FormData();
    form.append('file', new Blob([makeZip({ 'index.html': 'x' })]), 's.zip');
    const res = await fetch(`${adminUrl}/api/upload`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});