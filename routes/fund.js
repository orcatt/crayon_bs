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
    total_amount: 0,
    total_shares: 0,
    average_net_value: 0,
    holding_profit: 0,
    holding_profit_rate: 0,
    total_profit: 0,
    total_profit_rate: 0,
    management_fee: 0
  };

  try {
    const [result] = await db.query(
      'INSERT INTO `fund_holdings` (`user_id`, `fund_name`, `code`, `total_amount`, `total_shares`, `average_net_value`, `holding_profit`, `holding_profit_rate`, `total_profit`, `total_profit_rate`, `management_fee`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

  // 如果当前基金持有数据的总金额和总份额是 0，则说明是初始化状态
  let updatedAmount = parseFloat(fund.total_amount) || 0;  // 确保总金额是有效数字
  let updatedShares = parseFloat(fund.total_shares) || 0;   // 确保持有份额是有效数字
  let updatedAverageNetValue = parseFloat(fund.average_net_value) || 0;  // 确保平均净值是有效数字

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
    if (transaction_type === 'buy') { // 买入
      // 如果是买入操作，则累加金额和份额
      updatedAmount += parseFloat(amount); // 买入时累加金额
      updatedShares += parseFloat(shares); // 买入时累加份额

      // 计算新的平均净值
      updatedAverageNetValue = updatedAmount / updatedShares;

    } else if (transaction_type === 'sell') { // 卖出
      // 如果是卖出操作，则减少金额和份额
      if (parseFloat(shares) > updatedShares) {
        return res.error('卖出份额不能大于持有份额', 400);
      }

      updatedAmount -= parseFloat(amount); // 卖出时减少金额
      updatedShares -= parseFloat(shares); // 卖出时减少份额

      // 计算新的平均净值
      if (updatedShares > 0) {
        updatedAverageNetValue = updatedAmount / updatedShares; // 计算新的平均净值
      } else {
        updatedAverageNetValue = 0; // 如果份额为 0，平均净值设置为 0
      }
    }

    // 更新基金持有表
    const updateQuery = `
      UPDATE fund_holdings
      SET total_amount = ?, total_shares = ?, average_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [updatedAmount, updatedShares, updatedAverageNetValue, fund_id]);

    // 提交事务
    await connection.commit();

    return res.success({ message: '买入/卖出成功' });

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
    let updatedAmount = parseFloat(fund.total_amount) || 0;  // 确保总金额是有效数字
    let updatedShares = parseFloat(fund.total_shares) || 0;   // 确保持有份额是有效数字
    let updatedAverageNetValue = parseFloat(fund.average_net_value) || 0;  // 确保平均净值是有效数字

    if (transaction_type === 'buy') { // 如果是买入记录，删除时减少金额和份额
      updatedAmount -= parseFloat(amount); // 减少金额
      updatedShares -= parseFloat(shares); // 减少份额
    } else if (transaction_type === 'sell') { // 如果是卖出记录，删除时增加金额和份额
      updatedAmount += parseFloat(amount); // 增加金额
      updatedShares += parseFloat(shares); // 增加份额
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
      SET total_amount = ?, total_shares = ?, average_net_value = ?
      WHERE id = ?
    `;
    await connection.query(updateQuery, [updatedAmount, updatedShares, updatedAverageNetValue, fund_id]);

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


module.exports = router;