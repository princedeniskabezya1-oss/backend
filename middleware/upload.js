const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/*
=========================================
CLOUDINARY STORAGE CONFIG
Supports:
- Images
- Videos
- LinkedIn-style media posts
=========================================
*/
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let resourceType = "auto";

    if (file.mimetype.startsWith("video")) {
      resourceType = "video";
    }

    return {
      folder: "aift_media",
      resource_type: resourceType,
      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "mp4",
        "mov",
        "avi",
        "webm"
      ]
    };
  }
});

/*
=========================================
UPLOAD MIDDLEWARE
=========================================
*/
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max (videos safe)
  }
});

module.exports = upload;
