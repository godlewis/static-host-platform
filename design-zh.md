# Static Website Host Platform - 设计方案

## 📊 架构概览

### 双端口设计
| 端口 | 用途 | 访问方式 |
|------|------|---------|
| **3001** | 管理后台 | 需要登录 |
| **3000** | 对外展示 | 无需认证 |

### 核心功能
1. **管理员认证**
   - 单一账号密码登录
   - 邮箱找回密码功能
   - Session 会话管理

2. **网站管理**
   - ZIP 文件上传（拖拽或点击）
   - 站点列表展示
   - 在线预览、编辑信息、删除

3. **公共访问**
   - 按站点 slug 访问网站
   - 自动识别 index.html

### 技术栈
- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **前端**: Vanilla JS + Tailwind CSS
- **存储**: 本地文件系统
- **邮件**: Nodemailer (可配置 SMTP)

### 项目结构
```
static-host-platform/
├── server/
│   ├── index.js          # 主入口，启动两个端口
│   ├── config.js         # 配置（端口、邮件等）
│   ├── db.js             # SQLite 数据库
│   ├── routes/
│   │   ├── admin.js      # 管理 API
│   │   └── public.js     # 公开 API
│   ├── middleware/
│   │   ├── auth.js       # 认证中间件
│   │   └── upload.js     # 文件上传处理
│   └── email.js          # 邮件服务
├── client/
│   ├── admin.html        # 管理后台界面
│   └── admin.js          # 前端逻辑
├── uploads/              # 上传文件存储
├── package.json
└── design.md
```

### API 设计

#### 管理 API (端口 3001)
```
POST /api/login              - 登录
POST /api/logout             - 登出
POST /api/forgot-password    - 请求密码重置
POST /api/reset-password     - 重置密码
GET  /api/sites              - 列出所有站点
POST /api/sites              - 上传新站点 (multipart)
PUT  /api/sites/:slug        - 更新站点信息
DELETE /api/sites/:slug      - 删除站点
GET  /api/sites/:slug        - 获取站点详情
```

#### 公开 API (端口 3000)
```
GET /sites/:slug/*           - 提供网站文件
```

### 安全考虑
- Bcrypt 密码哈希
- Session-based 认证
- 邮件重置令牌带过期时间
- ZIP 上传路径遍历防护
- 登录尝试频率限制

---

## 🎨 UI 设计

### 管理后台界面
- 现代化卡片式布局
- 清晰的导航栏
- 响应式设计
- 拖拽上传区域
- 站点卡片网格展示

### 上传流程
1. 进入管理后台
2. 点击「上传新站点」
3. 拖拽 ZIP 文件或点击选择
4. 填写站点名称和描述
5. 完成上传

### 站点列表
- 卡片式展示已上传站点
- 显示预览图（首屏截图）
- 快速操作按钮（预览/编辑/删除）
- 搜索和筛选功能
