const path = require('path');

module.exports = {
  ADMIN_PORT: process.env.ADMIN_PORT || 3001,
  PUBLIC_PORT: process.env.PUBLIC_PORT || 3000,

  UPLOAD_DIR: path.join(__dirname, '..', 'uploads'),
  SITE_DIR: path.join(__dirname, '..', 'uploads', 'site'),

  CLIENT_DIR: path.join(__dirname, '..', 'client'),

  PASSWORD_FILE: process.env.PASSWORD_FILE || path.join(__dirname, '..', 'data', 'admin-password.json'),
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || 'liuyan@2026',
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
  INITIAL_ADMIN_USER: process.env.ADMIN_USER || 'admin',

  SESSION_SECRET: process.env.SESSION_SECRET || 'static-host-secret-change-in-production',
  SESSION_NAME: 'static_host_session',

  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB) || 100,
};