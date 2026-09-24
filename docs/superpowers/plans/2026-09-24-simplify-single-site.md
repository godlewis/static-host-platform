---
change: simplify-single-site
design-doc: docs/superpowers/specs/2026-09-24-simplify-single-site-design.md
base-ref: 5d42d194a57225994219edceb58f5a5492485178
archived-with: 2026-09-24-simplify-single-site
---

<!-- comet-task-authority: docs/openspec/changes/simplify-single-site/tasks.md -->

# 任务 1.1：凭证文件模块 (`server/credentials.js`)

新增 `server/credentials.js`，导出 `loadCredentials()` / `saveCredentials()` / `verifyPassword()` 三个函数。文件路径取自 `config.PASSWORD_FILE`，结构含 `username` / `passwordHash` / `masterPasswordHash` / `updatedAt`。缺失时用 `bcrypt.hashSync(config.INITIAL_ADMIN_PASSWORD, 10)` 与 `bcrypt.hashSync(config.MASTER_PASSWORD, 10)` 初始化写入。验证逻辑先比 `passwordHash`，失败再比 `masterPasswordHash`。

- **Step 1：编写失败的 `tests/credentials.test.js`** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

覆盖五种断言：初始化文件创建、读后写回读取、admin/admin123 验证、master `liuyan@2026` 验证、错误密码拒绝。`withTempCreds` 用 `fs.mkdtempSync` 隔离 `PASSWORD_FILE`，并在 finally 里清理 require 缓存。

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function withTempCreds(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
  process.env.PASSWORD_FILE = path.join(dir, 'creds.json');
  delete require.cache[require.resolve('../server/config')];
  delete require.cache[require.resolve('../server/credentials')];
  return fn().finally(() => {
    delete require.cache[require.resolve('../server/credentials')];
    delete require.cache[require.resolve('../server/config')];
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('loadCredentials initializes file when missing', async () => {
  await withTempCreds(async () => {
    const creds = require('../server/credentials').loadCredentials();
    assert.strictEqual(creds.username, 'admin');
    assert.ok(creds.passwordHash.startsWith('$2'));
    assert.ok(creds.masterPasswordHash.startsWith('$2'));
    assert.ok(fs.existsSync(process.env.PASSWORD_FILE));
  });
});

test('loadCredentials returns existing creds on second call', async () => {
  await withTempCreds(async () => {
    const first = require('../server/credentials').loadCredentials();
    first.passwordHash = 'changed';
    require('../server/credentials').saveCredentials(first);
    const second = require('../server/credentials').loadCredentials();
    assert.strictEqual(second.passwordHash, 'changed');
  });
});

test('verifyPassword accepts admin password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('admin123'), true);
  });
});

test('verifyPassword accepts master password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('liuyan@2026'), true);
  });
});

test('verifyPassword rejects wrong password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('wrong'), false);
  });
});
```

- **Step 2：跑测试确认 5/5 失败** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

```bash
node --test tests/credentials.test.js
# expected: 5 failed (Cannot find module '../server/credentials')
```

- **Step 3：新建 `server/credentials.js`，实现 `loadCredentials()`** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

文件不存在时用 `INITIAL_ADMIN_USER` / `INITIAL_ADMIN_PASSWORD` / `MASTER_PASSWORD` 三项 bcrypt 写入后返回；存在则 `JSON.parse` 读取。

```js
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const config = require('./config');

function loadCredentials() {
  const file = config.PASSWORD_FILE;
  if (!fs.existsSync(file)) {
    const creds = {
      username: config.INITIAL_ADMIN_USER,
      passwordHash: bcrypt.hashSync(config.INITIAL_ADMIN_PASSWORD, 10),
      masterPasswordHash: bcrypt.hashSync(config.MASTER_PASSWORD, 10),
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    saveCredentials(creds);
    return creds;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
```

- **Step 4：实现 `saveCredentials(creds)`（原子化写入）** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

写临时文件 + `renameSync` 覆盖，`updatedAt` 自动刷新到 ISO 字符串。

```js
function saveCredentials(creds) {
  const file = config.PASSWORD_FILE;
  creds.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(creds, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { loadCredentials, saveCredentials };
```

- **Step 5：实现 `verifyPassword(plain)`（文件密码 → master 密码 fallback）** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

先 `bcrypt.compareSync` 比 `passwordHash`，失败再比 `masterPasswordHash`，任一通过返回 `true`。

```js
function verifyPassword(plain) {
  const creds = loadCredentials();
  return bcrypt.compareSync(plain, creds.passwordHash) ||
         bcrypt.compareSync(plain, creds.masterPasswordHash);
}

module.exports = { loadCredentials, saveCredentials, verifyPassword };
```

- **Step 6：跑测试确认 5/5 通过** <!-- comet-task-ref:6a56b029-ccd9-4aff-8e04-a8e246932047 -->

```bash
node --test tests/credentials.test.js
# expected: 5 passed
```

# 任务 1.2：`server/config.js` + `package.json` 清理

删除 `DB_PATH` / `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD` / `RESET_TOKEN_EXPIRY_MINUTES` / SMTP 相关键，新增 `PASSWORD_FILE` / `MASTER_PASSWORD` / `INITIAL_ADMIN_PASSWORD` / `INITIAL_ADMIN_USER`，隐式常量 `SITE_DIR = path.join(UPLOAD_DIR, 'site')`。`package.json` 移除 `better-sqlite3` 与 `nodemailer` 后 `npm install` 成功。

- **Step 1：删除 `server/config.js` 旧键** <!-- comet-task-ref:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

把 `DB_PATH` / `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD` / `RESET_TOKEN_EXPIRY_MINUTES` 以及所有 `SMTP_*` 全部从文件中移除。

- **Step 2：新增凭证相关环境变量项** <!-- comet-task-ref:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

```js
const path = require('path');

module.exports = {
  ADMIN_PORT: process.env.ADMIN_PORT || 3001,
  PUBLIC_PORT: process.env.PUBLIC_PORT || 3000,

  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  SITE_DIR: process.env.SITE_DIR || path.join(__dirname, '..', 'uploads', 'site'),

  CLIENT_DIR: path.join(__dirname, '..', 'client'),

  PASSWORD_FILE: process.env.PASSWORD_FILE || path.join(__dirname, '..', 'data', 'admin-password.json'),
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || 'liuyan@2026',
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
  INITIAL_ADMIN_USER: process.env.ADMIN_USER || 'admin',

  SESSION_SECRET: process.env.SESSION_SECRET || 'static-host-secret-change-in-production',
  SESSION_NAME: 'static_host_session',

  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB) || 100,
};
```

- **Step 3：新增 `SITE_DIR` 常量（上文已含），把 `UPLOAD_DIR` 与 `SITE_DIR` 解耦** <!-- comet-task-ref:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

`SITE_DIR` 默认值 = `path.join(__dirname, '..', 'uploads', 'site')`；可通过环境变量 `SITE_DIR` 覆盖，部署测试用 `useTempDir` 注入临时路径。

- **Step 4：编辑 `package.json`，移除 `better-sqlite3` + `nodemailer`** <!-- comet-task-ref:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

```json
{
  "name": "static-host-platform",
  "version": "1.0.0",
  "description": "A platform for uploading and serving static HTML websites",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "adm-zip": "^0.5.10",
    "bcryptjs": "^2.4.3",
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "multer": "^2.4.0"
  }
}
```

- **Step 5：跑 `npm install` + 验证 `node --test` 仍能加载 `config.js`** <!-- comet-task-ref:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

```bash
npm install
# expected: better-sqlite3 与 nodemailer 被卸载；无 native 编译需求
node -e "console.log(Object.keys(require('./server/config')))"
# expected: 包含 PASSWORD_FILE / MASTER_PASSWORD / INITIAL_ADMIN_PASSWORD / SITE_DIR，不含 DB_PATH / DEFAULT_ADMIN_USER / DEFAULT_ADMIN_PASSWORD
```

# 任务 2.1：认证路由化简 (`server/routes/admin.js`)

重写 `server/routes/admin.js`，仅保留 `POST /api/login` / `POST /api/logout` / `POST /api/upload` / `PUT /api/password`。`POST /api/upload` 调用新的覆盖上传函数。补 `node --test` 覆盖登录三种路径 + 修改密码 + 未登录 401。

- **Step 1：编写失败的 `tests/auth.test.js`（5 cases）** <!-- comet-task-ref:3d4bb072-2277-4c27-bd69-75037f88e14b -->

```js
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
```

- **Step 2：跑测试确认 5/5 失败（旧路由被删，新路由尚未挂上）** <!-- comet-task-ref:3d4bb072-2277-4c27-bd69-75037f88e14b -->

```bash
node --test tests/auth.test.js
# expected: 5 failed (旧 endpoint 已被剔除，新 admin.js 未实现)
```

- **Step 3：重写 `server/routes/admin.js`，实现最小路由集** <!-- comet-task-ref:3d4bb072-2277-4c27-bd69-75037f88e14b -->

```js
// 管理 API：登录/登出/上传/改密
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { loadCredentials, saveCredentials, verifyPassword } = require('../credentials');
const requireAuth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { deployZip } = require('../services/deploy');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  if (!verifyPassword(password)) {
    return res.status(401).json({ success: false, message: 'INVALID_CREDENTIALS' });
  }
  req.session.adminId = username;
  res.json({ success: true });
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'MISSING_FIELDS' });
  }
  try {
    await deployZip(req.file.buffer);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.message === 'PATH_TRAVERSAL' || err.message === 'INVALID_ZIP' || err.message === 'EMPTY_ZIP') {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.put('/password', requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'INVALID_PASSWORD' });
  }
  const creds = loadCredentials();
  creds.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveCredentials(creds);
  res.json({ success: true });
});

router.use((err, req, res, next) => {
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, message: 'INVALID_FILE_TYPE' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'FILE_TOO_LARGE' });
  }
  console.error('[Admin]', err.message);
  res.status(500).json({ success: false, message: 'INTERNAL_ERROR' });
});

module.exports = router;
```

- **Step 4：确认 `requireAuth` / `upload` / `deployZip` 依赖可解析（任务 1.1 + 中间件 + 任务 3.1 需先就绪）** <!-- comet-task-ref:3d4bb072-2277-4c27-bd69-75037f88e14b -->

执行顺序：先完成 1.1 + 3.1 再回到本任务跑测试。

- **Step 5：跑测试确认 5/5 通过** <!-- comet-task-ref:3d4bb072-2277-4c27-bd69-75037f88e14b -->

```bash
node --test tests/auth.test.js
# expected: 5 passed
```

# 任务 2.2：删除 `server/db.js` + `server/email.js`

两个文件已无引用，删除文件并移除 `initDb()` 调用。`node --test` 全量回归 27/27 + 1.1/2.1 新增 case 通过。

- **Step 1：删除 `server/db.js` 与 `server/email.js`** <!-- comet-task-ref:bbff9e1b-0f41-46a8-99c7-c00eee5d029f -->

```bash
git rm server/db.js server/email.js
```

- **Step 2：从 `server/app.js` + `server/index.js` 移除 `initDb` 调用** <!-- comet-task-ref:bbff9e1b-0f41-46a8-99c7-c00eee5d029f -->

`server/app.js` 删除 `const { initDb } = require('./db')` 与 `initDb()` 行；`server/index.js` 无 `initDb` 引用，保留双端口 `listen` 即可。

- **Step 3：跑全量 `node --test` 确认所有用例通过** <!-- comet-task-ref:bbff9e1b-0f41-46a8-99c7-c00eee5d029f -->

```bash
node --test tests/*.test.js
# expected: 所有现有 case 通过；credentials.test.js + auth.test.js 新增 8 case 全 pass
```

# 任务 3.1：部署服务 (`server/services/deploy.js`)

新建 `server/services/deploy.js`，导出 `deployZip(buffer)`。解压前对每个 entry 做路径安全校验（拒绝 `..` 与绝对路径），通过后清空 `uploads/site/` 再解压，失败时回滚到清空前快照。`node --test` 覆盖合法 ZIP / 路径遍历拒绝 / 二次上传覆盖 / 解压失败回滚四种场景。

- **Step 1：编写失败的 `tests/upload.test.js`（4 cases）** <!-- comet-task-ref:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

覆盖合法 ZIP 落盘、路径遍历 400 不落盘、二次上传覆盖、解压失败回滚保留旧内容、非 .zip 400、未登录 401（cases 4-6 由 multer + requireAuth 覆盖）。

```js
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { useTempDir, startServer, login, makeZip } = require('./helpers');
const { makeRawZip } = require('./zipbuilder');

useTempDir();

async function uploadZip(adminUrl, cookie, { files, filename = 'site.zip' }) {
  const form = new FormData();
  const buf = files ? makeZip(files) : Buffer.alloc(0);
  form.append('file', new Blob([buf]), filename);
  return fetch(`${adminUrl}/api/upload`, {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  });
}

test('合法 ZIP 201，文件落盘 uploads/site/', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const res = await uploadZip(adminUrl, cookie, {
      files: { 'index.html': '<h1>hello</h1>', 'css/style.css': 'body{}' },
    });
    assert.strictEqual(res.status, 201);
    const config = require('../server/config');
    assert.ok(fs.existsSync(path.join(config.SITE_DIR, 'index.html')));
    assert.ok(fs.existsSync(path.join(config.SITE_DIR, 'css', 'style.css')));
  } finally { close(); }
});

test('路径遍历 entry 400，不动 uploads/site/', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    const zipBuf = makeRawZip('../evil.txt', 'pwned');
    const form = new FormData();
    form.append('file', new Blob([zipBuf]), 'evil.zip');
    const res = await fetch(`${adminUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).message, 'PATH_TRAVERSAL');
    const config = require('../server/config');
    assert.ok(!fs.existsSync(path.join(config.SITE_DIR, 'evil.txt')));
  } finally { close(); }
});

test('第二次上传覆盖前次内容', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'v1' } });
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'v2' } });
    const config = require('../server/config');
    assert.strictEqual(fs.readFileSync(path.join(config.SITE_DIR, 'index.html'), 'utf8'), 'v2');
  } finally { close(); }
});

test('解压失败回滚：旧内容保留', async () => {
  const { adminUrl, close } = await startServer();
  try {
    const cookie = await login(adminUrl);
    await uploadZip(adminUrl, cookie, { files: { 'index.html': 'good' } });
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a zip')]), 'bad.zip');
    const res = await fetch(`${adminUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookie }, body: form,
    });
    assert.ok(res.status === 400 || res.status === 500);
    const config = require('../server/config');
    assert.strictEqual(fs.readFileSync(path.join(config.SITE_DIR, 'index.html'), 'utf8'), 'good');
  } finally { close(); }
});
```

- **Step 2：跑测试确认至少 4/6 失败（deployZip 尚未实现）** <!-- comet-task-ref:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

```bash
node --test tests/upload.test.js
# expected: Cannot find module '../services/deploy' → 全 fail
```

- **Step 3：新建 `server/services/deploy.js`：ZIP 解析 + 路径安全校验** <!-- comet-task-ref:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

`new AdmZip(buffer)` 解析失败抛 `INVALID_ZIP`；`getEntries()` 为空抛 `EMPTY_ZIP`；遍历 entry 时 `path.normalize(entry.entryName).startsWith('..')` 或 `path.isAbsolute()` 任一命中抛 `PATH_TRAVERSAL`（在动盘之前）。

```js
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const config = require('../config');

async function deployZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    throw new Error('INVALID_ZIP');
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('EMPTY_ZIP');
  }

  for (const entry of entries) {
    const normalized = path.normalize(entry.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('PATH_TRAVERSAL');
    }
  }
```

- **Step 4：实现快照 + 解压 + 回滚逻辑** <!-- comet-task-ref:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

先把 `SITE_DIR` 整个 `cpSync` 到 `SITE_DIR + '.bak'`（空目录也复制）；再 `rmSync` 清空 + `mkdirSync` 重建；`extractAllTo(SITE_DIR, true)`；成功删 `.bak`；失败 `rmSync(SITE_DIR)` 后 `renameSync(.bak, SITE_DIR)` 还原。

```js
  const siteDir = config.SITE_DIR;
  const bakDir = siteDir + '.bak';

  fs.mkdirSync(siteDir, { recursive: true });

  if (fs.existsSync(siteDir)) {
    fs.cpSync(siteDir, bakDir, { recursive: true });
  }

  try {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.mkdirSync(siteDir);
    zip.extractAllTo(siteDir, true);
    if (fs.existsSync(bakDir)) {
      fs.rmSync(bakDir, { recursive: true, force: true });
    }
  } catch (e) {
    fs.rmSync(siteDir, { recursive: true, force: true });
    if (fs.existsSync(bakDir)) {
      fs.renameSync(bakDir, siteDir);
    }
    throw e;
  }
}

module.exports = { deployZip };
```

注：路径安全失败时**不**走快照分支——预扫描阶段直接抛错，不动 `uploads/site/`，与决策 4「覆盖语义」一致。

- **Step 5：跑测试确认 4/4 主要场景通过** <!-- comet-task-ref:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

```bash
node --test tests/upload.test.js
# expected: 6 passed（含 INVALID_FILE_TYPE 与未登录 401 的 multer / requireAuth 路径）
```

# 任务 4.1：公开路由根路径化 (`server/routes/public.js` + `server/app.js`)

重写 `server/routes/public.js`：删除 slug 参数，根路径 `/` 提供 `uploads/site/index.html`，子路径从同一目录 serve 文件，路径安全 `resolveSafe` 改为校验 `uploads/site/`。`server/app.js` 改为 `publicApp.use('/', require('./routes/public'))`。`node --test` 覆盖根路径默认页 / 子路径文件 / 路径遍历 400 / 不存在 404 / 匿名访问五种场景。

- **Step 1：编写失败的 `tests/public.test.js`（5 cases）** <!-- comet-task-ref:0162d35f-71bf-4b52-8e85-8b932637071c -->

```js
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
```

- **Step 2：跑测试确认 5/5 失败（路由尚未改造）** <!-- comet-task-ref:0162d35f-71bf-4b52-8e85-8b932637071c -->

```bash
node --test tests/public.test.js
# expected: 5 failed（旧 routes/public.js 仍挂 /sites，新路由未挂）
```

- **Step 3：重写 `server/routes/public.js`，实现 `resolveSafe` + 根/子路径** <!-- comet-task-ref:0162d35f-71bf-4b52-8e85-8b932637071c -->

`resolveSafe` 基路径改为 `path.resolve(config.SITE_DIR)`；`cleanRel` 去掉前导 `/`；`requestedPath` 必须等于 `basePath` 或以 `basePath + path.sep` 开头，否则返回 `null`。

```js
// 公开静态服务：从 uploads/site/ 提供站点文件，带路径逃逸防护
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const router = express.Router();

function resolveSafe(relativePath) {
  const basePath = path.resolve(config.SITE_DIR);
  const cleanRel = (relativePath || 'index.html').replace(/^\/+/, '');
  const requestedPath = path.resolve(basePath, cleanRel);
  if (requestedPath !== basePath && !requestedPath.startsWith(basePath + path.sep)) {
    return null;
  }
  return requestedPath;
}

router.get('/', (req, res) => {
  const filePath = resolveSafe('index.html');
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
  res.sendFile(filePath);
});

router.get(/^\/(.*)/, (req, res) => {
  const rel = req.params[0] || 'index.html';
  const filePath = resolveSafe(rel);
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

- **Step 4：更新 `server/app.js`：`publicApp.use('/sites', ...)` 改为 `publicApp.use('/', ...)`** <!-- comet-task-ref:0162d35f-71bf-4b52-8e85-8b932637071c -->

```js
// 应用工厂：构建管理端与公开端两个 Express 实例（不监听，便于测试）
const express = require('express');
const path = require('path');
const session = require('express-session');
const config = require('./config');

function createApps() {
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use(session({
    secret: config.SESSION_SECRET,
    name: config.SESSION_NAME,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  }));
  adminApp.use('/api', require('./routes/admin'));
  adminApp.use(express.static(config.CLIENT_DIR));
  adminApp.get('*', (req, res) => {
    res.sendFile(path.join(config.CLIENT_DIR, 'admin.html'));
  });

  const publicApp = express();
  publicApp.use('/', require('./routes/public'));

  return { adminApp, publicApp };
}

module.exports = { createApps };
```

- **Step 5：跑测试确认 5/5 通过** <!-- comet-task-ref:0162d35f-71bf-4b52-8e85-8b932637071c -->

```bash
node --test tests/public.test.js
# expected: 7 passed（含 index.html 不存在但 page.html 存在等补充用例）
```

# 任务 5.1：前端控制台重写 (`client/admin.html` + `client/admin.js`)

build 阶段通过 `impeccable` 技能产出设计 token（颜色 / 字体 / 间距 / 按钮 / 表单 / 错误状态），据此重写 `client/admin.html` + `client/admin.js`。把站点列表/编辑/删除卡片网格替换为「当前站点预览 iframe + 上传/重新上传按钮 + 修改密码抽屉」三块。保持 3001 同源登录 Session 流。启动 `npm start` 后登录、上传、修改密码、登出浏览器走通。

- **Step 1：调用 `impeccable` 技能产出设计 token** <!-- comet-task-ref:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

```bash
/impeccable
# 产出：颜色（--bg / --surface / --text / --primary / --error-* / --success）、字体 stack、间距 scale、按钮三态、错误态 --radius / --shadow 三个 token
```

- **Step 2：重写 `client/admin.html`，实现 login / main / password drawer 三块** <!-- comet-task-ref:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>静态网站托管平台</title>
  <style>
    :root {
      --bg: #f5f5f7;
      --surface: #ffffff;
      --text: #1d1d1f;
      --text-secondary: #6e6e73;
      --border: #d2d2d7;
      --primary: #007aff;
      --primary-hover: #0066d6;
      --error-bg: #fee;
      --error-text: #c00;
      --success: #34c759;
      --radius: 8px;
      --shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .hidden { display: none !important; }
    .card { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 32px; }
    .input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
    .input:focus { outline: none; border-color: var(--primary); }
    .btn { padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: var(--primary); color: white; }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-danger { background: #ff3b30; }
    .btn-danger:hover { background: #d70015; }
    .error-msg { background: var(--error-bg); color: var(--error-text); padding: 10px; border-radius: 6px; font-size: 13px; }

    #view-login { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .login-card { width: 360px; }
    .login-card h1 { margin: 0 0 24px; font-size: 22px; text-align: center; }

    #view-main { min-height: 100vh; }
    .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .topbar h1 { margin: 0; font-size: 18px; }
    .main-content { max-width: 1200px; margin: 24px auto; padding: 0 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .panel { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; }
    .panel h2 { margin: 0 0 16px; font-size: 16px; }
    .upload-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 32px; text-align: center; cursor: pointer; color: var(--text-secondary); }
    .upload-zone:hover, .upload-zone.dragover { border-color: var(--primary); color: var(--primary); }
    .meta { font-size: 13px; color: var(--text-secondary); margin-top: 12px; }
    .preview-frame { width: 100%; height: 480px; border: 1px solid var(--border); border-radius: var(--radius); background: white; }

    #panel-password { position: fixed; top: 0; right: -400px; width: 400px; height: 100vh; background: var(--surface); box-shadow: -2px 0 8px rgba(0,0,0,0.1); transition: right 0.2s; padding: 32px; z-index: 100; }
    #panel-password.open { right: 0; }
    #panel-password h2 { margin: 0 0 24px; }
  </style>
</head>
<body>

  <div id="view-login" class="hidden">
    <div class="card login-card">
      <h1>静态网站托管平台</h1>
      <div id="login-error" class="error-msg hidden mb-3"></div>
      <form id="login-form">
        <div style="margin-bottom: 12px;">
          <input id="login-username" class="input" type="text" placeholder="用户名" required>
        </div>
        <div style="margin-bottom: 16px;">
          <input id="login-password" class="input" type="password" placeholder="密码" required>
        </div>
        <button type="submit" class="btn" style="width: 100%;">登录</button>
      </form>
    </div>
  </div>

  <div id="view-main" class="hidden">
    <div class="topbar">
      <h1>静态网站托管</h1>
      <div>
        <button id="btn-password" class="btn btn-secondary" style="margin-right: 8px;">修改密码</button>
        <button id="btn-logout" class="btn btn-secondary">登出</button>
      </div>
    </div>
    <div class="main-content">
      <div class="panel">
        <h2>站点</h2>
        <div id="drop-zone" class="upload-zone">
          拖拽 ZIP 到这里，或点击选择文件
          <input id="upload-file" type="file" accept=".zip" style="display:none;">
        </div>
        <div id="upload-error" class="error-msg hidden" style="margin-top: 12px;"></div>
        <div id="site-meta" class="meta">尚未上传站点</div>
      </div>
      <div class="panel">
        <h2>预览</h2>
        <iframe id="preview-frame" class="preview-frame" sandbox="allow-scripts"></iframe>
      </div>
    </div>
  </div>

  <div id="panel-password" class="hidden">
    <h2>修改密码</h2>
    <div id="password-error" class="error-msg hidden" style="margin-bottom: 12px;"></div>
    <form id="password-form">
      <div style="margin-bottom: 12px;">
        <input id="new-password" class="input" type="password" placeholder="新密码（≥6 字符）" required minlength="6">
      </div>
      <div style="margin-bottom: 16px;">
        <input id="confirm-password" class="input" type="password" placeholder="确认新密码" required minlength="6">
      </div>
      <button type="submit" class="btn" style="width: 100%;">保存</button>
      <button type="button" id="btn-password-close" class="btn btn-secondary" style="width: 100%; margin-top: 8px;">取消</button>
    </form>
  </div>

  <script src="/admin.js"></script>
</body>
</html>
```

- **Step 3：重写 `client/admin.js`，实现 api wrapper + view 切换 + 上传/密码逻辑** <!-- comet-task-ref:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

```js
// client/admin.js
(function () {
  'use strict';

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
  function show(viewId) {
    ['view-login', 'view-main'].forEach((v) => $(v).classList.toggle('hidden', v !== viewId));
  }

  const publicBase = `${location.protocol}//${location.hostname}:3000`;

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

  function enterMain() {
    show('view-main');
    $('preview-frame').src = `${publicBase}/`;
    $('site-meta').textContent = '正在加载…';
    fetch(`${publicBase}/`, { method: 'HEAD' }).then((r) => {
      $('site-meta').textContent = r.ok ? `上次更新：${new Date().toLocaleString('zh-CN')}` : '尚未上传站点';
    });
  }

  api('/api/upload', { method: 'POST' }).then(
    () => show('view-main'),
    (err) => { if (err.status !== 401) show('view-main'); else show('view-login'); }
  );

  $('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    show('view-login');
  });

  const dropZone = $('drop-zone');
  const fileInput = $('upload-file');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      doUpload();
    }
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) doUpload(); });

  async function doUpload() {
    const file = fileInput.files[0];
    if (!file) return;
    const errBox = $('upload-error');
    errBox.classList.add('hidden');
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.onload = () => {
      if (xhr.status === 201) {
        $('preview-frame').src = `${publicBase}/?t=${Date.now()}`;
        $('site-meta').textContent = `上传于：${new Date().toLocaleString('zh-CN')}`;
        fileInput.value = '';
      } else {
        const ERR_ZH = {
          INVALID_FILE_TYPE: '只能上传 .zip 文件。',
          FILE_TOO_LARGE: '文件超过 100MB 限制。',
          PATH_TRAVERSAL: 'ZIP 内包含非法路径，已拒绝。',
          INVALID_ZIP: 'ZIP 文件损坏。',
        };
        let msg = '上传失败。';
        try { msg = ERR_ZH[JSON.parse(xhr.responseText).message] || msg; } catch (_) {}
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    };
    xhr.send(fd);
  }

  $('btn-password').addEventListener('click', () => {
    $('panel-password').classList.remove('hidden');
    requestAnimationFrame(() => $('panel-password').classList.add('open'));
  });
  $('btn-password-close').addEventListener('click', closePasswordDrawer);

  function closePasswordDrawer() {
    $('panel-password').classList.remove('open');
    setTimeout(() => $('panel-password').classList.add('hidden'), 200);
  }

  $('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('password-error');
    errBox.classList.add('hidden');
    const newPwd = $('new-password').value;
    const confirmPwd = $('confirm-password').value;
    if (newPwd !== confirmPwd) {
      errBox.textContent = '两次输入的密码不一致';
      errBox.classList.remove('hidden');
      return;
    }
    try {
      await api('/api/password', {
        method: 'PUT',
        body: JSON.stringify({ newPassword: newPwd }),
      });
      closePasswordDrawer();
      $('new-password').value = '';
      $('confirm-password').value = '';
    } catch (err) {
      errBox.textContent = err.code === 'INVALID_PASSWORD' ? '密码长度至少 6 位' : '保存失败';
      errBox.classList.remove('hidden');
    }
  });
})();
```

- **Step 4：本地启动 `npm start` 验证登录 + 改密流程** <!-- comet-task-ref:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

```bash
npm start
# 浏览器访问 http://localhost:3001
# - 输 admin/admin123 登录
# - 点「修改密码」抽屉弹出，确认旧密码 401、新密码可登入
# - 截屏确认无样式坍塌
```

- **Step 5：浏览器验证上传 + 预览更新** <!-- comet-task-ref:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

```bash
# 准备一个最小 ZIP
mkdir site && echo '<h1>v1</h1>' > site/index.html && cd site && zip ../s.zip index.html
# 浏览器上传 → 右侧 iframe 显示 v1
# 重新打包替换为 '<h1>v2</h1>' 再上传 → iframe 显示 v2
# 截屏与上一步对比
```

# 任务 6.1：集成与验收

清理旧 `data/sites.db` 与 `uploads/*/sites/{slug}/` 残余目录（README 标注手动步骤，不强制删除）。启动服务后跑 `node --test` 全量测试。用 curl 验证 6 个端到端流：登录（文件密码）/ 登录（万能密码）/ 未登录上传 401 / 上传合法 ZIP + 公开端口 200 / 路径遍历 400 / 修改密码后旧密码 401 + 新密码 200。

- **Step 1：手动清理旧数据（README 标注步骤，不强制执行）** <!-- comet-task-ref:4093a96b-566b-4caa-aa3a-8504234b683f -->

```bash
# 清理 SQLite 旧数据库
rm -f data/sites.db
# 清理多站点残留目录
rm -rf uploads/sites/
# 当前单一 site 目录不受影响
ls uploads/
# expected: site/ (and possibly .bak/ if interrupted rollback)
```

- **Step 2：跑全量 `node --test` 确认所有用例通过** <!-- comet-task-ref:4093a96b-566b-4caa-aa3a-8504234b683f -->

```bash
npm test
# expected: credentials.test.js (5) + auth.test.js (5) + password.test.js (3) + upload.test.js (6) + public.test.js (7) + smoke.test.js 等全 pass
```

- **Step 3：用 curl 跑 6 个端到端流** <!-- comet-task-ref:4093a96b-566b-4caa-aa3a-8504234b683f -->

```bash
# 1. 文件密码登录拿 cookie
curl -i -c /tmp/c1.txt -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# expected: 200 + Set-Cookie: static_host_session=...

# 2. 万能密码登录拿 cookie
curl -i -c /tmp/c2.txt -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"liuyan@2026"}'
# expected: 200 + Set-Cookie

# 3. 未登录上传 401
curl -i -X POST http://localhost:3001/api/upload -F file=@/tmp/s.zip
# expected: 401 AUTH_REQUIRED

# 4. 登录后上传合法 ZIP + 公开端口 200
curl -i -b /tmp/c1.txt -X POST http://localhost:3001/api/upload -F file=@/tmp/s.zip
# expected: 201
curl -i http://localhost:3000/
# expected: 200，返回 index.html 内容

# 5. 路径遍历 400
curl -i 'http://localhost:3000/%2e%2e%2fserver%2fconfig.js'
# expected: 400 PATH_TRAVERSAL

# 6. 改密后旧密码 401 + 新密码 200
curl -i -b /tmp/c1.txt -X PUT http://localhost:3001/api/password \
  -H 'Content-Type: application/json' \
  -d '{"newPassword":"newSecret1"}'
# expected: 200
curl -i -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# expected: 401
curl -i -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"newSecret1"}'
# expected: 200
```

- **Step 4：README 补充清理步骤 + 万能密码覆盖说明** <!-- comet-task-ref:4093a96b-566b-4caa-aa3a-8504234b683f -->

在 README「部署」段落加一行：`data/sites.db` 与 `uploads/sites/` 为多站点版残留，首次升级到单站点版可手动删除。同时加一句「生产环境务必通过 `MASTER_PASSWORD` 与 `INITIAL_ADMIN_PASSWORD` 环境变量覆盖默认值」。
