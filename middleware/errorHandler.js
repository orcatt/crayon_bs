class ResponseHandler {
  static success(data = null, message = '操作成功', code = 200) {
    return {
      code,
      message,
      data
    };
  }

  static error(message = '操作失败', code = 500, data = null) {
    return {
      code,
      message,
      data
    };
  }
}

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // 处理不同类型的错误
  if (err.name === 'UnauthorizedError') {
    // JWT 认证错误
    return res.status(401).json(ResponseHandler.error('无效或已过期的令牌', 401));
  }

  if (err.name === 'ValidationError') {
    // 参数验证错误
    return res.status(400).json(ResponseHandler.error(err.message, 400));
  }

  if (err.code === 'ER_DUP_ENTRY') {
    // 数据库唯一键冲突
    return res.status(400).json(ResponseHandler.error('数据已存在', 400));
  }

  // 默认服务器错误
  res.status(500).json(ResponseHandler.error(
    process.env.NODE_ENV === 'production' ? '服务器错误' : err.message,
    500
  ));
};

// 包装异步路由处理器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 扩展 Express 的 Response 对象，添加统一的响应方法
const extendResponse = (req, res, next) => {
  res.success = function(data = null, message = '操作成功', code = 200) {
    return this.json(ResponseHandler.success(data, message, code));
  };

  res.error = function(message = '操作失败', code = 500, data = null) {
    return this.status(code).json(ResponseHandler.error(message, code, data));
  };

  next();
};

module.exports = {
  errorHandler,
  asyncHandler,
  extendResponse,
  ResponseHandler
};