const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDb, startServer, login, makeZip, randomSlug } = require('./helpers');
const { makeRawZip } = require('./zipbuilder');

useTempDb();

// multipart 上传辅助
async function uploadZip(adminUrl, cookie, { slug, title = '测试站', files, filename = 'site.zip' }) {
  const form = new FormData();
  form.append('title', title);
  form.append('slug', slug);
  const buf = files ? makeZip(files) : Buffer.alloc(0);
  form.append('file', new Blob([buf]), filename);
  return fetch(`${adminUrl}/api/sites`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
}

test('上传合法 ZIP 返回 201，站点入库且文件落盘', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    const res = await uploadZip(adminUrl, cookie, {
      slug,
      files: { 'index.html': '<h1>hello</h1>', 'css/style.css': 'body{}' },
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.site.slug, slug);

    // 文件确实解压到 uploads/{slug}/
    const path = require('path');
    const config = require('../server/config');
    assert.ok(require('fs').existsSync(path.join(config.UPLOAD_DIR, slug, 'index.html')));
    assert.ok(require('fs').existsSync(path.join(config.UPLOAD_DIR, slug, 'css', 'style.css')));
  } finally { close(); }
});

test('恶意 ZIP（entryName 含 ../）整包拒绝，返回 400 PATH_TRAVERSAL 且不落盘', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    // 手工构造带路径穿越 entry 的 ZIP（adm-zip 会剥离 ../，必须用 zipbuilder 写裸字节）
    const zipBuf = makeRawZip('../evil.txt', 'pwned');
    const form = new FormData();
    form.append('title', 'evil');
    form.append('slug', slug);
    form.append('file', new Blob([zipBuf]), 'evil.zip');
    const res = await fetch(`${adminUrl}/api/sites`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');

    // 目录未被创建
    const config = require('../server/config');
    assert.ok(!require('fs').existsSync(require('path').join(config.UPLOAD_DIR, slug)));
  } finally { close(); }
});

test('重复 slug 返回 409 DUPLICATE_SLUG 且不残留半解压目录', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    const first = await uploadZip(adminUrl, cookie, { slug, files: { 'index.html': 'a' } });
    assert.strictEqual(first.status, 201);
    const second = await uploadZip(adminUrl, cookie, { slug, title: '另一个', files: { 'index.html': 'b' } });
    assert.strictEqual(second.status, 409);
    assert.strictEqual((await second.json()).message, 'DUPLICATE_SLUG');
    // 原站点文件未被覆盖损坏（直接读文件系统验证）
    const html = require('fs').readFileSync(
      require('path').join(require('../server/config').UPLOAD_DIR, slug, 'index.html'), 'utf8'
    );
    assert.strictEqual(html, 'a');
  } finally { close(); }
});

test('非 .zip 文件返回 400 INVALID_FILE_TYPE', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const form = new FormData();
    form.append('title', 'x');
    form.append('slug', randomSlug());
    form.append('file', new Blob([Buffer.from('not a zip')]), 'evil.exe');
    const res = await fetch(`${adminUrl}/api/sites`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'INVALID_FILE_TYPE');
  } finally { close(); }
});

test('缺少 title/slug 返回 400 MISSING_FIELDS', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const form = new FormData();
    form.append('slug', randomSlug());
    form.append('file', new Blob([makeZip({ 'index.html': 'x' })]), 's.zip');
    const res = await fetch(`${adminUrl}/api/sites`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'MISSING_FIELDS');
  } finally { close(); }
});

test('非法 slug 字符返回 400 INVALID_SLUG', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const res = await uploadZip(adminUrl, cookie, { slug: '../bad slug!', files: { 'index.html': 'x' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'INVALID_SLUG');
  } finally { close(); }
});

test('未登录上传返回 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const form = new FormData();
    form.append('title', 'x');
    form.append('slug', randomSlug());
    form.append('file', new Blob([makeZip({ 'index.html': 'x' })]), 's.zip');
    const res = await fetch(`${adminUrl}/api/sites`, { method: 'POST', body: form });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});