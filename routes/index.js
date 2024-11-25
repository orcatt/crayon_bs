const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('Welcome to the Node.js server!');
});

module.exports = router;
