const express = require("express");
const { Readable } = require("stream");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

/* =========================================================
   HELPERS
========================================================= */

function uploadBufferToCloudinary(
  fileBuffer,
  {
    folder,
    publicId,
    resourceType = "image",
    transformation = []
  } = {}
) {
  return new Promise((resolve, reject) => {
    const uploadStream =
      cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId || undefined,
          resource_type: resourceType,
          overwrite: false,
          unique_filename: true,
          use_filename: false,
          transformation
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }

          resolve(result);
        }
      );

    Readable.from(fileBuffer).pipe(
      uploadStream
    );
  });
}

function lessonCoverUploadMiddleware(
  req,
  res,
  next
) {
  upload.single("cover")(
    req,
    res,
    error => {
      if (!error) {
        return next();
      }

      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          success: false,
          message:
            "The lesson cover is too large."
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "The lesson cover could not be uploaded."
      });
    }
  );
}

/* =========================================================
   POST /api/uploads/lesson-cover
========================================================= */

router.post(
  "/lesson-cover",
  auth,
  lessonCoverUploadMiddleware,
  async (req, res) => {
    try {
      const role =
        String(
          req.user?.role ||
          ""
        ).toLowerCase();

      const allowedRoles =
        new Set([
          "admin",
          "school",
          "teacher"
        ]);

      if (
        !allowedRoles.has(role)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to upload lesson covers."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Please select a lesson cover image."
        });
      }

      const allowedImageTypes =
        new Set([
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/gif"
        ]);

      if (
        !allowedImageTypes.has(
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Lesson covers must be JPG, PNG, WEBP, or GIF images."
        });
      }

      /*
        The general multer middleware allows files up to 50 MB,
        but lesson covers should remain much smaller.
      */
      const lessonCoverLimit =
        8 * 1024 * 1024;

      if (
        req.file.size >
        lessonCoverLimit
      ) {
        return res.status(413).json({
          success: false,
          message:
            "Lesson cover images must be 8 MB or smaller."
        });
      }

      const userId =
        String(
          req.user?._id ||
          req.user?.id ||
          "unknown"
        );

      const result =
        await uploadBufferToCloudinary(
          req.file.buffer,
          {
            folder:
              `aift/classes/lesson-covers/${userId}`,
            resourceType:
              "image",
            transformation: [
              {
                width: 1600,
                height: 900,
                crop: "limit",
                quality: "auto",
                fetch_format: "auto"
              }
            ]
          }
        );

      return res.status(201).json({
        success: true,
        url:
          result.secure_url,
        secureUrl:
          result.secure_url,
        publicId:
          result.public_id,
        width:
          result.width || null,
        height:
          result.height || null,
        format:
          result.format || null,
        bytes:
          result.bytes || req.file.size
      });
    } catch (error) {
      console.error(
        "Lesson cover upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload the lesson cover image."
      });
    }
  }
);

module.exports = router;
