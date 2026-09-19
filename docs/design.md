# 静态网站托管平台 - 详细设计文档

> 本文档为需求规格说明书的补充，描述技术实现细节。

---

## 1. 模块划分

### 1.1 server/config.js - 配置中心
- 集中管理所有配置项
- 支持环境变量覆盖
- 提供默认值

### 1.2 server/db.js - 数据层
- SQLite 数据库连接
- 表结构初始化
- 默认数据填充

### 1.3 server/email.js - 邮件服务
- Nodemailer 封装
- 邮件模板
- 发送接口

### 1.4 server/middleware/auth.js - 认证中间件
- Session 验证
- 登录状态检查
- 权限控制

### 1.5 server/middleware/upload.js - 文件上传
- Multer 配置
- 文件大小限制
- 文件类型验证
- 路径安全校验

### 1.6 server/routes/admin.js - 管理路由
- 认证相关 API
- 网站 CRUD API

### 1.7 server/routes/public.js - 公开路由
- 网站文件服务
- 错误页面处理

### 1.8 server/index.js - 服务入口
- 双端口启动
- 中间件注册
- 错误处理

### 1.9 client/admin.html - 管理界面
- HTML 结构
- Tailwind CSS 样式
- 响应式布局

### 1.10 client/admin.js - 前端逻辑
- API 调用封装
- DOM 操作
- 事件处理

---

## 2. 安全设计

### 2.1 认证安全
```javascript
// 密码哈希
const hash = await bcrypt.hash(password, 10);
const valid = await bcrypt.compare(input, hash);

// Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));
```

### 2.2 文件上传安全
```javascript
// 路径遍历防护
const safeName = sanitize(filename);
const safePath = path.join(UPLOAD_DIR, safeSlug, safeName);

// ZIP 内路径验证
const zip = new AdmZip(zipBuffer);
zip.getEntries().forEach(entry => {
  const entryPath = path.normalize(entry.entryName);
  if (entryPath.startsWith('..')) {
    throw new Error('路径包含非法字符');
  }
});
```

### 2.3 密码重置安全
```javascript
// 令牌生成
const token = uuid.v4();
const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60分钟

// 令牌验证
const isValid = tokenRecord && tokenRecord.expiresAt > new Date();
```

---

## 3. 数据库设计

### 3.1 SQL Schema
```sql
-- 管理员表
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 网站表
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  files_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 密码重置令牌表
CREATE TABLE reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);
```

### 3.2 索引设计
```sql
CREATE INDEX idx_admins_username ON admins(username);
CREATE INDEX idx_sites_slug ON sites(slug);
CREATE INDEX idx_reset_tokens_token ON reset_tokens(token);
CREATE INDEX idx_reset_tokens_email ON reset_tokens(email);
```

---

## 4. API 详细设计

### 4.1 登录接口
```
POST /api/login
Content-Type: application/json

Request:
{
  "username": "admin",
  "password": "password123"
}

Response (200):
{
  "success": true,
  "message": "登录成功"
}

Response (401):
{
  "success": false,
  "message": "用户名或密码错误"
}
```

### 4.2 上传接口
```
POST /api/sites
Content-Type: multipart/form-data

FormData:
- file: ZIP 文件
- title: 网站标题
- description: 网站描述（可选）

Response (201):
{
  "success": true,
  "site": {
    "id": 1,
    "slug": "my-site",
    "title": "我的网站",
    "description": "描述",
    "url": "http://localhost:3000/sites/my-site"
  }
}

Response (400):
{
  "success": false,
  "message": "上传失败原因"
}
```

### 4.3 公开访问
```
GET /sites/:slug/*
示例: GET /sites/my-site/index.html

返回 ZIP 解压后的文件内容
Content-Type 根据文件扩展名自动设置
```

---

## 5. UI 组件设计

### 5.1 登录页组件
```
┌─────────────────────────────┐
│         LOGO                │
│                             │
│    ┌─────────────────┐      │
│    │  用户名          │      │
│    └─────────────────┘      │
│    ┌─────────────────┐      │
│    │  密码            │      │
│    └─────────────────┘      │
│                             │
│    [  登录  ]               │
│                             │
│    忘记密码？                │
│                             │
└─────────────────────────────┘
```

### 5.2 主界面布局
```
┌─────────────────────────────────────────────┐
│  Logo    网站托管平台           用户名 ▼  [退出] │
├─────────────────────────────────────────────┤
│                                             │
│  [+ 上传新网站]      [搜索...]               │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 预览图    │ │ 预览图    │ │ 预览图    │   │
│  │ 网站A    │ │ 网站B    │ │ 网站C    │   │
│  │ [预览][删]│ │ [预览][删]│ │ [预览][删]│   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 6. 错误处理

### 6.1 统一错误格式
```javascript
{
  success: false,
  message: '错误描述',
  code: 'ERROR_CODE'  // 可选，用于前端逻辑判断
}
```

### 6.2 常见错误码
| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| AUTH_REQUIRED | 401 | 未登录 |
| INVALID_CREDENTIALS | 401 | 凭证错误 |
| FILE_TOO_LARGE | 400 | 文件过大 |
| INVALID_FILE_TYPE | 400 | 文件格式错误 |
| PATH_TRAVERSAL | 400 | 路径遍历攻击 |
| SITE_NOT_FOUND | 404 | 网站不存在 |
| DUPLICATE_SLUG | 409 | Slug 已存在 |

---

## 7. 日志设计

### 7.1 日志级别
- ERROR: 系统错误、未处理异常
- WARN: 警告信息、降级处理
- INFO: 关键操作（登录、上传、删除）
- DEBUG: 调试信息

### 7.2 日志格式
```
[2025-09-10 14:30:00] [INFO] Admin login: admin from 192.168.1.1
[2025-09-10 14:30:05] [INFO] Site uploaded: my-site by admin
[2025-09-10 14:30:10] [WARN] Failed login attempt for admin
```

---

## 8. 测试策略

### 8.1 单元测试
- 数据库操作
- 认证逻辑
- 文件处理

### 8.2 集成测试
- API 端点
- 完整上传流程
- 邮件发送（Mock）

### 8.3 端到端测试
- 登录流程
- 上传预览删除
- 公共访问
