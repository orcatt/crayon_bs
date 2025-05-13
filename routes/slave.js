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
  const { type, difficulty_level } = req.body;  // 获取可选的 type 和 difficulty_level 参数

  // 处理 difficulty_level 参数
  let difficultyLevels = [];
  if (difficulty_level) {
    // 将字符串转换为数组
    difficultyLevels = difficulty_level.toString().split(',').map(level => level.trim());
    
    // 验证每个难度级别是否在有效范围内
    const invalidLevels = difficultyLevels.filter(level => {
      const num = parseInt(level);
      return isNaN(num) || num < 1 || num > 5;
    });

    if (invalidLevels.length > 0) {
      return res.error('难度级别必须在1-5之间', 400);
    }
  }

  try {
    // 构建基础 SQL，根据是否有 type 和 difficulty_level 参数添加条件
    const typeCondition = type ? 'AND type = ?' : '';
    const difficultyCondition = difficultyLevels.length > 0 
      ? `AND difficulty_level IN (${difficultyLevels.map(() => '?').join(',')})` 
      : '';
    const sql = `
      (SELECT *, 1 as sort_order 
        FROM slave_tasks 
        WHERE user_id = ? ${typeCondition} ${difficultyCondition})
      UNION ALL
      (SELECT *, 2 as sort_order 
        FROM slave_tasks 
        WHERE public_display = 1 AND user_id != ? ${typeCondition} ${difficultyCondition})
      ORDER BY sort_order, id DESC
    `;

    // 构建查询参数数组
    let params = [userId];
    if (type) params.push(type);
    if (difficultyLevels.length > 0) params.push(...difficultyLevels);
    params.push(userId);
    if (type) params.push(type);
    if (difficultyLevels.length > 0) params.push(...difficultyLevels);

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




// ? --------------------- 每日规矩表相关 ---------------------

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

    const dailyRule = rows[0];
    let dailyTask = null;
    let extraTask = null;

    // 如果存在 daily_task_id，查询日常任务信息
    if (dailyRule.daily_task_id) {
      const [dailyTasks] = await db.query(`
        SELECT 
          id,
          user_id,
          name,
          description,
          type,
          reward_punishment,
          difficulty_level,
          public_display
        FROM slave_tasks
        WHERE id = ?
      `, [dailyRule.daily_task_id]);
      
      if (dailyTasks.length > 0) {
        dailyTask = dailyTasks[0];
      }
    }

    // 如果存在 extra_task_id，查询额外任务信息
    if (dailyRule.extra_task_id) {
      const [extraTasks] = await db.query(`
        SELECT 
          id,
          user_id,
          name,
          description,
          type,
          reward_punishment,
          difficulty_level,
          public_display
        FROM slave_tasks
        WHERE id = ?
      `, [dailyRule.extra_task_id]);
      
      if (extraTasks.length > 0) {
        extraTask = extraTasks[0];
      }
    }

    // 将任务信息添加到返回数据中
    const responseData = {
      ...dailyRule,
      daily_task: dailyTask,
      extra_task: extraTask
    };

    return res.success(responseData, '获取成功');
  } catch (error) {
    console.error('获取每日规矩失败:', error);
    return res.error('获取每日规矩失败', 500);
  }
}));

// 新增/修改每日规矩
router.post('/dailyRules/save', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { date } = req.body;  // 只解构必填的 date 字段

  // 参数验证
  if (!date) {
    return res.error('日期不能为空', 400);
  }

  try {
    // 查询是否存在当天的记录
    const [existing] = await db.query(
      'SELECT * FROM slave_daily_rules WHERE user_id = ? AND date = ?',
      [userId, date]
    );

    // 构建数据对象
    const dailyRuleData = {
      user_id: userId,
      date,
      ...req.body  // 直接使用请求体中的所有字段
    };

    let result;
    if (existing.length > 0) {
      // 更新现有记录，只更新传入的字段
      const updateData = {};
      Object.keys(req.body).forEach(key => {
        if (req.body[key] !== undefined) {  // 只更新明确传入的字段
          updateData[key] = req.body[key];
        }
      });

      [result] = await db.query(
        'UPDATE slave_daily_rules SET ? WHERE id = ?',
        [updateData, existing[0].id]
      );

      // 查询更新后的完整记录
      const [updatedRecord] = await db.query(`
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
        WHERE id = ?
      `, [existing[0].id]);

      return res.success(updatedRecord[0], '更新每日规矩成功');
    } else {
      // 插入新记录
      [result] = await db.query(
        'INSERT INTO slave_daily_rules SET ?',
        [dailyRuleData]
      );

      // 查询插入后的完整记录
      const [newRecord] = await db.query(`
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
        WHERE id = ?
      `, [result.insertId]);

      return res.success(newRecord[0], '新增每日规矩成功');
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

  if (type !== 'create' && !date) {
    return res.error('type为wearer、manager时，date参数不能为空', 400);
  }

  // 添加日期格式验证
  if (type === 'wearer' || type === 'manager') {
    // 验证日期格式是否为 yyyy-mm-dd
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.error('日期格式必须为 yyyy-mm-dd', 400);
    }

    // 将输入的日期转换为本地时区的日期（去掉时间部分）
    const requestDate = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);  // 将今天的时间设置为 00:00:00
    
    if (requestDate > today) {
      return res.error('日期不能超过今天', 400);
    }
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
    if (type === 'wearer' || type === 'manager') {
      sql += ` AND wearer_user_id = ? AND DATE(start_date) <= ? AND DATE(update_end_date) >= ?`;
      queryParams.push(userId, date, date);
      sql += ` GROUP BY wearer_user_id`; // 每个穿戴者只返回一条记录
    } else if (type === 'create') {
      sql += ` AND create_user_id = ?`;
      queryParams.push(userId);
    }

    sql += ` ORDER BY created_at DESC`;

    // 执行查询
    const [rows] = await db.query(sql, queryParams);

    // 如果是wearer或manager类型,需要查询当日游戏记录
    if ((type === 'wearer' || type === 'manager') && rows.length > 0) {
      const temalock = rows[0];
      
      // 添加格式化的日期，用于比较
      const formatStartDate = temalock.start_date.split(' ')[0];
      const formatUpdateEndDate = temalock.update_end_date.split(' ')[0];

      // 验证请求日期是否在开始日期之后
      if (date < formatStartDate) {
        return res.error('日期不能早于开始日期', 400);
      }

      // 计算从开始日期到今天的天数差
      const startDate = new Date(formatStartDate);
      const today = new Date();
      const formatToday = today.toISOString().split('T')[0];
      
      const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // 查询已有的游戏记录数
      const [gameRecords] = await db.query(`
        SELECT DATE_FORMAT(game_date, '%Y-%m-%d') as game_date
        FROM slave_daily_game
        WHERE temalock_id = ?
      `, [temalock.id]);
      
      // 如果记录数少于天数差，需要补充数据
      if (gameRecords.length < daysDiff) {
        // 创建一个Set存储已有记录的日期
        const existingDates = new Set(gameRecords.map(record => record.game_date));

        // 生成所有应该有记录的日期
        const missingDates = [];
        for (let i = 0; i < daysDiff; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          // 使用 DATE_FORMAT 格式化日期为 YYYY-MM-DD
          const formattedDate = currentDate.toISOString().split('T')[0];

          // 如果这个日期没有记录，添加到缺失日期数组
          if (!existingDates.has(formattedDate) && currentDate <= today) {
            missingDates.push(formattedDate);
          }
        }
        
        let missingPenaltyMinutes = temalock.game_bet * temalock.min_game_times;
        // 为每个缺失的日期创建记录
        for (const missingDate of missingDates) {
          
          await db.query(`
            INSERT INTO slave_daily_game 
            (temalock_id, game_count, min_game_times, max_game_times, game_bet, penalty_minutes, game_date)
            VALUES (?, 0, ?, ?, ?, ?, ?)
          `, [
            temalock.id,
            temalock.min_game_times,
            temalock.max_game_times,
            temalock.game_bet,
            missingDate == formatToday ? 0 : missingPenaltyMinutes,
            missingDate
          ]);
        }

        // 更新惩罚时间
        if (missingDates.length > 0) {
          // 如果包含当天，则惩罚时间减去当天
          if (missingDates.includes(formatToday)) {
            totalPenaltyMinutes = (missingDates.length - 1) * temalock.min_game_times * temalock.game_bet;
          } else {
            totalPenaltyMinutes = missingDates.length * temalock.min_game_times * temalock.game_bet;
          }
          await db.query(`
            UPDATE slave_temalock 
            SET game_times_penalty = COALESCE(game_times_penalty, 0) + ?,
              update_end_date = DATE_ADD(update_end_date, INTERVAL ? MINUTE)
            WHERE id = ?
          `, [totalPenaltyMinutes, totalPenaltyMinutes, temalock.id]);
        }
      }
    }

    return res.success({
      list: rows,
      total: rows.length
    }, '获取 temalock 事件列表成功');

  } catch (error) {
    console.error('获取 temalock 事件列表失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      console.warn('Duplicate entry detected:', error.sqlMessage);
      return res.error('数据重复，请重试', 400);
    }
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
    share_template,
    description,
    start_date,
    frequency,
    default_end_date,
    share_link_status = 0,
    share_link_url = null,
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
  } = req.body;

  // 参数验证
  if (!wearer_user_name || !wearer_user_id || !create_user_name || !create_user_id || !description ||
    !start_date || !frequency || !default_end_date || !min_game_times || !max_game_times || !game_bet) {
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

// 绑定管理者
router.post('/temalock/bind/manager', asyncHandler(async (req, res) => {
  // const userId = req.auth.userId;
  const { temalock_id, manager_user_id } = req.body;

  // 参数验证
  if (!temalock_id || !manager_user_id) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 验证 temalock 记录是否存在
    const [temalockInfo] = await db.query(`
      SELECT 
        id,
        wearer_user_id,
        manager_user_id,
        end_status
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证事件是否已结束
    if (temalockInfo[0].end_status !== 0) {
      return res.error('该事件已结束，无法绑定管理者', 400);
    }

    // 验证是否已绑定管理者
    if (temalockInfo[0].manager_user_id) {
      return res.error('该事件已绑定管理者', 400);
    }

    // 验证管理者用户是否存在
    const [managerInfo] = await db.query(`
      SELECT id, nickname
      FROM users 
      WHERE id = ?
    `, [manager_user_id]);

    if (managerInfo.length === 0) {
      return res.error('管理者用户不存在', 404);
    }

    // 更新 temalock 记录，绑定管理者
    await db.query(`
      UPDATE slave_temalock 
      SET 
        manager_user_id = ?,
        manager_user_name = ?
      WHERE id = ?
    `, [manager_user_id, managerInfo[0].nickname, temalock_id]);

    return res.success({
      manager_user_id: manager_user_id,
      manager_user_name: managerInfo[0].nickname
    }, '绑定管理者成功');

  } catch (error) {
    console.error('绑定管理者失败:', error);
    return res.error('绑定管理者失败', 500);
  }
}));

// 格式化日期为 YYYY-MM-DD HH:mm:ss
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 获得验证记录（同时补缺失记录）
router.post('/temalock/check/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id } = req.body;

  // 参数验证
  if (!temalock_id) {
    return res.error('temalock_id不能为空', 400);
  }

  try {
    // 查询 temalock 信息
    const [temalockInfo] = await db.query(`
      SELECT 
        id,
        start_date,
        frequency,
        manager_user_id,
        wearer_user_id
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以查看验证记录', 403);
    }

    // 生成验证时间数组
    const startDate = new Date(temalockInfo[0].start_date);
    const frequency = temalockInfo[0].frequency;
    const now = new Date();
    
    // 计算验证时间点
    const checkTimes = [];
    // 第一个时间点是开始时间加上一个周期频率
    let currentTime = new Date(startDate.getTime() + frequency * 60 * 60 * 1000);
    
    while (currentTime <= now) {
      checkTimes.push(new Date(currentTime));
      currentTime = new Date(currentTime.getTime() + frequency * 60 * 60 * 1000);
    }

    // 格式化时间数组，保持原始时区
    const formattedCheckTimes = checkTimes.map(time => formatDateTime(time));
    
    // 查询现有的验证记录
    const [existingRecords] = await db.query(`
      SELECT check_original_time 
      FROM slave_check_records 
      WHERE temalock_id = ?
    `, [temalock_id]);

    // 获取现有的验证时间点，保持原始时区
    const existingTimes = existingRecords.map(record => formatDateTime(new Date(record.check_original_time)));

    // 找出缺失的时间点
    const missingTimes = formattedCheckTimes.filter(time => !existingTimes.includes(time));

    // 如果有缺失的时间点，插入新记录
    if (missingTimes.length > 0) {
      // 使用 INSERT IGNORE 避免重复插入
      const insertValues = missingTimes.map(time => [
        temalock_id,
        null, // check_number
        time, // check_original_time
        'late', // check_result
        null, // check_actual_time
        0, // public_check
        null // check_pic_url
      ]);

      await db.query(`
        INSERT IGNORE INTO slave_check_records 
        (temalock_id, check_number, check_original_time, check_result, check_actual_time, public_check, check_pic_url)
        VALUES ?
      `, [insertValues]);
    }

    // 查询补全后的所有记录
    const [allRecords] = await db.query(`
      SELECT 
        id,
        temalock_id,
        check_number,
        check_pic_url,
        check_actual_time,
        check_original_time,
        check_result,
        public_check,
        created_at,
        updated_at
      FROM slave_check_records 
      WHERE temalock_id = ?
      ORDER BY check_original_time ASC
    `, [temalock_id]);

    // 查询最近的"正常"验证记录
    const [lastValidRecord] = await db.query(`
      SELECT 
        check_original_time,
        check_result
      FROM slave_check_records 
      WHERE temalock_id = ? 
        AND check_actual_time IS NOT NULL
      ORDER BY check_original_time DESC
      LIMIT 1
    `, [temalock_id]);

    // 判断验证状态
    let checkStatus = {
      lastCheckTime: null,
      nextCheckTime: null,
      frequency: frequency,
      description: null
    };

    if (lastValidRecord.length > 0) {
      // 情况 1：存在正常验证记录 lastValidRecord

      // lastCheckTime 为最后一次成功验证的时间
      checkStatus.lastCheckTime = formatDateTime(new Date(lastValidRecord[0].check_original_time));

      // 查询最新的验证记录
      const [latestRecord] = await db.query(`
        SELECT 
          check_original_time,
          check_actual_time
        FROM slave_check_records 
        WHERE temalock_id = ?
        ORDER BY check_original_time DESC
        LIMIT 1
      `, [temalock_id]);
      
      if (latestRecord[0].check_actual_time) {
        // 情况 1.1：最新验证已完成
        const nextTime = new Date(latestRecord[0].check_original_time);
        nextTime.setHours(nextTime.getHours() + frequency);
        checkStatus.nextCheckTime = formatDateTime(nextTime);
        checkStatus.title = '下次验证';
        checkStatus.state = 'next';
        checkStatus.description = '最新验证已完成，nextCheckTime为下次验证时间';
      } else {
        // 情况 1.2：最新验证未完成
        checkStatus.nextCheckTime = formatDateTime(new Date(latestRecord[0].check_original_time));
        checkStatus.title = '待验证';
        checkStatus.state = 'late';
        checkStatus.description = '最新验证未完成，nextCheckTime为本次验证时间';
      }
    } else {
      // 情况 2：没有正常验证记录
      if (formattedCheckTimes.length > 0) {
        // 情况 2.1：存在需要验证的数据
        checkStatus.lastCheckTime = formattedCheckTimes[0];
        checkStatus.nextCheckTime = formattedCheckTimes[formattedCheckTimes.length - 1];
        checkStatus.title = '从未验证';
        checkStatus.state = 'lateNever';
        checkStatus.description = '不存在正常验证记录，lastCheckTime为首个原定验证时间，nextCheckTime为最新原定验证时间';
      } else {
        // 情况 2.2：不存在需要验证的数据（可能时间太短）
        checkStatus.lastCheckTime = null;
        checkStatus.nextCheckTime = formatDateTime(new Date(startDate.getTime() + frequency * 60 * 60 * 1000));
        checkStatus.title = '首次验证';
        checkStatus.state = 'first';
        checkStatus.description = '不存在验证记录，可能验证任务还未开始，nextCheckTime为首次验证时间';
      }
    }

    return res.success({
      check_times: formattedCheckTimes,
      check_status: checkStatus,
      records: allRecords
    }, '获取验证记录成功');

  } catch (error) {
    console.error('获取验证记录失败:', error);
    return res.error('获取验证记录失败', 500);
  }
}));

// 新增更新验证记录
router.post('/temalock/check/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id, check_original_time, check_result, check_actual_time, public_check, check_pic_url, check_number } = req.body;

  // 参数验证
  if (!temalock_id || !check_original_time || !check_result || !check_actual_time || !public_check || !check_pic_url || !check_number) {
    return res.error('缺少必要参数', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限
    const [temalockInfo] = await db.query(`
      SELECT id, manager_user_id, wearer_user_id
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为穿戴者
    if (temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有穿戴者可以更新验证记录', 403);
    }

    // 查询验证记录是否存在
    const [existingRecord] = await db.query(`
      SELECT id
      FROM slave_check_records 
      WHERE temalock_id = ? AND check_original_time = ?
    `, [temalock_id, check_original_time]);

    let result;
    if (existingRecord.length > 0) {
      // 更新现有记录
      [result] = await db.query(`
        UPDATE slave_check_records 
        SET check_number = ?,
            check_result = ?,
            check_actual_time = ?,
            public_check = ?,
            check_pic_url = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [check_number, check_result, check_actual_time, public_check, check_pic_url, existingRecord[0].id]);
    } else {
      // 插入新记录
      [result] = await db.query(`
        INSERT INTO slave_check_records 
        (temalock_id, check_original_time, check_number, check_result, check_actual_time, public_check, check_pic_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [temalock_id, check_original_time, check_number, check_result, check_actual_time, public_check, check_pic_url]);
    }

    // 查询更新后的记录
    const [updatedRecord] = await db.query(`
      SELECT 
        id,
        temalock_id,
        check_number,
        check_pic_url,
        check_actual_time,
        check_original_time,
        check_result,
        public_check,
        created_at,
        updated_at
      FROM slave_check_records 
      WHERE id = ?
    `, [existingRecord.length > 0 ? existingRecord[0].id : result.insertId]);

    return res.success(updatedRecord[0], existingRecord.length > 0 ? '更新验证记录成功' : '新增验证记录成功');

  } catch (error) {
    console.error('更新验证记录失败:', error);
    return res.error('更新验证记录失败', 500);
  }
}));





// ? --------------------- 调教记录表相关 ---------------------

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
    minute,
    reward_punishment
  } = req.body;

  // 参数验证
  if (!temalock_id || !title || !occur_time || !reason || !minute || !reward_punishment) {
    return res.error('缺少必要参数', 400);
  }

  // 验证 reward_punishment 的值
  if (!['REWARD', 'PUNISHMENT'].includes(reward_punishment)) {
    return res.error('reward_punishment 必须是 REWARD 或 PUNISHMENT', 400);
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
      minute,
      reward_punishment
    };

    // 插入记录
    const [result] = await db.query(
      'INSERT INTO slave_action_records SET ?',
      [recordData]
    );

    // 根据 reward_punishment 决定是增加还是减少时间
    const timeAdjustment = reward_punishment === 'REWARD' ? -minute : minute;

    // 更新 training_penalty 字段
    await db.query(`
      UPDATE slave_temalock 
      SET training_penalty = COALESCE(training_penalty, 0) + ?
      WHERE id = ?
    `, [timeAdjustment, temalock_id]);

    // 更新 update_end_date 字段
    await db.query(`
      UPDATE slave_temalock 
      SET update_end_date = DATE_ADD(update_end_date, INTERVAL ? MINUTE)
      WHERE id = ?
    `, [timeAdjustment, temalock_id]);

    return res.success({
      id: result.insertId
    }, '添加调教记录成功');

  } catch (error) {
    console.error('添加调教记录失败:', error);
    return res.error('添加调教记录失败', 500);
  }
}));




// ? --------------------- 高潮事件表相关 ---------------------

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
    const [temalockInfo] = await db.query(`      SELECT id, manager_user_id, wearer_user_id, end_status 
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



// ? --------------------- 每日游戏记录表相关 ---------------------

// 增加每日游戏记录
router.post('/temalock/game/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { temalock_id, game_date } = req.body;

  // 参数验证
  if (!temalock_id) {
    return res.error('temalock_id不能为空', 400);
  }

  try {
    // 验证 temalock 记录是否存在，并检查权限
    const [temalockInfo] = await db.query(`
      SELECT 
        id, 
        manager_user_id, 
        wearer_user_id, 
        end_status,
        min_game_times,
        max_game_times,
        game_bet
      FROM slave_temalock 
      WHERE id = ?
    `, [temalock_id]);

    if (temalockInfo.length === 0) {
      return res.error('temalock 记录不存在', 404);
    }

    // 验证是否为管理者或穿戴者
    if (temalockInfo[0].manager_user_id !== userId && temalockInfo[0].wearer_user_id !== userId) {
      return res.error('只有管理者或穿戴者可以更新游戏记录', 403);
    }

    // 验证事件是否已结束
    if (temalockInfo[0].end_status !== 0) {
      return res.error('该事件已结束，无法更新游戏记录', 400);
    }

    // 使用传入的game_date或默认使用今天的日期
    const gameDate = game_date || new Date().toISOString().slice(0, 10);

    // 查询指定日期的游戏记录
    const [existingRecord] = await db.query(`
      SELECT id, game_count
      FROM slave_daily_game
      WHERE temalock_id = ? AND game_date = ?
    `, [temalock_id, gameDate]);

    let game_count = 1; // 默认值为 1
    let penalty_minutes = 0;

    if (existingRecord.length > 0) {
      // 如果记录存在，检查是否超过最大游戏次数
      if (existingRecord[0].game_count >= temalockInfo[0].max_game_times) {
        return res.error('已达到该日最大游戏次数限制', 400);
      }
      game_count = existingRecord[0].game_count + 1;

      // 计算惩罚时间
      if (game_count < temalockInfo[0].min_game_times) {
        const remaining_games = temalockInfo[0].min_game_times - game_count;
        penalty_minutes = remaining_games * temalockInfo[0].game_bet;
      }

      // 更新现有记录
      await db.query(`
        UPDATE slave_daily_game 
        SET game_count = ?,
            penalty_minutes = ?,
            min_game_times = ?,
            max_game_times = ?,
            game_bet = ?
        WHERE id = ?`, 
      [
        game_count,
        penalty_minutes,
        temalockInfo[0].min_game_times,
        temalockInfo[0].max_game_times,
        temalockInfo[0].game_bet,
        existingRecord[0].id
      ]);
    } else {
      // 计算惩罚时间
      if (game_count < temalockInfo[0].min_game_times) {
        const remaining_games = temalockInfo[0].min_game_times - game_count;
        penalty_minutes = remaining_games * temalockInfo[0].game_bet;
      }

      // 插入新记录
      await db.query(`
        INSERT INTO slave_daily_game 
        (temalock_id, game_count, min_game_times, max_game_times, game_bet, penalty_minutes, game_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        temalock_id,
        game_count,
        temalockInfo[0].min_game_times,
        temalockInfo[0].max_game_times,
        temalockInfo[0].game_bet,
        penalty_minutes,
        gameDate
      ]);
    }

    return res.success({
      game_count,
      penalty_minutes,
      min_game_times: temalockInfo[0].min_game_times,
      max_game_times: temalockInfo[0].max_game_times
    }, '更新游戏记录成功');

  } catch (error) {
    console.error('更新游戏记录失败:', error);
    return res.error('更新游戏记录失败', 500);
  }
}));

module.exports = router;
