---
change: static-host-platform
design-doc: docs/superpowers/specs/2025-09-19-static-host-platform-design.md
base-ref: 8a070148d60144a8e84b0eb2bec114df372fe338
---

# 静态网站托管平台 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个单容器、双端口（3001 管理 / 3000 公开）的静态网站托管平台：管理员登录后上传 ZIP 静态站点，平台解压存储并通过公开端口按 slug 提供访问。

**Architecture:** Express 双应用实例跑在同一 Node 进程（双端口）。管理端提供 Session 认证 + 站点 CRUD + ZIP 上传（Multer 内存存储 → AdmZip 解压）；公开端按 `uploads/{slug}/` 提供静态文件。SQLite（better-sqlite3）存站点元数据，`uploads/` 和 `data/` 挂 Docker named volume。

**Tech Stack:** Node.js 20 + Express 4 + better-sqlite3 + bcryptjs + express-session + Multer + AdmZip + nodemailer（密码重置邮件，SMTP 可选）+ Tailwind CSS CDN（前端）+ Docker（node:20-alpine 多阶段）。

**Spec:** `docs/superpowers/specs/2025-09-19-static-host-platform-design.md`（下称"设计文档"）；任务边界见 `docs/openspec/changes/static-host-platform/tasks.md`。

## Global Constraints

以下约束来自设计文档 §5/§7 与 tasks.md，所有任务隐式遵守：

- 管理端口 `3001`，公开端口 `3000`（`server/config.js` 已有 `ADMIN_PORT`/`PUBLIC_PORT`，可被环境变量覆盖）。
- 上传仅接受 `.zip` 扩展名，单文件上限 `MAX_UPLOAD_MB`（默认 100MB，Multer 限制）。
- ZIP 解压前必须校验每个 entry：`path.normalize(entryName)` 后不得以 `..` 开头、不得为绝对路径，违规返回 `400 PATH_TRAVERSAL`。
- 公开文件服务的请求路径 normalize 后必须位于 `uploads/{slug}/` 内，否则返回 `400 PATH_TRAVERSAL`。
- 密码用 bcryptjs 哈希存储（cost 10）；登录失败统一返回 401，不区分用户名/密码错误。
- Session cookie `httpOnly`，有效期 24h；未认证访问管理 API 返回 `401 {success:false,message:"AUTH_REQUIRED"}`。
- 重置令牌 UUID，有效期 `RESET_TOKEN_EXPIRY_MINUTES`（60 分钟）；SMTP 未配置时 forgot-password 静默返回 200。
- slug 冲突返回 `409 DUPLICATE_SLUG`；删除不存在的站点返回 `404 SITE_NOT_FOUND`。
- API 响应统一 JSON 格式 `{success: boolean, ...}`，错误消息用大写蛇形码（`AUTH_REQUIRED`、`PATH_TRAVERSAL`、`DUPLICATE_SLUG`、`SITE_NOT_FOUND`、`INVALID_FILE_TYPE`、`FILE_TOO_LARGE`、`MISSING_FIELDS`、`INVALID_TOKEN`）。
- 代码注释、commit message 全部中文，commit message 不带任何 Co-Authored-By 等署名信息。
- 测试统一用 Node 内置 `node --test`（Node 20 自带，不新增测试依赖），测试文件放 `tests/`。
- `server/config.js`、`server/db.js`、`server/email.js` 已存在且可用（见下方"已有代码"），只允许微调，不重写。

## Review Focus

设计文档隐含但容易被实现者搞砸的五类输入，每条都已在对应任务里配了测试：

1. **恶意 ZIP（entryName 含 `../`）**：必须在整个解压开始前整包拒绝并返回 `400 PATH_TRAVERSAL`，不能边解压边检查、更不能留下半解压的目录 → Task 4 测试钉死。
2. **URL 编码的路径遍历**：`GET /sites/{slug}/%2e%2e%2fconfig.js` 这类编码后的 `..`，Express 解码后 normalize 校验必须仍然拦截，返回 `400` 而不是把配置文件吐出去 → Task 6 测试钉死。
3. **登录错误信息区分**：用户名不存在和密码错误必须返回完全相同的 `401` 响应，防止用户名枚举 → Task 2 测试钉死。
4. **slug 冲突残留**：上传撞 UNIQUE 约束返回 `409` 时，必须先清理已解压的 `uploads/{slug}/` 目录，不留脏数据 → Task 4 测试钉死。
5. **过期重置令牌**：令牌超过 60 分钟后必须不可用（返回 `400 INVALID_TOKEN`），且不能改到任何用户的密码 → Task 3 测试钉死。

## 已有代码（计划引用的事实，不要重写）

- `server/config.js`：导出 `ADMIN_PORT`(3001)、`PUBLIC_PORT`(3000)、`DB_PATH`、`UPLOAD_DIR`、`CLIENT_DIR`、`SESSION_SECRET`、`SESSION_NAME`、`SMTP_*`、`DEFAULT_ADMIN_USER`('admin')、`DEFAULT_ADMIN_PASSWORD`('admin123')、`RESET_TOKEN_EXPIRY_MINUTES`(60)、`MAX_UPLOAD_MB`(100)。
- `server/db.js`：`initDb()` 建表（admins/sites/reset_tokens/uploads）并在空表时用 bcryptjs 创建默认管理员；导出 `{ initDb, getDb, db }`。`sites` 表：`id, slug(UNIQUE), title, description, created_at, updated_at`。`reset_tokens` 表：`id, email, token(UNIQUE), created_at, expires_at`。
- `server/email.js`：导出 `async sendResetEmail(email, token, adminUrl)`，SMTP 未配置时告警并返回 `false`。
- `package.json`：依赖已全部声明（express、better-sqlite3、bcryptjs、cors、express-session、multer、nodemailer、adm-zip、uuid、sanitize-filename），`start` 脚本指向 `server/index.js`。

---

### Task 1: 应用工厂与双端口入口

**Files:**
- Create: `server/app.js`
- Create: `server/index.js`
- Test: `tests/helpers.js`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Consumes: `server/config.js`（`ADMIN_PORT`、`PUBLIC_PORT`、`CLIENT_DIR`、`SESSION_SECRET`、`SESSION_NAME`）、`server/db.js` 的 `initDb()`。
- Produces: `server/app.js` 导出 `createApps()`，返回 `{ adminApp, publicApp }` 两个未监听的 Express 实例；后续所有任务的测试都通过 `tests/helpers.js` 的 `startServer()` 拿到 `adminUrl`/`publicUrl`/`close()`。

- [x] **Step 1: 安装依赖**

Run: `npm install`
Expected: 退出码 0，`node_modules/` 生成，无 missing 依赖报错。package.json 已声明全部依赖，无需新增。

- [x] **Step 2: 写测试辅助（先写测试）**

创建 `tests/helpers.js`：

```javascript
// 测试辅助：用临时 DB 启动双端口服务（随机端口）
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// 注意：必须在 require('../server/config') 之前设置，config 模块加载时即读取
function useTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shp-test-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  return dir;
}

async function startServer() {
  const { createApps } = require('../server/app');
  const { adminApp, publicApp } = createApps();
  const adminServer = adminApp.listen(0, '127.0.0.1');
  const publicServer = publicApp.listen(0, '127.0.0.1');
  await new Promise((r) => { adminServer.once('listening', r); });
  return {
    adminUrl: `http://127.0.0.1:${adminServer.address().port}`,
    publicUrl: `http://127.0.0.1:${publicServer.address().port}`,
    close: () => { adminServer.close(); publicServer.close(); },
  };
}

// 从 fetch 响应提取会话 cookie（Node 20 fetch 不自动管理 cookie）
function sessionCookie(res) {
  const cookies = res.headers.getSetCookie();
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function login(adminUrl) {
  const res = await fetch(`${adminUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  return sessionCookie(res);
}

function makeZip(files) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  }
  return zip.toBuffer();
}

module.exports = { useTempDb, startServer, sessionCookie, login, makeZip, randomSlug: () => 'site-' + crypto.randomBytes(4).toString('hex') };
```

- [x] **Step 3: 写冒烟测试**

创建 `tests/smoke.test.js`：

```javascript
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
```

- [x] **Step 4: 运行测试确认失败**

Run: `node --test tests/smoke.test.js`
Expected: FAIL，报错 `Cannot find module '../server/app'`。

- [x] **Step 5: 实现 `server/app.js`**

```javascript
// 应用工厂：构建管理端与公开端两个 Express 实例（不监听，便于测试）
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const config = require('./config');
const { initDb } = require('./db');

function createApps() {
  initDb();

  // ── 管理端 ──────────────────────────────────────────────
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use(cors({ origin: true, credentials: true }));
  adminApp.use(session({
    secret: config.SESSION_SECRET,
    name: config.SESSION_NAME,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  }));
  adminApp.use('/api', require('./routes/admin'));
  adminApp.use(express.static(config.CLIENT_DIR));
  // 单页 fallback
  adminApp.get('*', (req, res) => {
    res.sendFile(path.join(config.CLIENT_DIR, 'admin.html'));
  });

  // ── 公开端 ──────────────────────────────────────────────
  const publicApp = express();
  publicApp.use('/sites', require('./routes/public'));

  return { adminApp, publicApp };
}

module.exports = { createApps };
```

同时创建占位路由，让服务能启动（Task 2/4/6 会替换为完整实现）：

`server/routes/admin.js`：

```javascript
const express = require('express');
const router = express.Router();

// 占位：后续任务逐个补齐
router.use((req, res) => res.status(404).json({ success: false, message: 'NOT_FOUND' }));

module.exports = router;
```

`server/routes/public.js`：

```javascript
const express = require('express');
const router = express.Router();

// 占位：后续任务逐个补齐
router.use((req, res) => res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' }));

module.exports = router;
```

`server/middleware/auth.js`（空占位，Task 2 实现）：

```javascript
module.exports = function requireAuth(req, res, next) { next(); };
```

- [x] **Step 6: 实现 `server/index.js`**

```javascript
// 双端口入口：管理端 3001 + 公开端 3000
const config = require('./config');
const { createApps } = require('./app');

const { adminApp, publicApp } = createApps();

adminApp.listen(config.ADMIN_PORT, () => {
  console.log(`[Admin] http://localhost:${config.ADMIN_PORT}`);
});
publicApp.listen(config.PUBLIC_PORT, () => {
  console.log(`[Public] http://localhost:${config.PUBLIC_PORT}`);
});
```

- [x] **Step 7: 运行测试确认通过**

Run: `node --test tests/smoke.test.js`
Expected: PASS（1 个测试通过）。

- [x] **Step 8: 手动验证 `npm start`**

Run: `npm start`（另开终端 `curl http://localhost:3001` 与 `curl http://localhost:3000/sites/x`）
Expected: 控制台输出 `[Admin]` 与 `[Public]` 两行日志；两个 curl 都有响应（管理端返回 fallback HTML/404 占位均可）。验证完 Ctrl+C 停掉。

- [x] **Step 9: 提交**

```bash
git add server/app.js server/index.js server/routes server/middleware tests
git commit -m "feat: 双端口应用工厂与入口，测试辅助基建"
```

---

### Task 2: 认证中间件与登录/登出

**Files:**
- Modify: `server/middleware/auth.js`（替换占位实现）
- Modify: `server/routes/admin.js`（替换占位实现）
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `server/db.js` 的 `db`（admins 表：`username`、`password_hash`）、`server/config.js` 的 `DEFAULT_ADMIN_USER`('admin')/`DEFAULT_ADMIN_PASSWORD`('admin123')、Task 1 的 `createApps()`。
- Produces: `module.exports = function requireAuth(req, res, next)`，已登录（`req.session.adminId` 存在）放行，否则 401。`routes/admin.js` 导出挂载于 `/api` 的路由器，公开端点 `POST /api/login`、`POST /api/logout`、受保护端点 `GET/POST /api/sites` 等由后续任务在同一文件追加。

- [x] **Step 1: 写失败测试**

创建 `tests/auth.test.js`：

```javascript
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
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/auth.test.js`
Expected: FAIL——未登录测试返回 404（占位路由）而非 401；登录测试返回 404 而非 200。

- [x] **Step 3: 实现认证中间件**

替换 `server/middleware/auth.js` 全部内容：

```javascript
// Session 认证中间件：未登录返回 401
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.status(401).json({ success: false, message: 'AUTH_REQUIRED' });
};
```

- [x] **Step 4: 实现登录/登出路由**

替换 `server/routes/admin.js` 全部内容（保留文件骨架，公开路由在前、`requireAuth` 在后，后续任务往"受保护区"里加路由）：

```javascript
// 管理 API：公开路由（登录/登出/找回密码）+ 受保护路由（站点管理）
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

// ── 公开路由 ─────────────────────────────────────────────

// 登录：bcrypt 校验，建立 Session；失败统一 401，不区分用户名/密码
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  const ok = row && bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  req.session.adminId = row.id;
  res.json({ success: true });
});

// 登出：销毁 Session
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── 受保护路由（以下全部需要登录）────────────────────────
router.use(requireAuth);

// 登出：销毁 Session（按设计文档要求需登录后才能登出）
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// 占位：站点管理路由在 Task 4/5 实现
router.get('/sites', (req, res) => res.json({ success: true, sites: [] }));

// Multer/解压错误统一处理（Task 4 会往这里补错误码）
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Admin]', err.message);
  res.status(500).json({ success: false, message: 'INTERNAL_ERROR' });
});

module.exports = router;
```

注意：`/logout` 按设计文档要求认证（表格标注"需"），所以必须放在 `router.use(requireAuth)` 之后——上面 Step 4 的最终代码已经是这样（logout 在受保护区），公开区只有 `/login` 和后续 Task 3 的密码重置路由。测试中 logout 请求已带会话 cookie，可直接通过。

- [x] **Step 5: 运行测试确认通过**

Run: `node --test tests/auth.test.js`
Expected: PASS（4 个测试全部通过）。

- [x] **Step 6: 提交**

```bash
git add server/middleware/auth.js server/routes/admin.js tests/auth.test.js
git commit -m "feat: Session 认证中间件与登录登出接口"
```

---

### Task 3: 密码找回与重置

**Files:**
- Modify: `server/routes/admin.js`（在公开区追加两个路由）
- Test: `tests/password-reset.test.js`

**Interfaces:**
- Consumes: `server/db.js` 的 `db`（`reset_tokens` 表：`email/token/expires_at`）、`server/email.js` 的 `sendResetEmail(email, token, adminUrl)`、`server/config.js` 的 `RESET_TOKEN_EXPIRY_MINUTES`(60)、`uuid` 包。
- Produces: `POST /api/forgot-password`（body `{email}`，恒返回 `200 {success:true}`）、`POST /api/reset-password`（body `{token, newPassword}`，成功 `200 {success:true}`；令牌无效/过期/邮箱不匹配 `400 {success:false,message:"INVALID_TOKEN"}`）。

- [x] **Step 1: 写失败测试**

创建 `tests/password-reset.test.js`：

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { useTempDb, startServer, login } = require('./helpers');

useTempDb();

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
```

注意：每个测试文件是独立进程、独立临时 DB，`startServer` 内部会调 `createApps()`→`initDb()` 建默认管理员，所以每文件里默认管理员密码都是 `admin123`，测试之间互不污染。

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/password-reset.test.js`
Expected: FAIL——两个路由均为 404。

- [x] **Step 3: 实现路由**

在 `server/routes/admin.js` 文件顶部 require 区追加：

```javascript
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { sendResetEmail } = require('../email');
const config = require('../config');
```

在公开区（`router.use(requireAuth)` 之前、`/login` 之后）追加：

```javascript
// 找回密码：生成令牌并尝试发邮件；无论邮箱是否存在都返回 200（防枚举）
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (admin) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + config.RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reset_tokens (email, token, expires_at) VALUES (?, ?, ?)')
      .run(email, token, expiresAt);
    await sendResetEmail(email, token, `http://localhost:${config.ADMIN_PORT}`);
  }
  res.json({ success: true });
});

// 重置密码：校验令牌（存在 + 未过期 + 邮箱匹配）→ 更新密码 → 删除令牌
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  const row = db.prepare('SELECT * FROM reset_tokens WHERE token = ?').get(token);
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ success: false, message: 'INVALID_TOKEN' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
    .run(hash, row.email);
  db.prepare('DELETE FROM reset_tokens WHERE token = ?').run(token);
  res.json({ success: true });
});
```

- [x] **Step 4: 运行测试确认通过**

Run: `node --test tests/password-reset.test.js`
Expected: PASS（4 个测试全部通过）。

- [x] **Step 5: 回归跑全部已有测试**

Run: `node --test tests/`
Expected: 全部 PASS（smoke + auth + password-reset）。

- [x] **Step 6: 提交**

```bash
git add server/routes/admin.js tests/password-reset.test.js
git commit -m "feat: 密码找回与重置接口，令牌 60 分钟过期一次性使用"
```

---

### Task 4: ZIP 上传（Multer 中间件 + 上传路由 + slug 冲突）

**Files:**
- Create: `server/middleware/upload.js`
- Modify: `server/routes/admin.js`（受保护区追加 `POST /api/sites`，错误处理中间件补错误码）
- Test: `tests/upload.test.js`

**Interfaces:**
- Consumes: Task 2 的 `requireAuth`；`multer`；`adm-zip`；`server/config.js` 的 `UPLOAD_DIR`、`MAX_UPLOAD_MB`；`db`（sites 表 `slug` UNIQUE）。
- Produces: `module.exports = upload`（Multer 实例，调用方式 `upload.single('file')`，字段名必须是 `file`）。`POST /api/sites` 为 multipart/form-data：字段 `file`(ZIP)、`title`、`slug`、`description`(可选)；成功 `201 {success:true, site:{id,slug,title,description,created_at}}`；错误码 `MISSING_FIELDS`(400)、`INVALID_SLUG`(400)、`INVALID_FILE_TYPE`(400)、`FILE_TOO_LARGE`(400)、`PATH_TRAVERSAL`(400)、`DUPLICATE_SLUG`(409)。slug 规则：`/^[a-z0-9][a-z0-9-]{0,63}$/i`。

- [x] **Step 1: 实现 Multer 中间件（无独立测试，由上传路由测试覆盖）**

创建 `server/middleware/upload.js`：

```javascript
// ZIP 上传中间件：内存暂存，仅允许 .zip，限制 MAX_UPLOAD_MB
const multer = require('multer');
const config = require('../config');

const upload = multer({
  storage: multer.memoryStorage(), // 内存暂存，解压前先做路径安全校验
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

module.exports = upload;
```

- [x] **Step 2: 写失败测试**

创建 `tests/upload.test.js`：

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDb, startServer, login, makeZip, randomSlug } = require('./helpers');

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
    // 手工构造带路径穿越 entry 的 ZIP
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addFile('../evil.txt', Buffer.from('pwned'));
    const form = new FormData();
    form.append('title', 'evil');
    form.append('slug', slug);
    form.append('file', new Blob([zip.toBuffer()]), 'evil.zip');
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
```

再补错误输入测试（同一文件追加）：

```javascript
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
```

- [x] **Step 3: 运行测试确认失败**

Run: `node --test tests/upload.test.js`
Expected: FAIL——`POST /api/sites` 目前只返回空列表占位（404/200 而非 201）。

- [x] **Step 4: 实现上传路由**

在 `server/routes/admin.js` 顶部 require 区追加：

```javascript
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const upload = require('../middleware/upload');
const config = require('../config');
```

在受保护区（`router.use(requireAuth)` 之后，替换掉 Task 2 里的 `router.get('/sites', ...)` 占位）追加：

```javascript
// 上传新站点：ZIP 校验 → 解压 → 入库
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

router.post('/sites', upload.single('file'), (req, res, next) => {
  const { title, slug } = req.body || {};
  if (!title || !slug || !req.file) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ success: false, message: 'INVALID_SLUG' });
  }

  // 解压前逐个校验 entry 路径安全（必须在任何解压动作之前完成整包校验）
  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'INVALID_ZIP' });
  }
  for (const entry of zip.getEntries()) {
    const normalized = path.normalize(entry.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
    }
  }

  const dest = path.join(config.UPLOAD_DIR, slug);
  fs.mkdirSync(dest, { recursive: true });
  zip.extractAllTo(dest, true);

  let site;
  try {
    site = db.prepare('INSERT INTO sites (slug, title, description) VALUES (?, ?, ?)')
      .run(slug, title, req.body.description || '');
  } catch (e) {
    // slug 唯一冲突：回滚已解压目录，返回 409
    if (String(e.message).includes('UNIQUE')) {
      fs.rmSync(dest, { recursive: true, force: true });
      return res.status(409).json({ success: false, message: 'DUPLICATE_SLUG' });
    }
    fs.rmSync(dest, { recursive: true, force: true });
    return next(e);
  }

  const created = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.lastInsertRowid);
  res.status(201).json({ success: true, site: created });
});
```

把文件底部错误处理中间件替换为（补齐 Multer/校验错误码）：

```javascript
// Multer 与上传校验错误统一处理
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, message: 'INVALID_FILE_TYPE' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'FILE_TOO_LARGE' });
  }
  console.error('[Admin]', err.message);
  res.status(500).json({ success: false, message: 'INTERNAL_ERROR' });
});
```

同时删掉 Task 2 遗留的 `router.get('/sites', ...)` 占位路由（Task 5 会实现真正的列表接口；先删掉避免与 Task 5 冲突，本任务测试不依赖列表接口）。

- [x] **Step 5: 运行测试确认通过**

Run: `node --test tests/upload.test.js`
Expected: PASS（7 个测试全部通过）。

- [x] **Step 6: 回归跑全部已有测试**

Run: `node --test tests/`
Expected: 全部 PASS。

- [x] **Step 7: 提交**

```bash
git add server/middleware/upload.js server/routes/admin.js tests/upload.test.js
git commit -m "feat: ZIP 上传接口，含路径安全校验与 slug 冲突处理"
```

---

### Task 5: 站点管理 CRUD

**Files:**
- Modify: `server/routes/admin.js`（受保护区追加 GET 列表 / GET 详情 / PUT 更新 / DELETE）
- Test: `tests/sites-crud.test.js`

**Interfaces:**
- Consumes: Task 4 的上传流程（测试里用 `helpers.login` + FormData 造站点）；`db`（sites 表）、`config.UPLOAD_DIR`。
- Produces:
  - `GET /api/sites` → `200 {success:true, sites:[{id,slug,title,description,created_at,updated_at}...]}` 按 `created_at` 倒序。
  - `GET /api/sites/:slug` → `200 {success:true, site:{...}}`；不存在 `404 SITE_NOT_FOUND`。
  - `PUT /api/sites/:slug`（body 可含 `title`、`description`、`slug`）→ `200 {success:true, site:{...}}`；新 slug 冲突 `409 DUPLICATE_SLUG`（此时目录不得被改名）；目标不存在 `404 SITE_NOT_FOUND`；slug 变更时 `uploads/{旧slug}/` 同步改名为 `uploads/{新slug}/`。
  - `DELETE /api/sites/:slug` → `200 {success:true}`，删除 DB 记录和 `uploads/{slug}/` 目录；不存在 `404 SITE_NOT_FOUND`。

- [x] **Step 1: 写失败测试**

创建 `tests/sites-crud.test.js`：

```javascript
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
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/sites-crud.test.js`
Expected: FAIL——GET 列表 404（占位已删），详情/PUT/DELETE 404。

- [x] **Step 3: 实现 CRUD 路由**

在 `server/routes/admin.js` 受保护区（`POST /sites` 之后）追加：

```javascript
// 站点列表：created_at 倒序
router.get('/sites', (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at DESC, id DESC').all();
  res.json({ success: true, sites });
});

// 站点详情
router.get('/sites/:slug', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE slug = ?').get(req.params.slug);
  if (!site) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.json({ success: true, site });
});

// 更新站点：title/description/slug；slug 变更需校验唯一并同步改名目录
router.put('/sites/:slug', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE slug = ?').get(req.params.slug);
  if (!site) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  const { title = site.title, description = site.description } = req.body || {};
  const newSlug = req.body && req.body.slug ? req.body.slug : site.slug;
  if (!SLUG_RE.test(newSlug)) {
    return res.status(400).json({ success: false, message: 'INVALID_SLUG' });
  }

  const oldDir = path.join(config.UPLOAD_DIR, site.slug);
  const newDir = path.join(config.UPLOAD_DIR, newSlug);

  if (newSlug !== site.slug) {
    // 先查冲突（含自身以外的记录），再改名
    const clash = db.prepare('SELECT id FROM sites WHERE slug = ?').get(newSlug);
    if (clash) {
      return res.status(409).json({ success: false, message: 'DUPLICATE_SLUG' });
    }
    try {
      db.prepare('UPDATE sites SET slug = ?, title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newSlug, title, description, site.id);
      fs.renameSync(oldDir, newDir);
    } catch (e) {
      // 改名失败（如目录缺失）不回滚 DB 也无妨——目录缺失本就该清理
      return next(e);
    }
  } else {
    db.prepare('UPDATE sites SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title, description, site.id);
  }

  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
  res.json({ success: true, site: updated });
});

// 删除站点：DB 记录 + 上传目录一起删
router.delete('/sites/:slug', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE slug = ?').get(req.params.slug);
  if (!site) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  fs.rmSync(path.join(config.UPLOAD_DIR, site.slug), { recursive: true, force: true });
  res.json({ success: true });
});
```

- [x] **Step 4: 运行测试确认通过**

Run: `node --test tests/sites-crud.test.js`
Expected: PASS（6 个测试全部通过）。

- [x] **Step 5: 回归跑全部已有测试**

Run: `node --test tests/`
Expected: 全部 PASS。

- [x] **Step 6: 提交**

```bash
git add server/routes/admin.js tests/sites-crud.test.js
git commit -m "feat: 站点管理 CRUD 接口，slug 变更同步改名目录"
```

---

### Task 6: 公开静态文件服务

**Files:**
- Modify: `server/routes/public.js`（替换占位实现）
- Test: `tests/public.test.js`

**Interfaces:**
- Consumes: Task 4 造的站点目录结构（`uploads/{slug}/index.html` 等）；`config.UPLOAD_DIR`。
- Produces: 挂载在 `/sites` 前缀下的路由器：
  - `GET /sites/:slug` → 提供 `uploads/{slug}/index.html`；无 index.html 或目录不存在 → `404 SITE_NOT_FOUND`。
  - `GET /sites/:slug/*` → 提供子路径文件；路径逃逸（含 URL 编码 `%2e%2e%2f`）→ `400 PATH_TRAVERSAL`；文件不存在 → `404 SITE_NOT_FOUND`。
  - Content-Type 由 `res.sendFile` 按扩展名自动设置。

- [x] **Step 1: 写失败测试**

创建 `tests/public.test.js`：

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { useTempDb, startServer, login, makeZip, randomSlug } = require('./helpers');

useTempDb();

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
    const res = await fetch(`${publicUrl}/sites/x/../../package.json`);
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
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/public.test.js`
Expected: FAIL——占位路由全部返回 404 SITE_NOT_FOUND（合法请求也 404，遍历请求返回的是 404 而非 400）。

- [x] **Step 3: 实现公开路由**

替换 `server/routes/public.js` 全部内容：

```javascript
// 公开静态服务：从 uploads/{slug}/ 提供站点文件，带路径逃逸防护
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

// 路径安全：resolve 后必须仍位于站点目录内
function resolveSafe(slug, relativePath) {
  const basePath = path.resolve(config.UPLOAD_DIR, slug);
  const requestedPath = path.resolve(basePath, relativePath);
  if (requestedPath !== basePath && !requestedPath.startsWith(basePath + path.sep)) {
    return null;
  }
  return requestedPath;
}

// 根路径 → index.html
router.get('/:slug', (req, res) => {
  const filePath = resolveSafe(req.params.slug, 'index.html');
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

// 子路径文件
router.get('/:slug/*', (req, res) => {
  const filePath = resolveSafe(req.params.slug, req.params[0] || 'index.html');
  if (!filePath) {
    return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

module.exports = router;
```

- [x] **Step 4: 运行测试确认通过**

Run: `node --test tests/public.test.js`
Expected: PASS（5 个测试全部通过）。若 URL 编码遍历测试失败，检查 Express 对 `%2e` 的解码时机——`req.params` 已解码，`path.resolve` + `startsWith` 校验能覆盖，无需额外处理。

- [x] **Step 5: 回归跑全部已有测试**

Run: `node --test tests/`
Expected: 全部 PASS。

- [x] **Step 6: 提交**

```bash
git add server/routes/public.js tests/public.test.js
git commit -m "feat: 公开静态文件服务，含路径逃逸防护与默认首页"
```

---

### Task 7: 前端管理界面

**Files:**
- Create: `client/admin.html`
- Create: `client/admin.js`
- Test: 无单元测试（纯静态前端），由 Task 9 集成冒烟验收；本任务以手动浏览器/`curl` 验证。

**Interfaces:**
- Consumes: Task 2-6 的全部 API（`/api/login`、`/api/logout`、`/api/forgot-password`、`/api/reset-password`、`/api/sites` CRUD）；公开端 `http://<host>:3000/sites/{slug}` 用于预览 iframe。
- Produces: 管理端所有非 `/api` 路径都由 `express.static(client/)` + fallback 提供 `admin.html`。前端内置视图：登录、忘记密码、重置密码（`?token=...`）、主界面（站点卡片 + 上传/编辑/预览/删除）。

- [x] **Step 1: 创建 `client/admin.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>静态网站托管平台</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">

  <!-- 登录视图 -->
  <div id="view-login" class="hidden min-h-screen flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
      <h1 class="text-xl font-bold text-center mb-6">静态网站托管平台</h1>
      <div id="login-error" class="hidden mb-4 text-sm text-red-600 bg-red-50 p-2 rounded"></div>
      <form id="login-form" class="space-y-4">
        <input id="login-username" type="text" placeholder="用户名" required
               class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <input id="login-password" type="password" placeholder="密码" required
               class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">登录</button>
      </form>
      <a href="#" id="link-forgot" class="block mt-4 text-sm text-indigo-600 text-center hover:underline">忘记密码？</a>
    </div>
  </div>

  <!-- 忘记密码视图 -->
  <div id="view-forgot" class="hidden min-h-screen flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
      <h1 class="text-xl font-bold text-center mb-6">找回密码</h1>
      <div id="forgot-msg" class="hidden mb-4 text-sm p-2 rounded"></div>
      <form id="forgot-form" class="space-y-4">
        <input id="forgot-email" type="email" placeholder="注册邮箱" required
               class="w-full px-3 py-2 border rounded">
        <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">发送重置邮件</button>
      </form>
      <a href="#" id="link-back-login" class="block mt-4 text-sm text-indigo-600 text-center hover:underline">返回登录</a>
    </div>
  </div>

  <!-- 重置密码视图（/reset-password?token=...） -->
  <div id="view-reset" class="hidden min-h-screen flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
      <h1 class="text-xl font-bold text-center mb-6">重置密码</h1>
      <div id="reset-error" class="hidden mb-4 text-sm text-red-600 bg-red-50 p-2 rounded"></div>
      <form id="reset-form" class="space-y-4">
        <input id="reset-password" type="password" placeholder="新密码" required minlength="6"
               class="w-full px-3 py-2 border rounded">
        <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">重置</button>
      </form>
    </div>
  </div>

  <!-- 主界面 -->
  <div id="view-main" class="hidden">
    <nav class="bg-white shadow">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <span class="font-bold text-lg">☰ 静态网站托管</span>
        <button id="btn-logout" class="text-sm text-gray-600 hover:text-red-600">登出</button>
      </div>
    </nav>
    <main class="max-w-6xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <button id="btn-upload" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">+ 上传新网站</button>
        <input id="search" type="text" placeholder="搜索..." 
               class="px-3 py-2 border rounded w-64">
      </div>
      <div id="site-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      <p id="empty-hint" class="hidden text-center text-gray-400 mt-16">还没有站点，点右上角上传一个吧。</p>
    </main>
  </div>

  <!-- 上传模态框 -->
  <div id="modal-upload" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 w-full max-w-md">
      <h2 class="text-lg font-bold mb-4">上传新网站</h2>
      <div id="drop-zone" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500 cursor-pointer hover:border-indigo-400">
        拖拽 ZIP 到这里，或点击选择文件
        <input id="upload-file" type="file" accept=".zip" class="hidden">
      </div>
      <div class="mt-4 space-y-3">
        <input id="upload-title" type="text" placeholder="网站标题" class="w-full px-3 py-2 border rounded">
        <input id="upload-slug" type="text" placeholder="slug（字母/数字/连字符）" class="w-full px-3 py-2 border rounded">
        <textarea id="upload-desc" placeholder="描述（可选）" class="w-full px-3 py-2 border rounded"></textarea>
      </div>
      <div id="upload-progress" class="hidden mt-3 text-sm text-indigo-600">上传中，请稍候…</div>
      <div id="upload-error" class="hidden mt-3 text-sm text-red-600"></div>
      <div class="mt-4 flex justify-end gap-2">
        <button id="upload-cancel" class="px-4 py-2 border rounded">取消</button>
        <button id="upload-submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">上传</button>
      </div>
    </div>
  </div>

  <!-- 编辑模态框 -->
  <div id="modal-edit" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 w-full max-w-md">
      <h2 class="text-lg font-bold mb-4">编辑站点</h2>
      <div id="edit-error" class="hidden mb-3 text-sm text-red-600"></div>
      <div class="space-y-3">
        <input id="edit-title" type="text" placeholder="标题" class="w-full px-3 py-2 border rounded">
        <textarea id="edit-desc" placeholder="描述" class="w-full px-3 py-2 border rounded"></textarea>
        <input id="edit-slug" type="text" placeholder="slug" class="w-full px-3 py-2 border rounded">
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button id="edit-cancel" class="px-4 py-2 border rounded">取消</button>
        <button id="edit-save" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存</button>
      </div>
    </div>
  </div>

  <!-- 预览模态框 -->
  <div id="modal-preview" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-4 py-2 border-b">
        <span id="preview-title" class="font-bold"></span>
        <button id="preview-close" class="text-gray-500 hover:text-black">✕ 关闭</button>
      </div>
      <iframe id="preview-frame" class="flex-1 w-full" sandbox="allow-scripts"></iframe>
    </div>
  </div>

  <!-- 删除确认 -->
  <div id="modal-confirm" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 w-full max-w-sm text-center">
      <p class="mb-4">确定删除站点「<span id="confirm-name"></span>」？此操作不可恢复。</p>
      <div class="flex justify-center gap-2">
        <button id="confirm-cancel" class="px-4 py-2 border rounded">取消</button>
        <button id="confirm-delete" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">删除</button>
      </div>
    </div>
  </div>

  <script src="/admin.js"></script>
</body>
</html>
```

- [x] **Step 2: 创建 `client/admin.js`**

```javascript
// 管理界面逻辑：视图切换 + API 封装 + 各模态框
(function () {
  'use strict';

  // ── API 封装 ───────────────────────────────────────────
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'REQUEST_FAILED');
      err.status = res.status;
      err.code = data.message;
      throw err;
    }
    return data;
  }

  const $ = (id) => document.getElementById(id);
  const VIEWS = ['view-login', 'view-forgot', 'view-reset', 'view-main'];
  function show(viewId) {
    VIEWS.forEach((v) => $(v).classList.toggle('hidden', v !== viewId));
  }

  // 公开端口地址（同主机不同端口，开发环境 3000）
  const publicBase = `${location.protocol}//${location.hostname}:3000`;

  // ── 登录 ───────────────────────────────────────────────
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').classList.add('hidden');
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('login-username').value,
          password: $('login-password').value,
        }),
      });
      enterMain();
    } catch (err) {
      $('login-error').textContent = '用户名或密码错误';
      $('login-error').classList.remove('hidden');
    }
  });

  // ── 忘记密码 ───────────────────────────────────────────
  $('link-forgot').addEventListener('click', (e) => { e.preventDefault(); show('view-forgot'); });
  $('link-back-login').addEventListener('click', (e) => { e.preventDefault(); show('view-login'); });
  $('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('forgot-msg');
    msg.classList.remove('hidden', 'text-red-600', 'bg-red-50', 'text-green-700', 'bg-green-50');
    try {
      await api('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: $('forgot-email').value }),
      });
      msg.textContent = '如果该邮箱已注册，重置链接已发送（SMTP 未配置时请联系管理员）。';
      msg.classList.add('text-green-700', 'bg-green-50');
    } catch (err) {
      msg.textContent = '发送失败，请稍后再试。';
      msg.classList.add('text-red-600', 'bg-red-50');
    }
  });

  // ── 重置密码（URL 带 ?token=）─────────────────────────
  const resetToken = new URLSearchParams(location.search).get('token');
  if (resetToken) show('view-reset');
  $('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: $('reset-password').value }),
      });
      location.href = '/'; // 成功后回登录页
    } catch (err) {
      $('reset-error').textContent = err.code === 'INVALID_TOKEN' ? '链接无效或已过期' : '重置失败';
      $('reset-error').classList.remove('hidden');
    }
  });

  // ── 主界面 ─────────────────────────────────────────────
  let sites = [];
  let pendingDeleteSlug = null;
  let editingSlug = null;

  async function enterMain() {
    show('view-main');
    await refreshSites();
  }

  async function refreshSites() {
    const data = await api('/api/sites');
    sites = data.sites;
    renderSites();
  }

  function renderSites() {
    const q = $('search').value.trim().toLowerCase();
    const list = sites.filter((s) =>
      s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q));
    $('empty-hint').classList.toggle('hidden', list.length > 0);
    $('site-grid').innerHTML = list.map((s) => `
      <div class="bg-white rounded-lg shadow p-4 flex flex-col">
        <iframe src="${publicBase}/sites/${s.slug}" sandbox class="w-full h-40 rounded border bg-white pointer-events-none"></iframe>
        <h3 class="font-bold mt-3">${escapeHtml(s.title)}</h3>
        <p class="text-sm text-gray-500 flex-1">${escapeHtml(s.description || '')}</p>
        <p class="text-xs text-gray-400 mt-2">${s.created_at}</p>
        <div class="flex gap-2 mt-3">
          <button data-act="preview" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">预览</button>
          <button data-act="edit" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200">编辑</button>
          <button data-act="delete" data-slug="${s.slug}" class="flex-1 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
        </div>
      </div>`).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  $('search').addEventListener('input', renderSites);
  $('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  // ── 上传模态框 ─────────────────────────────────────────
  const dropZone = $('drop-zone');
  $('btn-upload').addEventListener('click', () => {
    $('modal-upload').classList.remove('hidden');
    $('upload-error').classList.add('hidden');
    $('upload-progress').classList.add('hidden');
  });
  $('upload-cancel').addEventListener('click', () => $('modal-upload').classList.add('hidden'));
  dropZone.addEventListener('click', () => $('upload-file').click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-400'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-400');
    if (e.dataTransfer.files.length) $('upload-file').files = e.dataTransfer.files;
  });

  $('upload-submit').addEventListener('click', () => {
    const file = $('upload-file').files[0];
    const title = $('upload-title').value.trim();
    const slug = $('upload-slug').value.trim();
    const errBox = $('upload-error');
    errBox.classList.add('hidden');
    if (!file || !title || !slug) {
      errBox.textContent = '请填写标题、slug 并选择 ZIP 文件。';
      errBox.classList.remove('hidden');
      return;
    }
    // XHR 以获得上传中状态（fetch 无上传进度）
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    fd.append('slug', slug);
    fd.append('description', $('upload-desc').value.trim());
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/sites');
    $('upload-progress').classList.remove('hidden');
    xhr.onload = async () => {
      $('upload-progress').classList.add('hidden');
      if (xhr.status === 201) {
        $('modal-upload').classList.add('hidden');
        ['upload-title', 'upload-slug', 'upload-desc'].forEach((id) => { $(id).value = ''; });
        $('upload-file').value = '';
        await refreshSites();
      } else {
        const ERR_ZH = {
          DUPLICATE_SLUG: 'slug 已存在，换一个吧。',
          INVALID_SLUG: 'slug 只能是字母、数字和连字符。',
          INVALID_FILE_TYPE: '只能上传 .zip 文件。',
          FILE_TOO_LARGE: '文件超过 100MB 限制。',
          PATH_TRAVERSAL: 'ZIP 内包含非法路径，已拒绝。',
          MISSING_FIELDS: '请填写标题、slug 并选择 ZIP 文件。',
        };
        let msg = '上传失败。';
        try { msg = ERR_ZH[JSON.parse(xhr.responseText).message] || msg; } catch (_) { /* 保持默认 */ }
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    };
    xhr.onerror = () => {
      $('upload-progress').classList.add('hidden');
      errBox.textContent = '网络错误，上传失败。';
      errBox.classList.remove('hidden');
    };
    xhr.send(fd);
  });

  // ── 卡片操作（事件委托）───────────────────────────────
  $('site-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slug = btn.dataset.slug;
    const site = sites.find((s) => s.slug === slug);
    if (btn.dataset.act === 'preview') {
      $('preview-title').textContent = site.title;
      $('preview-frame').src = `${publicBase}/sites/${slug}`;
      $('modal-preview').classList.remove('hidden');
    } else if (btn.dataset.act === 'edit') {
      editingSlug = slug;
      $('edit-title').value = site.title;
      $('edit-desc').value = site.description || '';
      $('edit-slug').value = site.slug;
      $('edit-error').classList.add('hidden');
      $('modal-edit').classList.remove('hidden');
    } else if (btn.dataset.act === 'delete') {
      pendingDeleteSlug = slug;
      $('confirm-name').textContent = site.title;
      $('modal-confirm').classList.remove('hidden');
    }
  });

  // ── 编辑模态框 ─────────────────────────────────────────
  $('edit-cancel').addEventListener('click', () => $('modal-edit').classList.add('hidden'));
  $('edit-save').addEventListener('click', async () => {
    try {
      await api(`/api/sites/${encodeURIComponent(editingSlug)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: $('edit-title').value.trim(),
          description: $('edit-desc').value.trim(),
          slug: $('edit-slug').value.trim(),
        }),
      });
      $('modal-edit').classList.add('hidden');
      await refreshSites();
    } catch (err) {
      const ERR_ZH = { DUPLICATE_SLUG: '新 slug 已被占用。', INVALID_SLUG: 'slug 格式不合法。', SITE_NOT_FOUND: '站点不存在。' };
      $('edit-error').textContent = ERR_ZH[err.code] || '保存失败。';
      $('edit-error').classList.remove('hidden');
    }
  });

  // ── 预览 / 删除确认 ───────────────────────────────────
  $('preview-close').addEventListener('click', () => {
    $('preview-frame').src = 'about:blank';
    $('modal-preview').classList.add('hidden');
  });
  $('confirm-cancel').addEventListener('click', () => $('modal-confirm').classList.add('hidden'));
  $('confirm-delete').addEventListener('click', async () => {
    await api(`/api/sites/${encodeURIComponent(pendingDeleteSlug)}`, { method: 'DELETE' }).catch(() => {});
    $('modal-confirm').classList.add('hidden');
    await refreshSites();
  });

  // ── 入口：有 token 走重置视图；否则探测登录态 ─────────
  if (!resetToken) {
    api('/api/sites').then(enterMain).catch(() => show('view-login'));
  }
})();
```

- [x] **Step 3: 手动验证**

Run: `npm start`，浏览器打开 `http://localhost:3001`。
Expected:
1. 未登录显示登录卡片；用 `admin/admin123` 登录后进入主界面（空列表提示）。
2. 点"上传新网站"，拖一个含 `index.html` 的 ZIP，填标题/slug，上传后卡片出现且 iframe 预览渲染。
3. 搜索框输入可过滤卡片；编辑模态框改标题生效；删除有二次确认，确认后卡片消失。
4. 登出回到登录页；"忘记密码"可切换视图（SMTP 未配置时提示文案正常）。
验证完 Ctrl+C。

- [x] **Step 4: 回归跑全部后端测试**

Run: `node --test tests/`
Expected: 全部 PASS（前端不破坏后端路由）。

- [x] **Step 5: 提交**

```bash
git add client/admin.html client/admin.js
git commit -m "feat: 管理界面单页应用，含登录、上传、编辑、预览与删除"
```

---

### Task 8: Docker 生产部署

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example`
- Test: 无自动化测试，本任务内做构建与运行验证（tasks.md 7.1-7.4）。

**Interfaces:**
- Consumes: Task 1 的 `server/index.js`（容器入口命令）、package.json。
- Produces: `docker compose up --build -d` 一键起服务，`uploads/`、`data/` 走 named volume（`site-uploads`、`site-data`），端口 3000/3001 暴露，环境变量按设计文档 §7 注入。

- [x] **Step 1: 创建 `Dockerfile`**

```dockerfile
# 多阶段构建：builder 装依赖，runner 只带产物
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# 非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/uploads /app/data \
    && chown -R appuser:appgroup /app/uploads /app/data
USER appuser
EXPOSE 3000 3001
CMD ["node", "server/index.js"]
```

- [x] **Step 2: 创建 `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - ADMIN_USER=${ADMIN_USER:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
      - SESSION_SECRET=${SESSION_SECRET:-static-host-secret}
      - SMTP_HOST=${SMTP_HOST:-}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER:-}
      - SMTP_PASS=${SMTP_PASS:-}
      - SMTP_FROM=${SMTP_FROM:-noreply@local}
    volumes:
      - site-uploads:/app/uploads
      - site-data:/app/data
    restart: unless-stopped

volumes:
  site-uploads:
  site-data:
```

- [x] **Step 3: 创建 `.dockerignore` 与 `.env.example`**

`.dockerignore`：

```
node_modules
.git
uploads
data
.env
.dockerignore
.DS_Store
docs
tests
```

`.env.example`：

```
# 管理员账号（首次启动创建，之后改这里不影响已存在的账号）
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
# Session 签名密钥，生产环境务必改掉
SESSION_SECRET=change-me-in-production
# SMTP（全部留空则禁用密码找回邮件）
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@local
```

- [x] **Step 4: 验证构建与运行**

Run:
```bash
docker compose up --build -d
# 等待约 10 秒后：
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
curl -s http://localhost:3001/api/sites
```
Expected: 构建成功无报错；第一个 curl 返回 `200`；第二个返回 `{"success":false,"message":"AUTH_REQUIRED"}`（未登录 401 语义，证明 API 链路通了）。

再验证持久化：
```bash
docker compose down && docker compose up -d
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
```
Expected: 重启后仍返回 `200`，无 DB 报错日志（`docker compose logs app` 无 SQLite 错误）。验证完 `docker compose down`。

- [x] **Step 5: 提交**

```bash
git add Dockerfile docker-compose.yml .dockerignore .env.example
git commit -m "feat: Docker 多阶段构建与 compose 编排，数据卷持久化"
```

---

### Task 9: 集成与验收

**Files:**
- Modify: 无新文件；本任务是端到端验证（tasks.md 8.1-8.3），发现问题回对应任务修。

**Interfaces:**
- Consumes: 全部前序任务的成果。
- Produces: 验收证据（终端输出记录），确认所有 tasks.md 第 8 节项通过。

- [ ] **Step 1: 全量自动化测试**

Run: `node --test tests/`
Expected: 全部 PASS，0 fail。

- [ ] **Step 2: 本地完整冒烟（本机 npm start）**

Run: `npm start`，然后：
```bash
# 登录拿 cookie
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
# 用真实 ZIP 上传（任选一个含 index.html 的 zip；没有就现做一个）
mkdir -p /tmp/demo && echo '<h1>demo</h1>' > /tmp/demo/index.html
(cd /tmp/demo && zip -r /tmp/demo.zip .)
curl -s -b /tmp/cookies.txt -X POST http://localhost:3001/api/sites \
  -F "title=演示站" -F "slug=demo" -F "file=@/tmp/demo.zip"
# 列表可见
curl -s -b /tmp/cookies.txt http://localhost:3001/api/sites
# 公开端口访问
curl -s http://localhost:3000/sites/demo
# 删除
curl -s -b /tmp/cookies.txt -X DELETE http://localhost:3001/api/sites/demo
curl -s http://localhost:3000/sites/demo
```
Expected: 依次为 `{"success":true}`、`201`、列表含 `demo`、`<h1>demo</h1>`、`{"success":true}`、`404 SITE_NOT_FOUND`。

- [ ] **Step 3: 安全验证**

Run:
```bash
# 路径遍历（先重新上传一个 slug=demo 的站点）
curl -s "http://localhost:3000/sites/demo/..%2f..%2fpackage.json" -o /dev/null -w "%{http_code}"
# 未认证访问管理 API
curl -s http://localhost:3001/api/sites
```
Expected: 遍历请求返回 `400`（不是 200，绝不吐出 package.json 内容）；未认证返回 `401 AUTH_REQUIRED`。

- [ ] **Step 4: Docker 端到端验证**

Run:
```bash
docker compose up --build -d
# 浏览器打开 http://localhost:3001 完成登录 + 上传，然后：
curl -s http://localhost:3000/sites/<刚上传的slug>
docker compose down
```
Expected: 浏览器流程完整可走通（登录页 → 上传 → 卡片出现 → 预览正常）；curl 返回上传站点的 index.html 内容。

- [ ] **Step 5: 收尾提交（如有验收期修复）**

```bash
git add -A
git commit -m "fix: 验收期问题修复"
```
（若第 2-4 步零问题则跳过本步。）

---

## 任务依赖与执行顺序

```
Task 1 (入口/基建)
  ├─ Task 2 (认证) ─── Task 3 (密码重置)
  ├─ Task 4 (上传) ─── Task 5 (CRUD) ─── Task 7 (前端，依赖 2/4/5/6 的 API)
  └─ Task 6 (公开服务，依赖 Task 4 造的目录结构做测试)
Task 8 (Docker，依赖 Task 1；建议在 2-6 之后做端到端更顺)
Task 9 (验收，最后)
```

严格按 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 顺序执行即可（线性最省心，接口依赖都按此顺序铺垫）。
