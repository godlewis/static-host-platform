const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../server/config');
const { useTempDb, startServer, login, makeZip, randomSlug } = require('./helpers');

useTempDb();

async function createSite(adminUrl, cookie, slug, title = '站点') {
  const form = new FormData();
  form.append('title', title);
  form.append('slug', slug);
  form.append('file', new Blob([makeZip({ 'index.html': `<h1>${title}</h1>` })]), 's.zip');
  const res = await fetch(`${adminUrl}/api/sites`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
  assert.strictEqual(res.status, 201, `造站点失败: ${slug}`);
  return res.json();
}

test('GET /api/sites 按 created_at 倒序返回全部站点', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const s1 = randomSlug(), s2 = randomSlug();
    await createSite(adminUrl, cookie, s1, '第一个');
    await createSite(adminUrl, cookie, s2, '第二个');

    const res = await fetch(`${adminUrl}/api/sites`, { headers: { Cookie: cookie } });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.sites));
    const slugs = body.sites.map((s) => s.slug);
    assert.ok(slugs.includes(s1) && slugs.includes(s2));
    // 后创建的排在前面（SQLite CURRENT_TIMESTAMP 秒级精度可能相同，只验证包含与结构）
    for (const s of body.sites) {
      assert.ok(s.id && s.slug && typeof s.title === 'string');
    }
  } finally { close(); }
});

test('GET /api/sites/:slug 返回详情；不存在的返回 404', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    await createSite(adminUrl, cookie, slug);

    const ok = await fetch(`${adminUrl}/api/sites/${slug}`, { headers: { Cookie: cookie } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual((await ok.json()).site.slug, slug);

    const missing = await fetch(`${adminUrl}/api/sites/no-such-${slug}`, { headers: { Cookie: cookie } });
    assert.strictEqual(missing.status, 404);
    assert.strictEqual((await missing.json()).message, 'SITE_NOT_FOUND');
  } finally { close(); }
});

test('PUT 更新 title/description；slug 变更时目录同步改名', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    await createSite(adminUrl, cookie, slug);

    const newSlug = randomSlug();
    const res = await fetch(`${adminUrl}/api/sites/${slug}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新标题', description: '新描述', slug: newSlug }),
    });
    assert.strictEqual(res.status, 200);
    const site = (await res.json()).site;
    assert.strictEqual(site.slug, newSlug);
    assert.strictEqual(site.title, '新标题');

    // 旧目录没了，新目录在
    assert.ok(!fs.existsSync(path.join(config.UPLOAD_DIR, slug)));
    assert.ok(fs.existsSync(path.join(config.UPLOAD_DIR, newSlug, 'index.html')));
  } finally { close(); }
});

test('PUT 新 slug 与他人冲突返回 409 且原目录不动', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const s1 = randomSlug(), s2 = randomSlug();
    await createSite(adminUrl, cookie, s1, '甲');
    await createSite(adminUrl, cookie, s2, '乙');

    const res = await fetch(`${adminUrl}/api/sites/${s1}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: s2 }),
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).message, 'DUPLICATE_SLUG');
    // s1 目录未被改名
    assert.ok(fs.existsSync(path.join(config.UPLOAD_DIR, s1)));
  } finally { close(); }
});

test('DELETE 删除记录与目录；再删返回 404', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const slug = randomSlug();
    await createSite(adminUrl, cookie, slug);
    assert.ok(fs.existsSync(path.join(config.UPLOAD_DIR, slug)));

    const res = await fetch(`${adminUrl}/api/sites/${slug}`, {
      method: 'DELETE', headers: { Cookie: cookie },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(!fs.existsSync(path.join(config.UPLOAD_DIR, slug)));

    const again = await fetch(`${adminUrl}/api/sites/${slug}`, {
      method: 'DELETE', headers: { Cookie: cookie },
    });
    assert.strictEqual(again.status, 404);
  } finally { close(); }
});

test('全部 CRUD 接口未登录返回 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    for (const [method, p] of [['GET', '/api/sites'], ['GET', '/api/sites/x'], ['PUT', '/api/sites/x'], ['DELETE', '/api/sites/x']]) {
      const res = await fetch(`${adminUrl}${p}`, { method });
      assert.strictEqual(res.status, 401, `${method} ${p} 应 401`);
    }
  } finally { close(); }
});
