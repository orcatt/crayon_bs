const mysql = require('mysql2');

// 创建数据库连接池
const pool = mysql.createPool({
  host: '111.119.235.36',    // 线上数据库地址
  user: 'orcatt',             // 数据库用户名
  password: 'Zht231822',      // 数据库密码
  database: 'crayon_bs',      // 数据库名称
  waitForConnections: true,
  connectionLimit: 10,        // 连接池最大连接数
  queueLimit: 0
});

// 使用 Promise 封装数据库连接池，以便可以使用 async/await
const promisePool = pool.promise();

module.exports = promisePool;
