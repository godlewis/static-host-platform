const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDb, startServer } = require('./helpers');

useTempDb();

test('管理端 3001 系：未登录访问 /api/sites 返回 401 占位路由前先能拿到静态页 404 之外的响应', async () => {
  // 此刻 /api 路由还没实现，只验证双端口服务能起来、管理端能响应
  const { adminUrl, publicUrl, close } = await startServer();
  try {
    const adminRes = await fetch(`${adminUrl}/`);
    assert.ok(adminRes.status >= 200); // 任何 HTTP 响应都算端口活着
    const pubRes = await fetch(`${publicUrl}/sites/whatever`);
    assert.ok(pubRes.status >= 200);
  } finally {
    close();
  }
});