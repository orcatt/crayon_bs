const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// 获取基金列表
router.post('/holdingShares/list', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { transaction_date } = req.body;
  // 参数验证
  if (!transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    // 查询基金持有数据，显式列出所有字段
    const [funds] = await db.query(
      `SELECT 
        id,
        user_id,
        fund_name,
        code,
        index_code,
        holding_amount,
        holding_shares,
        average_net_value,
        holding_cost,
        holding_profit,
        holding_profit_rate,
        total_profit,
        total_cost,
        management_fee
      FROM fund_holdings 
      WHERE user_id = ?`,
      [userId]
    );

    if (funds.length === 0) {
      return res.success([], '用户基金列表为空');
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
      dailyData: dailyProfitLoss.find(d => d.fund_id === fund.id) || {}
    }));

    return res.success(enrichedFunds, '基金列表获取成功');

  } catch (error) {
    console.error('基金列表获取失败:', error);
    return res.error('基金列表获取失败，请稍后重试', 500);
  }
}));





// 新增基金
router.post('/holdingShares/add', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { fund_name, code, index_code } = req.body;
  // 参数验证
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
    total_cost: 0,
    management_fee: 0
  };

  try {
    const [result] = await db.query(
      'INSERT INTO `fund_holdings` (`user_id`, `fund_name`, `code`, `index_code`, `holding_amount`, `holding_shares`, `average_net_value`, `holding_profit`, `holding_profit_rate`, `total_profit`, `total_cost`, `management_fee`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, fund_name, code, index_code, ...Object.values(defaultValues)]
    );
    return res.success({ id: result.insertId }, '基金新增成功');
    
  } catch (error) {
    console.error('基金新增失败:', error);
    return res.error('基金新增失败，请稍后重试', 500);
  }
}));


// 修改基金
router.post('/holdingShares/update', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { id, fund_name, code, index_code } = req.body;  // 添加 index_code
  // 参数验证
  if (!id || !fund_name) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    const [result] = await db.query(
      'UPDATE `fund_holdings` SET `fund_name` = ?, `code` = ?, `index_code` = ? WHERE `id` = ? AND `user_id` = ?',
      [fund_name, code, index_code, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.error('基金未找到', 404);
    }

    return res.success(null, '基金修改成功');
  } catch (error) {
    console.error('基金修改失败:', error);
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
    console.error('基金删除失败:', error);
    return res.error('基金删除失败，请稍后重试', 500);
  }
}));


// 买入/卖出接口
router.post('/holdingTransactions/buysell', asyncHandler(async (req, res) => {
  const { fund_id, transaction_type, amount, shares, net_value, transaction_date } = req.body;
  const userId = req.auth.userId;

  // 参数验证
  if (!fund_id || !transaction_type || !amount || !shares || !net_value || !transaction_date) {
    return res.error('缺少必要的参数', 400);
  }

  // 查找基金持有记录并鉴权
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 当前持有的份额和成本
  let updatedShares = parseFloat(fund.holding_shares) || 0;   // 当前持有份额
  let updatedAmount = parseFloat(fund.holding_amount) || 0;  // 当前持有金额
  let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;  // 当前单股持有成本
  let updatedAverageNetValue = parseFloat(fund.average_net_value) || 0;  // 平均净值
  let updatedTotalCost = parseFloat(fund.total_cost) || 0; // 当前总成本
  let updatedHoldingProfit = parseFloat(fund.holding_profit) || 0; // 当前持有收益
  let updatedHoldingProfitRate = parseFloat(fund.holding_profit_rate) || 0; // 当前持有收益率
  let updatedTotalProfit = parseFloat(fund.total_profit) || 0; // 累计总收益

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
    if (transaction_type === 'buy') {
      // 计算新的持有成本（加权平均）
      updatedHoldingCost = ((updatedHoldingCost * updatedShares) + (parseFloat(net_value) * parseFloat(shares))) / (updatedShares + parseFloat(shares));

      updatedAmount += parseFloat(amount); // 累加当前持有金额
      updatedShares += parseFloat(shares); // 累加持有份额
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); // 计算新的总成本
      updatedAverageNetValue = updatedAmount / updatedShares; // 计算新的平均净值

      // 如果存在持有收益，重新计算收益率
      if (updatedHoldingProfit !== 0) {
        updatedHoldingProfitRate = (updatedHoldingProfit / updatedTotalCost).toFixed(4);
      }
    } 
    else if (transaction_type === 'sell') { 
      if (parseFloat(shares) > updatedShares) {
        return res.error('卖出份额不能大于持有份额', 400);
      }

      // 计算卖出收益
      const sellProfit = (parseFloat(net_value) - updatedHoldingCost) * parseFloat(shares); 
      updatedTotalProfit += sellProfit; // 卖出时增加累计收益，累加卖出收益
      updatedHoldingProfit -= sellProfit; // 卖出时减少持有收益，减去卖出部分的收益

      // 更新持有金额和份额
      updatedAmount -= parseFloat(amount); // 卖出时减少持有金额
      updatedShares -= parseFloat(shares); // 卖出时减少持有份额
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); // 计算新的总成本

      // 如果还有剩余份额，重新计算收益率
      if (updatedShares > 0) {
        updatedHoldingProfitRate = updatedTotalCost > 0 ? (updatedHoldingProfit / updatedTotalCost).toFixed(4) : 0;
        updatedAverageNetValue = updatedAmount / updatedShares;
      } else {
        // 如果卖空了，持有市值、总成本、成本、收益、收益率和平均净值都设为0
        updatedAmount = 0;
        updatedTotalCost = 0;
        updatedHoldingCost = 0;
        updatedHoldingProfit = 0;
        updatedHoldingProfitRate = 0;
        updatedAverageNetValue = 0;
      }
    }

    // 3️ 更新 `fund_holdings`
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_shares = ?, 
          average_net_value = ?, 
          holding_cost = ?, 
          total_cost = ?,
          holding_profit = ?,
          holding_profit_rate = ?,
          total_profit = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount, 
      updatedShares, 
      updatedAverageNetValue, 
      updatedHoldingCost, 
      updatedTotalCost,
      updatedHoldingProfit,
      updatedHoldingProfitRate,
      updatedTotalProfit,
      fund_id
    ]);

    // 提交事务
    await connection.commit();
    return res.success({ message: '买入卖出成功' });

  } catch (error) {
    await connection.rollback();
    console.error('买入卖出操作失败:', error);
    return res.error('操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// 查询某个基金的买入卖出数据列表
router.post('/holdingTransactions/list', asyncHandler(async (req, res) => {
  const { fund_id, transaction_date } = req.body;  // 改为接收 transaction_date（YYYY-MM）
  const userId = req.auth.userId;

  // 参数验证
  if (!fund_id || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查找基金持有记录，验证该基金是否属于当前用户
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }

  try {
    // 查询基金当月买入卖出记录，并格式化日期
    const [rows] = await db.query(
      `SELECT 
        id,
        fund_id,
        transaction_type,
        shares,
        net_value,
        amount,
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
      FROM fund_transactions 
      WHERE fund_id = ? 
      AND user_id = ?
      AND DATE_FORMAT(transaction_date, '%Y-%m') = ? 
      ORDER BY transaction_date DESC`,
      [fund_id, userId, transaction_date]  // 添加 userId 参数
    );

    // 如果无数据，返回空数组
    if (rows.length === 0) {
      return res.success([], '未找到该月份的买入卖出记录');
    }
    // 正确返回
    return res.success(rows, '查询成功');

  } catch (error) {
    console.error('查询买入卖出记录失败:', error);
    return res.error('查询失败，请稍后重试', 500);
  }
}));


// 删除买入卖出记录
router.post('/holdingTransactions/delete', asyncHandler(async (req, res) => {
  const { transaction_id } = req.body;
  const userId = req.auth.userId; 
  // 参数验证
  if (!transaction_id) {
    return res.error('缺少必要的参数', 400);
  }

  // 查找买入卖出记录
  const [transactionRecord] = await db.query('SELECT * FROM fund_transactions WHERE id = ? AND user_id = ?', [transaction_id, userId]);
  if (transactionRecord.length === 0) {
    return res.error('未找到此用户的买卖记录', 404);
  }
  const transaction = transactionRecord[0];
  const { fund_id, shares, amount, transaction_type } = transaction;

  // 查找基金持有记录并鉴权
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
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
    let updatedTotalCost = parseFloat(fund.total_cost) || 0;  // 确保总成本是有效数字

    // ! 如果是买入记录，之前加了，删除时就应该减少
    if (transaction_type === 'buy') { 
      updatedAmount -= parseFloat(amount); // 减少持有金额
      updatedShares -= parseFloat(shares); // 减少持有份额
    
      const originalHoldingCost = parseFloat(amount) / parseFloat(shares);  // 原始每股成本
      // 更新每股成本
      if (updatedShares > 0) {
        updatedHoldingCost = ((updatedHoldingCost * (updatedShares + parseFloat(shares))) - (originalHoldingCost * parseFloat(shares))) / updatedShares;
      } else {
        updatedHoldingCost = 0;
      }

      // 计算总成本
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); 
    } 

    // ! 如果是卖出记录，之前减了，删除时就应该增加
    else if (transaction_type === 'sell') { 
      updatedAmount += parseFloat(amount); // 增加持有金额
      updatedShares += parseFloat(shares); // 增加持有份额
      // 计算总成本（卖出时每股成本不变）
      updatedTotalCost = (updatedHoldingCost * updatedShares).toFixed(2); 
    }

    // 重新计算平均净值
    if (updatedShares > 0) {
      updatedAverageNetValue = updatedAmount / updatedShares; // 计算新的平均净值
    } else {
      updatedAverageNetValue = 0;
    }

    // 3. 更新基金持有表
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_shares = ?, 
          average_net_value = ?, 
          holding_cost = ?, 
          total_cost = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount,
      updatedShares,
      updatedAverageNetValue,
      updatedHoldingCost,
      updatedTotalCost,
      fund_id
    ]);

    // 提交事务
    await connection.commit();
    return res.success({ message: '买卖记录已删除，基金持有数据已更新' });

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
  // 参数验证
  if (!fund_id || price_change_percentage === undefined || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询基金持有数据
  const [fundRecord] = await db.query('SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];
  if (parseFloat(fund.holding_shares) === 0) {
    return res.error('无持仓份额，无法计算盈亏', 400);
  }
  
  // 盈亏金额 = 盈亏率 * 持有金额
  const profit_loss = ((parseFloat(price_change_percentage) / 100) * parseFloat(fund.holding_amount));

  // 1️ `fund_daily_profit_loss`表插入数据
  const insertProfitQuery = `
    INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, profit_loss, price_change_percentage)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE profit_loss = VALUES(profit_loss), price_change_percentage = VALUES(price_change_percentage);
  `;
  await db.query(insertProfitQuery, [fund_id, userId, transaction_date, profit_loss, parseFloat(price_change_percentage)]);

  // 2️ `fund_daily_profit_loss_summary`表插入/更新数据
  const [existingSummary] = await db.query(
    'SELECT total_profit_loss FROM fund_daily_profit_loss_summary WHERE user_id = ? AND transaction_date = ?',
    [userId, transaction_date]
  );
  // 存在则更新，不存在则插入
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
  const updatedHoldingAmount = (parseFloat(fund.holding_amount) + profit_loss).toFixed(2); // 更新持有金额
  const updatedHoldingProfit = (parseFloat(fund.holding_profit) + profit_loss).toFixed(2); // 更新持有收益
  const updatedTotalProfit = (parseFloat(fund.total_profit) + profit_loss).toFixed(2); // 更新总收益

  // 计算新的持有收益率
  const newHoldingProfitRate = fund.total_cost && parseFloat(fund.total_cost) !== 0 
    ? Math.min(Math.max((updatedHoldingProfit / fund.total_cost), -9999), 9999).toFixed(4)  // 限制在 ±9999 范围内
    : 0;

  // 计算新的平均净值
  let updatedAverageNetValue = 0;
  if (parseFloat(fund.holding_shares) > 0) {
    updatedAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(4);
  }

  // 更新 `fund_holdings`
  const updateFundHoldingQuery = `
    UPDATE fund_holdings
    SET holding_amount = ?, 
        holding_profit = ?, 
        holding_profit_rate = ?,
        average_net_value = ?,
        total_profit = ?
    WHERE id = ?
  `;

  await db.query(updateFundHoldingQuery, [
    updatedHoldingAmount,
    updatedHoldingProfit,
    newHoldingProfitRate,
    updatedAverageNetValue,
    updatedTotalProfit,
    fund_id
  ]);
  return res.success({ message: '盈亏更新成功' });
}));



// 删除收益接口
router.post('/holdingShares/deleteProfitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { profit_loss_id } = req.body;
  // 参数验证
  if (!profit_loss_id) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询收益记录
  const [profitLossRecord] = await db.query('SELECT * FROM `fund_daily_profit_loss` WHERE `id` = ? AND `user_id` = ?', [profit_loss_id, userId]);
  if (profitLossRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const profitLoss = profitLossRecord[0];
  const { fund_id, transaction_date, profit_loss } = profitLoss; // 取出相关数据

  // 查询基金持有数据
  const [fundRecord] = await db.query('SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 计算新的持有金额、持有收益、持有收益率
  const updatedHoldingAmount = (parseFloat(fund.holding_amount) - profit_loss).toFixed(2);
  const updatedHoldingProfit = (parseFloat(fund.holding_profit) - profit_loss).toFixed(2);
  const newHoldingProfitRate = (fund.holding_cost * fund.holding_shares) !== 0
    ? (updatedHoldingProfit / (fund.holding_cost * fund.holding_shares)).toFixed(4)
    : 0;

  // 计算新的平均净值
  let updatedAverageNetValue = 0;
  if (parseFloat(fund.holding_shares) > 0) {
    updatedAverageNetValue = (parseFloat(updatedHoldingAmount) / parseFloat(fund.holding_shares)).toFixed(4);
  }

  // 开始数据库事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1️ 更新基金持有数据
    const updateFundHoldingQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?, 
          holding_profit = ?, 
          holding_profit_rate = ?, 
          average_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateFundHoldingQuery, [
      updatedHoldingAmount,
      updatedHoldingProfit,
      newHoldingProfitRate,
      updatedAverageNetValue,
      fund_id
    ]);

    // 2️ 更新当日收益
    const updateUserProfitQuery = `
      UPDATE fund_daily_profit_loss_summary
      SET total_profit_loss = total_profit_loss - ?
      WHERE user_id = ? AND transaction_date = ?;
    `;
    await connection.query(updateUserProfitQuery, [profit_loss, userId, transaction_date]);

    // 3️ 删除该收益记录
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
  const userId = req.auth.userId;
  const { fund_id, transaction_date } = req.body; 
  // 参数验证
  if (!fund_id || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    // 1️ 查询基金当月每日收益，并格式化日期
    const [profitLossData] = await db.query(
      `SELECT id,
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date, 
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
    console.error('基金收益列表获取失败:', error);
    return res.error('基金收益列表获取失败，请稍后重试', 500);
  }
}));


// 获取用户的月度每日收益列表
router.post('/holdingShares/userProfitList', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { transaction_date } = req.body;
  // 参数验证
  if (!transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  try {
    // 1. 查询用户当月每日总收益
    const [summaryData] = await db.query(
      `SELECT 
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date, 
        total_profit_loss 
      FROM fund_daily_profit_loss_summary 
      WHERE user_id = ? 
      AND DATE_FORMAT(transaction_date, '%Y-%m') = ? 
      ORDER BY transaction_date ASC`,
      [userId, transaction_date]
    );

    // 2. 查询每日收益的详细构成
    const [detailsData] = await db.query(
      `SELECT 
        fdpl.id,
        fdpl.transaction_date,
        DATE_FORMAT(fdpl.transaction_date, '%Y-%m-%d') AS formatted_date,
        fdpl.fund_id,
        fh.fund_name,
        fdpl.profit_loss,
        fdpl.price_change_percentage
      FROM fund_daily_profit_loss fdpl
      JOIN fund_holdings fh ON fdpl.fund_id = fh.id
      WHERE fdpl.user_id = ? 
      AND DATE_FORMAT(fdpl.transaction_date, '%Y-%m') = ? 
      ORDER BY fdpl.transaction_date ASC, fh.fund_name ASC`,
      [userId, transaction_date]
    );

    // 3. 组织返回数据结构
    const result = summaryData.map(summary => {
      const dateStr = summary.transaction_date;
      return {
        transaction_date: dateStr,
        total_profit_loss: summary.total_profit_loss,
        details: detailsData
          .filter(detail => detail.formatted_date === dateStr)
          .map(detail => ({
            id: detail.id,  // 添加 id 字段
            fund_id: detail.fund_id,
            fund_name: detail.fund_name,
            profit_loss: detail.profit_loss,
            price_change_percentage: detail.price_change_percentage
          }))
      };
    });
    return res.success(result, '用户收益列表获取成功');

  } catch (error) {
    console.error('查询用户收益列表失败:', error);
    return res.error('用户收益列表获取失败，请稍后重试', 500);
  }
}));



module.exports = router;