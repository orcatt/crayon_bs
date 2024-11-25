const express = require('express');
const bcrypt = require('bcryptjs');  // 用于加密密码
const jwt = require('jsonwebtoken');
const { secretKey } = require('../config/config');
const router = express.Router();
const db = require('../config/db');  // 引入数据库连接
const { asyncHandler } = require('../middleware/errorHandler');
const axios = require('axios');  // 添加这行


// 用户注册接口
router.post('/register', asyncHandler(async (req, res) => {
  const { phone, password, openid } = req.body;

  if (!phone || !password) {
    return res.error('手机号和密码不能为空', 400);
  }

  const [rows] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
  
  if (rows && rows.length > 0) {
    return res.error('手机号已注册', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (phone, password, openid) VALUES (?, ?, ?)',
    [phone, hashedPassword, openid || null]
  );

  return res.success({
    phone: phone,
    openid: openid || null 
  }, '注册成功', 200);
}));



// 用户登录接口
router.post('/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  
  const [rows] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
  
  if (!rows || rows.length === 0) {
    return res.error('手机号或密码错误', 401);
  }

  const user = rows[0];
  const isValidPassword = await bcrypt.compare(password, user.password);
  
  if (!isValidPassword) {
    return res.error('手机号或密码错误', 401);
  }

  const token = jwt.sign(
    { userId: user.id, phone: user.phone },
    secretKey,
    { expiresIn: '24h' }
  );

  return res.success({
    token,
    userInfo: user
  }, '登录成功');
}));

// 微信小程序 AppID 和 AppSecret
const { APPID, APPSECRET } = require('../config/config'); 
// 微信登录接口
router.post('/wechat-login', asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.error('Code 不能为空', 400);
  }

  // 向微信服务器请求 openid 和 session_key
  const wechatURL = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${APPSECRET}&js_code=${code}&grant_type=authorization_code`;

  try {
    const response = await axios.get(wechatURL);
    const { openid, session_key, errcode, errmsg } = response.data;

    if (errcode) {
      return res.error(`微信登录失败：${errmsg}`, 400);
    }

    // 检查 openid 是否已在数据库中存在
    const [rows] = await db.query('SELECT * FROM users WHERE openid = ?', [openid]);

    if (rows.length > 0) {
      // 用户已注册，生成 token 并返回登录信息
      const user = rows[0];
      const token = jwt.sign(
        { userId: user.id, phone: user.phone },
        secretKey,
        { expiresIn: '24h' }
      );

      return res.success({
        token,
        userInfo: user
      }, '登录成功');
    } else {
      // 用户未注册，返回需要补充资料的提示
      return res.success({
        openid
      }, '微信授权成功，但用户未注册', 401);
    }
  } catch (error) {
    console.error('微信登录错误:', error);
    return res.error('微信登录请求失败', 500);
  }
}));



// 完善资料
router.post('/updateUserInfo', asyncHandler(async (req, res) => {
  const userId = req.auth.userId;  // 从 JWT 中获取用户 ID
  const { nickname } = req.body;
  let gender = req.body.gender;

  // 处理 gender 的类型转换
  if (gender !== undefined) {
    gender = Number(gender);
    if (![0, 1].includes(gender)) {
      return res.error('性别参数无效', 400);
    }
  }

  const updateFields = {};
  if (nickname !== undefined) updateFields.nickname = nickname;
  if (gender !== undefined) updateFields.gender = gender;

  if (Object.keys(updateFields).length === 0) {
    return res.error('没有提供要更新的信息', 400);
  }

  const [result] = await db.query(
    'UPDATE users SET ? WHERE id = ?',
    [updateFields, userId]
  );

  if (result.affectedRows === 0) {
    return res.error('用户不存在', 404);
  }

  const [rows] = await db.query(
    'SELECT id, phone, nickname, gender FROM users WHERE id = ?',
    [userId]
  );

  return res.success(rows[0], '资料更新成功');
}));

// 删除用户（后台开发接口）
router.delete('/deleteUser', asyncHandler(async (req, res) => {
  const userId = req.query.userId;  // 从查询参数获取 userId
  
  if (!userId) {
    return res.error('用户ID不能为空', 400);
  }

  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [userId]);
    
    if (result.affectedRows === 0) {
      return res.error('用户不存在', 404);
    }
    
    return res.success(null, '用户删除成功');
  } catch (error) {
    console.error('删除用户错误:', error);
    throw error;
  }
}));

module.exports = router;
