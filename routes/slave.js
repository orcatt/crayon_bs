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
router.post('/tasks/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { type } = req.body;  // 获取可选的 type 参数

  try {
    // 构建基础 SQL，根据是否有 type 参数添加条件
    const typeCondition = type ? 'AND type = ?' : '';
    const sql = `
      (SELECT *, 1 as sort_order 
        FROM slave_tasks 
        WHERE user_id = ? ${typeCondition})
      UNION ALL
      (SELECT *, 2 as sort_order 
        FROM slave_tasks 
        WHERE public_display = 1 AND user_id != ? ${typeCondition})
      ORDER BY sort_order, id DESC
    `;
    
    // 构建查询参数数组
    const params = type 
      ? [userId, type, userId, type]  // 有 type 参数时
      : [userId, userId];             // 没有 type 参数时
    
    const [tasks] = await db.query(sql, params);
    
    return res.success({
      list: tasks,
      total: tasks.length
    }, '获取任务列表成功');
  } catch (error) {
    console.error('获取任务列表失败:', error);
    return res.error('获取任务列表失败', 500);
  }
}));

// 新增任务
router.post('/tasks/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    name,
    description,
    type,
    reward_punishment,
    difficulty_level,
    public_display
  } = req.body;

  // 参数验证
  if (!name || !type || !reward_punishment || !difficulty_level) {
    return res.error('缺少必要字段', 400);
  }

  try {
    const sql = `
      INSERT INTO slave_tasks 
      (user_id, name, description, type, reward_punishment, difficulty_level, public_display)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.query(sql, [
      userId,
      name,
      description,
      type,
      reward_punishment,
      difficulty_level,
      public_display
    ]);

    return res.success({
      id: result.insertId
    }, '新增任务成功');
  } catch (error) {
    console.error('新增任务失败:', error);
    return res.error('新增任务失败', 500);
  }
}));

// 修改任务
router.post('/tasks/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    id,
    name,
    description,
    type,
    reward_punishment,
    difficulty_level,
    public_display
  } = req.body;

  // 参数验证
  if (!id || !name || !type || !reward_punishment || !difficulty_level) {
    return res.error('缺少必要字段', 400);
  }

  try {
    // 先查询任务信息验证权限
    const [taskInfo] = await db.query('SELECT user_id FROM slave_tasks WHERE id = ?', [id]);
    
    if (taskInfo.length === 0) {
      return res.error('任务不存在', 404);
    }

    // 如果是公共任务(user_id为null)或不是自己创建的任务
    if (!taskInfo[0].user_id || taskInfo[0].user_id !== userId) {
      return res.error('无权修改此任务', 403);
    }

    const sql = `
      UPDATE slave_tasks 
      SET name = ?,
          description = ?,
          type = ?,
          reward_punishment = ?,
          difficulty_level = ?,
          public_display = ?
      WHERE id = ? AND user_id = ?
    `;

    const [result] = await db.query(sql, [
      name,
      description,
      type,
      reward_punishment,
      difficulty_level,
      public_display,
      id,
      userId
    ]);

    return res.success({ message: '修改任务成功' });
  } catch (error) {
    console.error('修改任务失败:', error);
    return res.error('修改任务失败', 500);
  }
}));

// 删除任务
router.post('/tasks/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  if (!id) {
    return res.error('缺少必要字段', 400);
  }

  try {
    // 先查询任务信息验证权限
    const [taskInfo] = await db.query('SELECT user_id FROM slave_tasks WHERE id = ?', [id]);
    
    if (taskInfo.length === 0) {
      return res.error('任务不存在', 404);
    }

    // 如果是公共任务(user_id为null)或不是自己创建的任务
    if (!taskInfo[0].user_id || taskInfo[0].user_id !== userId) {
      return res.error('无权删除此任务', 403);
    }

    const sql = 'DELETE FROM slave_tasks WHERE id = ? AND user_id = ?';
    const [result] = await db.query(sql, [id, userId]);
    return res.success({ message: '删除任务成功' });
  } catch (error) {
    console.error('删除任务失败:', error);
    return res.error('删除任务失败', 500);
  }
}));


// 获取每日规矩
router.post('/dailyRules/day', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { date } = req.body;

  // 参数验证
  if (!date) {
    return res.error('日期不能为空', 400);
  }

  try {
    // 查询指定日期的规矩记录
    const [rows] = await db.query(`
      SELECT 
        id,
        user_id,
        kowtow,
        is_locked,
        touch_count,
        libido_status,
        excretion_count_allowed,
        excretion_count,
        water_intake,
        water_completed,
        other_tools,
        daily_task_id,
        daily_task_completed,
        extra_task_id,
        extra_task_completed,
        violation,
        score,
        DATE_FORMAT(date, '%Y-%m-%d') as date,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM slave_daily_rules
      WHERE user_id = ? AND date = ?
    `, [userId, date]);

    // 如果没有找到记录
    if (rows.length === 0) {
      return res.error('未找到指定日期的规矩记录', 404);
    }

    return res.success(rows[0], '获取成功');
  } catch (error) {
    console.error('获取每日规矩失败:', error);
    return res.error('获取每日规矩失败', 500);
  }
}));

// 新增修改每日规矩
router.post('/dailyRules/save', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    date,  // 必填
    kowtow = 0,
    is_locked = 0,
    touch_count = 0,
    libido_status = '平常',
    excretion_count_allowed = 0,
    excretion_count = 0,
    water_intake = '0',
    water_completed = 0,
    other_tools = null,
    daily_task_id = null,
    daily_task_completed = 0,
    extra_task_id = null,
    extra_task_completed = 0,
    violation = null,
    score = null
  } = req.body;

  // 参数验证
  if (!date) {
    return res.error('日期不能为空', 400);
  }

  try {
    // 查询是否存在当天的记录
    const [existing] = await db.query(
      'SELECT id FROM slave_daily_rules WHERE user_id = ? AND date = ?',
      [userId, date]
    );

    // 构建数据对象
    const dailyRuleData = {
      user_id: userId,
      date,
      kowtow,
      is_locked,
      touch_count,
      libido_status,
      excretion_count_allowed,
      excretion_count,
      water_intake,
      water_completed,
      other_tools,
      daily_task_id,
      daily_task_completed,
      extra_task_id,
      extra_task_completed,
      violation,
      score
    };

    let result;
    if (existing.length > 0) {
      // 更新现有记录
      [result] = await db.query(
        'UPDATE slave_daily_rules SET ? WHERE id = ?',
        [dailyRuleData, existing[0].id]
      );
      
      return res.success({
        id: existing[0].id
      }, '更新每日规矩成功');
    } else {
      // 插入新记录
      [result] = await db.query(
        'INSERT INTO slave_daily_rules SET ?',
        [dailyRuleData]
      );

      return res.success({
        id: result.insertId
      }, '新增每日规矩成功');
    }
  } catch (error) {
    console.error('保存每日规矩失败:', error);
    return res.error('保存每日规矩失败', 500);
  }
}));




module.exports = router;