const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// 获取用户 slave 信息接口
router.post('/info/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从中间件获取 userId

  // 查询 slave_info 表，获取指定 userId 的数据
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
    FROM slave_info
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
  const [existing] = await db.query('SELECT id FROM slave_info WHERE user_id = ?', [userId]);

  let result;
  if (existing.length > 0) {
    // 如果已有数据，执行更新操作
    [result] = await db.query('UPDATE slave_info SET ? WHERE user_id = ?', [userSlaveInfoData, userId]);
  } else {
    // 如果没有数据，执行插入操作
    [result] = await db.query('INSERT INTO slave_info SET ?', [userSlaveInfoData]);
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
    FROM slave_info
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
  const [rows] = await db.query('SELECT 1 FROM slave_info WHERE number = ?', [number]);
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

// 新增/修改每日规矩
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

// 删除每日规矩
router.post('/dailyRules/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  // 参数验证
  if (!id) {
    return res.error('id不能为空', 400);
  }

  try {
    // 查询记录是否存在
    const [existing] = await db.query(
      'SELECT id FROM slave_daily_rules WHERE user_id = ? AND id = ?',
      [userId, id]
    );

    if (existing.length === 0) {
      return res.error('未找到指定日期的规矩记录', 404);
    }

    // 删除记录
    await db.query(
      'DELETE FROM slave_daily_rules WHERE user_id = ? AND id = ?',
      [userId, id]
    );

    return res.success(null, '删除成功');
  } catch (error) {
    console.error('删除每日规矩失败:', error);
    return res.error('删除每日规矩失败', 500);
  }
}));

// ? --------------------- temalock表 ---------------------

// 获取 temalock事件列表
router.post('/temalock/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { date, type } = req.body;

  // 参数验证
  if (type && !['wearer', 'manager', 'create'].includes(type)) {
    return res.error('type参数值无效', 400);
  }

  if (type === 'wearer' && !date) {
    return res.error('type为wearer时，date参数不能为空', 400);
  }

  try {
    // 构建基础查询
    let sql = `
      SELECT 
        id,
        wearer_user_name,
        wearer_user_id,
        manager_user_name,
        manager_user_id,
        create_user_name,
        create_user_id,
        share_template,
        description,
        DATE_FORMAT(start_date, '%Y-%m-%d %H:%i:%s') as start_date,
        frequency,
        DATE_FORMAT(default_end_date, '%Y-%m-%d %H:%i:%s') as default_end_date,
        DATE_FORMAT(update_end_date, '%Y-%m-%d %H:%i:%s') as update_end_date,
        share_link_status,
        share_link_url,
        share_link_bet,
        display_countdown_status,
        display_countdown_max_bet,
        public_everyone_status,
        public_everyone_bet,
        min_game_times,
        max_game_times,
        game_bet,
        regular_cleaning_status,
        regular_cleaning_frequency,
        end_condition,
        end_status,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
      FROM slave_temalock 
      WHERE end_status = 0
    `;

    const queryParams = [];

    // 根据type添加不同的查询条件
    if (type === 'wearer') {
      sql += ` AND wearer_user_id = ? AND start_date <= ? AND update_end_date >= ?`;
      queryParams.push(userId, date, date);
      sql += ` GROUP BY wearer_user_id`; // 每个穿戴者只返回一条记录
    } else if (type === 'manager') {
      sql += ` AND manager_user_id = ?`;
      queryParams.push(userId);
    } else if (type === 'create') {
      sql += ` AND create_user_id = ?`;
      queryParams.push(userId);
    }

    sql += ` ORDER BY created_at DESC`;

    // 执行查询
    const [rows] = await db.query(sql, queryParams);

    return res.success({
      list: rows,
      total: rows.length
    }, '获取 temalock 事件列表成功');

  } catch (error) {
    console.error('获取 temalock 事件列表失败:', error);
    return res.error('获取 temalock 事件列表失败', 500);
  }
}));

// 新增 temalock事件
router.post('/temalock/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    wearer_user_name,
    wearer_user_id,
    manager_user_name,
    manager_user_id,
    create_user_name,
    create_user_id,
    share_template = 0,
    description,
    start_date,
    frequency,
    default_end_date,
    share_link_status = 0,
    share_link_url = null,
    share_link_bet = null,
    display_countdown_status = 'hidden',
    display_countdown_max_bet = null,
    public_everyone_status = 0,
    public_everyone_bet = null,
    min_game_times = 0,
    max_game_times = 0,
    game_bet = null,
    regular_cleaning_status = 0,
    regular_cleaning_frequency = null,
    end_condition = 0,
    end_status = 0
  } = req.body;

  // 参数验证
  if (!wearer_user_name || !wearer_user_id || !manager_user_name || 
      !manager_user_id || !create_user_name || !create_user_id || !description || 
      !start_date || !frequency || !default_end_date) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 检查时间段内是否已存在进行中的事件（针对穿戴者）
    const [existingEvents] = await db.query(`
      SELECT id FROM slave_temalock 
      WHERE wearer_user_id = ? 
        AND end_status = 0
        AND (
          (start_date <= ? AND default_end_date >= ?) OR
          (start_date <= ? AND default_end_date >= ?) OR
          (start_date >= ? AND default_end_date <= ?)
        )
    `, [
      wearer_user_id,
      start_date, start_date,
      default_end_date, default_end_date,
      start_date, default_end_date
    ]);

    if (existingEvents.length > 0) {
      return res.error('该用户在指定时间段内已有进行中的事件', 400);
    }

    // 构建插入数据对象
    const temalockData = {
      wearer_user_name,
      wearer_user_id,
      manager_user_name,
      manager_user_id,
      create_user_name,
      create_user_id,
      share_template,
      description,
      start_date,
      frequency,
      default_end_date,
      update_end_date: default_end_date,
      share_link_status,
      share_link_url,
      share_link_bet,
      display_countdown_status,
      display_countdown_max_bet,
      public_everyone_status,
      public_everyone_bet,
      min_game_times,
      max_game_times,
      game_bet,
      regular_cleaning_status,
      regular_cleaning_frequency,
      end_condition,
      end_status
    };

    // 插入主表数据
    const [result] = await db.query(
      'INSERT INTO slave_temalock SET ?',
      [temalockData]
    );

    // 如果需要共享模板，则同时插入模板表
    if (share_template === 1) {
      const templateData = {
        create_user_name,
        create_user_id,
        description,
        start_date,
        frequency,
        default_end_date,
        share_link_status,
        share_link_url,
        share_link_bet,
        display_countdown_status,
        display_countdown_max_bet,
        public_everyone_status,
        public_everyone_bet,
        min_game_times,
        max_game_times,
        game_bet,
        regular_cleaning_status,
        regular_cleaning_frequency,
        end_condition,
        end_status
      };

      await db.query(
        'INSERT INTO slave_temalock_template SET ?',
        [templateData]
      );
    }

    return res.success({
      id: result.insertId
    }, '新增 temalock 事件成功');

  } catch (error) {
    console.error('新增 temalock 事件失败:', error);
    return res.error('新增 temalock 事件失败', 500);
  }
}));

// 新增 temalock 模板
router.post('/temalock/template/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    create_user_name,
    description,
    start_date,
    frequency,
    default_end_date,
    share_link_status = 0,
    share_link_url = null,
    share_link_bet = null,
    display_countdown_status = 'hidden',
    display_countdown_max_bet = null,
    public_everyone_status = 0,
    public_everyone_bet = null,
    min_game_times = 0,
    max_game_times = 0,
    game_bet = null,
    regular_cleaning_status = 0,
    regular_cleaning_frequency = null,
    end_condition = 0,
    end_status = 0
  } = req.body;

  // 参数验证
  if (!create_user_name || !description || !start_date || !frequency || !default_end_date) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 构建模板数据对象
    const templateData = {
      create_user_name,
      create_user_id: userId,
      description,
      start_date,
      frequency,
      default_end_date,
      share_link_status,
      share_link_url,
      share_link_bet,
      display_countdown_status,
      display_countdown_max_bet,
      public_everyone_status,
      public_everyone_bet,
      min_game_times,
      max_game_times,
      game_bet,
      regular_cleaning_status,
      regular_cleaning_frequency,
      end_condition,
      end_status
    };

    // 插入模板数据
    const [result] = await db.query(
      'INSERT INTO slave_temalock_template SET ?',
      [templateData]
    );

    return res.success({
      id: result.insertId
    }, '新增 temalock 模板成功');

  } catch (error) {
    console.error('新增 temalock 模板失败:', error);
    return res.error('新增 temalock 模板失败', 500);
  }
}));

// 删除 temalock事件
router.post('/temalock/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  // 参数验证
  if (!id) {
    return res.error('id不能为空', 400);
  }

  try {
    // 查询事件信息
    const [eventInfo] = await db.query(`
      SELECT 
        id,
        wearer_user_id,
        manager_user_id,
        create_user_id,
        end_status
      FROM slave_temalock 
      WHERE id = ?
    `, [id]);

    if (eventInfo.length === 0) {
      return res.error('事件不存在', 404);
    }

    const event = eventInfo[0];

    // 权限验证
    if (event.end_status === 0) {
      // 进行中的事件只有管理者可以删除
      if (event.manager_user_id !== userId) {
        return res.error('只有管理者可以删除进行中的事件', 403);
      }
    } else {
      // 已结束的事件穿戴者和管理者可以删除
      if (event.wearer_user_id !== userId && event.manager_user_id !== userId) {
        return res.error('只有穿戴者或管理者可以删除此事件', 403);
      }
    }

    // 执行删除操作
    await db.query('DELETE FROM slave_temalock WHERE id = ?', [id]);

    return res.success(null, '删除事件成功');

  } catch (error) {
    console.error('删除 temalock 事件失败:', error);
    return res.error('删除 temalock 事件失败', 500);
  }
}));

// 删除 temalock 模板
router.post('/temalock/template/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  // 参数验证
  if (!id) {
    return res.error('id不能为空', 400);
  }

  try {
    // 查询模板信息
    const [templateInfo] = await db.query(`
      SELECT id, create_user_id
      FROM slave_temalock_template 
      WHERE id = ?
    `, [id]);

    if (templateInfo.length === 0) {
      return res.error('模板不存在', 404);
    }

    // 验证是否为创建者
    if (templateInfo[0].create_user_id !== userId) {
      return res.error('只有创建者可以删除此模板', 403);
    }

    // 执行删除操作
    await db.query('DELETE FROM slave_temalock_template WHERE id = ?', [id]);

    return res.success(null, '删除模板成功');

  } catch (error) {
    console.error('删除 temalock 模板失败:', error);
    return res.error('删除 temalock 模板失败', 500);
  }
}));

// 获取调教记录列表
router.post('/temalock/record/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id } = req.body;

  // 参数验证
  if (!temalock_id) {
    return res.error('temalock_id不能为空', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限（管理者和穿戴者都可以查看记录）
    const [temalockInfo] = await db.query(`
      SELECT id, manager_user_id, wearer_user_id
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以查看调教记录', 403);
    }

    // 查询调教记录列表
    const [records] = await db.query(`
      SELECT 
        id,
        temalock_id,
        title,
        DATE_FORMAT(occur_time, '%Y-%m-%d %H:%i:%s') as occur_time,
        reason,
        minute,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM slave_action_records 
      WHERE temalock_id = ?
      ORDER BY occur_time DESC
    `, [temalock_id]);

    return res.success({
      list: records,
      total: records.length
    }, '获取调教记录列表成功');

  } catch (error) {
    console.error('获取调教记录列表失败:', error);
    return res.error('获取调教记录列表失败', 500);
  }
}));

// 添加调教记录
router.post('/temalock/record/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    temalock_id,
    title,
    occur_time,
    reason,
    minute
  } = req.body;

  // 参数验证
  if (!temalock_id || !title || !occur_time || !reason || !minute) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限（管理者和穿戴者都可以添加记录）
    const [temalockInfo] = await db.query(`
      SELECT id, manager_user_id, wearer_user_id, end_status 
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以添加调教记录', 403);
    }

    // 验证事件是否已结束
    if (temalockInfo[0].end_status !== 0) {
      return res.error('该事件已结束，无法添加调教记录', 400);
    }

    // 构建插入数据
    const recordData = {
      temalock_id,
      title,
      occur_time,
      reason,
      minute
    };

    // 插入记录
    const [result] = await db.query(
      'INSERT INTO slave_action_records SET ?',
      [recordData]
    );

    // 无论minute是正数还是负数，都更新update_end_date
    await db.query(`
      UPDATE slave_temalock 
      SET update_end_date = DATE_ADD(update_end_date, INTERVAL ? MINUTE)
      WHERE id = ?
    `, [minute, temalock_id]);

    return res.success({
      id: result.insertId
    }, '添加调教记录成功');

  } catch (error) {
    console.error('添加调教记录失败:', error);
    return res.error('添加调教记录失败', 500);
  }
}));


// 获取高潮事件列表
router.post('/temalock/climax/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id } = req.body;

  // 参数验证
  if (!temalock_id) {
    return res.error('temalock_id不能为空', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限（管理者和穿戴者都可以查看记录）
    const [temalockInfo] = await db.query(`
      SELECT id, manager_user_id, wearer_user_id
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以查看高潮事件记录', 403);
    }

    // 查询高潮事件列表
    const [records] = await db.query(`
      SELECT 
        id,
        temalock_id,
        climax_type,
        climax_method,
        climax_result,
        DATE_FORMAT(operation_time, '%Y-%m-%d %H:%i:%s') as operation_time,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM slave_climax_event 
      WHERE temalock_id = ?
      ORDER BY operation_time DESC
    `, [temalock_id]);

    return res.success({
      list: records,
      total: records.length
    }, '获取高潮事件列表成功');

  } catch (error) {
    console.error('获取高潮事件列表失败:', error);
    return res.error('获取高潮事件列表失败', 500);
  }
}));

// 添加高潮事件
router.post('/temalock/climax/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id, climax_type, climax_method, climax_result, operation_time } = req.body;
  
  // 参数验证
  if (!temalock_id || !climax_type || !climax_method || !climax_result || !operation_time) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限（管理者和穿戴者都可以添加记录）
    const [temalockInfo] = await db.query(`
      SELECT id, manager_user_id, wearer_user_id, end_status 
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以添加高潮事件记录', 403);
    }

    // 验证事件是否已结束
    if (temalockInfo[0].end_status !== 0) {
      return res.error('该事件已结束，无法添加高潮事件记录', 400);
    }

    // 构建插入数据
    const recordData = {
      temalock_id,
      climax_type,
      climax_method,
      climax_result,
      operation_time
    };

    // 插入记录
    const [result] = await db.query(
      'INSERT INTO slave_climax_event SET ?',
      [recordData]
    );

    return res.success({
      id: result.insertId
    }, '添加高潮事件记录成功');

  } catch (error) {
    console.error('添加高潮事件记录失败:', error);
    return res.error('添加高潮事件记录失败', 500);
  }
}));

// 更新每日游戏记录
// router.post('/temalock/game/update', asyncHandler(async (req, res) => {
//   const userId = req.auth.userId;
//   const { temalock_id } = req.body;

//   // 参数验证
//   if (!temalock_id) {
//     return res.error('temalock_id不能为空', 400);
//   }

//   try {
//     // 验证 temalock 记录是否存在，并检查权限
//     const [temalockInfo] = await db.query(`
//       SELECT 
//         id, 
//         manager_user_id, 
//         wearer_user_id, 
//         end_status,
//         min_game_times,
//         max_game_times,
//         game_bet
//       FROM slave_temalock 
//       WHERE id = ?
//     `, [temalock_id]);

//     if (temalockInfo.length === 0) {
//       return res.error('temalock 记录不存在', 404);
//     }

//     // 验证是否为管理者或穿戴者
//     if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
//       return res.error('只有管理者或穿戴者可以更新游戏记录', 403);
//     }

//     // 验证事件是否已结束
//     if (temalockInfo[0].end_status !== 0) {
//       return res.error('该事件已结束，无法更新游戏记录', 400);
//     }

//     const today = new Date().toISOString().slice(0, 10); // 获取当前日期 YYYY-MM-DD

//     // 查询今日游戏记录
//     const [existingRecord] = await db.query(`
//       SELECT id, game_count
//       FROM slave_daily_game
//       WHERE temalock_id = ? AND DATE(created_at) = ?
//     `, [temalock_id, today]);

//     let game_count = 1; // 默认为1
//     let penalty_minutes = 0;

//     if (existingRecord.length > 0) {
//       // 如果已有记录，检查是否超过最大游戏次数
//       if (existingRecord[0].game_count >= temalockInfo[0].max_game_times) {
//         return res.error('已达到今日最大游戏次数限制', 400);
//       }
//       game_count = existingRecord[0].game_count + 1;
//     }

//     // 如果游戏次数小于最小次数，计算惩罚时间
//     if (game_count < temalockInfo[0].min_game_times) {
//       const remaining_games = temalockInfo[0].min_game_times - game_count;
//       penalty_minutes = remaining_games * temalockInfo[0].game_bet;
//     }

//     if (existingRecord.length > 0) {
//       // 更新现有记录
//       await db.query(`
//         UPDATE slave_daily_game 
//         SET game_count = ?,
//             penalty_minutes = ?,
//             min_game_times = ?,
//             max_game_times = ?,
//             game_bet = ?
//         WHERE id = ?
//       `, [
//         game_count,
//         penalty_minutes,
//         temalockInfo[0].min_game_times,
//         temalockInfo[0].max_game_times,
//         temalockInfo[0].game_bet,
//         existingRecord[0].id
//       ]);
//     } else {
//       // 插入新记录
//       await db.query(`
//         INSERT INTO slave_daily_game 
//         (temalock_id, game_count, min_game_times, max_game_times, game_bet, penalty_minutes)
//         VALUES (?, ?, ?, ?, ?, ?)
//       `, [
//         temalock_id,
//         game_count,
//         temalockInfo[0].min_game_times,
//         temalockInfo[0].max_game_times,
//         temalockInfo[0].game_bet,
//         penalty_minutes
//       ]);
//     }

//     return res.success({
//       game_count,
//       penalty_minutes,
//       min_game_times: temalockInfo[0].min_game_times,
//       max_game_times: temalockInfo[0].max_game_times
//     }, '更新游戏记录成功');

//   } catch (error) {
//     console.error('更新游戏记录失败:', error);
//     return res.error('更新游戏记录失败', 500);
//   }
// }));

module.exports = router;