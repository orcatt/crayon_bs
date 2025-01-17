const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../../config/db');  // 引入数据库连接
const { asyncHandler } = require('../../middleware/errorHandler');

router.get('/provinces', asyncHandler(async (req, res) => {
  // 查询所有省份
  const provincesQuery = `
    SELECT province_id, shortname, name, merger_name, level, pinyin, code, zip_code, province_char
    FROM cn_provinces
  `;
  
  const [provinces] = await db.query(provincesQuery);

  // 查询所有车牌信息
  const licensesQuery = `
    SELECT province_id, name, content
    FROM cn_license
  `;
  const [licenses] = await db.query(licensesQuery);

  // 将车牌信息添加到对应的省份数据中
  const provincesWithLicense = provinces.map(province => {
    // 筛选出当前省份的车牌信息
    const provinceLicenses = licenses.filter(license => license.province_id === province.province_id);
    
    // 返回包含车牌数据的省份对象
    return {
      ...province,
      license: provinceLicenses.map(license => ({
        name: license.name,        // 车牌名称
        content: license.content   // 车牌内容
      }))
    };
  });

  // 如果没有省份数据，返回 404 错误
  if (provincesWithLicense.length === 0) {
    return res.error('未找到省份数据', 404);
  }

  // 返回包含车牌信息的省份数据
  return res.success(provincesWithLicense, '查询成功');
}));

router.get('/cities', asyncHandler(async (req, res) => {
  const { province_id } = req.query; // 从查询参数中获取省份 ID

  if (!province_id) {
    return res.error('省份 ID 是必填参数', 400);
  }

  const query = `
    SELECT city_id, shortname, name, merger_name, level, pinyin, code, zip_code, province_id
    FROM cn_cities
    WHERE province_id = ?
  `;
  
  const [rows] = await db.query(query, [province_id]);

  // 检查是否有数据返回
  if (rows.length === 0) {
    return res.error('未找到该省份的城市数据', 404);
  }

  // 返回查询结果
  return res.success(rows, '查询成功');
}));

router.get('/districts', asyncHandler(async (req, res) => {
  const { city_id } = req.query; // 从查询参数中获取城市 ID

  if (!city_id) {
    return res.error('城市 ID 是必填参数', 400);
  }

  const query = `
    SELECT district_id, shortname, name, merger_name, level, pinyin, code, zip_code, city_id
    FROM cn_districts
    WHERE city_id = ?
  `;
  
  const [rows] = await db.query(query, [city_id]);

  // 检查是否有数据返回
  if (rows.length === 0) {
    return res.error('未找到该城市的区县数据', 404);
  }

  // 返回查询结果
  return res.success(rows, '查询成功');
}));


router.post('/idcard', asyncHandler(async (req, res) => {
  const { code } = req.body; // 从请求体中获取 code 参数

  if (!code) {
    return res.error('code 是必填参数', 400); // 如果没有传递 code，返回 400 错误
  }

  const query = `
    SELECT id, code, name
    FROM cn_idcard_regions
    WHERE code = ?
  `;
  
  const [rows] = await db.query(query, [code]);

  // 如果没有找到符合条件的数据
  if (rows.length === 0) {
    return res.error('未找到符合条件的数据', 404);
  }

  // 返回查询结果
  return res.success(rows, '查询成功');
}));


module.exports = router;
