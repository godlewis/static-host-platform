const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDir, startServer, login } = require('./helpers');

useTempDir();

test('登录后改密：新密码可登入，旧密码失效', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const change = await fetch(`${adminUrl}/api/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ newPassword: 'newSecret1' }),
    });
    assert.strictEqual(change.status, 200);

    const oldLogin = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.strictEqual(oldLogin.status, 401);

    const newLogin = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'newSecret1' }),
    });
    assert.strictEqual(newLogin.status, 200);
  } finally { close(); }
});

test('未登录改密 401', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'whatever1' }),
    });
    assert.strictEqual(res.status, 401);
  } finally { close(); }
});

test('连续两次改密：最终密码以最后一次为准', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await fetch(`${adminUrl}/api/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ newPassword: 'firstPass1' }),
    });
    await fetch(`${adminUrl}/api/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ newPassword: 'secondPass2' }),
    });

    const r1 = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'firstPass1' }),
    });
    assert.strictEqual(r1.status, 401);
    const r2 = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secondPass2' }),
    });
    assert.strictEqual(r2.status, 200);
  } finally { close(); }
});