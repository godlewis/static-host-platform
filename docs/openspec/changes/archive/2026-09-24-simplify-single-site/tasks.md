# Tasks

## 1. 凭证文件模块

- [x] 1.1 创建 `server/credentials.js`：实现 `loadCredentials()` 与 `saveCredentials()`，文件路径取自 `config.PASSWORD_FILE`，结构含 username/passwordHash/masterPasswordHash/updatedAt；缺失时用默认密码与万能密码 `liuyan@2026` 初始化，并通过 `node --test` 单测验证初始化/读取/写入/更新四类路径 <!-- comet-task:6a56b029-ccd9-4aff-8e04-a8e246932047 -->
- [x] 1.2 在 `server/config.js` 中删除 `DB_PATH` / `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD` / `RESET_TOKEN_EXPIRY_MINUTES` / SMTP 相关键，新增 `PASSWORD_FILE`（默认 `data/admin-password.json`）、`MASTER_PASSWORD`（默认 `liuyan@2026`）、`INITIAL_ADMIN_PASSWORD`（默认 `admin123`），并删除 `package.json` 中 `better-sqlite3` 与 `nodemailer` 两个依赖后 `npm install` 成功 <!-- comet-task:5d79858a-e3b1-4453-9e04-4a43a4a6177b -->

## 2. 认证路由化简

- [x] 2.1 重写 `server/routes/admin.js`：仅保留 `POST /api/login`（文件密码 + 万能密码二选一）/ `POST /api/logout` / `POST /api/upload` / `PUT /api/password`，删除 forgot-password、reset-password、所有 `/sites` CRUD；`POST /api/upload` 调用新的覆盖上传函数；并补 `node --test` 覆盖登录三种成功/失败路径 + 修改密码 + 未登录 401 <!-- comet-task:3d4bb072-2277-4c27-bd69-75037f88e14b -->
- [x] 2.2 删除 `server/db.js` 与 `server/email.js` 文件（已无引用），并在 `server/app.js` / `server/index.js` 移除对 `initDb` 的调用与启动时数据库初始化逻辑；执行 `node --test` 全量回归 27/27 + 1.1/2.1 新增 case 通过 <!-- comet-task:bbff9e1b-0f41-46a8-99c7-c00eee5d029f -->

## 3. 上传与解压

- [x] 3.1 新建 `server/middleware/upload.js`（沿用 multer 配置，扩展名/大小限制不变）和 `server/services/deploy.js`：实现 `deployZip(buffer)`，解压前对每个 entry 做路径安全校验（拒绝 `..` 与绝对路径），通过后清空 `uploads/site/` 再解压，失败时回滚到清空前快照；`node --test` 覆盖合法 ZIP / 路径遍历拒绝 / 二次上传覆盖 / 解压失败回滚四种场景 <!-- comet-task:fd425fd4-0567-4979-bbe1-9df2a3168f64 -->

## 4. 公开路由根路径化

- [x] 4.1 重写 `server/routes/public.js`：删除 slug 参数，根路径 `/` 提供 `uploads/site/index.html`，子路径从同一目录 serve 文件，路径安全 `resolveSafe` 改为校验 `uploads/site/`；`server/app.js` 改为 `publicApp.use('/', require('./routes/public'))`；`node --test` 覆盖根路径默认页 / 子路径文件 / 路径遍历 400 / 不存在 404 / 匿名访问五种场景 <!-- comet-task:0162d35f-71bf-4b52-8e85-8b932637071c -->

## 5. 前端控制台

- [x] 5.1 在 build 阶段通过 `impeccable` 技能产出设计系统规范（颜色 / 字体 / 间距 / 按钮 / 表单 / 错误状态），并据此重写 `client/admin.html` + `client/admin.js`，把站点列表/编辑/删除卡片网格替换为「当前站点预览 iframe + 上传/重新上传按钮 + 修改密码抽屉」三块；保持 3001 同源登录 Session 流；启动 `npm start` 后在 3001 登录页、上传、修改密码、登出都能用浏览器走通并截屏 <!-- comet-task:bd4d0758-6d8e-4b3a-b7bd-e393bf52d841 -->

## 6. 集成与验收

- [x] 6.1 清理旧 `data/sites.db` 与 `uploads/*/sites/{slug}/` 残余目录（README 标注手动步骤，不强制删除）；启动服务后跑 `node --test` 全量测试；用 curl 验证 6 个端到端流：登录（文件密码）/ 登录（万能密码）/ 未登录上传 401 / 上传合法 ZIP + 公开端口 200 / 路径遍历 400 / 修改密码后旧密码 401 + 新密码 200 <!-- comet-task:4093a96b-566b-4caa-aa3a-8504234b683f -->