# Comet Design Handoff

- Change: static-host-platform
- Phase: design
- Mode: compact
- Context hash: a54d68bbf200b1e4d71ec4109910acf6235e40e9d207cfca4b6f458ddd12dd1a

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## docs/openspec/changes/static-host-platform/proposal.md

- Source: docs/openspec/changes/static-host-platform/proposal.md
- Lines: 1-39
- SHA256: 4f5d99121b163ba31e5aeccee79c769cb28ed344fd9495c10bd4abd5ae0df179

```md
# Proposal

## Why

用户需要一个轻量级的静态网站托管平台，允许管理员上传 ZIP 格式的静态网站压缩包并通过独立公网端口对外提供服务。当前仓库仅有文档和少量服务端骨架，尚未实现任何功能。

## What Changes

- 实现双端口 Express 服务（管理端口 3001 / 公开端口 3000）
- 实现管理员认证模块（登录、Session、邮箱密码找回）
- 实现 ZIP 上传与解压部署（路径安全校验、100MB 限制）
- 实现网站 CRUD（列表、预览、编辑、删除）
- 实现公开静态文件服务（按 slug 路由）
- 创建前端管理界面（Vanilla JS + Tailwind CSS）
- 初始化 SQLite 数据库（admins / sites / reset_tokens 表）
- 创建 Dockerfile 和 docker-compose.yml，支持生产环境一键部署

## Capabilities

### New Capabilities

- `admin-auth`: 管理员登录认证、Session 管理、邮箱密码重置
- `site-upload`: ZIP 文件上传、解压部署、路径安全校验
- `site-management`: 网站列表、预览、编辑元信息、删除
- `site-public`: 按 slug 提供静态网站公开访问
- `docker-deploy`: Dockerfile 和 docker-compose.yml 生产部署支持

### Modified Capabilities

（无）

## Impact

- 新增依赖：bcryptjs、better-sqlite3、express-session、multer、nodemailer、adm-zip、sanitize-filename、uuid、cors
- 新建目录：server/routes/、server/middleware/、client/
- 新建数据：SQLite 数据库（data/sites.db）
- 新增部署资产：Dockerfile、docker-compose.yml、.dockerignore
- API 变更：无（全新服务，无历史接口）
- 安全影响：认证、Session、文件上传路径安全为关键风险点

```

## docs/openspec/changes/static-host-platform/design.md

- Source: docs/openspec/changes/static-host-platform/design.md
- Lines: 1-81
- SHA256: 7e0bdef52341c2bb7df0fa6338cd0045c0ce3e27451fdcd79e44c03a9440a464

[TRUNCATED]

```md
# Design

## Context

项目已有 package.json（含全部依赖）和 server/config.js、server/db.js、server/email.js 三个文件骨架。缺少 server/index.js、routes/、middleware/、client/ 目录及所有实现代码。SQLite 数据库 schema 已在 db.js 中定义，但 admin 账号密码为明文存储逻辑（需改为 bcrypt）。

## Goals / Non-Goals

**Goals:**
- 实现完整双端口 Express 服务（3001 admin / 3000 public）
- 实现管理员认证（Session + bcrypt + 邮箱重置）
- 实现 ZIP 上传解压部署（路径安全校验）
- 实现网站 CRUD API
- 实现公开静态文件服务
- 创建单页管理界面（admin.html + admin.js）
- 提供 Docker 生产部署方案（docker-compose.yml + Dockerfile）

**Non-Goals:**
- 多租户支持（仅单管理员）
- CDN / 缓存策略
- 图片缩略图自动生成
- 用户注册（仅预设管理员）
- 内嵌 HTTPS 证书管理（由反向代理或 cloud provider 处理）

## Decisions

### 决策 1：双端口架构 vs 单端口路径隔离

**选择**：两个独立 Express 实例，分别监听 3001 和 3000。
**理由**：需求明确要求"管理端口与公共端口物理隔离"，双端口实现最简单且符合 SAF-003；单端口用前缀路径隔离会增加中间件复杂度且违背架构意图。
**替代方案**：单端口 + `/admin` 前缀路由；风险：无法通过网络层隔离管理流量。

### 决策 2：Session 存储

**选择**：express-session 内存 Session（不接入 Redis）。
**理由**：单管理员场景，Session 数量极少；SQLite 已有且无需额外依赖；满足 NFR-003（50+ 并发）的性能要求。
**替代方案**：Redis Session store；开销更高且引入新依赖。

### 决策 3：文件上传存储策略

**选择**：解压后按 `uploads/{slug}/` 目录存储，不保留原始 ZIP。
**理由**：公开服务直接 serve 目录，避免每次请求重新解压；100MB 以内解压耗时可接受。
**替代方案**：保留 ZIP 每次请求时解压；额外 I/O 开销，且无法直接 serve 单个文件。

### 决策 4：前端框架选择

**选择**：Vanilla JS + Tailwind CSS (CDN)。
**理由**：需求明确指定；无构建步骤，单文件部署；适合轻量管理后台。
**替代方案**：React/Vue；需要构建工具链，过度工程化。

### 决策 5：数据库字段设计修正

**选择**：sites 表移除 `files_path` 字段，路径由 slug 推导（`uploads/{slug}/`）。
**理由**：原 design.md 的 sites 表含 files_path 冗余字段；实际路径可由 slug 确定性推导，消除数据不一致风险。admin 表保持 email 非空（默认 admin@example.com）。

### 决策 6：Docker 生产部署

**选择**：多阶段 Docker 构建 + docker-compose.yml。
- **Dockerfile**：基于 `node:20-alpine`，多阶段构建（builder 安装依赖，runner 复制产物），非 root 用户运行，暴露 3000/3001 端口。
- **docker-compose.yml**：定义 `app` 服务，挂载 `uploads/` 和 `data/` 为 volume 保证数据持久化，支持环境变量注入（SMTP、ADMIN_PASSWORD 等）。
- **.dockerignore**：排除 node_modules、.git、uploads、data。
**理由**：用户需求明确要求 docker-compose 生产部署；多阶段构建减小镜像体积；volume 挂载保证数据不随容器销毁丢失。
**替代方案**：仅单 Dockerfile 无 compose；部署灵活性差，无法便捷管理环境变量和卷。

## Risks / Trade-offs

- **内存 Session 不持久**：服务重启后所有 Session 失效 → mitigated：单管理员场景可接受，重启即需重新登录
- **ZIP 炸弹风险**：超大压缩比文件可能导致解压后超内存 → mitigated：配置 adm-zip 最大解压大小限制（建议 500MB）
- **无 HTTPS**：密码明文传输 → mitigated：文档标注需在反向代理后使用，docker-compose 可通过 nginx-proxy 补充
- **单管理员**：无权限分级 → mitigated：满足需求范围内场景
- **SQLite 并发写**：多管理员同时操作可能锁表 → mitigated：WAL 模式已启用；单管理员场景下几乎无竞争

## Migration Plan

全新项目，无历史数据迁移。首次启动时 db.js 自动初始化表和默认管理员。

Docker 部署时，`data/` 和 `uploads/` 通过 named volume 持久化，容器重建后数据不丢失。

## Open Questions


```

Full source: docs/openspec/changes/static-host-platform/design.md

## docs/openspec/changes/static-host-platform/tasks.md

- Source: docs/openspec/changes/static-host-platform/tasks.md
- Lines: 1-54
- SHA256: b509c9c2f9d59783637c8c3c1b412e4459ca10988572ae2cec371d419226a8fc

```md
# Tasks

## 1. 基础设施

- [ ] 1.1 创建 server/routes/ 和 server/middleware/ 目录，在 server/index.js 中实现双端口 Express 启动（3001 admin / 3000 public），验证 `npm start` 无报错且两个端口均响应
- [ ] 1.2 安装依赖并验证：运行 `npm install`，确认 node_modules 中存在所有 package.json 声明的包

## 2. 认证模块（admin-auth）

- [ ] 2.1 实现 server/middleware/auth.js：Session 验证中间件，未登录返回 401 `{success:false,message:"AUTH_REQUIRED"}`
- [ ] 2.2 实现 server/routes/admin.js 的 POST /api/login：bcrypt 验证密码，建立 Session，返回 200 `{success:true}`；错误凭证返回 401
- [ ] 2.3 实现 POST /api/logout：销毁 Session，返回 200
- [ ] 2.4 实现 POST /api/forgot-password：生成 UUID 令牌存入 reset_tokens（60 分钟过期），调用 email.js 发送；SMTP 未配置时静默返回 200
- [ ] 2.5 实现 POST /api/reset-password：验证令牌有效性（存在、未过期、匹配邮箱），更新 password_hash，删除令牌，返回 200

## 3. 文件上传与部署（site-upload）

- [ ] 3.1 实现 server/middleware/upload.js：Multer 配置，限制 100MB，仅允许 .zip 扩展名
- [ ] 3.2 实现 server/routes/admin.js 的 POST /api/sites：接收 ZIP + title + slug，解压前校验 entry 路径不含 ".."，解压到 uploads/{slug}/，插入 sites 表，返回 201
- [ ] 3.3 处理 slug 唯一冲突：插入失败时返回 409 DUPLICATE_SLUG

## 4. 网站管理（site-management）

- [ ] 4.1 实现 GET /api/sites：查询所有站点，按 created_at 倒序，返回 JSON 数组
- [ ] 4.2 实现 GET /api/sites/:slug：返回单站点详情（id/slug/title/description/created_at）
- [ ] 4.3 实现 PUT /api/sites/:slug：更新 title/description/slug，slug 变更需检查唯一性
- [ ] 4.4 实现 DELETE /api/sites/:slug：删除 DB 记录及 uploads/{slug}/ 目录，站点不存在返回 404

## 5. 公开静态服务（site-public）

- [ ] 5.1 实现 server/routes/public.js：GET /sites/:slug/* 路由，从 uploads/{slug}/ 提供文件，Content-Type 由文件扩展名决定
- [ ] 5.2 实现默认页逻辑：GET /sites/:slug 无 path 时自动提供 index.html，不存在则 404
- [ ] 5.3 实现路径安全校验：请求路径 normalize 后必须位于 uploads/{slug}/ 内，否则返回 400 PATH_TRAVERSAL

## 6. 前端管理界面

- [ ] 6.1 创建 client/admin.html：登录页（表单+忘记密码链接）和主界面（导航栏+站点卡片网格+上传按钮），使用 Tailwind CSS CDN
- [ ] 6.2 创建 client/admin.js：封装 API 调用（login/logout/sites CRUD），DOM 操作实现页面渲染、上传模态框、编辑模态框、预览 iframe
- [ ] 6.3 实现登录页跳转逻辑：未登录时强制显示登录表单，登录后切换到主界面
- [ ] 6.4 实现上传功能：拖拽/点击选择 ZIP，显示进度提示，上传成功后刷新站点列表
- [ ] 6.5 实现站点卡片：显示 title、description、创建时间，操作按钮（预览弹窗 iframe、编辑元信息、删除二次确认）

## 7. Docker 生产部署

- [ ] 7.1 创建 Dockerfile：基于 node:20-alpine 多阶段构建（builder 安装依赖，runner 复制产物），非 root 用户运行，暴露 3000/3001 端口
- [ ] 7.2 创建 docker-compose.yml：定义 app 服务，挂载 uploads/ 和 data/ 为 named volume，支持 SMTP/ADMIN_PASSWORD 等环境变量注入
- [ ] 7.3 创建 .dockerignore：排除 node_modules、.git、uploads、data、.env
- [ ] 7.4 验证 Docker 构建与运行：`docker compose up --build` 成功后访问 http://localhost:3001 登录页正常显示

## 8. 集成与验收

- [ ] 8.1 完整冒烟测试：启动服务 → 登录 → 上传示例 ZIP → 列表可见 → 公开端口访问 → 删除站点，全部通过
- [ ] 8.2 安全验证：路径遍历攻击（../payload）被拒绝、未登录访问管理 API 返回 401、密码重置令牌过期后不可用
- [ ] 8.3 Docker 端到端验证：`docker compose up -d` 后通过 http://localhost:3001 完成登录并上传站点，通过 http://localhost:3000/sites/<slug> 访问成功

```

## docs/openspec/changes/static-host-platform/specs/admin-auth/spec.md

- Source: docs/openspec/changes/static-host-platform/specs/admin-auth/spec.md
- Lines: 1-59
- SHA256: dbf8ec2f5466e97d737982d9228a5955190ec78edc73348e70478a46a72a6551

```md
# Spec Delta

## Purpose

为静态网站托管平台提供管理员认证与密码重置的行为规范，覆盖登录、Session 管理、邮箱密码找回等核心能力。

## ADDED Requirements

### Requirement: 管理员登录
系统 MUST 接受用户名和密码，验证成功后建立 Session 并返回成功响应；凭证错误时返回 401。

#### Scenario: 成功登录
- **WHEN** 管理员提交有效用户名和密码
- **THEN** 系统返回 200，Session 已建立，后续请求无需重复认证

#### Scenario: 密码错误
- **WHEN** 管理员提交错误密码
- **THEN** 系统返回 401，不泄露用户名是否存在

#### Scenario: 未登录访问受保护路由
- **WHEN** 未认证请求访问管理 API
- **THEN** 系统返回 401 AUTH_REQUIRED

### Requirement: 密码重置令牌生成
系统 SHALL 在收到重置请求后生成一次性令牌，设置 60 分钟过期时间，并通过 SMTP 发送邮件（SMTP 未配置时返回 200 但不实际发送）。

#### Scenario: 有效邮箱请求重置
- **WHEN** 用户提供已注册邮箱
- **THEN** 系统生成令牌并存入 reset_tokens 表，返回 200

#### Scenario: 不存在邮箱请求重置
- **WHEN** 用户提供未注册邮箱
- **THEN** 系统仍返回 200（不泄露邮箱是否存在）

#### Scenario: SMTP 未配置
- **WHEN** 邮件服务未初始化
- **THEN** 系统返回 200，控制台输出警告日志

### Requirement: 密码重置执行
系统 MUST 验证令牌有效（存在、未过期、与邮箱匹配），验证通过后允许设置新密码。

#### Scenario: 有效令牌重置密码
- **WHEN** 用户提交有效令牌和新密码
- **THEN** 系统更新密码哈希，删除令牌，返回 200

#### Scenario: 令牌已过期
- **WHEN** 用户提交超过 60 分钟的令牌
- **THEN** 系统返回 400 INVALID_TOKEN

#### Scenario: 令牌已被使用
- **WHEN** 用户重复使用同一令牌
- **THEN** 系统返回 400 INVALID_TOKEN

### Requirement: 登出
系统 MUST 销毁当前 Session 并返回成功响应。

#### Scenario: 正常登出
- **WHEN** 已登录用户请求登出
- **THEN** Session 被清除，返回 200

```

## docs/openspec/changes/static-host-platform/specs/site-management/spec.md

- Source: docs/openspec/changes/static-host-platform/specs/site-management/spec.md
- Lines: 1-40
- SHA256: df7de9e78478d4fb9d66812a37c2f0fea762e12fc05ada3e09d13a6767951fa8

```md
# Spec Delta

## Purpose

为静态网站托管平台提供网站元信息管理的行为规范，覆盖列表查询、信息编辑和删除操作。

## ADDED Requirements

### Requirement: 网站列表
系统 MUST 返回所有站点的列表，包含 id、slug、title、description、created_at 字段，按创建时间倒序排列。

#### Scenario: 列表为空
- **WHEN** 数据库中无站点记录
- **THEN** 系统返回空数组

#### Scenario: 正常列表
- **WHEN** 存在 N 个站点
- **THEN** 系统返回 N 条记录，按 created_at 降序

### Requirement: 编辑网站信息
系统 MUST 允许已登录管理员更新站点的 title、description 和 slug（slug 变更需满足唯一性约束）。

#### Scenario: 成功更新
- **WHEN** 管理员提交合法更新数据
- **THEN** 系统更新记录并返回 200 新数据

#### Scenario: slug 冲突
- **WHEN** 更新后的 slug 与已有站点重复
- **THEN** 系统返回 409 DUPLICATE_SLUG

### Requirement: 删除网站
系统 MUST 删除站点记录及其对应文件目录，删除前需二次确认（前端行为），后端接口直接执行删除。

#### Scenario: 成功删除
- **WHEN** 管理员请求删除已存在的站点
- **THEN** 系统删除 DB 记录和文件目录，返回 200

#### Scenario: 站点不存在
- **WHEN** 删除不存在的 slug
- **THEN** 系统返回 404 SITE_NOT_FOUND

```

## docs/openspec/changes/static-host-platform/specs/site-public/spec.md

- Source: docs/openspec/changes/static-host-platform/specs/site-public/spec.md
- Lines: 1-47
- SHA256: 3182bec02fc8d030bde76ac848ae8764faa307377cdc3cef678ff6c0d8dee1e0

```md
# Spec Delta

## Purpose

为静态网站托管平台提供按 slug 公开访问托管网站的行为规范，支持静态文件服务和错误页面处理。

## ADDED Requirements

### Requirement: 按 slug 提供静态文件
系统 MUST 在端口 3000 上响应 GET /sites/:slug/* 请求，从 uploads/{slug}/ 目录提供对应文件，Content-Type 根据文件扩展名自动设置。

#### Scenario: 请求存在的文件
- **WHEN** 用户访问 /sites/my-site/index.html
- **THEN** 系统返回文件的实际内容，Content-Type 为 text/html

#### Scenario: 请求不存在的文件
- **WHEN** 用户访问 /sites/my-site/missing.html
- **THEN** 系统返回 404

#### Scenario: 站点不存在
- **WHEN** 用户访问 /sites/nonexistent/page.html
- **THEN** 系统返回 404

### Requirement: 站点根路径默认页
系统 MUST 在访问站点根路径时自动提供 index.html；若不存在则返回 404。

#### Scenario: 存在 index.html
- **WHEN** 用户 GET /sites/my-site
- **THEN** 系统返回 index.html 内容

#### Scenario: 不存在 index.html
- **WHEN** 用户 GET /sites/my-site，且无 index.html
- **THEN** 系统返回 404

### Requirement: 无需认证
系统 MUST 对所有 /sites/:slug/* 请求不检查 Session 或 Token。

#### Scenario: 未登录访问
- **WHEN** 匿名用户访问已托管站点
- **THEN** 系统正常返回文件内容

### Requirement: 路径安全
系统 MUST 防止路径遍历攻击，禁止通过 ../ 访问 uploads 目录以外的文件。

#### Scenario: 路径遍历尝试
- **WHEN** 用户请求 /sites/my-site/../../etc/passwd
- **THEN** 系统返回 400 PATH_TRAVERSAL

```

## docs/openspec/changes/static-host-platform/specs/site-upload/spec.md

- Source: docs/openspec/changes/static-host-platform/specs/site-upload/spec.md
- Lines: 1-40
- SHA256: 2bc3c0dfa7d1e5af55aace04688762c04c1605a182c2277929e33c327d25acd1

```md
# Spec Delta

## Purpose

为静态网站托管平台提供 ZIP 文件上传与解压部署的行为规范，确保文件路径安全、格式合法、部署可靠。

## ADDED Requirements

### Requirement: ZIP 文件上传
系统 MUST 接受 multipart/form-data 上传的 ZIP 文件，校验大小不超过 100MB，验证扩展名为 .zip，解压后存储到 uploads/{slug}/ 目录。

#### Scenario: 成功上传合法 ZIP
- **WHEN** 管理员上传 ≤100MB 的有效 ZIP 文件并提供 title 和 slug
- **THEN** 系统解压文件、创建站点记录、返回 201 及站点信息

#### Scenario: 文件超过 100MB
- **WHEN** 上传文件大小超过 100MB
- **THEN** 系统返回 400 FILE_TOO_LARGE

#### Scenario: 非 ZIP 文件
- **WHEN** 上传非 .zip 扩展名的文件
- **THEN** 系统返回 400 INVALID_FILE_TYPE

#### Scenario: ZIP 内含路径遍历
- **WHEN** ZIP 中存在 entries 的 entryName 包含 ".." 或绝对路径
- **THEN** 系统拒绝上传，返回 400 PATH_TRAVERSAL

### Requirement: Slug 唯一性
系统 MUST 确保同一 slug 在同一租户下唯一，重复创建时返回 409 DUPLICATE_SLUG。

#### Scenario: 重复 slug
- **WHEN** 使用已存在的 slug 创建新站点
- **THEN** 系统返回 409 DUPLICATE_SLUG

### Requirement: 默认 index.html 识别
系统 MUST 在解压后识别 index.html 作为默认入口，公开访问 slug 根路径时自动提供 index.html。

#### Scenario: 访问站点根路径
- **WHEN** 用户 GET /sites/:slug（无 path）
- **THEN** 系统返回该站点的 index.html（若存在）

```
