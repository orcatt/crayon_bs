const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// 获取用户 slave 信息接口
router.post('/info/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从中间件获取 userId

  // 查询 user_slave_info 表，获取指定 userId 的数据
  const [rows] = await db.query(`
    SELECT 
      id, 
      user_id, 
      number, 
      name, 
      DATE_FORMAT(birthday, '%Y-%m-%d') as birthday,  -- 格式化 birthday 为 yyyy-mm-dd
      height, 
      weight, 
      shoe_size, 
      experience_years, 
      submissive_count, 
      sexual_orientation, 
      role_recognition, 
      dick_unerected_size, 
      dick_erected_size, 
      dick_coarse, 
      dick_circumcised, 
      anal_diameter, 
      longest_abstinence, 
      max_ejaculation_frequency, 
      avg_masturbation_frequency, 
      avg_masturbation_duration, 
      semen_volume
    FROM user_slave_info
    WHERE user_id = ?
  `, [userId]);

  // 如果没有找到相关数据
  if (rows.length === 0) {
    return res.error('未找到用户的 slave 信息', 404);
  }

  // 直接返回查询到的数据，不包裹在额外的层级中
  return res.success(rows[0], '获取成功');
}));



// 新增用户 slave 信息接口
router.post('/info/addOrUpdate', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从中间件获取 userId
  const {
    name, birthday, height, weight, shoe_size, experience_years, submissive_count,
    sexual_orientation, role_recognition, dick_unerected_size, dick_erected_size,
    dick_coarse, dick_circumcised, anal_diameter, longest_abstinence, max_ejaculation_frequency,
    avg_masturbation_frequency, avg_masturbation_duration, semen_volume
  } = req.body;

  // 处理空字符串字段，将空字符串转化为 null
  const processEmptyToNull = (value) => value === "" ? null : value;

  // 生成 number 字段，确保唯一，只在新增时生成
  let number;
  if (!req.body.number) {  // 只有在没有传递 number 时生成
    number = generateUniqueNumber();
    while (await isNumberExists(number)) {
      number = generateUniqueNumber();  // 如果 number 已存在，则重新生成
    }
  } else {
    number = req.body.number;  // 如果传递了 number 字段，则使用传递的值
  }

  // 构建要插入或更新的字段对象
  const userSlaveInfoData = {
    user_id: userId,
    number,
    name,
    birthday,
    height: processEmptyToNull(height),
    weight: processEmptyToNull(weight),
    shoe_size: processEmptyToNull(shoe_size),
    experience_years: processEmptyToNull(experience_years),
    submissive_count: processEmptyToNull(submissive_count),
    sexual_orientation: processEmptyToNull(sexual_orientation),
    role_recognition: processEmptyToNull(role_recognition),
    dick_unerected_size: processEmptyToNull(dick_unerected_size),
    dick_erected_size: processEmptyToNull(dick_erected_size),
    dick_coarse: processEmptyToNull(dick_coarse),
    dick_circumcised: processEmptyToNull(dick_circumcised),
    anal_diameter: processEmptyToNull(anal_diameter),
    longest_abstinence: processEmptyToNull(longest_abstinence),
    max_ejaculation_frequency: processEmptyToNull(max_ejaculation_frequency),
    avg_masturbation_frequency: processEmptyToNull(avg_masturbation_frequency),
    avg_masturbation_duration: processEmptyToNull(avg_masturbation_duration),
    semen_volume: processEmptyToNull(semen_volume)
  };

  // 检查 user_id 是否已有 slave 信息
  const [existing] = await db.query('SELECT id FROM user_slave_info WHERE user_id = ?', [userId]);

  let result;
  if (existing.length > 0) {
    // 如果已有数据，执行更新操作
    [result] = await db.query('UPDATE user_slave_info SET ? WHERE user_id = ?', [userSlaveInfoData, userId]);
  } else {
    // 如果没有数据，执行插入操作
    [result] = await db.query('INSERT INTO user_slave_info SET ?', [userSlaveInfoData]);
  }

  // 获取更新或插入的数据
  const [rows] = await db.query(`
    SELECT 
      id, 
      user_id, 
      number, 
      name, 
      DATE_FORMAT(birthday, '%Y-%m-%d') as birthday,  -- 格式化 birthday 为 yyyy-mm-dd
      height, 
      weight, 
      shoe_size, 
      experience_years, 
      submissive_count, 
      sexual_orientation, 
      role_recognition, 
      dick_unerected_size, 
      dick_erected_size, 
      dick_coarse, 
      dick_circumcised, 
      anal_diameter, 
      longest_abstinence, 
      max_ejaculation_frequency, 
      avg_masturbation_frequency, 
      avg_masturbation_duration, 
      semen_volume
    FROM user_slave_info
    WHERE id = ?
  `, [existing.length > 0 ? existing[0].id : result.insertId]);

  return res.success({
    userSlaveInfo: rows[0],  // 返回格式化后的数据
  }, existing.length > 0 ? '更新成功' : '新增成功');
}));

// 生成唯一的 number 字段（类似于 "123-4567-890" 格式）
function generateUniqueNumber() {
  const part1 = Math.floor(Math.random() * 1000);  // 生成 3 位数
  const part2 = Math.floor(Math.random() * 10000); // 生成 4 位数
  const part3 = Math.floor(Math.random() * 1000);  // 生成 3 位数
  return `${part1}-${part2}-${part3}`;
}

// 检查 number 是否已经存在
async function isNumberExists(number) {
  const [rows] = await db.query('SELECT 1 FROM user_slave_info WHERE number = ?', [number]);
  return rows.length > 0;  // 如果存在，返回 true
}


// ? --------------------- 任务表相关 ---------------------
// 获取任务列表
// 新增任务
// 修改任务
// 删除任务

module.exports = router;
