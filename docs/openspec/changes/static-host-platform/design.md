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

无。所有关键决策已在需求和设计文档中明确。
