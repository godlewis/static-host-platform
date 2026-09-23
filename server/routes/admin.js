const express = require('express');
const router = express.Router();

// 占位：后续任务逐个补齐
router.use((req, res) => res.status(404).json({ success: false, message: 'NOT_FOUND' }));

module.exports = router;