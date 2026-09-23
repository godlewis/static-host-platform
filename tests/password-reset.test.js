const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { useTempDb, startServer } = require('./helpers');

useTempDb();

// 重置 admin 密码为 admin123（同一进程内多个 test 共享 DB，test 2 改密后 test 3 需还原）
function resetAdminPassword() {
  const { db } = require('../server/db');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('UPDATE admins SET password_hash = ?').run(hash);
}

// 直接往 DB 插令牌，绕开邮件环节
function insertToken(db, email, token, expiresAt) {
  db.prepare('INSERT INTO reset_tokens (email, token, expires_at) VALUES (?, ?, ?)').run(email, token, expiresAt);
}

test('forgot-password 恒返回 200（SMTP 未配置也静默成功）', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const res = await fetch(`${adminUrl}/api/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { success: true });
  } finally { close(); }
});

test('有效令牌可重置密码，旧密码随即失效', async () => {
  resetAdminPassword();
  const { adminUrl, close } = await startServer();
  try {
    const db = require('../server/db').db;
    const token = crypto.randomUUID();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    insertToken(db, 'admin@example.com', token, future);

    const res = await fetch(`${adminUrl}/api/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'newPass456' }),
    });
    assert.strictEqual(res.status, 200);

    // 旧密码失效、新密码可登录
    const oldLogin = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.strictEqual(oldLogin.status, 401);
    const newLogin = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'newPass456' }),
    });
    assert.strictEqual(newLogin.status, 200);
  } finally { close(); }
});

test('过期令牌返回 400 INVALID_TOKEN 且不改密码', async () => {
  resetAdminPassword();
  const { adminUrl, close } = await startServer();
  try {
    const db = require('../server/db').db;
    const token = crypto.randomUUID();
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    insertToken(db, 'admin@example.com', token, past);

    const res = await fetch(`${adminUrl}/api/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'hacked789' }),
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'INVALID_TOKEN');

    // 密码未被改动（当前密码仍是 admin123）
    const stillWorks = await fetch(`${adminUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.strictEqual(stillWorks.status, 200);
  } finally { close(); }
});

test('重置成功后令牌被删除，不能二次使用', async () => {
  resetAdminPassword();
  const { adminUrl, close } = await startServer();
  try {
    const db = require('../server/db').db;
    const token = crypto.randomUUID();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    insertToken(db, 'admin@example.com', token, future);

    await fetch(`${adminUrl}/api/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'once12345' }),
    });
    const again = await fetch(`${adminUrl}/api/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'twice6789' }),
    });
    assert.strictEqual(again.status, 400);
  } finally { close(); }
});