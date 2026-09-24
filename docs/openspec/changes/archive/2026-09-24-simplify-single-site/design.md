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

旧 `data/sites.db` 不再需要；`uploads/*/sites/{slug}/` 多余目录由用户自行清理（不自动删，避免误删正在看的文件）。

## Open Questions

无。