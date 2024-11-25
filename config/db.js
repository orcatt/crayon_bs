const mysql = require('mysql2');

// 创建数据库连接池
const pool = mysql.createPool({
  host: 'localhost',    // 数据库地址
  user: 'root',         // 数据库用户名
  password: '19991129', // 数据库密码
  database: 'crayon_bs',  // 数据库名称
  waitForConnections: true,
  connectionLimit: 10,  // 连接池最大连接数
  queueLimit: 0
});

// 使用 Promise 封装数据库连接池，以便可以使用 async/await
const promisePool = pool.promise();

module.exports = promisePool;
