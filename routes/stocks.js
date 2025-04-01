const express = require('express');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');
const { exec } = require('child_process');
const path = require('path');


// 获取股票K线数据-多日
router.post('/tradeList', asyncHandler(async (req, res) => {
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
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/abandoned/code_trade_30.py');  // Python 脚本路径
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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


// 获取股票 K 线数据-计算 (计算 MA5, MA10, MA20、波动率、MACD、KDJ、BOLL)
router.post('/tradeCalculate', asyncHandler(async (req, res) => {
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
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/trade_90_calculate.py');  // Python 脚本路径
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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


// 获取股票 K 线数据-相关性(计算 Alpha（超额收益）、相关性、RSI（相对强弱指数）)
router.post('/tradeRelevance', asyncHandler(async (req, res) => {
  const { stock_code, index_code, start_date, end_date } = req.body;

  // 参数验证
  if (!stock_code || !index_code || !start_date || !end_date) {
    return res.error('缺少必要的字段: stock_code, index_code, start_date, end_date', 400);
  }

  // 将 yyyy-mm-dd 格式转换为 yyyymmdd 格式
  const start_date_formatted = start_date.replace(/-/g, '');
  const end_date_formatted = end_date.replace(/-/g, '');

  try {
    // 调用 Python 脚本获取股票数据
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');
    const pythonScript = path.join(__dirname, '../scripts/trade_90_relevance.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${index_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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

// 获取流入记录-多日 ( 5 日数据直接交由大模型)
router.post('/inflowDayList', asyncHandler(async (req, res) => {
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
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/abandoned/code_Inflow_day.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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

// 获取流入记录-多日计算 
router.post('/inflowDayCalculate', asyncHandler(async (req, res) => {
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
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/inflow_day_data.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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

// 获取流入记录-单日分钟 原始数据
router.post('/inflowMinuteList', asyncHandler(async (req, res) => {
  const { stock_code } = req.body;

  // 参数验证
  if (!stock_code) {
    return res.error('缺少必要的字段: stock_code', 400);
  }

  try {
    // 调用 Python 脚本获取股票数据
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/abandoned/code_Inflow_minute.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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


// 计算流入记录-单日计算（超大单流向、主力流向、资金流入波动性）
router.post('/inflowMinuteCalculate', asyncHandler(async (req, res) => {
  const { stock_code } = req.body;

  // 参数验证
  if (!stock_code) {
    return res.error('缺少必要的字段: stock_code', 400);
  }

  try {
    // 调用 Python 脚本获取股票数据
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');  // 确保使用虚拟环境中的 Python
    const pythonScript = path.join(__dirname, '../scripts/inflow_minute_calculate.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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

// 获取股票支撑阻力位数据
router.post('/supportResistance', asyncHandler(async (req, res) => {
  const { stock_code, start_date, end_date } = req.body;

  // 参数验证
  if (!stock_code || !start_date || !end_date) {
    return res.error('缺少必要的字段: stock_code, start_date, end_date', 400);
  }

  // 将 yyyy-mm-dd 格式转换为 yyyymmdd 格式
  const start_date_formatted = start_date.replace(/-/g, '');
  const end_date_formatted = end_date.replace(/-/g, '');

  try {
    // 调用 Python 脚本获取股票数据
    const pythonExecutable = path.join(__dirname, '../venv/bin/python');
    const pythonScript = path.join(__dirname, '../scripts/support_resistance.py');
    exec(`${pythonExecutable} ${pythonScript} ${stock_code} ${start_date_formatted} ${end_date_formatted}`, (error, stdout, stderr) => {
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
        const output = stdout.trim();
        
        // 检查输出中是否包含证券代码错误的信息
        if (output.includes('证券代码') && output.includes('可能有误')) {
          return res.error('无效的证券代码', 500);
        }
        
        const stockData = JSON.parse(output);  // 确保 stdout 是 JSON 格式

        // 检查是否有错误信息
        if (stockData.error) {
          return res.error(stockData.error, 500);
        }

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