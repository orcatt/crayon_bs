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
  queryParams.push(limitNum, offset);

  // 组合完整查询
  const finalQuery = baseQuery + whereClause + groupBy + orderBy + limitClause;

  // 执行主查询
  const [rows] = await db.query(finalQuery, queryParams);

  // 获取总记录数
  const [total] = await db.query(
    `SELECT COUNT(DISTINCT f.id) as total 
    FROM foods_info f 
    LEFT JOIN food_aliases fa ON f.id = fa.food_id 
    ${whereClause}`,
    queryParams.slice(0, -2)
  );

  // 获取每个食物的营养信息和度量单位信息
  for (let food of rows) {
    // 获取营养信息
    const [nutritionData] = await db.query(
      `SELECT 
        nutrient_type,
        nutrient_name,
        amount_per_100g
      FROM food_nutrition 
      WHERE food_id = ?`,
      [food.id]
    );
    food.nutrition = nutritionData;

    // 获取度量单位信息
    const [measurementData] = await db.query(
      `SELECT 
        unit_name,
        weight,
        calories
      FROM food_measurement 
      WHERE food_id = ?`,
      [food.id]
    );
    food.measurement = measurementData;
  }

  return res.success({
    list: rows,
    pagination: {
      current: pageNum,
      pageSize: limitNum,
      total: total[0].total
    }
  }, '获取食物列表成功');
}));


// ? ----------------------------- 摄入信息 ----------------------------- 


// 获取摄入列表
router.post('/userIntake/list', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.body;
  const userId = req.auth.userId;

  let whereClause = `WHERE user_id = ?`;
  const queryParams = [userId];

  if (start_date) {
    whereClause += ` AND date >= ?`;
    queryParams.push(start_date);
  }
  if (end_date) {
    whereClause += ` AND date <= ?`;
    queryParams.push(end_date);
  }

  const query = `
    SELECT 
      id,
      user_id,
      DATE_FORMAT(date, '%Y-%m-%d') as date,
      calories,
      breakfast_calories,
      lunch_calories,
      dinner_calories,
      snack_calories,
      carbohydrate,
      fat,
      protein,
      cellulose,
      DATE_FORMAT(created_at, '%Y-%m-%d') as created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at
    FROM user_intake 
    ${whereClause} 
    ORDER BY date DESC
  `;
  
  const [rows] = await db.query(query, queryParams);
  return res.success(rows);
}));


// 获取某天摄入
router.post('/userIntake/daily', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { date } = req.body;

  // 检查当天是否已有数据
  const query = `
    SELECT 
      id,
      user_id,
      DATE_FORMAT(date, '%Y-%m-%d') as date,
      calories,
      breakfast_calories,
      lunch_calories,
      dinner_calories,
      snack_calories,
      carbohydrate,
      fat,
      protein,
      cellulose,
      DATE_FORMAT(created_at, '%Y-%m-%d') as created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at
    FROM user_intake 
    WHERE user_id = ? AND date = ?
  `;
  
  const [existingData] = await db.query(query, [userId, date]);

  if (existingData.length > 0) {
    return res.success(existingData[0]);
  } else {
    // 如果没有数据，创建一条新的
    const insertQuery = `INSERT INTO user_intake (user_id, date) VALUES (?, ?)`;
    const [result] = await db.query(insertQuery, [userId, date]);

    // 查询并返回新创建的记录
    const [newRecord] = await db.query(
      `SELECT 
        id,
        user_id,
        DATE_FORMAT(date, '%Y-%m-%d') as date,
        calories,
        breakfast_calories,
        lunch_calories,
        dinner_calories,
        snack_calories,
        carbohydrate,
        fat,
        protein,
        cellulose,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at
      FROM user_intake 
      WHERE id = ?`,
      [result.insertId]
    );

    return res.success(newRecord[0]);
  }
}));


// 摄入食物列表
router.post('/userIntakeFoods/list', asyncHandler(async (req, res) => {
  const { user_intake_id } = req.body;
  const query = `SELECT * FROM user_intake_foods WHERE user_intake_id = ?`;
  const [rows] = await db.query(query, [user_intake_id]);

  return res.success(rows);
}));


// 添加摄入食物
router.post('/userIntakeFoods/add', asyncHandler(async (req, res) => {
  const { user_intake_id, food_id, food_name, food_category, foods_weight, eating_type, calories, carbohydrate, fat, protein, cellulose } = req.body;
  const userId = req.auth.userId;

  // 插入摄入食物记录
  const insertQuery = `INSERT INTO user_intake_foods (user_intake_id, food_id, food_name, food_category, foods_weight, eating_type, calories, carbohydrate, fat, protein, cellulose, created_at, updated_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
  const [result] = await db.query(insertQuery, [user_intake_id, food_id, food_name, food_category, foods_weight, eating_type, calories, carbohydrate, fat, protein, cellulose]);

  // 更新主表数据
  const updateQuery = `
    UPDATE user_intake
    SET calories = calories + ?, 
        carbohydrate = carbohydrate + ?, 
        fat = fat + ?, 
        protein = protein + ?, 
        cellulose = cellulose + ?, 
        updated_at = NOW()
    WHERE id = ?
  `;
  await db.query(updateQuery, [calories, carbohydrate, fat, protein, cellulose, user_intake_id]);

  return res.success({ message: '食物摄入新增成功' });
}));


// 删除摄入食物
router.post('/userIntakeFoods/delete', asyncHandler(async (req, res) => {
  const { id, user_intake_id } = req.body;

  // 1. 获取该条摄入食物记录的详细信息
  const [foodRecords] = await db.query(
    'SELECT * FROM user_intake_foods WHERE id = ?',
    [id]
  );

  if (foodRecords.length === 0) {
    return res.error('食物记录未找到', 404);
  }

  const foodRecord = foodRecords[0];

  // 2. 更新主表的总量
  let updateQuery = `
    UPDATE user_intake 
    SET 
      calories = calories - ?,
      carbohydrate = carbohydrate - ?,
      fat = fat - ?,
      protein = protein - ?,
      cellulose = cellulose - ?
  `;

  // 根据 eating_type 添加对应的更新字段
  switch (foodRecord.eating_type) {
    case 1:
      updateQuery += ', breakfast_calories = breakfast_calories - ?';
      break;
    case 2:
      updateQuery += ', lunch_calories = lunch_calories - ?';
      break;
    case 3:
      updateQuery += ', dinner_calories = dinner_calories - ?';
      break;
    case 4:
      updateQuery += ', snack_calories = snack_calories - ?';
      break;
  }

  updateQuery += ' WHERE id = ?';

  // 准备更新参数
  const updateParams = [
    foodRecord.calories,
    foodRecord.carbohydrate,
    foodRecord.fat,
    foodRecord.protein,
    foodRecord.cellulose
  ];

  // 如果有餐类更新，添加卡路里参数
  if (foodRecord.eating_type >= 1 && foodRecord.eating_type <= 4) {
    updateParams.push(foodRecord.calories);
  }

  // 添加 user_intake_id
  updateParams.push(user_intake_id);

  // 执行更新
  await db.query(updateQuery, updateParams);

  // 3. 删除食物摄入记录
  await db.query('DELETE FROM user_intake_foods WHERE id = ?', [id]);

  return res.success({ message: '删除成功' });
}));


// 修改摄入食物
router.post('/userIntakeFoods/update', asyncHandler(async (req, res) => {
  const { id, user_intake_id, food_id, food_name, food_category, foods_weight, eating_type, calories, carbohydrate, fat, protein, cellulose } = req.body;

  // 1. 获取旧的食物摄入记录
  const [oldRecords] = await db.query(
    'SELECT * FROM user_intake_foods WHERE id = ?',
    [id]
  );

  if (oldRecords.length === 0) {
    return res.error('食物记录未找到', 404);
  }

  const oldRecord = oldRecords[0];

  // 2. 计算修改前后的差异
  const caloriesDiff = calories - oldRecord.calories;
  const carbohydrateDiff = carbohydrate - oldRecord.carbohydrate;
  const fatDiff = fat - oldRecord.fat;
  const proteinDiff = protein - oldRecord.protein;
  const celluloseDiff = cellulose - oldRecord.cellulose;

  // 3. 更新 user_intake_foods 表中的记录
  const updateFoodQuery = `
    UPDATE user_intake_foods 
    SET 
      food_id = ?,
      food_name = ?,
      food_category = ?,
      foods_weight = ?,
      eating_type = ?,
      calories = ?,
      carbohydrate = ?,
      fat = ?,
      protein = ?,
      cellulose = ?,
      updated_at = NOW()
    WHERE id = ?
  `;

  await db.query(updateFoodQuery, [
    food_id,
    food_name,
    food_category,
    foods_weight,
    eating_type,
    calories,
    carbohydrate,
    fat,
    protein,
    cellulose,
    id
  ]);

  // 4. 更新主表的总量
  let updateIntakeQuery = `
    UPDATE user_intake 
    SET 
      calories = calories + ?,
      carbohydrate = carbohydrate + ?,
      fat = fat + ?,
      protein = protein + ?,
      cellulose = cellulose + ?
  `;

  const updateParams = [
    caloriesDiff,
    carbohydrateDiff,
    fatDiff,
    proteinDiff,
    celluloseDiff
  ];

  // 处理不同餐类的卡路里更新
  if (oldRecord.eating_type === eating_type) {
    // 如果餐类没变，只需要更新对应餐类的卡路里差值
    switch (eating_type) {
      case 1:
        updateIntakeQuery += ', breakfast_calories = breakfast_calories + ?';
        updateParams.push(caloriesDiff);
        break;
      case 2:
        updateIntakeQuery += ', lunch_calories = lunch_calories + ?';
        updateParams.push(caloriesDiff);
        break;
      case 3:
        updateIntakeQuery += ', dinner_calories = dinner_calories + ?';
        updateParams.push(caloriesDiff);
        break;
      case 4:
        updateIntakeQuery += ', snack_calories = snack_calories + ?';
        updateParams.push(caloriesDiff);
        break;
    }
  } else {
    // 如果餐类改变，需要减去旧餐类的卡路里，加上新餐类的卡路里
    switch (oldRecord.eating_type) {
      case 1:
        updateIntakeQuery += ', breakfast_calories = breakfast_calories - ?';
        updateParams.push(oldRecord.calories);
        break;
      case 2:
        updateIntakeQuery += ', lunch_calories = lunch_calories - ?';
        updateParams.push(oldRecord.calories);
        break;
      case 3:
        updateIntakeQuery += ', dinner_calories = dinner_calories - ?';
        updateParams.push(oldRecord.calories);
        break;
      case 4:
        updateIntakeQuery += ', snack_calories = snack_calories - ?';
        updateParams.push(oldRecord.calories);
        break;
    }

    switch (eating_type) {
      case 1:
        updateIntakeQuery += ', breakfast_calories = breakfast_calories + ?';
        updateParams.push(calories);
        break;
      case 2:
        updateIntakeQuery += ', lunch_calories = lunch_calories + ?';
        updateParams.push(calories);
        break;
      case 3:
        updateIntakeQuery += ', dinner_calories = dinner_calories + ?';
        updateParams.push(calories);
        break;
      case 4:
        updateIntakeQuery += ', snack_calories = snack_calories + ?';
        updateParams.push(calories);
        break;
    }
  }

  updateIntakeQuery += ' WHERE id = ?';
  updateParams.push(user_intake_id);

  await db.query(updateIntakeQuery, updateParams);

  return res.success({ message: '修改成功' });
}));



// ? ----------------------------- 身体信息 -----------------------------


// 获取身体信息
router.post('/userWeight/list', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.body;
  const userId = req.auth.userId;

  // 如果没有传日期，则返回最新的数据
  if (!start_date && !end_date) {
    const latestQuery = `
      SELECT 
        id,
        user_id,
        DATE_FORMAT(date, '%Y-%m-%d') as date,
        weight,
        target_weight,
        target_type,
        bmi,
        bmr,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at
      FROM user_weight 
      WHERE user_id = ? 
      ORDER BY date DESC 
      LIMIT 1
    `;
    const [latestData] = await db.query(latestQuery, [userId]);
    return res.success(latestData);
  }

  // 构建查询条件
  let whereClause = `WHERE user_id = ?`;
  const queryParams = [userId];

  if (start_date) {
    whereClause += ` AND date >= ?`;
    queryParams.push(start_date);
  }
  if (end_date) {
    whereClause += ` AND date <= ?`;
    queryParams.push(end_date);
  }

  // 修改 SELECT 语句，使用 DATE_FORMAT 格式化日期
  const query = `
    SELECT 
      id,
      user_id,
      DATE_FORMAT(date, '%Y-%m-%d') as date,
      weight,
      target_weight,
      target_type,
      bmi,
      bmr,
      DATE_FORMAT(created_at, '%Y-%m-%d') as created_at,
      DATE_FORMAT(updated_at, '%Y-%m-%d') as updated_at
    FROM user_weight 
    ${whereClause} 
    ORDER BY date DESC
  `;
  
  const [rows] = await db.query(query, queryParams);
  return res.success(rows);
}));


// 添加身体信息
router.post('/userWeight/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { date, weight, target_weight, target_type, bmi, bmr } = req.body;

  // 插入数据
  const insertQuery = `INSERT INTO user_weight (user_id, date, weight, target_weight, target_type, bmi, bmr, created_at, updated_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
  const [result] = await db.query(insertQuery, [userId, date, weight, target_weight, target_type, bmi, bmr]);

  return res.success({ id: result.insertId, message: '身体数据新增成功' });
}));


// 删除身体信息
router.post('/userWeight/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  // 检查记录是否存在且属于当前用户
  const [record] = await db.query(
    'SELECT * FROM user_weight WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  if (record.length === 0) {
    return res.error('记录不存在或无权限删除', 404);
  }

  // 执行删除操作
  const deleteQuery = `DELETE FROM user_weight WHERE id = ? AND user_id = ?`;
  await db.query(deleteQuery, [id, userId]);

  return res.success({ message: '身体数据删除成功' });
}));


// 更新身体信息
router.post('/userWeight/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id, date, weight, target_weight, target_type, bmi, bmr } = req.body;

  // 删除旧数据
  const deleteQuery = `DELETE FROM user_weight WHERE id = ? AND user_id = ?`;
  await db.query(deleteQuery, [id, userId]);

  // 新增新数据
  const insertQuery = `INSERT INTO user_weight (user_id, date, weight, target_weight, target_type, bmi, bmr, created_at, updated_at) 
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
  await db.query(insertQuery, [userId, date, weight, target_weight, target_type, bmi, bmr]);

  return res.success({ message: '身体数据更新成功' });
}));


module.exports = router;
