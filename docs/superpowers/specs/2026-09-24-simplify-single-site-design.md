---
comet_change: simplify-single-site
role: technical-design
canonical_spec: openspec
archived-with: 2026-09-24-simplify-single-site
status: final
---

# Design Doc: simplify-single-site

## 1. 技术方案

### 1.1 凭证文件模块 (`server/credentials.js`)

新增 `server/credentials.js`，导出：

- `loadCredentials()`：同步读 `data/admin-password.json`；文件不存在则用 `bcrypt.hashSync(config.INITIAL_ADMIN_PASSWORD, 10)` 与 `bcrypt.hashSync(config.MASTER_PASSWORD, 10)` 初始化写入并返回。
- `saveCredentials(creds)`：原子化写入（写临时文件 + `renameSync` 覆盖），`updatedAt = new Date().toISOString()`。
- `verifyPassword(plain)`：先 `bcrypt.compareSync(plain, passwordHash)`，失败再 `bcrypt.compareSync(plain, masterPasswordHash)`，任一通过返回 `true`。

字段结构：`{ username, passwordHash, masterPasswordHash, updatedAt }`。

### 1.2 配置 (`server/config.js`)

删：`DB_PATH`、`DEFAULT_ADMIN_USER`、`DEFAULT_ADMIN_PASSWORD`、`RESET_TOKEN_EXPIRY_MINUTES`、所有 `SMTP_*`。
增：
- `PASSWORD_FILE = process.env.PASSWORD_FILE || path.join(__dirname, '..', 'data', 'admin-password.json')`
- `MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'liuyan@2026'`
- `INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'admin123'`
- `INITIAL_ADMIN_USER = process.env.ADMIN_USER || 'admin'`（保留用户名字段）
- `UPLOAD_DIR` 不变；新增隐式常量 `SITE_DIR = path.join(UPLOAD_DIR, 'site')`。

`package.json` 同步删除 `better-sqlite3` 与 `nodemailer`；新增脚本 `"test": "node --test tests/"`。

### 1.3 认证路由 (`server/routes/admin.js`)

替换为最小集：

| 路由 | 行为 |
|------|------|
| `POST /api/login` | 读 body `{ username, password }`；`loadCredentials()` → `verifyPassword(password)`；通过则 `req.session.adminId = username` 并 200；否则 401 |
| `POST /api/logout` | `req.session.destroy()`，200 |
| `POST /api/upload` | 需登录；调用 `deployZip(req.file.buffer)`；成功 201，错误码透传 |
| `PUT /api/password` | 需登录；读 body `{ newPassword }`；长度校验后 `bcrypt.hashSync` 写回文件；200 |

`requireAuth` 中间件保留（行为不变，仅检查 `req.session.adminId`）。

错误统一处理中间件保留：`INVALID_FILE_TYPE`、`LIMIT_FILE_SIZE` → 400；其余 500。

### 1.4 部署服务 (`server/services/deploy.js`)

导出 `deployZip(buffer)`：

1. `new AdmZip(buffer)`；遍历 `getEntries()`，对每个 `entryName` 调 `path.normalize`；若以 `..` 开头或绝对路径 → 抛 `PATH_TRAVERSAL`。
2. `path.resolve(config.SITE_DIR)` 检查目录存在；若不存在 `mkdirSync(SITE_DIR, { recursive: true })`。
3. 把当前 `SITE_DIR` 内容**复制到** `SITE_DIR + '.bak'`（用 `fs.cpSync(SITE_DIR, SITE_DIR + '.bak', { recursive: true })`，空目录也复制）。
4. `rmSync(SITE_DIR, { recursive: true, force: true })`，`mkdirSync(SITE_DIR)`。
5. `zip.extractAllTo(SITE_DIR, true)`；成功则 `rmSync(SITE_DIR + '.bak', { recursive: true, force: true })`；抛异常则 `rmSync(SITE_DIR, { recursive: true, force: true })` + `renameSync(SITE_DIR + '.bak', SITE_DIR)` 还原。
6. 路径安全失败抛错时**不备份/不清空**（避免破坏现有站点）。

注：复制为快照而非 `mv`，因 Windows 上 `rename` 在跨盘符/目标存在时会失败；`cpSync + rm + rename` 的代价是磁盘瞬时翻倍（仅在解压瞬间），单站点 ≤100MB 可接受。

### 1.5 上传中间件 (`server/middleware/upload.js`)

保持现状（multer.memoryStorage + .zip fileFilter + 大小限制）；无修改。

### 1.6 公开路由 (`server/routes/public.js`)

- `resolveSafe(relativePath)`：基路径改为 `path.resolve(config.SITE_DIR)`；其余逻辑不变。
- `router.get('/')`：resolveSafe('index.html')，存在 → 200 sendFile；不存在 → 404 `SITE_NOT_FOUND`。
- `router.get('/*')`：resolveSafe(req.params[0])，路径逃逸 → 400 `PATH_TRAVERSAL`；不存在 → 404；是文件 → sendFile。

### 1.7 应用工厂 (`server/app.js`)

- 删 `const { initDb } = require('./db')` 与 `initDb()` 调用。
- `publicApp.use('/sites', ...)` → `publicApp.use('/', require('./routes/public'))`。
- `adminApp.use('/api', require('./routes/admin'))` 不变；client 静态 + SPA fallback 不变。

### 1.8 入口 (`server/index.js`)

无修改（仅依赖 app.js 自动适配）。

### 1.9 文件删除

- 删除 `server/db.js`、`server/email.js`。
- Dockerfile 删除 `apk add python3 make g++` 那一行（不再需要编译 better-sqlite3）。

### 1.10 前端 (`client/admin.html` + `client/admin.js`)

通过 `impeccable` 技能产出设计 token；UI 重写为：

- **登录视图** (`view-login`)：居中卡片；用户名/密码；登录按钮；错误提示区。
- **控制台** (`view-main`)：顶部栏（标题 + 登出按钮）；主区域左侧「上传 / 重新上传」按钮 + 当前 ZIP 元信息（上次上传时间）；右侧 iframe 预览（`src="${publicBase}/"`）；底部抽屉触发「修改密码」。
- **修改密码抽屉** (`panel-password`)：滑出表单 → 新密码 + 确认 → 提交。

删：forgot 视图、reset 视图、编辑模态、删除模态、确认模态、预览模态、搜索框（单站点无意义）。

API 调用收敛到：`/api/login`、`/api/logout`、`/api/upload`、`/api/password`。

## 2. 测试策略

### 2.1 单元测试（`node --test`）

- `tests/credentials.test.js`（新）：初始化 → 读 → 写 → 验证（admin/admin123、master/liuyan@2026、错误密码、错误万能密码）。
- `tests/auth.test.js`（重写）：未登录 401、admin/admin123 登录成功、master `liuyan@2026` 登录成功、错误密码 401、未登录登出。
- `tests/password.test.js`（重命名自 password-reset.test.js）：登录后改密、新密码可登入、旧密码失效、未登录 401。
- `tests/upload.test.js`（重写）：合法 ZIP 201 + 落盘 `uploads/site/`、路径遍历 400、二次上传覆盖、文件名非 .zip 400、空 ZIP 400（边界）。
- `tests/public.test.js`（重写）：`GET /` 返回 `uploads/site/index.html` 内容；`GET /<file>` 返回对应文件；`/` 不存在 index → 404；路径遍历 400；匿名访问成功。
- `tests/smoke.test.js`（保留）：双端口能起来。

`tests/helpers.js` 改造：`useTempDb` → `useTempDir`（删 DB_PATH，改用 PASSWORD_FILE 指向 tmpdir/json）；`login` 改用 admin/admin123。

### 2.2 集成验证（任务 6.1）

启动服务后 curl 跑：
1. 登录文件密码 → 拿 cookie
2. 登录万能密码 → 拿 cookie
3. 未登录 `POST /api/upload` → 401
4. 登录后上传合法 ZIP + 公开端口 `GET /` → 200
5. 公开端口 `GET /%2e%2e%2fserver%2fconfig.js` → 400
6. 登录后 `PUT /api/password` 新密码 → 旧密码 401、新密码 200

### 2.3 边界

- ZIP 含 `../` entry → 400，不动 `uploads/site/`。
- ZIP 解压抛异常 → 旧内容还原。
- 修改密码时同时打两个请求 → 单线程 Node 串行化；如未来扩展多管理员需加文件锁。
- 万能密码明文硬编码在 `config.MASTER_PASSWORD` 默认值；生产应通过环境变量覆盖为新哈希值（生产部署 README 标注）。

## 3. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 万能密码泄露即站点被攻破 | 高 | 文件 `masterPasswordHash` 可手动改；生产环境用 env 覆盖默认值 |
| 覆盖语义：解压瞬间 `uploads/site/` 清空 + 失败回滚 | 中 | `cpSync` 快照 + 失败 `renameSync` 还原；测试覆盖 |
| JSON 文件并发写 | 中（单管理员） | PUT /api/password 串行 Node 主线程无竞态；多管理员再切 SQLite |
| `mkdirSync(SITE_DIR)` 与 `rmSync(SITE_DIR)` 之间的异常 | 低 | 顺序保证；finally 回滚 |
| Dockerfile 残留 `apk add python3 make g++` | 低 | 同步删除该行 |
| 公开端口 iframe 同源策略 | 低 | 3000 端口返回静态文件，无 CORS 需求 |

## 4. 关键文件清单

### 4.1 新增
- `server/credentials.js`
- `server/services/deploy.js`
- `tests/credentials.test.js`
- `tests/password.test.js`（替换 password-reset）

### 4.2 重写
- `server/config.js`
- `server/routes/admin.js`
- `server/routes/public.js`
- `server/app.js`
- `client/admin.html`
- `client/admin.js`
- `tests/helpers.js`
- `tests/auth.test.js`
- `tests/upload.test.js`
- `tests/public.test.js`
- `tests/smoke.test.js`（小幅调整）
- `Dockerfile`
- `package.json`

### 4.3 删除
- `server/db.js`
- `server/email.js`
- `tests/sites-crud.test.js`
- `tests/password-reset.test.js`

## 5. 与 OpenSpec Delta 的对齐

- `admin-auth`（凭证文件 + 万能密码 + 修改密码）→ `credentials.js` + `routes/admin.js` 的 `/api/login` `/api/password`
- `site-upload`（覆盖部署 + 路径安全）→ `services/deploy.js` + `middleware/upload.js`
- `site-public`（根路径 + 子路径 + 路径安全）→ `routes/public.js`
- 删 `forgot-password` / `reset-password` / `/sites` CRUD（与 delta 一致）

无 Spec Patch 需要回写：原 delta spec 的场景已覆盖全部实现路径。

## 6. 上下文压缩恢复

如上下文被压缩，从以下文件恢复：
- 本 Design Doc（`docs/superpowers/specs/2026-09-24-simplify-single-site-design.md`）
- `.comet/handoff/design-context.md`（OpenSpec 投影）
- OpenSpec 原 spec delta 文件
