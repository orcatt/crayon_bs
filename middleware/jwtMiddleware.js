const { expressjwt: jwtMiddleware } = require('express-jwt');
const { secretKey } = require('../config/config');

// 创建中间件
const jwtAuth = jwtMiddleware({
  secret: secretKey,
  algorithms: ['HS256'],
  // 将解码后的 payload 存储在 req.auth 中（express-jwt v7+ 使用 auth 而不是 user）
}).unless({ 
  path: [
    '/auth/login',
    '/auth/register',
    '/auth/deleteUser',
    '/auth/wechat-login',
    '/today/getAlmanac',
    '/explore/drug/search',
    '/',
    
  ] 
});

// 添加错误处理
const handleJWTError = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      code: 401,
      message: '无效或已过期的令牌',
      data: null
    });
  }
  next(err);
};

module.exports = {
  jwtAuth,
  handleJWTError
};

