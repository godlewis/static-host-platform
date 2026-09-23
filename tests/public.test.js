// 公开静态文件服务测试
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { useTempDb, startServer, login, makeZip, randomSlug } = require('./helpers');

useTempDb();

// Node 20 的 undici fetch 会用 URL 构造器规范化 ../ 段，
// 真实的恶意请求（代理 / 旧客户端 / raw HTTP）仍可能原样发出。
// 该 helper 用 http 模块保留原路径发送（不经过 URL 构造器）。
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

async function setup(adminUrl) {
  const cookie = await login(adminUrl);
  const slug = randomSlug();
  const form = new FormData();
  form.append('title', '演示站');
  form.append('slug', slug);
  form.append('file', new Blob([makeZip({
    'index.html': '<h1>home</h1>',
    'about.html': '<h1>about</h1>',
    'assets/app.js': 'console.log(1)',
  })]), 's.zip');
  const res = await fetch(`${adminUrl}/api/sites`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
  assert.strictEqual(res.status, 201);
  return slug;
}

test('GET /sites/:slug 默认返回 index.html', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const slug = await setup(adminUrl);
    const res = await fetch(`${publicUrl}/sites/${slug}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/html; charset=UTF-8');
    assert.strictEqual(await res.text(), '<h1>home</h1>');
  } finally { close(); }
});

test('GET /sites/:slug/子路径 返回对应文件，Content-Type 正确', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const slug = await setup(adminUrl);
    const html = await fetch(`${publicUrl}/sites/${slug}/about.html`);
    assert.strictEqual(html.status, 200);
    assert.strictEqual(await html.text(), '<h1>about</h1>');

    const js = await fetch(`${publicUrl}/sites/${slug}/assets/app.js`);
    assert.strictEqual(js.status, 200);
    assert.ok(js.headers.get('content-type').includes('javascript'));
  } finally { close(); }
});

test('URL 编码的路径遍历被拦截，返回 400 PATH_TRAVERSAL', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    await setup(adminUrl);
    const res = await fetch(`${publicUrl}/sites/x/%2e%2e%2f%2e%2e%2fserver%2fconfig.js`);
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
  } finally { close(); }
});

test('普通 ../ 遍历被拦截', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    await setup(adminUrl);
    const res = await rawGet(publicUrl, '/sites/x/../../package.json');
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
  } finally { close(); }
});

test('不存在的站点/文件返回 404 SITE_NOT_FOUND', async () => {
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const slug = await setup(adminUrl);
    const noSite = await fetch(`${publicUrl}/sites/never-exists`);
    assert.strictEqual(noSite.status, 404);
    assert.strictEqual((await noSite.json()).message, 'SITE_NOT_FOUND');

    const noFile = await fetch(`${publicUrl}/sites/${slug}/nope.html`);
    assert.strictEqual(noFile.status, 404);
  } finally { close(); }
});