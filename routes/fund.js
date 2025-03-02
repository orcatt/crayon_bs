const express = require('express');
const axios = require('axios');  // 添加这行
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');


// 获取基金列表
router.get('/holdingShares/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  try {
    const [funds] = await db.query('SELECT * FROM `fund_holdings` WHERE `user_id` = ?', [userId]);
    return res.success(funds, '基金列表获取成功');
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

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 插入买入/卖出记录到买入/卖出表
    const insertQuery = `
      INSERT INTO fund_transactions (user_id, fund_id, transaction_type, shares, net_value, amount, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await connection.query(insertQuery, [userId, fund_id, transaction_type, shares, net_value, amount, transaction_date]);

    // 2. 更新基金持有表
    if (transaction_type === 'buy') { // 买入操作
      // 计算新的持有成本（加权平均）
      updatedHoldingCost = ((updatedHoldingCost * updatedShares) + (parseFloat(net_value) * parseFloat(shares))) / (updatedShares + parseFloat(shares));
    
      // 累加总买入金额和份额
      updatedTotalAmount += parseFloat(amount); // 累加总买入金额
      updatedAmount += parseFloat(amount); // 累加当前持有金额
      updatedShares += parseFloat(shares); // 累加持有份额
    
   
      // 计算新的平均净值
      updatedAverageNetValue = updatedTotalAmount / updatedShares;
    } else if (transaction_type === 'sell') { // 卖出操作
      // 卖出时，减少当前持有金额和份额
      if (parseFloat(shares) > updatedShares) {
        return res.error('卖出份额不能大于持有份额', 400);
      }

      updatedAmount -= parseFloat(amount); // 卖出时减少金额
      updatedShares -= parseFloat(shares); // 卖出时减少份额

      // 计算新的平均净值
      if (updatedShares > 0) {
        updatedAverageNetValue = updatedTotalAmount / updatedShares; // 计算新的平均净值
      } else {
        updatedAverageNetValue = 0; // 如果份额为 0，平均净值设置为 0
      }
    }

    // 更新基金持有表
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, holding_shares = ?, total_amount = ?, average_net_value = ?, holding_cost = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [updatedAmount, updatedShares, updatedTotalAmount, updatedAverageNetValue, updatedHoldingCost, fund_id]);

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

    if (transaction_type === 'buy') { // 如果是买入记录，删除时减少金额和份额
      updatedAmount -= parseFloat(amount); // 减少金额
      updatedShares -= parseFloat(shares); // 减少份额

      // 计算已删除的买入份额成本
      const deletedHoldingCost = parseFloat(amount) / parseFloat(shares);  // 每股的成本
      const remainingShares = updatedShares;

      // 新的持有成本 = （当前持有成本 * 当前份额 - 已删除买入份额的成本）/ 剩余份额
      updatedHoldingCost = ((updatedHoldingCost * (updatedShares + parseFloat(shares))) - (deletedHoldingCost * parseFloat(shares))) / remainingShares;

    } else if (transaction_type === 'sell') { // 如果是卖出记录，删除时增加金额和份额
      updatedAmount += parseFloat(amount); // 增加金额
      updatedShares += parseFloat(shares); // 增加份额

      // 卖出时，持有成本保持不变
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
      SET holding_amount = ?, holding_shares = ?, average_net_value = ?, holding_cost = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [updatedAmount, updatedShares, updatedAverageNetValue, updatedHoldingCost, fund_id]);

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

// 盈利更新接口
router.post('/holdingShares/profit', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const { fund_id, current_net_value, transaction_date } = req.body;
  // 参数验证
  if (!fund_id || !current_net_value || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查找基金持有记录
  const [fundRecord] = await db.query('SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403);  // 用户没有权限操作该基金
  }

  const fund = fundRecord[0];
  const { average_net_value, holding_shares } = fund;

  // 如果当前净值大于平均净值，计算盈利（前后端同时限制）
  if (current_net_value > average_net_value) {
    const profit_loss = (current_net_value - average_net_value) * holding_shares;

    // 1. 更新 fund_daily_profit_loss 表
    const insertProfitQuery = `
      INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, profit_loss_type, profit_loss)
      VALUES (?, ?, ?, 0, ?)
    `;
    await db.query(insertProfitQuery, [fund_id, userId, transaction_date, profit_loss]);

    // 2. 更新 fund_daily_profit_loss_summary 表
    const insertSummaryQuery = `
      INSERT INTO fund_daily_profit_loss_summary (user_id, transaction_date, total_profit_loss_type, total_profit_loss)
      VALUES (?, ?, 0, ?)
    `;
    await db.query(insertSummaryQuery, [userId, transaction_date, profit_loss]);

    // 3. 更新 fund_holdings 表
    const updatedHoldingAmount = (parseFloat(fund.holding_amount) + parseFloat(profit_loss)).toFixed(3);  // 更新持有金额
    const updatedHoldingProfit = (parseFloat(fund.holding_profit) + parseFloat(profit_loss)).toFixed(3);  // 更新持有收益
    const updatedTotalProfit = (parseFloat(fund.total_profit) + parseFloat(profit_loss)).toFixed(3);  // 更新总收益

    // 计算新的持有收益率和总收益率，确保不除以零
    const newHoldingProfitRate = updatedHoldingAmount !== 0 ? (parseFloat(updatedHoldingProfit) / parseFloat(updatedHoldingAmount)).toFixed(3) : 0; // 如果持有金额为 0，收益率设为 0
    const newTotalProfitRate = parseFloat(fund.total_amount) !== 0 ? (parseFloat(updatedTotalProfit) / parseFloat(fund.total_amount)).toFixed(3) : 0; // 如果总金额为 0，总收益率设为 0

    // 计算新的平均净值
    let newAverageNetValue = 0;
    if (parseFloat(fund.holding_shares) > 0) {
      newAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(3);  // 总金额 / 持有份额
    }

    // 更新基金持有表
    const updateFundHoldingQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, holding_profit = ?, holding_profit_rate = ?, total_profit = ?, total_profit_rate = ?, average_net_value = ?
      WHERE id = ?
    `;
    await db.query(updateFundHoldingQuery, [
      updatedHoldingAmount, updatedHoldingProfit, newHoldingProfitRate, updatedTotalProfit, newTotalProfitRate, newAverageNetValue, fund_id
    ]);
    return res.success({ message: '盈利更新成功' });
  } else {
    return res.error('当前净值未超过平均净值，无盈利产生', 400);
  }
}));

// 亏损更新接口
router.post('/holdingShares/loss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const { fund_id, current_net_value, transaction_date } = req.body;

  // 参数验证
  if (!fund_id || !current_net_value || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查找基金持有记录
  const [fundRecord] = await db.query('SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('没有权限操作该基金', 403);  // 用户没有权限操作该基金
  }

  const fund = fundRecord[0];
  const { average_net_value, holding_shares } = fund;

  // 如果当前净值小于平均净值，计算亏损（前后端同时限制）
  if (current_net_value < average_net_value) {
    const profit_loss = (average_net_value - current_net_value) * holding_shares;

    // 1. 更新 fund_daily_profit_loss 表
    const insertLossQuery = `
      INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, profit_loss_type, profit_loss)
      VALUES (?, ?, ?, 1, ?)
    `;
    await db.query(insertLossQuery, [fund_id, userId, transaction_date, profit_loss]);

    // 2. 更新 fund_daily_profit_loss_summary 表
    const insertLossSummaryQuery = `
      INSERT INTO fund_daily_profit_loss_summary (user_id, transaction_date, total_profit_loss_type, total_profit_loss)
      VALUES (?, ?, 1, ?)
    `;
    await db.query(insertLossSummaryQuery, [userId, transaction_date, profit_loss]);

    // 3. 更新 fund_holdings 表
    const updatedHoldingAmount = (parseFloat(fund.holding_amount) - parseFloat(profit_loss)).toFixed(3);  // 更新持有金额
    const updatedHoldingProfit = (parseFloat(fund.holding_profit) - parseFloat(profit_loss)).toFixed(3);  // 更新持有收益
    const updatedTotalProfit = (parseFloat(fund.total_profit) - parseFloat(profit_loss)).toFixed(3);  // 更新总收益

    // 计算新的持有收益率和总收益率，确保不除以零
    const newHoldingProfitRate = updatedHoldingAmount !== 0 ? (parseFloat(updatedHoldingProfit) / parseFloat(updatedHoldingAmount)).toFixed(3) : 0; // 如果持有金额为 0，收益率设为 0
    const newTotalProfitRate = parseFloat(fund.total_amount) !== 0 ? (parseFloat(updatedTotalProfit) / parseFloat(fund.total_amount)).toFixed(3) : 0; // 如果总金额为 0，总收益率设为 0

    // 计算新的平均净值
    let newAverageNetValue = 0;
    if (parseFloat(fund.holding_shares) > 0) {
      newAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(3);  // 总金额 / 持有份额
    }

    // 更新基金持有表
    const updateFundLossQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, holding_profit = ?, holding_profit_rate = ?, total_profit = ?, total_profit_rate = ?, average_net_value = ?
      WHERE id = ?
    `;
    await db.query(updateFundLossQuery, [
      updatedHoldingAmount, updatedHoldingProfit, newHoldingProfitRate, updatedTotalProfit, newTotalProfitRate, newAverageNetValue, fund_id
    ]);

    return res.success({ message: '亏损更新成功' });
  } else {
    return res.error('当前净值未低于平均净值，无亏损产生', 400);
  }
}));


module.exports = router;