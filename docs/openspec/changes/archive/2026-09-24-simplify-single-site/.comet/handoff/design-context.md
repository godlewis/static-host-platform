# Comet Design Handoff

- Change: simplify-single-site
- Phase: design
- Mode: compact
- Context hash: 3666aa4e1aa2a7ea1d8d0113beae27e2a838254a3f65361574cb200cc7267b31

Generated-by: comet-handoff.sh
Task hash policy: task-content-v1. Read tasks.md for live completion; excerpts are design-time context.

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## docs/openspec/changes/simplify-single-site/proposal.md

- Source: docs/openspec/changes/simplify-single-site/proposal.md
- Lines: 1-36
- SHA256: 9d21ac3b0c48e4966bd37eb4aeebbf11930ae14af5a281893626a9d8f10490be

```md
# Proposal

## Why

上一版 `static-host-platform` 实现了完整的多站点托管能力，但用户实际只需要「一个站点 + 一个管理员」的极简形态。多站点抽象、邮箱密码找回、SQLite 表等资产在新需求下都是过设计，需要大幅化简并把凭证存储从 SQLite 改为文件，同时引入万能密码作为忘记密码兜底。

## What Changes

- 后端只服务单站点：移除多站点 CRUD / 列表 / 删除 / slug 唯一约束
- 公开路由从 `/sites/:slug/*` 收敛到根路径 `/`
- 站点目录固定为 `uploads/site/`，再次上传前清空旧文件再解压（覆盖语义）
- 凭证存储从 SQLite `admins` 表迁出到文件 `data/admin-password.json`
- 登录接受两种凭据：文件内 bcrypt 哈希、或万能密码 `liuyan@2026`（bcrypt 哈希形式存于文件，首次启动写入）
- 新增「修改密码」API（PUT /api/password），替代邮箱密码找回流
- 删除 `server/db.js` / `server/email.js` / `server/middleware/upload.js` 的多站点依赖；保留上传中间件核心
- 前端重新设计为「控制台 / 登录 / 修改密码 / 上传」四块，调用 impeccable 技能

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `admin-auth`: 文件化单管理员认证，登录接受文件密码或万能密码 `liuyan@2026`，新增修改密码，删除邮箱密码找回
- `site-upload`: 单站点 ZIP 上传与覆盖部署，去除 slug 唯一约束
- `site-public`: 公开路径从 `/sites/:slug/*` 收敛到根 `/`，站点目录固定 `uploads/site/`

## Impact

- 删除：`server/db.js`、`server/email.js`、`server/middleware/auth.js` 的多用户逻辑、`server/routes/admin.js` 的 CRUD、`server/routes/public.js` 的 slug 路由、`server/middleware/upload.js` 的多文件约束
- 修改：`server/app.js`、`server/index.js`、`server/config.js`、`server/routes/admin.js`、`server/routes/public.js`、`server/middleware/upload.js`、`client/admin.html`、`client/admin.js`
- 删除依赖：`better-sqlite3`、`nodemailer`（package.json 同步减重）
- 数据迁移：旧 `data/sites.db` 不再需要；`uploads/*/sites/{slug}/` 收敛为 `uploads/site/`
- API 变更：管理端 API 大幅裁剪（`POST /api/login` / `POST /api/logout` / `POST /api/upload` / `PUT /api/password`），公开端从 `/sites/:slug/*` 改为 `/`
- 安全影响：万能密码明文硬编码到首次启动写入文件；文件密码变更后万能密码仍有效
```

## docs/openspec/changes/simplify-single-site/design.md

- Source: docs/openspec/changes/simplify-single-site/design.md
- Lines: 1-85
- SHA256: e669ce99b6936a5837a96628314e97181c78f4f36046bab6b01d915282bd7303

[TRUNCATED]

```md
# Design

## Context

仓库当前是上一轮多站点版的成果（刚归档 `static-host-platform`）。现存的 `server/`、`client/`、`package.json` 全部按多站点设计，需要在同一仓库直接化简。

公开端口 `3000` 与管理端口 `3001` 双端口架构保留（已运行稳定）；站点数据目录 `uploads/` 保留，仅内部目录从按 slug 收敛为单一 `uploads/site/`。

凭证从 SQLite 迁到 JSON 文件，启动时若文件缺失则用默认密码 + 万能密码 `liuyan@2026` 写入。代码不再硬编码明文万能密码，统一以 bcrypt 哈希形式与文件密码共存于同一文件。

## Goals / Non-Goals

**Goals:**
- 单站点管理（仅一个根目录 / 一个 ZIP 槽位）
- 文件存凭证，启动自检（缺失则用默认值初始化）
- 万能密码兜底（bcrypt 哈希 + 启动写入）
- 修改密码 API（登录后）
- 控制台 UI 重新设计，调用 impeccable 技能输出视觉规格
- Docker 构建仍能跑通

**Non-Goals:**
- 多站点 / 多租户
- 邮箱密码找回 / SMTP
- 用户注册 / 多管理员
- 路径级访问控制（公开端纯静态）

## Decisions

### 决策 1：双端口架构保留

**选择**：继续保留 admin (3001) + public (3000) 双端口。
**理由**：上一轮已验证稳定，简化需求只改内部实现不动端口契约。
**替代方案**：合并到单端口 + 路径前缀；会增加管理端公网暴露面。

### 决策 2：凭证文件 `data/admin-password.json`

**选择**：单文件 JSON，结构 `{ username, passwordHash, masterPasswordHash, updatedAt }`。
**理由**：单管理员场景无并发写，单文件读改原子化最简单；与 SQLite 比减一个 native 依赖。
**替代方案**：纯文本明文 + `.env`；不抗源码泄露，且环境变量文件修改后需重启。

### 决策 3：万能密码存为 bcrypt 哈希

**选择**：启动时若文件缺失，把 `liuyan@2026` 与默认用户密码 `admin123` 分别 bcrypt 后写入文件；登录时先按文件 `passwordHash` 校验，失败再按 `masterPasswordHash` 校验。
**理由**：源码不暴露明文万能密码；与文件密码同等强度比较；忘文件密码仍能登入。
**替代方案**：源码硬编码明文常量；对比文件时省一次 bcrypt，但牺牲源码可审计性。

### 决策 4：站点目录固定 `uploads/site/` + 覆盖语义

**选择**：上传前 `rmSync(uploads/site, {recursive: true, force: true})`，再解压到该目录。
**理由**：单站点场景不存在「保留旧版」语义；覆盖简化前端「再次上传」交互。
**替代方案**：保留旧版做备份目录；增加复杂度但收益低。

### 决策 5：公开路由直接挂根

**选择**：`publicApp.use('/', require('./routes/public'))`，从 `uploads/site/` 提供文件，`/` 命中 `index.html`。
**理由**：用户原话「前端展示也只展示一个站点（网站根地址）」；语义最直接。
**替代方案**：`/site/*` 中转；多一层无意义前缀。

### 决策 6：UI 视觉用 impeccable 技能

**选择**：build 阶段实施前端时加载 `impeccable` 技能，把控制台/登录/上传/修改密码界面统一视觉规范。
**理由**：用户原话指定；impeccable 输出设计系统规范，避免每次页面拼凑样式。

### 决策 7：删除 better-sqlite3 + nodemailer

**选择**：package.json 移除以上两个依赖；`server/db.js` / `server/email.js` 文件一并删除。
**理由**：随凭证文件化、删邮件找回，两个依赖成为死代码；保留会扩大 Node ABI 风险面。

## Risks / Trade-offs

- **万能密码泄露 = 站点被破解** → 源码与文件双控；生产环境应改文件 `masterPasswordHash` 为不同值
- **覆盖语义 = 上传中途崩溃会让旧站也丢失** → 解压失败时回滚策略：保留旧目录的预快照，失败时 `renameSync` 回滚；最后验收时验证
- **明文密码在源码（`config.DEFAULT_*`）** → 仅用于首次启动写文件；生产环境应通过 `INITIAL_ADMIN_PASSWORD` 环境变量覆盖
- **JSON 文件并发写** → 单管理员场景下 PUT /api/password 串行化无竞态；如未来多管理员需切换 SQLite

## Migration Plan

无历史数据迁移。化简版首次启动：
1. 若 `data/admin-password.json` 不存在，用默认密码 + 万能密码 bcrypt 后写入
2. `uploads/site/` 若不存在则创建（首次上传前为空）

```

Full source: docs/openspec/changes/simplify-single-site/design.md

## docs/openspec/changes/simplify-single-site/tasks.md

- Source: docs/openspec/changes/simplify-single-site/tasks.md
- Lines: 1-26
- SHA256: d4fb61a4da42651f9eff86cf9dc5a2dfe8f6e6d6f41aa6edc41482c97a2f0d59

```md
# Tasks

## 1. 凭证文件模块

- [ ] 1.1 创建 `server/credentials.js`：实现 `loadCredentials()` 与 `saveCredentials()`，文件路径取自 `config.PASSWORD_FILE`，结构含 username/passwordHash/masterPasswordHash/updatedAt；缺失时用默认密码与万能密码 `liuyan@2026` 初始化，并通过 `node --test` 单测验证初始化/读取/写入/更新四类路径
- [ ] 1.2 在 `server/config.js` 中删除 `DB_PATH` / `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD` / `RESET_TOKEN_EXPIRY_MINUTES` / SMTP 相关键，新增 `PASSWORD_FILE`（默认 `data/admin-password.json`）、`MASTER_PASSWORD`（默认 `liuyan@2026`）、`INITIAL_ADMIN_PASSWORD`（默认 `admin123`），并删除 `package.json` 中 `better-sqlite3` 与 `nodemailer` 两个依赖后 `npm install` 成功

## 2. 认证路由化简

- [ ] 2.1 重写 `server/routes/admin.js`：仅保留 `POST /api/login`（文件密码 + 万能密码二选一）/ `POST /api/logout` / `POST /api/upload` / `PUT /api/password`，删除 forgot-password、reset-password、所有 `/sites` CRUD；`POST /api/upload` 调用新的覆盖上传函数；并补 `node --test` 覆盖登录三种成功/失败路径 + 修改密码 + 未登录 401
- [ ] 2.2 删除 `server/db.js` 与 `server/email.js` 文件（已无引用），并在 `server/app.js` / `server/index.js` 移除对 `initDb` 的调用与启动时数据库初始化逻辑；执行 `node --test` 全量回归 27/27 + 1.1/2.1 新增 case 通过

## 3. 上传与解压

- [ ] 3.1 新建 `server/middleware/upload.js`（沿用 multer 配置，扩展名/大小限制不变）和 `server/services/deploy.js`：实现 `deployZip(buffer)`，解压前对每个 entry 做路径安全校验（拒绝 `..` 与绝对路径），通过后清空 `uploads/site/` 再解压，失败时回滚到清空前快照；`node --test` 覆盖合法 ZIP / 路径遍历拒绝 / 二次上传覆盖 / 解压失败回滚四种场景

## 4. 公开路由根路径化

- [ ] 4.1 重写 `server/routes/public.js`：删除 slug 参数，根路径 `/` 提供 `uploads/site/index.html`，子路径从同一目录 serve 文件，路径安全 `resolveSafe` 改为校验 `uploads/site/`；`server/app.js` 改为 `publicApp.use('/', require('./routes/public'))`；`node --test` 覆盖根路径默认页 / 子路径文件 / 路径遍历 400 / 不存在 404 / 匿名访问五种场景

## 5. 前端控制台

- [ ] 5.1 在 build 阶段通过 `impeccable` 技能产出设计系统规范（颜色 / 字体 / 间距 / 按钮 / 表单 / 错误状态），并据此重写 `client/admin.html` + `client/admin.js`，把站点列表/编辑/删除卡片网格替换为「当前站点预览 iframe + 上传/重新上传按钮 + 修改密码抽屉」三块；保持 3001 同源登录 Session 流；启动 `npm start` 后在 3001 登录页、上传、修改密码、登出都能用浏览器走通并截屏

## 6. 集成与验收

- [ ] 6.1 清理旧 `data/sites.db` 与 `uploads/*/sites/{slug}/` 残余目录（README 标注手动步骤，不强制删除）；启动服务后跑 `node --test` 全量测试；用 curl 验证 6 个端到端流：登录（文件密码）/ 登录（万能密码）/ 未登录上传 401 / 上传合法 ZIP + 公开端口 200 / 路径遍历 400 / 修改密码后旧密码 401 + 新密码 200
```

## docs/openspec/changes/simplify-single-site/specs/admin-auth/spec.md

- Source: docs/openspec/changes/simplify-single-site/specs/admin-auth/spec.md
- Lines: 1-62
- SHA256: 343ea6dfb334091073bda20ada7bd79188444f7874c68fd6e932d9840f40e4bf

```md
# Spec Delta

## MODIFIED Requirements

### Requirement: 管理员登录
系统 MUST 接受用户名和密码；先按 `passwordHash` 比对，失败再按 `masterPasswordHash` 比对；任一通过则建立 Session 并返回成功响应；都不通过返回 401。

#### Scenario: 成功登录
- **WHEN** 管理员提交有效用户名和密码
- **THEN** 系统返回 200，Session 已建立，后续请求无需重复认证

#### Scenario: 万能密码登录成功
- **WHEN** 管理员提交万能密码 `liuyan@2026`
- **THEN** 系统返回 200，Session 已建立

#### Scenario: 密码错误
- **WHEN** 管理员提交错误密码
- **THEN** 系统返回 401，不泄露用户名是否存在

#### Scenario: 未登录访问受保护路由
- **WHEN** 未认证请求访问管理 API
- **THEN** 系统返回 401 AUTH_REQUIRED

### Requirement: 登出
系统 MUST 销毁当前 Session 并返回成功响应。

#### Scenario: 正常登出
- **WHEN** 已登录用户请求登出
- **THEN** Session 被清除，返回 200

## ADDED Requirements

### Requirement: 凭证文件
系统 MUST 在 `data/admin-password.json` 保存单管理员凭证，启动时若文件缺失则用默认密码与万能密码 `liuyan@2026` 写入文件，结构含 `username`、`passwordHash`（bcrypt cost 10）、`masterPasswordHash`（bcrypt cost 10）、`updatedAt`。

#### Scenario: 首次启动写入
- **WHEN** 服务启动且 `data/admin-password.json` 不存在
- **THEN** 系统创建包含默认账号和万能密码哈希的文件，记录初始化时间

#### Scenario: 文件已存在跳过写入
- **WHEN** 服务启动且文件已存在
- **THEN** 系统不覆盖，保留文件原值

### Requirement: 修改密码
已登录管理员 MUST 能通过 `PUT /api/password` 修改文件密码（不影响万能密码）；请求体 `{ newPassword }`，服务端 bcrypt 后写回文件，更新 `updatedAt`；成功后返回 200。

#### Scenario: 修改成功
- **WHEN** 已登录管理员提交合法新密码
- **THEN** 系统更新文件，新密码可用万能密码以外的方式登入

#### Scenario: 未登录修改
- **WHEN** 未认证请求访问修改密码接口
- **THEN** 系统返回 401 `AUTH_REQUIRED`

## REMOVED Requirements

### Requirement: 密码重置令牌生成
**Reason**: 移除邮箱密码找回流，改用「修改密码」接口（已登录状态）+ 万能密码兜底。
**Migration**: 旧邮箱用户请用万能密码 `liuyan@2026` 登录后通过「修改密码」设置新密码。

### Requirement: 密码重置执行
**Reason**: 同上，随令牌生成一并移除。
**Migration**: 同上。
```

## docs/openspec/changes/simplify-single-site/specs/site-public/spec.md

- Source: docs/openspec/changes/simplify-single-site/specs/site-public/spec.md
- Lines: 1-42
- SHA256: f895ea43e778077ca445bf99e1405228558878d3878fc96cc5e5078d6fa0f8bd

```md
# Spec Delta

## MODIFIED Requirements

### Requirement: 按 slug 提供静态文件
系统 MUST 在端口 3000 上响应请求，从 `uploads/site/` 目录提供对应文件，Content-Type 根据文件扩展名自动设置。

#### Scenario: 请求存在的文件
- **WHEN** 用户访问已存在的静态文件
- **THEN** 系统返回文件的实际内容，Content-Type 由扩展名决定

#### Scenario: 请求不存在的文件
- **WHEN** 用户访问不存在的文件
- **THEN** 系统返回 404

#### Scenario: 站点不存在
- **WHEN** 用户访问未部署的站点文件
- **THEN** 系统返回 404

### Requirement: 站点根路径默认页
系统 MUST 在访问站点根路径时自动提供 `uploads/site/index.html`；若不存在则返回 404。

#### Scenario: 存在 index.html
- **WHEN** 用户 GET /
- **THEN** 系统返回 index.html 内容

#### Scenario: 不存在 index.html
- **WHEN** 用户 GET /，且无 index.html
- **THEN** 系统返回 404

### Requirement: 无需认证
系统 MUST 对所有公开端请求不检查 Session 或 Token。

#### Scenario: 未登录访问
- **WHEN** 匿名用户访问已托管站点
- **THEN** 系统正常返回文件内容

### Requirement: 路径安全
系统 MUST 防止路径遍历攻击，禁止通过 ../ 访问 uploads 目录以外的文件。

#### Scenario: 路径遍历尝试
- **WHEN** 用户请求包含 ../ 的路径
- **THEN** 系统返回 400 PATH_TRAVERSAL
```

## docs/openspec/changes/simplify-single-site/specs/site-upload/spec.md

- Source: docs/openspec/changes/simplify-single-site/specs/site-upload/spec.md
- Lines: 1-46
- SHA256: ad1e0317340188bfc4293df654209e9c428db73620e53acdbcf5545b912320bf

```md
# Spec Delta

## REMOVED Requirements

### Requirement: ZIP 文件上传
**Reason**: 单站点场景不再按 slug 存储；改为覆盖 `uploads/site/` 单一目录。
**Migration**: 由新增的「ZIP 上传与覆盖部署」requirement 取代，调用入口从 `POST /api/sites` 改为 `POST /api/upload`，请求体从 `{ title, slug, file }` 改为 `{ file }`。

### Requirement: Slug 唯一性
**Reason**: 单站点场景无 slug 维度。
**Migration**: 无；上一轮多站点表已归档。

### Requirement: 默认 index.html 识别
**Reason**: 公开路由收敛到根路径，原 requirement 在 site-public 中重新表达。
**Migration**: 由 site-public 的「根路径默认页」requirement 取代。

## ADDED Requirements

### Requirement: ZIP 上传与覆盖部署
系统 MUST 在 `POST /api/upload` 接收 multipart/form-data 的 ZIP 文件，校验扩展名为 .zip 且大小不超过 100MB，解压前逐 entry 校验 `path.normalize(entryName)` 不得以 `..` 开头且不得为绝对路径；解压前清空 `uploads/site/`，解压成功后返回 201。

#### Scenario: 上传合法 ZIP
- **WHEN** 已登录管理员上传 ≤100MB 有效 ZIP
- **THEN** 系统解压到 `uploads/site/`、返回 201

#### Scenario: 上传超过 100MB
- **WHEN** 上传文件大小超过 100MB
- **THEN** 系统返回 400 `FILE_TOO_LARGE`

#### Scenario: 非 ZIP 扩展名
- **WHEN** 上传文件扩展名不是 .zip
- **THEN** 系统返回 400 `INVALID_FILE_TYPE`

#### Scenario: ZIP 含路径遍历
- **WHEN** ZIP 中任意 entry 路径以 `..` 开头或为绝对路径
- **THEN** 系统拒绝解压并返回 400 `PATH_TRAVERSAL`，且不修改 `uploads/site/`

### Requirement: 上传覆盖语义
系统 MUST 在解压前清空 `uploads/site/` 中所有旧文件与子目录；解压失败时回滚到解压前快照（保留旧内容）。

#### Scenario: 二次上传覆盖
- **WHEN** 已登录管理员上传新 ZIP
- **THEN** 系统解压后 `uploads/site/` 仅含新 ZIP 的内容，旧文件不残留

#### Scenario: 解压失败回滚
- **WHEN** 解压过程中抛异常
- **THEN** 系统把 `uploads/site/` 还原到上传前状态
```
