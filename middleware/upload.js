const multer = require("multer");

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_UPLOAD_SIZE =
  100 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
new Set([

  /* ============================================
     IMAGES
  ============================================ */

  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",


  /* ============================================
     VIDEOS
  ============================================ */

  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",


  /* ============================================
     AUDIO
  ============================================ */

  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",


  /* ============================================
     PDF
  ============================================ */

  "application/pdf",


  /* ============================================
     WORD
  ============================================ */

  "application/msword",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",


  /* ============================================
     POWERPOINT
  ============================================ */

  "application/vnd.ms-powerpoint",

  "application/vnd.openxmlformats-officedocument.presentationml.presentation",


  /* ============================================
     EXCEL
  ============================================ */

  "application/vnd.ms-excel",

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",


  /* ============================================
     TEXT / CSV / RTF
  ============================================ */

  "text/plain",
  "text/csv",
  "application/csv",
  "application/rtf",
  "text/rtf",


  /* ============================================
     ZIP
  ============================================ */

  "application/zip",
  "application/x-zip-compressed"

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
