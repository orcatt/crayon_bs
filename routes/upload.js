const express = require('express');
const multer = require('multer');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { asyncHandler } = require('../middleware/errorHandler');

// 配置 multer 存储方式
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      // 图片存储目录
      const uploadDir = '/www/wwwroot/crayon/static/recipes';
      
      // 确保目录存在
      if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
      }

      cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
      // 保证文件名唯一（根据时间戳生成文件名）
      const ext = path.extname(file.originalname);
      const filename = `recipe_image_${Date.now()}${ext}`;
      cb(null, filename);
  }
});

// 创建 multer 实例
const upload = multer({ storage });

// 上传图片接口
router.post('/recipes/upload-image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
      return res.error('请上传图片文件', 400);
  }
  
  try {
      // 获取图片存储的路径
      const imagePath = `/static/recipes/${req.file.filename}`;

      // 返回图片的存储路径
      return res.success({
          image_path: imagePath,
          message: '图片上传成功'
      });
  } catch (error) {
      console.error('Error uploading image:', error);
      return res.error('图片上传失败，请稍后重试', 500);
  }
}));

module.exports = router;
