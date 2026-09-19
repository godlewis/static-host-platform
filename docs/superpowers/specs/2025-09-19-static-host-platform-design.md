---
comet_change: static-host-platform
role: technical-design
canonical_spec: openspec
---

# 静态网站托管平台 — 技术设计文档

## 1. 架构总览

```
                        ┌──────────────────┐
                        │   docker-compose  │
                        │  (production)     │
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
    │  Admin Server     │ │  Public      │ │  SQLite DB      │
    │  :3001            │ │  Server :3000│ │  (data volume)  │
    │  - express        │ │  - express   │ │                 │
    │  - session        │ │  - serve     │ │  uploads/       │
    │  - auth mw        │ │    static    │ │  (data volume)  │
    └─────────┬─────────┘ └─────────────┘ └─────────────────┘
              │
    ┌─────────▼─────────┐
    │  Admin Frontend    │
    │  admin.html + .js  │
    │  (served by :3001) │
    └───────────────────┘
```

**部署模式**：单容器运行全部 Node.js 进程（双端口），通过 `docker-compose.yml` 管理环境变量和卷。

---

## 2. 目录结构

```
static-host-platform/
├── server/
│   ├── index.js              # 双端口入口，注册中间件
│   ├── config.js             # 配置中心（已有，微调）
│   ├── db.js                 # 数据库初始化（已有，微调）
│   ├── email.js              # 邮件服务（已有，微调）
│   ├── routes/
│   │   ├── admin.js          # 管理 API（认证 + 网站 CRUD）
│   │   └── public.js         # 公开 API（静态文件服务）
│   └── middleware/
│       ├── auth.js           # Session 认证中间件
│       └── upload.js         # Multer 上传中间件
├── client/
│   ├── admin.html            # 单页管理界面
│   └── admin.js              # 前端逻辑
├── uploads/                  # 站点文件存储（volume）
├── data/                     # SQLite 数据库（volume）
├── docs/
│   ├── requirements.md
│   ├── design.md
│   └── openspec/             # OpenSpec artifacts
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── package.json
└── .env.example
```

---

## 3. 核心模块详细设计

### 3.1 server/index.js — 双端口入口

```javascript
const express = require('express');
const path = require('path');
const config = require('./config');
const { initDb } = require('./db');

initDb();

// ── Admin Server (port 3001) ──────────────────────────────
const adminApp = express();
adminApp.use(express.json());
adminApp.use(require('cors')());
adminApp.use(require('express-session')({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));
adminApp.use(require('./middleware/auth'));
adminApp.use('/api', require('./routes/admin'));
adminApp.use(express.static(config.CLIENT_DIR));
// SPA fallback
adminApp.get('*', (req, res) => {
  res.sendFile(path.join(config.CLIENT_DIR, 'admin.html'));
});

// ── Public Server (port 3000) ─────────────────────────────
const publicApp = express();
publicApp.use('/sites', require('./routes/public'));

// ── 启动 ──────────────────────────────────────────────────
adminApp.listen(config.ADMIN_PORT, () => {
  console.log(`[Admin] http://localhost:${config.ADMIN_PORT}`);
});
publicApp.listen(config.PUBLIC_PORT, () => {
  console.log(`[Public] http://localhost:${config.PUBLIC_PORT}`);
});
```

### 3.2 server/middleware/auth.js — 认证中间件

```javascript
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.status(401).json({ success: false, message: 'AUTH_REQUIRED' });
}

module.exports = requireAuth;
```

### 3.3 server/middleware/upload.js — 上传中间件

```javascript
const multer = require('multer');
const config = require('../config');

const storage = multer.memoryStorage(); // 内存暂存，由路由层处理解压

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'), false);
    }
  },
});

module.exports = upload;
```

### 3.4 server/routes/admin.js — 管理路由

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/login | 无 | 登录，建立 Session |
| POST | /api/logout | 需 | 登出，销毁 Session |
| POST | /api/forgot-password | 无 | 发送重置邮件 |
| POST | /api/reset-password | 无 | 重置密码 |
| GET | /api/sites | 需 | 站点列表 |
| POST | /api/sites | 需 | 上传新站点 |
| GET | /api/sites/:slug | 需 | 站点详情 |
| PUT | /api/sites/:slug | 需 | 更新站点 |
| DELETE | /api/sites/:slug | 需 | 删除站点 |

**关键实现要点**：

- **登录**：查询 admins 表，bcrypt.compare，设置 `req.session.adminId`
- **上传**：Multer 内存存储 → AdmZip 解压前校验 entryName 路径安全 → 写入 `uploads/{slug}/` → 插入 sites 表
- **路径安全校验**：
  ```javascript
  zip.getEntries().forEach(entry => {
    const normalized = path.normalize(entry.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('PATH_TRAVERSAL');
    }
  });
  ```

### 3.5 server/routes/public.js — 公开路由

```javascript
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.get('/sites/:slug/*', (req, res) => {
  const slug = req.params.slug;
  const relativePath = req.params[0] || 'index.html';

  // 路径安全校验
  const basePath = path.resolve(__dirname, '..', '..', 'uploads', slug);
  const requestedPath = path.resolve(basePath, relativePath);

  if (!requestedPath.startsWith(basePath + path.sep) && requestedPath !== basePath) {
    return res.status(400).json({ success: false, message: 'PATH_TRAVERSAL' });
  }

  // 检查文件是否存在
  if (!fs.existsSync(requestedPath)) {
    return res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }

  res.sendFile(requestedPath);
});

// 根路径 → index.html
router.get('/sites/:slug', (req, res) => {
  const indexPath = path.join(__dirname, '..', '..', 'uploads', req.params.slug, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ success: false, message: 'SITE_NOT_FOUND' });
  }
});

module.exports = router;
```

### 3.6 client/admin.html — 管理界面架构

**页面结构**（单页应用，JS 控制视图切换）：

```
┌─────────────────────────────────────────────┐
│  ☰ 静态网站托管    管理员 ▼  [登出]          │  ← 导航栏（登录后显示）
├─────────────────────────────────────────────┤
│                                             │
│  [+ 上传新网站]      🔍 搜索...             │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 预览iframe│ │ 网站标题  │ │ 网站标题  │   │
│  │          │ │ 描述...   │ │ 描述...   │   │
│  │ [预览][删]│ │ [预览][删]│ │ [预览][删]│   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**登录页**：居中卡片，用户名/密码输入框，"忘记密码"链接，错误提示区。

**主界面**：
- 顶部导航栏（Logo + 用户名下拉 + 登出按钮）
- 工具栏（上传按钮 + 搜索框）
- 站点卡片网格（3列，响应式）
- 上传模态框（拖拽区 + 表单 + 进度条）
- 预览模态框（iframe 加载公开端口 URL）
- 编辑模态框（标题/描述/slug 表单）
- 删除确认对话框

### 3.7 Docker 部署设计

**Dockerfile**（多阶段构建）：

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# 创建非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 3000 3001
CMD ["node", "server/index.js"]
```

**docker-compose.yml**：

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - ADMIN_USER=${ADMIN_USER:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
      - SMTP_HOST=${SMTP_HOST:-}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER:-}
      - SMTP_PASS=${SMTP_PASS:-}
      - SMTP_FROM=${SMTP_FROM:-noreply@local}
    volumes:
      - site-uploads:/app/uploads
      - site-data:/app/data
    restart: unless-stopped

volumes:
  site-uploads:
  site-data:
```

**.dockerignore**：
```
node_modules
.git
uploads
data
.env
.dockerignore
.DS_Store
```

---

## 4. 数据流

### 4.1 上传流程
```
前端拖拽 ZIP → POST /api/sites (multipart)
  → auth middleware 检查 Session
  → upload middleware 验证 .zip 扩展名 + ≤100MB
  → 路由：AdmZip 读取内存 buffer
  → 路径安全检查（entryName 不含 ..）
  → fs.writeFileSync 解压到 uploads/{slug}/
  → db.insert sites 记录
  → 返回 201 { site }
```

### 4.2 公开访问流程
```
GET /sites/my-site/index.html
  → public router 解析 slug=my-site, path=index.html
  → 计算 requestedPath = uploads/my-site/index.html
  → 安全校验：requestedPath 在 uploads/my-site/ 内
  → fs.existsSync 检查
  → res.sendFile 返回文件
```

### 4.3 登录流程
```
POST /api/login { username, password }
  → db.query admins WHERE username=?
  → bcrypt.compare(password, hash)
  → req.session.adminId = row.id
  → 返回 200 { success: true }
```

---

## 5. 安全设计

| 威胁 | 防护措施 | 对应 spec |
|------|---------|----------|
| 路径遍历（ZIP entries） | 解压前校验 entryName normalize 后不含 `..` | site-upload |
| 路径遍历（HTTP 请求） | requestedPath 必须位于 uploads/{slug}/ 内 | site-public |
| 密码泄露 | bcrypt hash 存储，错误时不区分用户名/密码 | admin-auth |
| Session 劫持 | httpOnly cookie，24h 过期 | admin-auth |
| 大文件攻击 | Multer 100MB 限制 | site-upload |
| ZIP 炸弹 | adm-zip 最大解压大小限制 | design decision |

---

## 6. 测试策略

### 6.1 冒烟测试（手动验收，tasks.md §8）
1. `npm start` 启动两个端口
2. 访问 http://localhost:3001 登录
3. 上传测试 ZIP，验证列表出现
4. 访问 http://localhost:3000/sites/{slug} 确认正常渲染
5. 删除站点，确认消失

### 6.2 安全测试
```bash
# 路径遍历测试
curl -X GET http://localhost:3000/sites/test/../../etc/passwd
# 期望：400 PATH_TRAVERSAL

# 未认证访问测试
curl http://localhost:3001/api/sites
# 期望：401 AUTH_REQUIRED
```

### 6.3 Docker 验证
```bash
docker compose up --build -d
# 等待启动后：
curl http://localhost:3001   # 应返回 admin.html
curl http://localhost:3000   # 应 404（无站点）
```

---

## 7. 配置映射

| 环境变量 | 默认值 | 用途 |
|---------|--------|------|
| ADMIN_USER | admin | 管理员用户名 |
| ADMIN_PASSWORD | admin123 | 管理员密码（启动时 bcrypt 哈希） |
| SESSION_SECRET | static-host-secret | Session 签名密钥 |
| SMTP_HOST | - | SMTP 服务器（空则禁用邮件） |
| SMTP_PORT | 587 | SMTP 端口 |
| SMTP_USER | - | SMTP 用户名 |
| SMTP_PASS | - | SMTP 密码 |
| SMTP_FROM | noreply@local | 发件人 |
| ADMIN_PORT | 3001 | 管理端口 |
| PUBLIC_PORT | 3000 | 公开端口 |
