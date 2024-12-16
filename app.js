const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { port } = require('./config/config');
const { jwtAuth, handleJWTError } = require('./middleware/jwtMiddleware');
const { errorHandler, extendResponse } = require('./middleware/errorHandler');
const fetchAndUpdateAlmanac = require('./tasks/scheduledTask');

// 引入数据库连接配置
const db = require('./config/db');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const todayRoutes = require('./routes/today');
const healthRoutes = require('./routes/health');
const uploadRoutes = require('./routes/upload');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 在所有路由之前添加响应扩展中间件
app.use(extendResponse);

// 添加 JWT 中间件
app.use(jwtAuth);
app.use(handleJWTError);  // JWT 错误处理

// Routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/today', todayRoutes);
app.use('/health', healthRoutes);
app.use('/upload', uploadRoutes);

// Error handling - 保持在所有路由之后
app.use(errorHandler);

// 先确保数据库连接成功
db.getConnection()
  .then((connection) => {
    console.log('Database connected');
    connection.release();

    // 启动服务器
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${port}`);
      
      // 在服务器成功启动后初始化定时任务
      try {
        fetchAndUpdateAlmanac();
        console.log('定时任务已启动');
      } catch (error) {
        console.error('定时任务启动失败:', error);
      }
    });
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);  // 如果数据库连接失败，终止程序
  });