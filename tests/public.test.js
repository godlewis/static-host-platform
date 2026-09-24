const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const { useTempDir, startServer, login, makeZip } = require('./helpers');

useTempDir();

async function upload(adminUrl, cookie, files) {
  const form = new FormData();
  form.append('file', new Blob([makeZip(files)]), 's.zip');
  const res = await fetch(`${adminUrl}/api/upload`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
  assert.strictEqual(res.status, 201);
}

function rawGet(base, rawPath) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: u.hostname, port: u.port, path: rawPath, method: 'GET',
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('GET / 返回 uploads/site/index.html', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, {
      'index.html': '<h1>home</h1>',
      'about.html': '<h1>about</h1>',
      'assets/app.js': 'console.log(1)',
    });
    const res = await fetch(`${publicUrl}/`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/html; charset=UTF-8');
    assert.strictEqual(await res.text(), '<h1>home</h1>');
  } finally { close(); }
});

test('GET /<file> 返对应文件', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, {
      'index.html': '<h1>home</h1>',
      'about.html': '<h1>about</h1>',
    });
    const html = await fetch(`${publicUrl}/about.html`);
    assert.strictEqual(html.status, 200);
    assert.strictEqual(await html.text(), '<h1>about</h1>');
  } finally { close(); }
});

test('URL 编码路径遍历 400', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, { 'index.html': 'x' });
    const res = await fetch(`${publicUrl}/%2e%2e%2fserver%2fconfig.js`);
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
  } finally { close(); }
});

test('普通 ../ 路径遍历 400', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, { 'index.html': 'x' });
    const res = await rawGet(publicUrl, '/../package.json');
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
  } finally { close(); }
});

test('空 uploads/site/ 根路径 404 SITE_NOT_FOUND', async () => {
  const { publicUrl, close } = await startServer();
  try {
    const res = await fetch(`${publicUrl}/`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).message, 'SITE_NOT_FOUND');
  } finally { close(); }
});

test('index.html 不存在但其他文件存在时：子路径 200，根路径 404', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, { 'page.html': '<h1>page</h1>' });
    const root = await fetch(`${publicUrl}/`);
    assert.strictEqual(root.status, 404);
    const page = await fetch(`${publicUrl}/page.html`);
    assert.strictEqual(page.status, 200);
    assert.strictEqual(await page.text(), '<h1>page</h1>');
  } finally { close(); }
});

test('匿名访问公开端口成功（无 session 要求）', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await upload(adminUrl, cookie, { 'index.html': 'anon' });
    const res = await fetch(`${publicUrl}/`);
    assert.strictEqual(res.status, 200);
  } finally { close(); }
});