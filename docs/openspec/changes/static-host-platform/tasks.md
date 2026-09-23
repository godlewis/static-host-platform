# Tasks

## 1. 基础设施

- [x] 1.1 创建 server/routes/ 和 server/middleware/ 目录，在 server/index.js 中实现双端口 Express 启动（3001 admin / 3000 public），验证 `npm start` 无报错且两个端口均响应
- [x] 1.2 安装依赖并验证：运行 `npm install`，确认 node_modules 中存在所有 package.json 声明的包

## 2. 认证模块（admin-auth）

- [x] 2.1 实现 server/middleware/auth.js：Session 验证中间件，未登录返回 401 `{success:false,message:"AUTH_REQUIRED"}`
- [x] 2.2 实现 server/routes/admin.js 的 POST /api/login：bcrypt 验证密码，建立 Session，返回 200 `{success:true}`；错误凭证返回 401
- [x] 2.3 实现 POST /api/logout：销毁 Session，返回 200
- [x] 2.4 实现 POST /api/forgot-password：生成 UUID 令牌存入 reset_tokens（60 分钟过期），调用 email.js 发送；SMTP 未配置时静默返回 200
- [x] 2.5 实现 POST /api/reset-password：验证令牌有效性（存在、未过期、匹配邮箱），更新 password_hash，删除令牌，返回 200

## 3. 文件上传与部署（site-upload）

- [x] 3.1 实现 server/middleware/upload.js：Multer 配置，限制 100MB，仅允许 .zip 扩展名
- [x] 3.2 实现 server/routes/admin.js 的 POST /api/sites：接收 ZIP + title + slug，解压前校验 entry 路径不含 ".."，解压到 uploads/{slug}/，插入 sites 表，返回 201
- [x] 3.3 处理 slug 唯一冲突：插入失败时返回 409 DUPLICATE_SLUG

## 4. 网站管理（site-management）

- [x] 4.1 实现 GET /api/sites：查询所有站点，按 created_at 倒序，返回 JSON 数组
- [x] 4.2 实现 GET /api/sites/:slug：返回单站点详情（id/slug/title/description/created_at）
- [x] 4.3 实现 PUT /api/sites/:slug：更新 title/description/slug，slug 变更需检查唯一性
- [x] 4.4 实现 DELETE /api/sites/:slug：删除 DB 记录及 uploads/{slug}/ 目录，站点不存在返回 404

## 5. 公开静态服务（site-public）

- [x] 5.1 实现 server/routes/public.js：GET /sites/:slug/* 路由，从 uploads/{slug}/ 提供文件，Content-Type 由文件扩展名决定
- [x] 5.2 实现默认页逻辑：GET /sites/:slug 无 path 时自动提供 index.html，不存在则 404
- [x] 5.3 实现路径安全校验：请求路径 normalize 后必须位于 uploads/{slug}/ 内，否则返回 400 PATH_TRAVERSAL

## 6. 前端管理界面

- [x] 6.1 创建 client/admin.html：登录页（表单+忘记密码链接）和主界面（导航栏+站点卡片网格+上传按钮），使用 Tailwind CSS CDN
- [x] 6.2 创建 client/admin.js：封装 API 调用（login/logout/sites CRUD），DOM 操作实现页面渲染、上传模态框、编辑模态框、预览 iframe
- [x] 6.3 实现登录页跳转逻辑：未登录时强制显示登录表单，登录后切换到主界面
- [x] 6.4 实现上传功能：拖拽/点击选择 ZIP，显示进度提示，上传成功后刷新站点列表
- [x] 6.5 实现站点卡片：显示 title、description、创建时间，操作按钮（预览弹窗 iframe、编辑元信息、删除二次确认）

## 7. Docker 生产部署

- [x] 7.1 创建 Dockerfile：基于 node:20-alpine 多阶段构建（builder 安装依赖，runner 复制产物），非 root 用户运行，暴露 3000/3001 端口
- [x] 7.2 创建 docker-compose.yml：定义 app 服务，挂载 uploads/ 和 data/ 为 named volume，支持 SMTP/ADMIN_PASSWORD 等环境变量注入
- [x] 7.3 创建 .dockerignore：排除 node_modules、.git、uploads、data、.env
- [x] 7.4 验证 Docker 构建与运行：`docker compose up --build` 成功后访问 http://localhost:3001 登录页正常显示

## 8. 集成与验收

- [x] 8.1 完整冒烟测试：启动服务 → 登录 → 上传示例 ZIP → 列表可见 → 公开端口访问 → 删除站点，全部通过
- [x] 8.2 安全验证：路径遍历攻击（../payload）被拒绝、未登录访问管理 API 返回 401、密码重置令牌过期后不可用
- [x] 8.3 Docker 端到端验证：`docker compose up -d` 后通过 http://localhost:3001 完成登录并上传站点，通过 http://localhost:3000/sites/<slug> 访问成功
