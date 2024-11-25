const express = require('express');
const { HL_API_URL, HL_API_KEY } = require('../config/config');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');
const axios = require('axios');  // 添加这行

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


module.exports = router;
