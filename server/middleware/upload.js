// ZIP 上传中间件：内存暂存，仅允许 .zip，限制 MAX_UPLOAD_MB
const multer = require('multer');
const config = require('../config');

const upload = multer({
  storage: multer.memoryStorage(), // 内存暂存，解压前先做路径安全校验
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

module.exports = upload;