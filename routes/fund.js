const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// 获取基金列表（含当日收益 & 盈亏率）
router.post('/holdingShares/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 获取用户 ID
  const { transaction_date } = req.body;  // 从请求体中获取交易日期

  // 参数验证
  if (!transaction_date) {
    return res.error('缺少交易日期参数', 400);
  }

  try {
    // 查询基金持有数据
    const [funds] = await db.query(
      'SELECT * FROM `fund_holdings` WHERE `user_id` = ?',
      [userId]
    );

    if (funds.length === 0) {
      return res.success([], '未找到持有的基金');
    }

    // 查询基金当日盈亏数据，并格式化 transaction_date
    const [dailyProfitLoss] = await db.query(
      `SELECT id, fund_id, user_id, 
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date, 
        profit_loss, price_change_percentage 
        FROM fund_daily_profit_loss 
      WHERE user_id = ? AND transaction_date = ?`,
      [userId, transaction_date]
    );

    // 构建基金列表，直接附加 dailyData
    const enrichedFunds = funds.map(fund => ({
      ...fund,
      dailyData: dailyProfitLoss.find(d => d.fund_id === fund.id) || {} // 若无数据，则为空对象
    }));

    return res.success(enrichedFunds, '基金列表获取成功');

  } catch (error) {
    console.error(error);
    return res.error('基金列表获取失败，请稍后重试', 500);
  }
}));





// 新增基金
router.post('/holdingShares/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { fund_name, code } = req.body;

  if (!fund_name) {
    return res.error('缺少必要的字段', 400);
  }

  // 设置默认值
  const defaultValues = {
    holding_amount: 0,
    holding_shares: 0,
    average_net_value: 0,
    holding_profit: 0,
    holding_profit_rate: 0,
    total_profit: 0,
    total_profit_rate: 0,
    management_fee: 0
  };

  try {
    const [result] = await db.query(
      'INSERT INTO `fund_holdings` (`user_id`, `fund_name`, `code`, `holding_amount`, `holding_shares`, `average_net_value`, `holding_profit`, `holding_profit_rate`, `total_profit`, `total_profit_rate`, `management_fee`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, fund_name, code, ...Object.values(defaultValues)]
    );
    return res.success({ id: result.insertId }, '基金新增成功');
  } catch (error) {
    console.error(error);
    return res.error('基金新增失败，请稍后重试', 500);
  }
}));


// 修改基金
router.post('/holdingShares/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id, fund_name, code } = req.body;

  if (!id || !fund_name) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    const [result] = await db.query(
      'UPDATE `fund_holdings` SET `fund_name` = ?, `code` = ? WHERE `id` = ? AND `user_id` = ?',
      [fund_name, code, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.error('基金未找到', 404);
    }

    return res.success(null, '基金修改成功');
  } catch (error) {
    console.error(error);
    return res.error('基金修改失败，请稍后重试', 500);
  }
}));


// 删除基金
router.post('/holdingShares/delete', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id } = req.body;

  if (!id) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    const [result] = await db.query('DELETE FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', [id, userId]);

    if (result.affectedRows === 0) {
      return res.error('基金未找到', 404);
    }

    return res.success(null, '基金删除成功');
  } catch (error) {
    console.error(error);
    return res.error('基金删除失败，请稍后重试', 500);
  }
}));


// 买入/卖出接口
router.post('/holdingTransactions/buysell', asyncHandler(async (req, res) => {
  const { fund_id, transaction_type, amount, shares, net_value, transaction_date } = req.body;

  // 参数验证
  if (!fund_id || !transaction_type || !amount || !shares || !net_value || !transaction_date) {
    return res.error('缺少必要的参数', 400);
  }

  // 获取当前用户的ID
  const userId = req.auth.userId; // 假设用户ID存储在请求的auth中

  // 查找基金持有记录，验证该基金是否属于当前用户
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403); // 用户没有权限操作该基金
  }

  // 获取当前的基金持有数据
  const fund = fundRecord[0];

  // 当前持有的份额和成本
  let updatedShares = parseFloat(fund.holding_shares) || 0;   // 当前持有份额
  let updatedAmount = parseFloat(fund.holding_amount) || 0;  // 当前持有金额
  let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;  // 当前单股持有成本
  let updatedTotalAmount = parseFloat(fund.total_amount) || 0;  // 总买入金额
  let updatedAverageNetValue = parseFloat(fund.average_net_value) || 0;  // 平均净值
  let updatedTotalCost = parseFloat(fund.total_cost) || 0; // 当前总成本

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1️ 插入买入/卖出记录
    const insertQuery = `
      INSERT INTO fund_transactions (user_id, fund_id, transaction_type, shares, net_value, amount, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await connection.query(insertQuery, [userId, fund_id, transaction_type, shares, net_value, amount, transaction_date]);

    // 2️ 处理买入和卖出
    if (transaction_type === 'buy') { // ✅ 买入操作
      // 计算新的持有成本（加权平均）
      updatedHoldingCost = ((updatedHoldingCost * updatedShares) + (parseFloat(net_value) * parseFloat(shares))) / (updatedShares + parseFloat(shares));

      // 累加总买入金额和份额
      updatedTotalAmount += parseFloat(amount); // 累加总买入金额
      updatedAmount += parseFloat(amount); // 累加当前持有金额
      updatedShares += parseFloat(shares); // 累加持有份额

      // 计算新的总成本
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2);
      // 计算新的平均净值
      updatedAverageNetValue = updatedAmount / updatedShares;

    } else if (transaction_type === 'sell') { // 卖出操作
      // 卖出时，减少当前持有金额和份额
      if (parseFloat(shares) > updatedShares) {
        return res.error('卖出份额不能大于持有份额', 400);
      }

      updatedAmount -= parseFloat(amount); // 卖出时减少金额
      updatedShares -= parseFloat(shares); // 卖出时减少份额

      // 更新总成本
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); 

      // 计算新的平均净值
      if (updatedShares > 0) {
        updatedAverageNetValue = updatedAmount / updatedShares; // 计算新的平均净值
      } else {
        updatedAverageNetValue = 0; // 如果份额为 0，平均净值设置为 0
      }
    }

    // 3️ 更新 `fund_holdings`
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_shares = ?, 
          total_amount = ?, 
          average_net_value = ?, 
          holding_cost = ?, 
          total_cost = ?  
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount, 
      updatedShares, 
      updatedTotalAmount, 
      updatedAverageNetValue, 
      updatedHoldingCost, 
      updatedTotalCost,
      fund_id
    ]);

    // 提交事务
    await connection.commit();

    return res.success({ message: '买入卖出成功' });

  } catch (error) {
    // 回滚事务
    await connection.rollback();
    console.error('买入卖出操作失败:', error);
    return res.error('操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));



// 查询某个基金的买入卖出数据列表
router.post('/holdingTransactions/list', asyncHandler(async (req, res) => {
  const { fund_id, start_date, end_date } = req.body;

  // 获取当前用户的ID
  const userId = req.auth.userId; // 假设用户ID存储在请求的auth中

  // 参数验证
  if (!fund_id) {
    return res.error('缺少基金 ID', 400);
  }

  // 查找基金持有记录，验证该基金是否属于当前用户
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('没有权限查询该基金', 403); // 用户没有权限查询该基金的交易记录
  }

  // 构建查询条件
  const queryParams = [fund_id];

  // 如果提供了 start_date 和 end_date，则添加日期范围条件
  let query = `
    SELECT 
      id,
      fund_id,
      transaction_type,
      shares,
      net_value,
      amount,
      transaction_date
    FROM fund_transactions
    WHERE fund_id = ?
  `;

  // 如果有日期范围参数，则添加 WHERE 条件
  if (start_date && end_date) {
    query += ` AND transaction_date BETWEEN ? AND ?`;
    queryParams.push(start_date, end_date);
  }

  query += ` ORDER BY transaction_date DESC;`;  // 按日期降序排序

  try {
    // 执行查询
    const [rows] = await db.query(query, queryParams);

    // 如果没有找到数据，返回一个空数组
    if (rows.length === 0) {
      return res.success([], '未找到该时间范围内的买入卖出记录');
    }

    // 返回查询到的数据
    return res.success(rows, '查询成功');
  } catch (error) {
    console.error('查询买入卖出记录失败:', error);
    return res.error('查询失败，请稍后重试', 500);
  }
}));


// 删除买入卖出记录
router.post('/holdingTransactions/delete', asyncHandler(async (req, res) => {
  const { transaction_id } = req.body;

  // 获取当前用户的ID
  const userId = req.auth.userId; // 假设用户ID存储在请求的auth中

  // 参数验证
  if (!transaction_id) {
    return res.error('缺少必要的参数', 400);
  }

  // 查找买入卖出记录
  const [transactionRecord] = await db.query('SELECT * FROM fund_transactions WHERE id = ? AND user_id = ?', [transaction_id, userId]);
  if (transactionRecord.length === 0) {
    return res.error('没有找到该买入卖出记录或该记录不属于当前用户', 404);
  }

  const transaction = transactionRecord[0];
  const { fund_id, shares, amount, transaction_type } = transaction;

  // 查找基金持有记录，验证该基金是否属于当前用户
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403); // 用户没有权限操作该基金
  }

  // 获取当前的基金持有数据
  const fund = fundRecord[0];

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 删除买入/卖出记录
    const deleteQuery = 'DELETE FROM fund_transactions WHERE id = ?';
    await connection.query(deleteQuery, [transaction_id]);

    // 2. 根据交易类型重新计算基金持有数据
    let updatedAmount = parseFloat(fund.holding_amount) || 0;  // 确保总金额是有效数字
    let updatedShares = parseFloat(fund.holding_shares) || 0;   // 确保持有份额是有效数字
    let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;  // 当前持有成本
    let updatedAverageNetValue = parseFloat(fund.average_net_value) || 0;  // 确保平均净值是有效数字
    let updatedTotalAmount = parseFloat(fund.total_amount) || 0;  // 确保总金额是有效数字
    let updatedTotalCost = parseFloat(fund.total_cost) || 0;  // 确保总成本是有效数字

    if (transaction_type === 'buy') { // 如果是买入记录，之前加了，删除时就应该减少
      updatedAmount -= parseFloat(amount); // 减少持有金额
      updatedShares -= parseFloat(shares); // 减少持有份额
      updatedTotalAmount -= parseFloat(amount); // 从总投入中减去已删除的买入金额
    
      // 计算已删除的买入份额成本
      const deletedHoldingCost = parseFloat(amount) / parseFloat(shares);  // 每股的成本
      const remainingShares = updatedShares;
    
      // 处理 `remainingShares == 0`，防止 `NaN`
      if (remainingShares > 0) {
        updatedHoldingCost = ((updatedHoldingCost * (updatedShares + parseFloat(shares))) - (deletedHoldingCost * parseFloat(shares))) / remainingShares;
      } else {
        updatedHoldingCost = 0;
      }
  
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); // 重新计算 `total_cost`

      
    } else if (transaction_type === 'sell') { // 如果是卖出记录，之前减了，删除时就应该增加
      updatedAmount += parseFloat(amount); // 增加金额
      updatedShares += parseFloat(shares); // 增加份额
      updatedTotalAmount += parseFloat(amount); // 从总投入中减去已删除的卖出金额
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); // 重新计算 `total_cost`
    }

    // 重新计算平均净值：如果份额为 0，则设置为 0
    if (updatedShares > 0) {
      updatedAverageNetValue = updatedAmount / updatedShares; // 计算新的平均净值
    } else {
      updatedAverageNetValue = 0; // 如果份额为 0，平均净值设置为 0
    }

    // 3. 更新基金持有表
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_shares = ?, 
          average_net_value = ?, 
          holding_cost = ?, 
          total_amount = ?, 
          total_cost = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount,
      updatedShares,
      updatedAverageNetValue,
      updatedHoldingCost,
      updatedTotalAmount, // 确保 total_amount 传入
      updatedTotalCost, // 确保 total_cost 传入
      fund_id
    ]);

    // 提交事务
    await connection.commit();

    return res.success({ message: '买入卖出记录删除成功，基金持有数据已更新' });

  } catch (error) {
    // 回滚事务
    await connection.rollback();
    console.error('删除买入卖出记录操作失败:', error);
    return res.error('操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// 更新盈亏
router.post('/holdingShares/profitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { fund_id, price_change_percentage, transaction_date } = req.body;

  if (!fund_id || price_change_percentage === undefined || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询基金持有数据
  const [fundRecord] = await db.query(
    'SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', 
    [fund_id, userId]
  );
  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403);
  }

  const fund = fundRecord[0];

  // 计算盈亏
  const profit_loss = ((parseFloat(price_change_percentage) / 100) * parseFloat(fund.holding_amount));

  // 1️ 插入 `fund_daily_profit_loss`
  const insertProfitQuery = `
    INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, profit_loss, price_change_percentage)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE profit_loss = VALUES(profit_loss), price_change_percentage = VALUES(price_change_percentage);
  `;
  await db.query(insertProfitQuery, [fund_id, userId, transaction_date, profit_loss, parseFloat(price_change_percentage)]);

  // 2️ 更新 `fund_daily_profit_loss_summary`
  const [existingSummary] = await db.query(
    'SELECT total_profit_loss FROM fund_daily_profit_loss_summary WHERE user_id = ? AND transaction_date = ?',
    [userId, transaction_date]
  );

  if (existingSummary.length > 0) {
    const updateUserProfitQuery = `
      UPDATE fund_daily_profit_loss_summary
      SET total_profit_loss = total_profit_loss + ?
      WHERE user_id = ? AND transaction_date = ?
    `;
    await db.query(updateUserProfitQuery, [profit_loss, userId, transaction_date]);
  } else {
    const insertUserProfitQuery = `
      INSERT INTO fund_daily_profit_loss_summary (user_id, transaction_date, total_profit_loss)
      VALUES (?, ?, ?)
    `;
    await db.query(insertUserProfitQuery, [userId, transaction_date, profit_loss]);
  }

  // 3️ 更新 `fund_holdings`
  const updatedHoldingAmount = (parseFloat(fund.holding_amount) + profit_loss).toFixed(2);
  const updatedHoldingProfit = (parseFloat(fund.holding_profit) + profit_loss).toFixed(2);
  const updatedTotalProfit = (parseFloat(fund.total_profit) + profit_loss).toFixed(2);

  // 修改持有收益率的计算方式，防止除零
  const newHoldingProfitRate = fund.total_cost && parseFloat(fund.total_cost) !== 0 
    ? Math.min(Math.max((updatedHoldingProfit / fund.total_cost), -9999), 9999).toFixed(4)  // 限制在 ±9999 范围内
    : 0;

  // 修改总收益率的计算方式，防止除零
  const newTotalProfitRate = fund.total_amount && parseFloat(fund.total_amount) !== 0 
    ? Math.min(Math.max((updatedTotalProfit / fund.total_amount), -9999), 9999).toFixed(4)  // 限制在 ±9999 范围内
    : 0;

  // 计算新的平均净值（防止除零错误）
  let newAverageNetValue = 0;
  if (parseFloat(fund.holding_shares) > 0) {
    newAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(4);
  }

  // 更新 `fund_holdings`
  const updateFundHoldingQuery = `
    UPDATE fund_holdings
    SET holding_amount = ?, 
        holding_profit = ?, 
        holding_profit_rate = ?, 
        total_profit = ?, 
        total_profit_rate = ?, 
        average_net_value = ?
    WHERE id = ?
  `;

  await db.query(updateFundHoldingQuery, [
    updatedHoldingAmount,
    updatedHoldingProfit,
    newHoldingProfitRate,
    updatedTotalProfit,
    newTotalProfitRate,
    newAverageNetValue,
    fund_id
  ]);

  return res.success({ message: '盈亏更新成功' });
}));



// 删除收益接口
router.post('/holdingShares/deleteProfitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 获取用户 ID
  const { profit_loss_id } = req.body; // 需要删除的收益记录 ID

  // 参数验证
  if (!profit_loss_id) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询 `fund_daily_profit_loss` 记录，确保用户有权限删除
  const [profitLossRecord] = await db.query(
    'SELECT * FROM `fund_daily_profit_loss` WHERE `id` = ? AND `user_id` = ?',
    [profit_loss_id, userId]
  );

  if (profitLossRecord.length === 0) {
    return res.error('没有找到该收益记录或无权限删除', 404);
  }

  const profitLoss = profitLossRecord[0];
  const { fund_id, transaction_date, profit_loss } = profitLoss; // 取出相关数据

  // 查询基金持有数据
  const [fundRecord] = await db.query(
    'SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?',
    [fund_id, userId]
  );

  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403);
  }

  const fund = fundRecord[0];

  // 计算新的持有金额、持有收益和总收益
  const updatedHoldingAmount = (parseFloat(fund.holding_amount) - profit_loss).toFixed(2);
  const updatedHoldingProfit = (parseFloat(fund.holding_profit) - profit_loss).toFixed(2);
  const updatedTotalProfit = (parseFloat(fund.total_profit) - profit_loss).toFixed(2);

  // 计算新的持有收益率，防止除零错误
  const newHoldingProfitRate = (fund.holding_cost * fund.holding_shares) !== 0
    ? (updatedHoldingProfit / (fund.holding_cost * fund.holding_shares)).toFixed(4)
    : 0;

  // 计算新的总收益率，防止除零错误
  const newTotalProfitRate = fund.total_amount != 0
    ? (updatedTotalProfit / fund.total_amount).toFixed(4)
    : 0;

  // 计算新的平均净值（防止除零错误）
  let newAverageNetValue = 0;
  if (parseFloat(fund.holding_shares) > 0) {
    newAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(4);
  }

  // 开始数据库事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1️ 更新 `fund_holdings`
    const updateFundHoldingQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_profit = ?, 
          holding_profit_rate = ?, 
          total_profit = ?, 
          total_profit_rate = ?, 
          average_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateFundHoldingQuery, [
      updatedHoldingAmount,
      updatedHoldingProfit,
      newHoldingProfitRate,
      updatedTotalProfit,
      newTotalProfitRate,
      newAverageNetValue,
      fund_id
    ]);

    // 2️ 更新 `fund_daily_profit_loss_summary`
    const updateUserProfitQuery = `
      UPDATE fund_daily_profit_loss_summary
      SET total_profit_loss = total_profit_loss - ?
      WHERE user_id = ? AND transaction_date = ?;
    `;
    await connection.query(updateUserProfitQuery, [profit_loss, userId, transaction_date]);

    // 3️ 删除 `fund_daily_profit_loss`
    const deleteProfitLossQuery = `DELETE FROM fund_daily_profit_loss WHERE id = ?`;
    await connection.query(deleteProfitLossQuery, [profit_loss_id]);

    // 提交事务
    await connection.commit();

    return res.success({ message: '收益删除成功，数据已更新' });

  } catch (error) {
    // 回滚事务
    await connection.rollback();
    console.error('删除收益操作失败:', error);
    return res.error('操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// 获取某基金的月度每日收益列表
router.post('/holdingShares/profitList', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 获取用户 ID
  const { fund_id, transaction_date } = req.body;  // 需要查询的基金 ID 和月份（YYYY-MM）

  // 参数验证
  if (!fund_id || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    // 1️ 查询基金当月每日收益，并格式化日期
    const [profitLossData] = await db.query(
      `SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date, 
        profit_loss, 
        price_change_percentage 
        FROM fund_daily_profit_loss 
        WHERE user_id = ? 
        AND fund_id = ? 
        AND DATE_FORMAT(transaction_date, '%Y-%m') = ? 
        ORDER BY transaction_date ASC`,
      [userId, fund_id, transaction_date]
    );

    return res.success(profitLossData, '基金收益列表获取成功');

  } catch (error) {
    console.error(error);
    return res.error('基金收益列表获取失败，请稍后重试', 500);
  }
}));


// 获取用户的月度每日收益列表
router.post('/holdingShares/userProfitList', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 获取用户 ID
  const { transaction_date } = req.body;  // 需要查询的月份（YYYY-MM）

  // 参数验证
  if (!transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    // 查询用户当月每日收益，并格式化日期
    const [profitLossData] = await db.query(
      `SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date, 
        total_profit_loss 
        FROM fund_daily_profit_loss_summary 
        WHERE user_id = ? 
        AND DATE_FORMAT(transaction_date, '%Y-%m') = ? 
        ORDER BY transaction_date ASC`,
      [userId, transaction_date]
    );

    return res.success(profitLossData, '用户收益列表获取成功');

  } catch (error) {
    console.error(error);
    return res.error('用户收益列表获取失败，请稍后重试', 500);
  }
}));



module.exports = router;