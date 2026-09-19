const path = require('path');

module.exports = {
  // 端口配置
  ADMIN_PORT: process.env.ADMIN_PORT || 3001,
  PUBLIC_PORT: process.env.PUBLIC_PORT || 3000,

  // 数据库路径
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sites.db'),

  // 上传目录
  UPLOAD_DIR: path.join(__dirname, '..', 'uploads'),

  // 静态文件目录（admin 界面）
  CLIENT_DIR: path.join(__dirname, '..', 'client'),

  // Session 配置
  SESSION_SECRET: process.env.SESSION_SECRET || 'static-host-secret-change-in-production',
  SESSION_NAME: 'static_host_session',

  // 邮件配置（可选，不配置则禁用密码找回）
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@static-host.local',

  // 管理后台默认账号
  DEFAULT_ADMIN_USER: process.env.ADMIN_USER || 'admin',
  DEFAULT_ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  // 重置令牌过期时间（分钟）
  RESET_TOKEN_EXPIRY_MINUTES: 60,

  // 最大上传文件大小（MB）
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB) || 100,
};
