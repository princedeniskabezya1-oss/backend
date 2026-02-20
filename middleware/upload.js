const multer = require("multer");

/*
=========================================
MEMORY STORAGE (NO CLOUDINARY HERE)
=========================================
*/
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

module.exports = upload;