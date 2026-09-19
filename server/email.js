const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });
}

/**
 * 发送密码重置邮件
 * @param {string} email - 收件人邮箱
 * @param {string} token - 重置令牌
 * @param {string} adminUrl - 管理后台地址
 */
async function sendResetEmail(email, token, adminUrl) {
  if (!transporter) {
    console.warn('[Email] SMTP 未配置，密码重置链接无法发送');
    return false;
  }

  const resetUrl = `${adminUrl}/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: email,
      subject: '密码重置请求',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #333;">密码重置</h2>
          <p>您好，您收到了这封邮件是因为收到了密码重置请求。</p>
          <p>请点击以下按钮重置您的密码：</p>
          <div style="margin: 24px 0;">
            <a href="${resetUrl}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              重置密码
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            如果按钮无法点击，请复制以下链接到浏览器：<br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            此链接将在 ${config.RESET_TOKEN_EXPIRY_MINUTES} 分钟后过期。
            如果您没有请求重置密码，请忽略此邮件。
          </p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('[Email] 发送失败:', error.message);
    return false;
  }
}

module.exports = { sendResetEmail };
