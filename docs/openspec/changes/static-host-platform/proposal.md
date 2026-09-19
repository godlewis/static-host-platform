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
