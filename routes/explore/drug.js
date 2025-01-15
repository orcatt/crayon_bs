const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../../config/db');  // 引入数据库连接
const { asyncHandler } = require('../../middleware/errorHandler');

// 查询 drugs 表
router.post('/search', asyncHandler(async (req, res) => {
  const { letter, name } = req.body; // 从请求体中获取 letter 和 name 参数

  // 1. 如果传了 letter，name 参数为空
  if (letter && !name) {
    const query = `
      SELECT id, letter, name, brand_name, manufacturer, tags
      FROM drugs
      WHERE letter = ?
    `;
    const [rows] = await db.query(query, [letter]);

    // 检查是否有数据返回
    if (rows.length === 0) {
      return res.error('未找到符合条件的数据', 404);
    }

    // 返回查询结果
    return res.success(rows, '查询成功');
  }

  // 2. 如果传了 name，letter 参数为空
  if (name && !letter) {
    const query = `
      SELECT id, letter, name, brand_name, manufacturer, tags
      FROM drugs
      WHERE name LIKE ? OR brand_name LIKE ?
    `;
    const searchName = `%${name}%`; // 使用模糊匹配
    const [rows] = await db.query(query, [searchName, searchName]);

    // 检查是否有数据返回
    if (rows.length === 0) {
      return res.error('未找到符合条件的数据', 404);
    }

    // 返回查询结果
    return res.success(rows, '查询成功');
  }

  // 如果没有传入 letter 或 name，返回错误
  return res.error('请输入 letter 或 name 参数', 400);
}));


module.exports = router;
