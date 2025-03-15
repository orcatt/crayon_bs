const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');
const { exec } = require('child_process');
const path = require('path');


// 获取股票数据的接口
router.post('/trade30', asyncHandler(async (req, res) => {
  const { stock_code, start_date, end_date } = req.body;  // 获取股票代码、开始时间和结束时间

  // 参数验证
  if (!stock_code || !start_date || !end_date) {
    return res.error('缺少必要的字段: stock_code, start_date, end_date', 400);
  }
  // 将 yyyy-mm-dd 格式转换为 yyyymmdd 格式
  const start_date_formatted = start_date.replace(/-/g, '');
  const end_date_formatted = end_date.replace(/-/g, '');

  try {
    // 调用 Python 脚本获取股票数据
    const pythonScript = path.join(__dirname, '../scripts/code_trade_30.py');  // Python 脚本路径
    exec(`python3 ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行 Python 脚本出错: ${error.message}`);
        return res.error('股票数据获取失败', 500);
      }
      if (stderr) {
        console.error(`Python 脚本错误: ${stderr}`);
        return res.error('股票数据获取失败', 500);
      }

      try {
        // 解析 Python 脚本返回的结果
        const stockData = JSON.parse(stdout.trim());  // 确保 stdout 是 JSON 格式

        // 确保 stockData 格式正确
        if (!stockData || !stockData.list) {
          return res.error('无效的股票数据', 500);
        }

        // 返回股票数据
        return res.success(stockData, '股票数据获取成功');
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        return res.error('数据解析失败', 500);
      }
    });

  } catch (error) {
    console.error(error);
    return res.error('股票数据获取失败，请稍后重试', 500);
  }
}));

// 获取股票数据的接口
router.post('/inflow5', asyncHandler(async (req, res) => {
  const { stock_code, start_date, end_date } = req.body;  // 修改参数

  // 参数验证
  if (!stock_code || !start_date || !end_date) {
    return res.error('缺少必要的字段: stock_code, start_date, end_date', 400);
  }

  // 将 yyyy-mm-dd 格式转换为 yyyymmdd 格式
  const start_date_formatted = start_date.replace(/-/g, '');
  const end_date_formatted = end_date.replace(/-/g, '');

  try {
    // 调用 Python 脚本获取股票数据
    const pythonScript = path.join(__dirname, '../scripts/code_Inflow_5.py');
    exec(`python3 ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行 Python 脚本出错: ${error.message}`);
        return res.error('股票数据获取失败', 500);
      }
      if (stderr) {
        console.error(`Python 脚本错误: ${stderr}`);
        return res.error('股票数据获取失败', 500);
      }

      try {
        const stockData = JSON.parse(stdout.trim());  // 确保 stdout 是 JSON 格式

        // 确保 stockData 格式正确
        if (!stockData || !stockData.list) {
          return res.error('无效的股票数据', 500);
        }

        // 返回股票数据
        return res.success(stockData, '股票数据获取成功');
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        return res.error('数据解析失败', 500);
      }
    });

  } catch (error) {
    console.error(error);
    return res.error('股票数据获取失败，请稍后重试', 500);
  }
}));

// 获取股票单日分钟级数据的接口
router.post('/inflowDay', asyncHandler(async (req, res) => {
  const { stock_code } = req.body;

  // 参数验证
  if (!stock_code) {
    return res.error('缺少必要的字段: stock_code', 400);
  }

  try {
    // 调用 Python 脚本获取股票数据
    const pythonScript = path.join(__dirname, '../scripts/code_Inflow_day.py');
    exec(`python3 ${pythonScript} ${stock_code}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行 Python 脚本出错: ${error.message}`);
        return res.error('股票数据获取失败', 500);
      }
      if (stderr) {
        console.error(`Python 脚本错误: ${stderr}`);
        return res.error('股票数据获取失败', 500);
      }

      try {
        const stockData = JSON.parse(stdout.trim());

        // 确保 stockData 格式正确
        if (!stockData || !stockData.list) {
          return res.error('无效的股票数据', 500);
        }

        // 返回股票数据
        return res.success(stockData, '股票数据获取成功');
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError);
        return res.error('数据解析失败', 500);
      }
    });

  } catch (error) {
    console.error(error);
    return res.error('股票数据获取失败，请稍后重试', 500);
  }
}));

module.exports = router