const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');
const { HL_API_URL, HL_API_KEY } = require('../config/config');

router.get('/getAlmanac', asyncHandler(async (req, res) => {
  const { date } = req.query; // 查询参数中传递日期

  if (!date) {
    return res.error('请提供日期参数', 400);
  }

  const [rows] = await db.query(
    'SELECT * FROM almanac WHERE gregoriandate = ?',
    [date]
  );

  if (rows.length === 0) {
    console.log(`日期 ${date} 无数据，尝试实时获取黄历数据...`);

    try {
      const response = await axios.get(HL_API_URL, { params: { key: HL_API_KEY, date: date } });
      if (response.data.code !== 200) {
        return res.error('获取黄历数据失败，请稍后重试', 500);
      }

      const data = response.data.result;
      // console.log('外部 API 返回的黄历数据:', response.data.result);
      const insertData = {
        gregoriandate: data.gregoriandate,
        lunardate: data.lunardate,
        lunar_festival: data.lunar_festival || null,
        festival: data.festival || null,
        fitness: data.fitness || null,
        taboo: data.taboo || null,
        shenwei: data.shenwei || null,
        taishen: data.taishen || null,
        chongsha: data.chongsha || null,
        suisha: data.suisha || null,
        wuxingjiazi: data.wuxingjiazi || null,
        wuxingnayear: data.wuxingnayear || null,
        wuxingnamonth: data.wuxingnamonth || null,
        xingsu: data.xingsu || null,
        pengzu: data.pengzu || null,
        jianshen: data.jianshen || null,
        tiangandizhiyear: data.tiangandizhiyear || null,
        tiangandizhimonth: data.tiangandizhimonth || null,
        tiangandizhiday: data.tiangandizhiday || null,
        lmonthname: data.lmonthname || null,
        shengxiao: data.shengxiao || null,
        lubarmonth: data.lubarmonth || null,
        lunarday: data.lunarday || null,
        jieqi: data.jieqi || null,
      };
      // console.log('即将插入的黄历数据:', insertData);

      await db.query(
        `
        INSERT INTO almanac (
          gregoriandate, lunardate, lunar_festival, festival, fitness, taboo,
          shenwei, taishen, chongsha, suisha, wuxingjiazi, wuxingnayear, wuxingnamonth,
          xingsu, pengzu, jianshen, tiangandizhiyear, tiangandizhimonth, tiangandizhiday,
          lmonthname, shengxiao, lubarmonth, lunarday, jieqi
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          lunardate = VALUES(lunardate),
          lunar_festival = VALUES(lunar_festival),
          festival = VALUES(festival),
          fitness = VALUES(fitness),
          taboo = VALUES(taboo),
          shenwei = VALUES(shenwei),
          taishen = VALUES(taishen),
          chongsha = VALUES(chongsha),
          suisha = VALUES(suisha),
          wuxingjiazi = VALUES(wuxingjiazi),
          wuxingnayear = VALUES(wuxingnayear),
          wuxingnamonth = VALUES(wuxingnamonth),
          xingsu = VALUES(xingsu),
          pengzu = VALUES(pengzu),
          jianshen = VALUES(jianshen),
          tiangandizhiyear = VALUES(tiangandizhiyear),
          tiangandizhimonth = VALUES(tiangandizhimonth),
          tiangandizhiday = VALUES(tiangandizhiday),
          lmonthname = VALUES(lmonthname),
          shengxiao = VALUES(shengxiao),
          lubarmonth = VALUES(lubarmonth),
          lunarday = VALUES(lunarday),
          jieqi = VALUES(jieqi)
        `,
        Object.values(insertData)
      );

      console.log('实时获取并存储黄历数据成功');
      return res.success(insertData, '实时获取并存储黄历数据成功');
    } catch (error) {
      console.error('实时获取黄历数据失败:', error);
      return res.error('实时获取黄历数据失败，请稍后重试', 500);
    }
  }

  return res.success(rows[0], '获取成功');
}));


// 获取待办事项列表
router.get('/todo/list', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const date = req.query.date;
  const userId = req.auth.userId;
  const offset = (page - 1) * limit;

  // 获取当前时间
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 8); // 格式: HH:MM:SS

  try {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // 1. 首先更新过期任务的状态
      if (date) {
        await connection.query(
          `UPDATE todo 
            SET done = 1 
            WHERE user_id = ? 
            AND date = ? 
            AND time < ? 
            AND done = 0`,
          [userId, date, currentTime]
        );
      }

      // 2. 构建查询条件
      let whereClause = 'WHERE user_id = ?';
      let queryParams = [userId];

      if (date) {
        whereClause += ' AND date = ?';
        queryParams.push(date);
      }

      // 3. 获取总记录数
      const [total] = await connection.query(
        `SELECT COUNT(*) as total FROM todo ${whereClause}`,
        queryParams
      );

      // 4. 获取分页数据，按完成状态和时间排序
      const [rows] = await connection.query(
        `SELECT * FROM todo 
          ${whereClause}
          ORDER BY 
            done ASC,                    -- 未完成的排在前面
            CASE 
              WHEN done = 0 THEN time    -- 未完成的按时间正序
              ELSE created_at            -- 已完成的按创建时间倒序
            END ASC,
            created_at DESC
          LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
      );

      await connection.commit();

      return res.success({
        list: rows,
        pagination: {
          current: page,
          pageSize: limit,
          total: total[0].total
        }
      }, '获取待办事项列表成功');

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('获取待办事项列表失败:', error);
    return res.error('获取待办事项列表失败，请稍后重试', 500);
  }
}));


// 添加待办事项
router.post('/todo/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId; // 从全局中间件获取用户 ID
  const { title, date, time, alert, description, category, priority } = req.body;

  // 参数验证
  if (!title || !date || !time || alert === undefined) {
    return res.error('请提供完整的参数：title, date, time, alert', 400);
  }

  // 数据插入
  const [result] = await db.query(
    `
      INSERT INTO todo (
        user_id, title, date, time, alert, description, category, 
        priority, done, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
      `,
    [
      userId,
      title,
      date,
      time,
      alert,
      description || null, // 未传递时插入 NULL
      category || null,    // 未传递时插入 NULL
      priority || 1,       // 未传递时插入默认值 1
    ]
  );

  if (result.affectedRows === 1) {
    return res.success({ id: result.insertId }, '待办事项添加成功');
  } else {
    return res.error('待办事项添加失败，请稍后重试', 500);
  }
})
);

// 修改待办事项
router.post('/todo/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const { todoId, title, date, time, alert, description, priority, category, done } = req.body;

  // 检查必填字段 todoId 是否存在
  if (!todoId) {
    return res.error('缺少待办事项 ID', 400);
  }

  try {
    // 查询待办事项是否存在
    const [todo] = await db.query('SELECT * FROM todo WHERE id = ? AND user_id = ?', [todoId, userId]);

    if (todo.length === 0) {
      return res.error('待办事项不存在', 404);
    }

    // 构建更新数据
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (date !== undefined) updateData.date = date;
    if (time !== undefined) updateData.time = time;
    if (alert !== undefined) updateData.alert = alert;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (done !== undefined) updateData.done = done;  // 更新done字段

    // 执行更新操作
    await db.query('UPDATE todo SET ? WHERE id = ? AND user_id = ?', [updateData, todoId, userId]);

    return res.success(null, '待办事项更新成功');
  } catch (error) {
    console.error('更新待办事项失败:', error);
    return res.error('更新待办事项失败，请稍后重试', 500);
  }
}));


// 删除待办事项
router.delete('/todo/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const todoId = req.query.todoId;  // 从查询参数中获取待办事项的 ID

  if (!todoId) {
    return res.error('缺少待办事项 ID', 400);
  }

  try {
    // 检查待办事项是否存在
    const [todo] = await db.query('SELECT * FROM todo WHERE id = ? AND user_id = ?', [todoId, userId]);

    if (todo.length === 0) {
      return res.error('待办事项不存在', 404);
    }

    // 执行删除操作
    await db.query('DELETE FROM todo WHERE id = ? AND user_id = ?', [todoId, userId]);

    return res.success(null, '待办事项删除成功');
  } catch (error) {
    console.error('删除待办事项失败:', error);
    return res.error('删除待办事项失败，请稍后重试', 500);
  }
}));


// 获取备忘录列表
router.get('/memos/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 99;
  const offset = (page - 1) * limit;
  console.log(userId, page, limit, offset);

  const [rows] = await db.query(
    `SELECT 
      id,
      title,
      content,
      DATE_FORMAT(date, '%Y-%m-%d') as date,
      time,
      user_id,
      is_important
    FROM memos 
    WHERE user_id = ? 
    ORDER BY 
      is_important DESC,
      date DESC,
      time DESC
    LIMIT ?, ?`,
    [userId, offset, limit]
  );

  if (rows.length === 0) {
    return res.success([], '没有找到备忘录');
  }

  return res.success(rows, '获取备忘录列表成功');
}));

// 添加备忘录
router.post('/memos/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const { title, content, date, time, is_important = 0 } = req.body;  // 备忘录内容（is_important 默认为 0）

  if (!title || !content || !date || !time) {
    return res.error('标题、内容、日期和时间是必填项', 400);
  }

  const [result] = await db.query(
    'INSERT INTO memos (title, content, date, time, user_id, is_important) VALUES (?, ?, ?, ?, ?, ?)',
    [title, content, date, time, userId, is_important]
  );

  return res.success({ id: result.insertId }, '备忘录添加成功');
}));


// 修改备忘录
router.post('/memos/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { memoId, title, content, date, time, is_important } = req.body;

  if (!memoId) {
    return res.error('备忘录 ID 是必填项', 400);
  }

  const [memo] = await db.query(
    'SELECT * FROM memos WHERE id = ? AND user_id = ?',
    [memoId, userId]
  );

  if (memo.length === 0) {
    return res.error('备忘录未找到或您没有权限修改', 404);
  }

  // 构建更新的 SQL 语句，只有传递的字段才会被更新
  const updateFields = [];
  const updateValues = [];

  if (title) {
    updateFields.push('title = ?');
    updateValues.push(title);
  }

  if (content) {
    updateFields.push('content = ?');
    updateValues.push(content);
  }

  if (date) {
    updateFields.push('date = ?');
    updateValues.push(date);
  }

  if (time) {
    updateFields.push('time = ?');
    updateValues.push(time);
  }

  if (is_important !== undefined) {
    updateFields.push('is_important = ?');
    updateValues.push(is_important);
  }

  if (updateFields.length === 0) {
    return res.error('没有需要更新的字段', 400);
  }

  // 添加 userId 到更新值数组
  updateValues.push(memoId, userId);

  await db.query(
    `UPDATE memos SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`,
    updateValues
  );

  return res.success({}, '备忘录更新成功');
}));

// 删除备忘录
router.delete('/memos/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const memoId = req.query.memoId;  // 从 query 中获取备忘录 ID

  if (!memoId) {
    return res.error('备忘录 ID 是必填项', 400);
  }

  // 检查备忘录是否存在且属于当前用户
  const [memo] = await db.query(
    'SELECT * FROM memos WHERE id = ? AND user_id = ?',
    [memoId, userId]
  );

  if (memo.length === 0) {
    return res.error('备忘录未找到或您没有权限删除', 404);
  }

  await db.query('DELETE FROM memos WHERE id = ?', [memoId]);

  return res.success({}, '备忘录删除成功');
}));

// 处理日期累加的辅助函数
function addToDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

// 获取倒数日列表
router.get('/countdown/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const today = new Date().toISOString().slice(0, 10);

  const [rows] = await db.query(
    `SELECT 
      id,
      title,
      DATE_FORMAT(gregorian_date, '%Y-%m-%d') as gregorian_date,
      lunar_date,
      is_pinned,
      reminder_frequency,
      is_repeating,
      repeat_frequency,
      repeat_count,
      user_id,
      is_reminder,
      calendar_type
    FROM countdown 
    WHERE user_id = ? 
    ORDER BY is_pinned DESC, gregorian_date ASC`,
    [userId]
  );

  for (let item of rows) {
    if (item.is_repeating && item.repeat_frequency) {
      let eventDate = item.gregorian_date;
      let repeatCount = item.repeat_count || 0;

      while (eventDate < today) {
        let tempDate = new Date(eventDate);
        tempDate = addToDate(tempDate, item.repeat_frequency);
        eventDate = tempDate.toISOString().slice(0, 10);
        repeatCount++;
      }
      
      if (eventDate !== item.gregorian_date) {
        await db.query(
          'UPDATE countdown SET gregorian_date = ?, repeat_count = ? WHERE id = ?',
          [eventDate, repeatCount, item.id]
        );
        item.gregorian_date = eventDate;
        item.repeat_count = repeatCount;
      }
    }
  }

  return res.success(rows, '获取倒数日列表成功');
}));

// 添加倒数日
router.post('/countdown/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    title, gregorian_date, lunar_date, is_pinned, 
    reminder_frequency, is_repeating, repeat_frequency, is_reminder,
    calendar_type
  } = req.body;

  if (!title || !gregorian_date || !calendar_type) {
    return res.error('标题、日期和日历类型为必填项', 400);
  }

  // 开始事务
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 如果要置顶，先将其他项目取消置顶
    if (is_pinned) {
      await connection.query(
        'UPDATE countdown SET is_pinned = false WHERE user_id = ?',
        [userId]
      );
    }

    let finalDate = gregorian_date;
    let repeatCount = 0;
    
    if (is_repeating && repeat_frequency) {
      const today = new Date().toISOString().slice(0, 10);
      let eventDate = gregorian_date;
      
      while (eventDate < today) {
        let tempDate = new Date(eventDate);
        tempDate = addToDate(tempDate, repeat_frequency);
        eventDate = tempDate.toISOString().slice(0, 10);
        repeatCount++;
      }
      finalDate = eventDate;
    }

    const [result] = await connection.query(
      `INSERT INTO countdown (
        title, gregorian_date, lunar_date, is_pinned, reminder_frequency,
        is_repeating, repeat_frequency, user_id, is_reminder, repeat_count, calendar_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, finalDate, lunar_date, is_pinned, reminder_frequency,
       is_repeating, repeat_frequency, userId, is_reminder, repeatCount, calendar_type]
    );

    // 查询插入的数据并返回
    const [insertedData] = await connection.query(
      `SELECT 
        id,
        title,
        DATE_FORMAT(gregorian_date, '%Y-%m-%d') as gregorian_date,
        lunar_date,
        is_pinned,
        reminder_frequency,
        is_repeating,
        repeat_frequency,
        repeat_count,
        user_id,
        is_reminder,
        calendar_type
      FROM countdown 
      WHERE id = ?`,
      [result.insertId]
    );

    await connection.commit();
    return res.success(insertedData[0], '倒数日添加成功');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// 修改倒数日
router.post('/countdown/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const {
    id, title, gregorian_date, lunar_date, is_pinned,
    reminder_frequency, is_repeating, repeat_frequency, is_reminder,
    calendar_type
  } = req.body;

  if (!id) {
    return res.error('倒数日ID为必填项', 400);
  }

  // 开始事务
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 检查是否存在且属于当前用户，同时获取当前的 repeat_count
    const [countdown] = await connection.query(
      `SELECT 
        DATE_FORMAT(gregorian_date, '%Y-%m-%d') as gregorian_date,
        repeat_count
      FROM countdown 
      WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (countdown.length === 0) {
      await connection.rollback();
      return res.error('倒数日不存在或无权限修改', 404);
    }

    // 如果要设置置顶，先将其他项目取消置顶
    if (is_pinned) {
      await connection.query(
        'UPDATE countdown SET is_pinned = false WHERE user_id = ?',
        [userId]
      );
    }

    let finalDate = gregorian_date;
    let repeatCount = countdown[0].repeat_count || 0;

    if (is_repeating && repeat_frequency && gregorian_date) {
      const today = new Date().toISOString().slice(0, 10);
      let eventDate = gregorian_date;
      
      while (eventDate < today) {
        let tempDate = new Date(eventDate);
        tempDate = addToDate(tempDate, repeat_frequency);
        eventDate = tempDate.toISOString().slice(0, 10);
        repeatCount++;
      }
      finalDate = eventDate;
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (finalDate !== undefined) updateData.gregorian_date = finalDate;
    if (lunar_date !== undefined) updateData.lunar_date = lunar_date;
    if (is_pinned !== undefined) updateData.is_pinned = is_pinned;
    if (reminder_frequency !== undefined) updateData.reminder_frequency = reminder_frequency;
    if (is_repeating !== undefined) updateData.is_repeating = is_repeating;
    if (repeat_frequency !== undefined) updateData.repeat_frequency = repeat_frequency;
    if (is_reminder !== undefined) updateData.is_reminder = is_reminder;
    if (calendar_type !== undefined) updateData.calendar_type = calendar_type;
    updateData.repeat_count = repeatCount;

    await connection.query(
      'UPDATE countdown SET ? WHERE id = ? AND user_id = ?',
      [updateData, id, userId]
    );

    // 查询更新后的数据并返回
    const [updatedData] = await connection.query(
      `SELECT 
        id,
        title,
        DATE_FORMAT(gregorian_date, '%Y-%m-%d') as gregorian_date,
        lunar_date,
        is_pinned,
        reminder_frequency,
        is_repeating,
        repeat_frequency,
        repeat_count,
        user_id,
        is_reminder,
        calendar_type
      FROM countdown 
      WHERE id = ?`,
      [id]
    );

    await connection.commit();
    return res.success(updatedData[0], '倒数日更新成功');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// 删除倒数日
router.delete('/countdown/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const countdownId = req.query.countdownId;

  if (!countdownId) {
    return res.error('倒数日ID为必填项', 400);
  }

  const [countdown] = await db.query(
    `SELECT 
      DATE_FORMAT(gregorian_date, '%Y-%m-%d') as gregorian_date 
    FROM countdown 
    WHERE id = ? AND user_id = ?`,
    [countdownId, userId]
  );

  if (countdown.length === 0) {
    return res.error('倒数日不存在或无权限删除', 404);
  }

  await db.query(
    'DELETE FROM countdown WHERE id = ? AND user_id = ?',
    [countdownId, userId]
  );

  return res.success(null, '倒数日删除成功');
}));

module.exports = router;
