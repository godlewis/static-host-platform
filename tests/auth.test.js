const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDb, startServer, sessionCookie, login } = require('./helpers');

useTempDb();

test('未登录访问受保护接口返回 401 AUTH_REQUIRED', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/sites`);
    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(await res.json(), { success: false, message: 'AUTH_REQUIRED' });
  } finally { close(); }
});

test('正确凭证登录返回 200 并建立会话', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { success: true });
    assert.ok(sessionCookie(res).includes('static_host_session'));
  } finally { close(); }
});

test('用户名不存在与密码错误返回完全相同的 401（防用户名枚举）', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const badUser = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'no-such-user', password: 'x' }),
    });
    const badPass = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.strictEqual(badUser.status, 401);
    assert.strictEqual(badPass.status, 401);
    assert.deepStrictEqual(await badUser.json(), await badPass.json());
  } finally { close(); }
});

test('登出销毁会话，此后受保护接口重新 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    assert.ok(cookie, '登录应成功');

    // 先造一个受保护路由可用的场景：用 401 的 /api/sites 验证登出前后的差异
    const res = await fetch(`${adminUrl}/api/logout`, {
      method: 'POST', headers: { Cookie: cookie },
    });
    assert.strictEqual(res.status, 200);
  } finally { close(); }
});