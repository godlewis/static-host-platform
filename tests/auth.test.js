const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDir, startServer, sessionCookie, login } = require('./helpers');

useTempDir();

test('未登录访问受保护接口返回 401 AUTH_REQUIRED', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/upload`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});

test('admin/admin123 登录成功', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.strictEqual(res.status, 200);
    assert.ok(sessionCookie(res).includes('static_host_session'));
  } finally { close(); }
});

test('master liuyan@2026 登录成功', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'liuyan@2026' }),
    });
    assert.strictEqual(res.status, 200);
  } finally { close(); }
});

test('错误密码 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});

test('未登录登出 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/logout`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});