const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../../config/db');  // 引入数据库连接
const { asyncHandler } = require('../../middleware/errorHandler');


// 通过笔画数和部首查询汉字
router.post('/bhbsSearch', asyncHandler(async (req, res) => {
  const { strokes, radicals } = req.body;  // 从请求体中获取笔画数和部首

  // 验证输入
  if (strokes && isNaN(strokes)) {
    return res.error('笔画数必须是一个数字', 400);
  }

  // 构建查询以获取汉字信息
  let query = `
    SELECT 
      id,
      name,
      strokes,
      radicals,
      frequency
    FROM chinese_dictionary
    WHERE 1=1`;  // 使用1=1以便于后续条件拼接

  const params = [];  // 存储查询参数

  if (strokes) {
    query += ` AND strokes = ?`;
    params.push(parseInt(strokes, 10));  // 确保strokes必传
  }

  if (radicals) {
    query += ` AND radicals = ?`;
    params.push(radicals);  // 如果radicals存在，则添加到参数中
  }

  // 执行查询以获取汉字信息
  const [rows] = await db.query(query, params);

  // 检查是否找到结果
  if (rows.length === 0) {
    return res.error('未找到匹配的汉字', 404);
  }

  // 返回汉字信息
  return res.success(rows, '获取汉字信息成功');
}));


// 通过拼音搜索汉字
router.post('/pinyinSearch', asyncHandler(async (req, res) => {
  const { pinyin } = req.body;  // 从请求体中获取拼音

  // 验证输入
  if (!pinyin) {
    return res.error('拼音不能为空', 400);
  }

  // 构建查询以通过拼音获取汉字信息
  const query = `
    SELECT 
      d.id,
      d.name,
      d.strokes,
      d.radicals,
      d.frequency
    FROM chinese_dictionary d
    INNER JOIN chinese_pinyin p ON d.id = p.char_id
    WHERE p.pinyin_plain = ?
    ORDER BY d.frequency ASC
  `;

  // 执行查询以获取汉字信息
  const [rows] = await db.query(query, [pinyin]);

  // 检查是否找到结果
  if (rows.length === 0) {
    return res.error('未找到匹配的汉字', 404);
  }

  // 返回汉字信息
  return res.success(rows, '通过拼音获取汉字信息成功');
}));

module.exports = router;
