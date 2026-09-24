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