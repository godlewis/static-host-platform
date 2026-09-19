# Static Website Host Platform

一个轻量级的静态网站托管平台，支持管理员上传 ZIP 包并对外提供服务。

## 🎯 项目简介

- **管理后台**：端口 3001，需要登录
- **公共访问**：端口 3000，无需认证
- **特点**：双端口隔离、操作简单、界面美观

## 🚀 快速开始

### 环境要求
- Node.js >= 16
- npm >= 8

### 安装与运行

```bash
# 进入项目目录
cd static-host-platform

# 安装依赖
npm install

# 启动服务
npm start
```

### 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 管理后台 | http://localhost:3001 | 需要登录 |
| 公共访问 | http://localhost:3000 | 直接访问 |

### 默认账号

```
用户名: admin
密码: admin123
```

## 📦 功能特性

- ✅ 管理员登录认证
- ✅ 邮箱找回密码
- ✅ ZIP 文件上传（拖拽支持）
- ✅ 网站列表管理
- ✅ 在线预览
- ✅ 编辑/删除网站
- ✅ 公共端口访问网站

## 🔧 配置

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

### 必填配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| ADMIN_USER | 管理员用户名 | admin |
| ADMIN_PASSWORD | 管理员密码 | admin123 |
| SESSION_SECRET | Session 密钥 | static-host-secret |

### 可选配置（邮件）

| 变量 | 说明 |
|------|------|
| SMTP_HOST | SMTP 服务器地址 |
| SMTP_PORT | SMTP 端口 |
| SMTP_USER | 发件人邮箱 |
| SMTP_PASS | 邮箱密码 |
| SMTP_FROM | 发件人显示名 |

## 📁 项目结构

```
static-host-platform/
├── docs/                 # 需求与设计文档
├── server/              # 服务端代码
│   ├── routes/         # API 路由
│   └── middleware/     # 中间件
├── client/              # 前端代码
├── uploads/             # 上传文件存储
├── data/                # 数据库文件
└── package.json
```

## 🔒 安全说明

- 密码使用 bcrypt 哈希存储
- Session 认证机制
- 路径遍历攻击防护
- 文件上传大小限制
- 登录频率限制

## 📄 许可证

MIT License
