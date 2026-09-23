// Session 认证中间件：未登录返回 401
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.status(401).json({ success: false, message: 'AUTH_REQUIRED' });
};