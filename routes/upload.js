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

// 删除图片接口
router.post('/recipes/delete-image', asyncHandler(async (req, res) => {
    const { image_path } = req.body;

    // 校验 image_path 参数是否存在
    if (!image_path) {
        return res.error('请提供图片路径', 400);
    }

    try {
        // 从完整路径中提取文件名
        const filename = path.basename(image_path);
        // 直接使用文件名构造服务器上的绝对路径
        const imageFilePath = path.join('/www/wwwroot/crayon/static/recipes', filename);
        // 检查文件是否存在
        if (fs.existsSync(imageFilePath)) {
            // 删除文件
            fs.unlinkSync(imageFilePath);

            // 返回成功响应
            return res.success({
                message: '图片删除成功'
            });
        } else {
            return res.error('图片文件未找到', 404);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        return res.error('图片删除失败，请稍后重试', 500);
    }
}));





// 配置 multer 存储方式
const storageAvatar = multer.diskStorage({
    destination: (req, file, cb) => {
        // 头像存储目录
        const uploadDir = '/www/wwwroot/crayon/static/avatar';

        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 保证文件名唯一（根据时间戳生成文件名）
        const ext = path.extname(file.originalname);
        const filename = `avatar_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// 创建 multer 实例
const uploadAvatar = multer({ storage: storageAvatar });

// 上传头像接口
router.post('/auth/uploadAvatar', uploadAvatar.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.error('请上传图片文件', 400);
    }

    try {
        // 获取头像存储的路径
        const imagePath = `/static/avatar/${req.file.filename}`;

        // 返回头像的存储路径
        return res.success({
            image_path: imagePath,
            message: '头像上传成功'
        });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        return res.error('头像上传失败，请稍后重试', 500);
    }
}));

// 删除头像接口
router.post('/auth/deleteAvatar', asyncHandler(async (req, res) => {
    const { image_path } = req.body;

    // 校验 image_path 参数是否存在
    if (!image_path) {
        return res.error('请提供头像路径', 400);
    }

    try {
        // 从完整路径中提取文件名
        const filename = path.basename(image_path);
        // 直接使用文件名构造服务器上的绝对路径
        const imageFilePath = path.join('/www/wwwroot/crayon/static/avatar', filename);
        // 检查文件是否存在
        if (fs.existsSync(imageFilePath)) {
            // 删除文件
            fs.unlinkSync(imageFilePath);

            // 返回成功响应
            return res.success({
                message: '头像删除成功'
            });
        } else {
            return res.error('头像文件未找到', 404);
        }
    } catch (error) {
        console.error('Error deleting avatar:', error);
        return res.error('头像删除失败，请稍后重试', 500);
    }
}));




// 配置验证图片的存储方式
const checkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 验证图片存储目录
        const uploadDir = '/www/wwwroot/crayon/static/check';

        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 保证文件名唯一（根据时间戳生成文件名）
        const ext = path.extname(file.originalname);
        const filename = `check_image_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const checkUpload = multer({ storage: checkStorage });

// 上传验证图片接口
router.post('/check/upload-image', checkUpload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.error('请上传图片文件', 400);
    }

    try {
        // 获取图片存储的路径
        const imagePath = `/static/check/${req.file.filename}`;

        // 返回图片的存储路径
        return res.success({
            image_path: imagePath,
            message: '图片上传成功'
        });
    } catch (error) {
        console.error('Error uploading check image:', error);
        return res.error('图片上传失败', 500);
    }
}));

// 删除验证图片接口
router.post('/check/delete-image', asyncHandler(async (req, res) => {
    const { image_path } = req.body;

    // 校验 image_path 参数是否存在
    if (!image_path) {
        return res.error('图片路径不正确', 400);
    }

    try {
        // 从完整路径中提取文件名
        const filename = path.basename(image_path);
        // 直接使用文件名构造服务器上的绝对路径
        const imageFilePath = path.join('/www/wwwroot/crayon/static/check', filename);
        // 检查文件是否存在
        if (fs.existsSync(imageFilePath)) {
            // 删除文件
            fs.unlinkSync(imageFilePath);

            // 返回成功响应
            return res.success({
                message: '删除成功'
            });
        } else {
            return res.error('图片未找到', 404);
        }
    } catch (error) {
        console.error('Error deleting check image:', error);
        return res.error('删除失败', 500);
    }
}));

module.exports = router;
