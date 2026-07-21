const multer = require("multer");

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_UPLOAD_SIZE =
  100 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    /* Images */
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",

    /* Videos */
    "video/mp4",
    "video/webm",
    "video/quicktime",

    /* Audio */
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",

    /* Documents */
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    /* PowerPoint */
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    /* Excel */
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    /* Plain text */
    "text/plain",
    "text/csv"
  ]);

/* =========================================================
   MEMORY STORAGE
========================================================= */

const storage =
  multer.memoryStorage();

/* =========================================================
   FILE FILTER
========================================================= */

function fileFilter(
  req,
  file,
  callback
) {
  const mimeType =
    String(
      file?.mimetype ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    ALLOWED_MIME_TYPES.has(
      mimeType
    )
  ) {
    callback(
      null,
      true
    );

    return;
  }

  const error =
    new Error(
      [
        "Unsupported file type.",
        "Allowed files include images, videos, audio,",
        "PDF, Word, PowerPoint, Excel, TXT, and CSV files."
      ].join(" ")
    );

  error.code =
    "UNSUPPORTED_FILE_TYPE";

  callback(
    error,
    false
  );
}

/* =========================================================
   MULTER INSTANCE
========================================================= */

const upload =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        MAX_UPLOAD_SIZE,

      files:
        20,

      fields:
        40,

      fieldNameSize:
        100,

      fieldSize:
        1024 * 1024
    }
  });

module.exports =
  upload;

module.exports.ALLOWED_MIME_TYPES =
  ALLOWED_MIME_TYPES;

module.exports.MAX_UPLOAD_SIZE =
  MAX_UPLOAD_SIZE;
