const express = require('express');
const multer = require('multer');
const { uploadDir } = require('../config/config');
const router = express.Router();

const upload = multer({ dest: uploadDir });

router.post('/upload', upload.single('file'), (req, res) => {
  res.send(`File uploaded: ${req.file.filename}`);
});

module.exports = router;
