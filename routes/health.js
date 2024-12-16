const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// 获取食物列表
router.post('/food/list', asyncHandler(async (req, res) => {
  const { name, category, page, limit } = req.body;
  
  // 确保 page 和 limit 是数字类型
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const offset = (pageNum - 1) * limitNum;
  
  // 构建基础查询
  let baseQuery = `
    SELECT 
      f.id,
      f.name,
      f.category,
      f.calories_per_100g,
      f.image_path,
      GROUP_CONCAT(fa.alias_name) as alias_names
    FROM foods_info f
    LEFT JOIN food_aliases fa ON f.id = fa.food_id
  `;

  // 构建 WHERE 子句
  let whereClause = 'WHERE 1';
  let queryParams = [];

  if (name) {
    whereClause += ` AND (f.name LIKE ? OR fa.alias_name LIKE ?)`;
    queryParams.push(`%${name}%`, `%${name}%`);
  }

  if (category) {
    whereClause += ` AND f.category = ?`;
    queryParams.push(category);
  }

  // 添加分组和排序
  const groupBy = ' GROUP BY f.id';
  const orderBy = ' ORDER BY f.name ASC';

  // 添加分页
  const limitClause = ' LIMIT ? OFFSET ?';
  queryParams.push(limitNum, offset);  // 使用转换后的数字类型值

  // 组合完整查询
  const finalQuery = baseQuery + whereClause + groupBy + orderBy + limitClause;

  // 执行查询
  const [rows] = await db.query(finalQuery, queryParams);

  // 获取总记录数
  const [total] = await db.query(
    `SELECT COUNT(DISTINCT f.id) as total 
      FROM foods_info f 
      LEFT JOIN food_aliases fa ON f.id = fa.food_id 
      ${whereClause}`,
    queryParams.slice(0, -2)  // 移除 LIMIT 和 OFFSET 参数
  );

  return res.success({
    list: rows,
    pagination: {
      current: pageNum,
      pageSize: limitNum,
      total: total[0].total
    }
  }, '获取食物列表成功');
}));

module.exports = router;
