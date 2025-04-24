const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');

// ? --------------------- 基金列表相关 ---------------------

// 基金列表
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
        holding_cost,
        holding_profit,
        holding_profit_rate,
        sell_profit,
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
        profit_loss, current_net_value 
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
    current_net_value: 0,
    holding_profit: 0,
    holding_profit_rate: 0,
    total_profit: 0,
    total_cost: 0,
    management_fee: 0
  };

  try {
    const [result] = await db.query(
      'INSERT INTO `fund_holdings` (`user_id`, `fund_name`, `code`, `index_code`, `holding_amount`, `holding_shares`, `current_net_value`, `holding_profit`, `holding_profit_rate`, `total_profit`, `total_cost`, `management_fee`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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


// ? --------------------- 买入卖出相关 ---------------------

// 买入卖出
router.post('/holdingTransactions/buysell', asyncHandler(async (req, res) => {
  const { fund_id, transaction_type, amount, shares, net_value, transaction_date } = req.body;
  const userId = req.auth.userId;

  // 参数验证
  if (!fund_id || !transaction_type || !amount || !shares || !net_value || !transaction_date) {
    return res.error('缺少必要的参数', 400);
  }

  // 校验 amount = net_value * shares
  const expectedAmount = (parseFloat(shares) * parseFloat(net_value)).toFixed(2);
  if (Math.abs(parseFloat(amount) - expectedAmount) > 0.01) {
    return res.error('金额与净值和份额不匹配', 400);
  }

  // 查找基金持有记录并鉴权
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 当前持有的字段
  let updatedShares = parseFloat(fund.holding_shares) || 0;
  let updatedAmount = parseFloat(fund.holding_amount) || 0;
  let updatedTotalCost = parseFloat(fund.total_cost) || 0;
  let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;
  let updatedHoldingProfit = parseFloat(fund.holding_profit) || 0;
  let updatedTotalProfit = parseFloat(fund.total_profit) || 0;
  let updatedHoldingProfitRate = parseFloat(fund.holding_profit_rate) || 0;
  let updatedSellProfit = parseFloat(fund.sell_profit) || 0;
  // let updatedCurrentNetValue = parseFloat(fund.current_net_value) || 0;

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 插入买入/卖出记录
    const insertQuery = `
      INSERT INTO fund_transactions (user_id, fund_id, transaction_type, shares, net_value, amount, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await connection.query(insertQuery, [userId, fund_id, transaction_type, shares, net_value, amount, transaction_date]);

    // 2. 处理买入和卖出
    if (transaction_type === 'buy') {
      // 1. 持有份额 = 原份额 + 新份额
      updatedShares += parseFloat(shares);

      // 2. 持有金额 = 原持有金额 + 新买入金额（暂时性）
      updatedAmount += parseFloat(amount);

      // 3. 总成本 = 原总成本 + 新买入金额
      updatedTotalCost += parseFloat(amount);

      // 4. 持有成本 = (原持有成本 * 原份额 + 新买入净值 * 新份额) / (原份额 + 新份额)
      updatedHoldingCost =
        ((updatedHoldingCost * (updatedShares - parseFloat(shares))) +
          (parseFloat(net_value) * parseFloat(shares))) /
        updatedShares;

      // 5. 卖出收益（保持不变）
      // updatedSellProfit = updatedSellProfit（无需更新）

      // 6. 总收益（保持不变）
      // updatedTotalProfit = updatedTotalProfit（无需更新）

      // 7. 持有收益（保持不变）
      // updatedHoldingProfit = updatedHoldingProfit（无需更新）

      // 8. 持有收益率 = 持有收益 / 总成本（补仓后更新）
      updatedHoldingProfitRate = updatedTotalCost > 0 ? (updatedHoldingProfit / updatedTotalCost).toFixed(4) : 0;

      // 9. 现价（保持不变）
      // updatedCurrentNetValue = updatedCurrentNetValue（无需更新）

 
    } else if (transaction_type === 'sell') {
      // 1. 校验卖出份额
      if (parseFloat(shares) > updatedShares) {
        throw new Error('卖出份额不能大于持有份额');
      }

      // 1. 持有份额 = 原份额 - 卖出份额
      updatedShares -= parseFloat(shares);

      // 2. 持有金额 = 原持有金额 - 卖出金额
      updatedAmount -= parseFloat(amount);

      // 3. 总成本 = 原总成本 - (持有成本 * 卖出份额)
      // updatedTotalCost -= (updatedHoldingCost * parseFloat(shares)).toFixed(2);
      // 3. 总成本 = 原总成本 - 卖出金额
      updatedTotalCost -= parseFloat(amount);

      // 4. 持有成本（保持不变）
      // updatedHoldingCost = updatedHoldingCost（无需更新）
      // updatedHoldingCost = updatedShares > 0 ? (updatedTotalCost / updatedShares).toFixed(4) : 0;

      // 5. 卖出收益 = (卖出净值 - 持有成本) * 卖出份额
      const sellProfit = ((parseFloat(net_value) - updatedHoldingCost) * parseFloat(shares)).toFixed(2);
      updatedSellProfit += parseFloat(sellProfit);
      
      // 6. 总收益 = 原总收益 + 卖出收益
      updatedTotalProfit += parseFloat(sellProfit);

      // 7. 持有收益（保持不变）
      // updatedHoldingProfit = updatedHoldingProfit

      // 8. 持有收益率（保持不变）
      // updatedHoldingProfitRate = updatedHoldingProfitRate

      // 9. 现价（保持不变）
      // updatedCurrentNetValue = updatedCurrentNetValue（无需更新）

      // 处理清仓情况
      if (updatedShares <= 0) {
        updatedAmount = 0;
        updatedTotalCost = 0;
        updatedHoldingCost = 0;
        updatedHoldingProfit = 0;
        updatedHoldingProfitRate = 0;
      }
    }

    // 3. 更新 fund_holdings
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?,
          holding_shares = ?,
          total_cost = ?,
          holding_cost = ?,
          holding_profit = ?,
          total_profit = ?,
          holding_profit_rate = ?,
          sell_profit = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount,
      updatedShares,
      updatedTotalCost,
      updatedHoldingCost,
      updatedHoldingProfit,
      updatedTotalProfit,
      updatedHoldingProfitRate,
      updatedSellProfit,
      fund_id,
    ]);

    // 提交事务
    await connection.commit();
    return res.success({ message: '买入卖出成功' });
  } catch (error) {
    await connection.rollback();
    console.error('买入卖出操作失败:', error);
    return res.error(error.message || '操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// 批量买入卖出
router.post('/holdingTransactions/batch', asyncHandler(async (req, res) => {
  const transactions = req.body; // 交易数组
  const userId = req.auth.userId;
  
  // 参数验证
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.error('请提供有效的交易数据数组', 400);
  }

  // 开启事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 存储所有处理结果
    const results = [];

    // 遍历处理每个交易
    for (const transaction of transactions) {
      const { fund_id, transaction_type, shares, net_value, transaction_date, amount } = transaction;

      // 单条交易参数验证
      if (!fund_id || !transaction_type || !shares || !net_value || !transaction_date) {
        await connection.rollback();
        return res.error('缺少必要的参数', 400);
      }
      // 校验 amount = net_value * shares
      const expectedAmount = (parseFloat(shares) * parseFloat(net_value)).toFixed(2);
      if (Math.abs(parseFloat(amount) - expectedAmount) > 0.01) {
        return res.error('金额与净值和份额不匹配', 400);
      }

      // 验证基金所属权
      const [fundRecord] = await connection.query(
        'SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?',
        [fund_id, userId]
      );
      if (fundRecord.length === 0) {
        await connection.rollback();
        return res.error(`基金ID ${fund_id} 不存在或无权操作`, 403);
      }
      const fund = fundRecord[0];
      
      // 当前持有的字段
      let updatedShares = parseFloat(fund.holding_shares) || 0;
      let updatedAmount = parseFloat(fund.holding_amount) || 0;
      let updatedTotalCost = parseFloat(fund.total_cost) || 0;
      let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;
      let updatedHoldingProfit = parseFloat(fund.holding_profit) || 0;
      let updatedTotalProfit = parseFloat(fund.total_profit) || 0;
      let updatedHoldingProfitRate = parseFloat(fund.holding_profit_rate) || 0;
      let updatedSellProfit = parseFloat(fund.sell_profit) || 0;
      // let updatedCurrentNetValue = parseFloat(fund.current_net_value) || 0;

      // 根据交易类型更新基金持仓
      if (transaction_type === 'buy') {
        // 1. 持有份额 = 原份额 + 新份额
        updatedShares += parseFloat(shares);

        // 2. 持有金额 = 原持有金额 + 新买入金额（暂时性）
        updatedAmount += parseFloat(amount);

        // 3. 总成本 = 原总成本 + 新买入金额
        updatedTotalCost += parseFloat(amount);

        // 4. 持有成本 = (原持有成本 * 原份额 + 新买入净值 * 新份额) / (原份额 + 新份额)
        updatedHoldingCost =
          ((updatedHoldingCost * (updatedShares - parseFloat(shares))) +
            (parseFloat(net_value) * parseFloat(shares))) /
          updatedShares;
        
        // 5. 卖出收益（保持不变）
        // updatedSellProfit = updatedSellProfit（无需更新）

        // 6. 总收益（保持不变）
        // updatedTotalProfit = updatedTotalProfit（无需更新）

        // 7. 持有收益（保持不变）
        // updatedHoldingProfit = updatedHoldingProfit（无需更新）

        // 8. 持有收益率 = 持有收益 / 总成本（补仓后更新）
        updatedHoldingProfitRate = updatedTotalCost > 0 ? (updatedHoldingProfit / updatedTotalCost).toFixed(4) : 0;

        // 9. 现价（保持不变）
        // updatedCurrentNetValue = updatedCurrentNetValue（无需更新）

      

      } else if (transaction_type === 'sell') {
        // 验证是否有足够的份额卖出
        if (parseFloat(fund.holding_shares) < parseFloat(shares)) {
          await connection.rollback();
          return res.error(`基金ID ${fund_id} 的持有份额不足`, 400);
        }

        
        // 1. 持有份额 = 原份额 - 卖出份额
        updatedShares -= parseFloat(shares);

        // 2. 持有金额 = 原持有金额 - 卖出金额
        updatedAmount -= parseFloat(amount);

        // 3. 总成本 = 原总成本 - (持有成本 * 卖出份额)
        // updatedTotalCost -= (updatedHoldingCost * parseFloat(shares)).toFixed(2);
        // 3. 总成本 = 原总成本 - 卖出金额
        updatedTotalCost -= parseFloat(amount);

        // 4. 持有成本（保持不变）
        // updatedHoldingCost = updatedHoldingCost（无需更新）
        // updatedHoldingCost = updatedShares > 0 ? (updatedTotalCost / updatedShares).toFixed(4) : 0;

        // 5. 卖出收益 = (卖出净值 - 持有成本) * 卖出份额
        const sellProfit = ((parseFloat(net_value) - updatedHoldingCost) * parseFloat(shares)).toFixed(2);
        updatedSellProfit += parseFloat(sellProfit);
        
        // 6. 总收益 = 原总收益 + 卖出收益
        updatedTotalProfit += parseFloat(sellProfit);

        // 7. 持有收益（保持不变）
        // updatedHoldingProfit = updatedHoldingProfit

        // 8. 持有收益率（保持不变）
        // updatedHoldingProfitRate = updatedHoldingProfitRate

        // 9. 现价（保持不变）
        // updatedCurrentNetValue = updatedCurrentNetValue（无需更新）

        // 处理清仓情况
        if (updatedShares <= 0) {
          updatedAmount = 0;
          updatedTotalCost = 0;
          updatedHoldingCost = 0;
          updatedHoldingProfit = 0;
          updatedHoldingProfitRate = 0;
        }
        
      }
      // 更新基金持仓
      await connection.query(
        `UPDATE fund_holdings 
        SET holding_shares = ?,
            holding_amount = ?,
            holding_cost = ?,
            total_cost = ?,
            holding_profit = ?,
            total_profit = ?,
            holding_profit_rate = ?,
            sell_profit = ?
        WHERE id = ?`,
        [updatedShares, updatedAmount, updatedHoldingCost, updatedTotalCost, updatedHoldingProfit, updatedTotalProfit, updatedHoldingProfitRate, updatedSellProfit, fund_id]
      );
      // 插入买入/卖出记录
      const [result] = await connection.query(
        `INSERT INTO fund_transactions 
        (fund_id, user_id, transaction_type, shares, net_value, amount, transaction_date) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fund_id, userId, transaction_type, shares, net_value, amount, transaction_date]
      );

      results.push({
        fund_id,
        transaction_id: result.insertId,
        status: 'success'
      });
    }

    await connection.commit();
    return res.success({
      results,
      message: '批量交易处理成功'
    });

  } catch (error) {
    await connection.rollback();
    console.error('批量交易处理失败:', error);
    return res.error(error.message || '批量交易处理失败', 500);
  } finally {
    connection.release();
  }
}));


// 查询某个基金的买入卖出数据列表
router.post('/holdingTransactions/list', asyncHandler(async (req, res) => {
  const { fund_id, start_date, end_date } = req.body;  // 修改为开始和结束日期
  const userId = req.auth.userId;

  // 参数验证
  if (!fund_id || !start_date || !end_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 验证日期格式
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
    return res.error('日期格式错误，请使用 YYYY-MM-DD 格式', 400);
  }

  // 查找基金持有记录，验证该基金是否属于当前用户
  const [fundRecord] = await db.query('SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?', [fund_id, userId]);
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }

  try {
    // 查询指定日期区间的买入卖出记录
    const [rows] = await db.query(
      `SELECT 
        id,
        fund_id,
        transaction_type,
        shares,
        net_value,
        amount,
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
        created_at
      FROM fund_transactions 
      WHERE fund_id = ? 
      AND user_id = ?
      AND transaction_date >= ? 
      AND transaction_date <= ?
      ORDER BY transaction_date DESC, created_at DESC`,
      [fund_id, userId, start_date, end_date]
    );

    // 如果无数据，返回空数组
    if (rows.length === 0) {
      return res.success([], '未找到该时间区间的买入卖出记录');
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
  const [transactionRecord] = await db.query(
    'SELECT * FROM fund_transactions WHERE id = ? AND user_id = ?',
    [transaction_id, userId]
  );
  if (transactionRecord.length === 0) {
    return res.error('未找到此用户的买卖记录', 404);
  }
  const transaction = transactionRecord[0];
  const { fund_id, shares, amount, net_value, transaction_type } = transaction;

  // 查找基金持有记录并鉴权
  const [fundRecord] = await db.query(
    'SELECT * FROM fund_holdings WHERE id = ? AND user_id = ?',
    [fund_id, userId]
  );
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 当前持有的字段
  let updatedShares = parseFloat(fund.holding_shares) || 0;
  let updatedAmount = parseFloat(fund.holding_amount) || 0;
  let updatedTotalCost = parseFloat(fund.total_cost) || 0;
  let updatedHoldingCost = parseFloat(fund.holding_cost) || 0;
  let updatedHoldingProfit = parseFloat(fund.holding_profit) || 0;
  let updatedTotalProfit = parseFloat(fund.total_profit) || 0;
  let updatedHoldingProfitRate = parseFloat(fund.holding_profit_rate) || 0;
  let updatedSellProfit = parseFloat(fund.sell_profit) || 0;

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 删除买入/卖出记录
    const deleteQuery = 'DELETE FROM fund_transactions WHERE id = ?';
    await connection.query(deleteQuery, [transaction_id]);

    // 2. 根据交易类型回退基金持有数据
    if (transaction_type === 'buy') {
      // 回退买入：反向执行买入逻辑
      // 校验：确保可减少份额
      if (parseFloat(shares) > updatedShares) {
        throw new Error('删除买入记录失败：持有份额不足');
      }

      // 1. 持有份额 = 原份额 - 买入份额
      updatedShares -= parseFloat(shares);

      // 2. 持有金额 = 原持有金额 - 买入金额
      updatedAmount -= parseFloat(amount);

      // 3. 总成本 = 原总成本 - 买入金额
      updatedTotalCost -= parseFloat(amount);

      // 4. 持有成本 = 总成本 / 剩余份额
      updatedHoldingCost = updatedShares > 0 ? (updatedTotalCost / updatedShares).toFixed(4) : 0;

      // 5. 卖出收益（保持不变）
      // updatedSellProfit = updatedSellProfit

      // 6. 总收益（保持不变）
      // updatedTotalProfit = updatedTotalProfit

      // 7. 持有收益（保持不变）
      // updatedHoldingProfit = updatedHoldingProfit

      // 8. 持有收益率 = 持有收益 / 总成本
      updatedHoldingProfitRate = updatedTotalCost > 0 ? (updatedHoldingProfit / updatedTotalCost).toFixed(4) : 0;

    } else if (transaction_type === 'sell') {
      // 回退卖出：反向执行卖出逻辑
      // 1. 持有份额 = 原份额 + 卖出份额
      updatedShares += parseFloat(shares);

      // 2. 持有金额 = 原持有金额 + 卖出金额
      updatedAmount += parseFloat(amount);

      // 3. 总成本 = 原总成本 + 卖出金额
      updatedTotalCost += parseFloat(amount);

      // 4. 持有成本 = 总成本 / 剩余份额
      // updatedHoldingCost = updatedHoldingCost 
      // updatedHoldingCost = updatedShares > 0 ? (updatedTotalCost / updatedShares).toFixed(4) : 0;

      // 5. 卖出收益 = 回退卖出收益
      const sellProfit = ((parseFloat(net_value) - updatedHoldingCost) * parseFloat(shares)).toFixed(4);
      updatedSellProfit -= parseFloat(sellProfit);

      // 6. 总收益 = 原总收益 - 卖出收益
      updatedTotalProfit -= parseFloat(sellProfit);
    }

    // 3. 清仓检查
    if (updatedShares <= 0) {
      updatedAmount = 0;
      updatedTotalCost = 0;
      updatedHoldingCost = 0;
      updatedHoldingProfit = 0;
      updatedHoldingProfitRate = 0;
      // 注意：updatedSellProfit 和 updatedTotalProfit 不清零，保留历史卖出收益
    }

    // 4. 更新基金持有表
    const updateQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?,
          holding_shares = ?,
          total_cost = ?,
          holding_cost = ?,
          holding_profit = ?,
          total_profit = ?,
          holding_profit_rate = ?,
          sell_profit = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      updatedAmount,
      updatedShares,
      updatedTotalCost,
      updatedHoldingCost,
      updatedHoldingProfit,
      updatedTotalProfit,
      updatedHoldingProfitRate,
      updatedSellProfit,
      fund_id,
    ]);

    // 提交事务
    await connection.commit();
    return res.success({ message: '买卖记录已删除，基金持有数据已更新' });
  } catch (error) {
    await connection.rollback();
    console.error('删除买入卖出记录操作失败:', error);
    return res.error(error.message || '操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// ? --------------------- 盈亏相关 ---------------------

// 更新盈亏
router.post('/holdingShares/profitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { fund_id, current_net_value, transaction_date } = req.body;

  // 参数验证
  if (!fund_id || current_net_value === undefined || !transaction_date) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询基金持有数据
  const [fundRecord] = await db.query(
    'SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?',
    [fund_id, userId]
  );
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 校验持仓份额
  if (parseFloat(fund.holding_shares) === 0) {
    return res.error('无持仓份额，无法计算盈亏', 400);
  }

  // 开始事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 计算新的持有数据
    const newHoldingAmount = (parseFloat(current_net_value) * parseFloat(fund.holding_shares)).toFixed(2);
    const newHoldingProfit = (parseFloat(newHoldingAmount) - parseFloat(fund.total_cost)).toFixed(2);
    const newTotalProfit = (parseFloat(newHoldingProfit) + parseFloat(fund.sell_profit)).toFixed(2);
    const newHoldingProfitRate =
      parseFloat(fund.total_cost) > 0
        ? Math.min(Math.max(newHoldingProfit / parseFloat(fund.total_cost), -9999), 9999).toFixed(4)
        : 0;

    // 计算盈亏金额（与前一天的 holding_profit 相比）
    const profitLoss = (parseFloat(newHoldingProfit) - parseFloat(fund.holding_profit)).toFixed(2);

    // 1. 更新 fund_holdings
    const updateFundHoldingQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?,
          holding_profit = ?,
          total_profit = ?,
          holding_profit_rate = ?,
          current_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateFundHoldingQuery, [
      newHoldingAmount,
      newHoldingProfit,
      newTotalProfit,
      newHoldingProfitRate,
      parseFloat(current_net_value).toFixed(4),
      fund_id,
    ]);

    // 2. 插入/更新 fund_daily_profit_loss
    const insertProfitQuery = `
      INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, current_net_value, profit_loss)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE current_net_value = VALUES(current_net_value), profit_loss = VALUES(profit_loss)
    `;
    await connection.query(insertProfitQuery, [
      fund_id,
      userId,
      transaction_date,
      parseFloat(current_net_value).toFixed(4),
      profitLoss,
    ]);

    // 3. 更新 fund_daily_profit_loss_summary
    const [existingSummary] = await connection.query(
      'SELECT total_profit_loss FROM fund_daily_profit_loss_summary WHERE user_id = ? AND transaction_date = ?',
      [userId, transaction_date]
    );

    if (existingSummary.length > 0) {
      // 更新现有记录
      const updateSummaryQuery = `
        UPDATE fund_daily_profit_loss_summary
        SET total_profit_loss = total_profit_loss + ?
        WHERE user_id = ? AND transaction_date = ?
      `;
      await connection.query(updateSummaryQuery, [profitLoss, userId, transaction_date]);
    } else {
      // 插入新记录
      const insertSummaryQuery = `
        INSERT INTO fund_daily_profit_loss_summary (user_id, transaction_date, total_profit_loss)
        VALUES (?, ?, ?)
      `;
      await connection.query(insertSummaryQuery, [userId, transaction_date, profitLoss]);
    }

    // 提交事务
    await connection.commit();
    return res.success({ message: '盈亏更新成功' });
  } catch (error) {
    await connection.rollback();
    console.error('更新盈亏操作失败:', error);
    return res.error(error.message || '操作失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));



// 批量更新盈亏
router.post('/holdingShares/batchProfitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const profitLossList = req.body; // 盈亏数据数组
  
  // 参数验证
  if (!Array.isArray(profitLossList) || profitLossList.length === 0) {
    return res.error('请提供有效的盈亏数据数组', 400);
  }

  // 开启事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 存储所有处理结果
    const results = [];

    // 遍历处理每个盈亏更新
    for (const item of profitLossList) {
      const { fund_id, current_net_value, transaction_date } = item;

      // 单条数据参数验证
      if (!fund_id || current_net_value === undefined || !transaction_date) {
        await connection.rollback();
        return res.error('缺少必要的字段', 400);
      }

      // 查询基金持有数据
      const [fundRecord] = await connection.query(
        'SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?',
        [fund_id, userId]
      );
      if (fundRecord.length === 0) {
        await connection.rollback();
        return res.error(`基金ID ${fund_id} 不存在或无权操作`, 403);
      }
      const fund = fundRecord[0];

      // 校验持仓份额
      if (parseFloat(fund.holding_shares) === 0) {
        await connection.rollback();
        return res.error(`基金ID ${fund_id} 无持仓份额，无法计算盈亏`, 400);
      }

      // 计算新的持有数据
      const newHoldingAmount = (parseFloat(current_net_value) * parseFloat(fund.holding_shares)).toFixed(2);
      const newHoldingProfit = (parseFloat(newHoldingAmount) - parseFloat(fund.total_cost)).toFixed(2);
      const newTotalProfit = (parseFloat(newHoldingProfit) + parseFloat(fund.sell_profit)).toFixed(2);
      const newHoldingProfitRate =
        parseFloat(fund.total_cost) > 0
          ? Math.min(Math.max(newHoldingProfit / parseFloat(fund.total_cost), -9999), 9999).toFixed(4)
          : 0;

      // 计算盈亏金额（与前一天的 holding_profit 相比）
      const profitLoss = (parseFloat(newHoldingProfit) - parseFloat(fund.holding_profit)).toFixed(2);

      // 1. 更新 fund_holdings
      await connection.query(
        `UPDATE fund_holdings
        SET holding_amount = ?,
            holding_profit = ?,
            total_profit = ?,
            holding_profit_rate = ?,
            current_net_value = ?
        WHERE id = ?`,
        [
          newHoldingAmount,
          newHoldingProfit,
          newTotalProfit,
          newHoldingProfitRate,
          parseFloat(current_net_value).toFixed(4),
          fund_id,
        ]
      );

      // 2. 插入/更新 fund_daily_profit_loss
      await connection.query(
        `INSERT INTO fund_daily_profit_loss (fund_id, user_id, transaction_date, current_net_value, profit_loss)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE current_net_value = VALUES(current_net_value), profit_loss = VALUES(profit_loss)`,
        [
          fund_id,
          userId,
          transaction_date,
          parseFloat(current_net_value).toFixed(4),
          profitLoss,
        ]
      );

      // 3. 更新 fund_daily_profit_loss_summary
      const [existingSummary] = await connection.query(
        'SELECT total_profit_loss FROM fund_daily_profit_loss_summary WHERE user_id = ? AND transaction_date = ?',
        [userId, transaction_date]
      );

      if (existingSummary.length > 0) {
        // 更新现有记录
        await connection.query(
          `UPDATE fund_daily_profit_loss_summary
          SET total_profit_loss = total_profit_loss + ?
          WHERE user_id = ? AND transaction_date = ?`,
          [profitLoss, userId, transaction_date]
        );
      } else {
        // 插入新记录
        await connection.query(
          `INSERT INTO fund_daily_profit_loss_summary (user_id, transaction_date, total_profit_loss)
          VALUES (?, ?, ?)`,
          [userId, transaction_date, profitLoss]
        );
      }

      results.push({
        fund_id,
        status: 'success',
        profit_loss: profitLoss
      });
    }

    await connection.commit();
    return res.success({
      results,
      message: '批量盈亏更新成功'
    });

  } catch (error) {
    await connection.rollback();
    console.error('批量更新盈亏操作失败:', error);
    return res.error(error.message || '批量更新盈亏失败，请稍后重试', 500);
  } finally {
    connection.release();
  }
}));


// 删除盈亏记录
router.post('/holdingShares/deleteProfitLoss', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { profit_loss_id } = req.body;

  // 参数验证
  if (!profit_loss_id) {
    return res.error('缺少必要的字段', 400);
  }

  // 查询收益记录
  const [profitLossRecord] = await db.query(
    'SELECT * FROM `fund_daily_profit_loss` WHERE `id` = ? AND `user_id` = ?',
    [profit_loss_id, userId]
  );
  if (profitLossRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const profitLoss = profitLossRecord[0];
  const { fund_id, transaction_date, profit_loss } = profitLoss;

  // 查询基金持有数据
  const [fundRecord] = await db.query(
    'SELECT * FROM `fund_holdings` WHERE `id` = ? AND `user_id` = ?',
    [fund_id, userId]
  );
  if (fundRecord.length === 0) {
    return res.error('记录不存在或无权操作', 403);
  }
  const fund = fundRecord[0];

  // 校验持仓份额
  if (parseFloat(fund.holding_shares) === 0) {
    return res.error('无持仓份额，无法删除盈亏记录', 400);
  }

  // 查询前一天的 fund_daily_profit_loss 记录以获取最新的 current_net_value
  const [prevRecord] = await db.query(
    'SELECT current_net_value, profit_loss FROM fund_daily_profit_loss ' +
    'WHERE fund_id = ? AND transaction_date < ? AND user_id = ? ' +
    'ORDER BY transaction_date DESC LIMIT 1',
    [fund_id, transaction_date, userId]
  );

  // 开始数据库事务
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 计算回退后的持有数据
    // 1. 持有收益：撤销 profit_loss 的影响
    const updatedHoldingProfit = (parseFloat(fund.holding_profit) - parseFloat(profit_loss)).toFixed(2);

    // 2. 持有金额和现价：基于前一天的 current_net_value
    let updatedHoldingAmount;
    let updatedCurrentNetValue;
    if (prevRecord.length > 0) {
      // 使用前一天的净值
      updatedCurrentNetValue = parseFloat(prevRecord[0].current_net_value).toFixed(4);
      updatedHoldingAmount = (parseFloat(updatedCurrentNetValue) * parseFloat(fund.holding_shares)).toFixed(2);
    } else {
      // 无前一天记录，回退到持有成本（假设初始状态）
      updatedCurrentNetValue = parseFloat(fund.holding_cost).toFixed(4);
      updatedHoldingAmount = (parseFloat(updatedCurrentNetValue) * parseFloat(fund.holding_shares)).toFixed(2);
    }

    // 3. 总收益：total_profit = holding_profit + sell_profit
    const updatedTotalProfit = (parseFloat(updatedHoldingProfit) + parseFloat(fund.sell_profit)).toFixed(2);

    // 4. 持有收益率：holding_profit / total_cost
    const updatedHoldingProfitRate =
      parseFloat(fund.total_cost) > 0
        ? Math.min(Math.max(updatedHoldingProfit / parseFloat(fund.total_cost), -9999), 9999).toFixed(4)
        : 0;

    // 1. 更新 fund_holdings
    const updateFundHoldingQuery = `
      UPDATE fund_holdings
      SET holding_amount = ?,
          holding_profit = ?,
          total_profit = ?,
          holding_profit_rate = ?,
          current_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateFundHoldingQuery, [
      updatedHoldingAmount,
      updatedHoldingProfit,
      updatedTotalProfit,
      updatedHoldingProfitRate,
      updatedCurrentNetValue,
      fund_id,
    ]);

    // 2. 更新 fund_daily_profit_loss_summary
    const updateSummaryQuery = `
      UPDATE fund_daily_profit_loss_summary
      SET total_profit_loss = total_profit_loss - ?
      WHERE user_id = ? AND transaction_date = ?
    `;
    await connection.query(updateSummaryQuery, [profit_loss, userId, transaction_date]);

    // 3. 删除 fund_daily_profit_loss 记录
    const deleteProfitLossQuery = `DELETE FROM fund_daily_profit_loss WHERE id = ?`;
    await connection.query(deleteProfitLossQuery, [profit_loss_id]);

    // 4. 检查 fund_daily_profit_loss_summary 是否需要删除
    const [remainingProfits] = await connection.query(
      'SELECT COUNT(*) as count FROM fund_daily_profit_loss WHERE user_id = ? AND transaction_date = ?',
      [userId, transaction_date]
    );
    if (remainingProfits[0].count === 0) {
      const deleteSummaryQuery = `
        DELETE FROM fund_daily_profit_loss_summary
        WHERE user_id = ? AND transaction_date = ?
      `;
      await connection.query(deleteSummaryQuery, [userId, transaction_date]);
    }

    // 提交事务
    await connection.commit();
    return res.success({ message: '收益删除成功，数据已更新' });
  } catch (error) {
    await connection.rollback();
    console.error('删除收益操作失败:', error);
    return res.error(error.message , 500);
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
        current_net_value 
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
        fdpl.current_net_value
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
            current_net_value: detail.current_net_value
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