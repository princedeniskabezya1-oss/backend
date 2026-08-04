const express = require("express");
const { Readable } = require("stream");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_UPLOAD_ROLES = new Set([
  "admin",
  "school",
  "teacher"
]);

const LESSON_COVER_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif"
]);

const LESSON_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const MAX_LESSON_COVER_SIZE =
  8 * 1024 * 1024;

const MAX_LESSON_VIDEO_SIZE =
  50 * 1024 * 1024;



/* =========================================================
   ASSIGNMENT ATTACHMENT UPLOADS
========================================================= */

const ASSIGNMENT_UPLOAD_ROLES =
  new Set([
    "admin",
    "school",
    "teacher",
    "student"
  ]);

const ASSIGNMENT_ATTACHMENT_TYPES =
  new Set([
    /* Images */
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",

    /* Video */
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

    /* Presentations */
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    /* Spreadsheets */
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    /* Text */
    "text/plain",
    "text/csv"
  ]);

const MAX_ASSIGNMENT_ATTACHMENT_SIZE =
  50 * 1024 * 1024;

const MAX_ASSIGNMENT_ATTACHMENTS =
  10;

/* =========================================================
   HELPERS
========================================================= */

function getAuthenticatedUserId(req) {
  return String(
    req.user?._id ||
    req.user?.id ||
    ""
  ).trim();
}

function userCanUpload(req) {
  const role =
    String(
      req.user?.role ||
      ""
    )
      .trim()
      .toLowerCase();

  return ALLOWED_UPLOAD_ROLES.has(
    role
  );
}

function userCanUploadAssignmentFiles(
  req
) {
  const role =
    String(
      req.user?.role ||
      ""
    )
      .trim()
      .toLowerCase();

  return ASSIGNMENT_UPLOAD_ROLES.has(
    role
  );
}

function uploadBufferToCloudinary(
  fileBuffer,
  {
    folder,
    resourceType,
    transformation
  }
) {
  return new Promise(
    (resolve, reject) => {
      const options = {
        folder,
        resource_type:
          resourceType,
        overwrite:
          false,
        unique_filename:
          true,
        use_filename:
          false
      };

      if (
        Array.isArray(
          transformation
        ) &&
        transformation.length
      ) {
        options.transformation =
          transformation;
      }

      const cloudinaryStream =
        cloudinary.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          }
        );

      Readable
        .from(fileBuffer)
        .pipe(cloudinaryStream);
    }
  );
}

function singleFileUpload(
  fieldName
) {
  return function multerMiddleware(
    req,
    res,
    next
  ) {
    upload.single(fieldName)(
      req,
      res,
      error => {
        if (!error) {
          next();
          return;
        }

        if (
          error.code ===
          "LIMIT_FILE_SIZE"
        ) {
          res.status(413).json({
            success: false,
            message:
              "The selected file is larger than the allowed upload limit."
          });

          return;
        }

        res.status(400).json({
          success: false,
          message:
            error.message ||
            "The selected file could not be uploaded."
        });
      }
    );
  };
}

function multipleFileUpload(
  fieldName,
  maxFiles =
    MAX_ASSIGNMENT_ATTACHMENTS
) {
  return function multerMiddleware(
    req,
    res,
    next
  ) {
    upload.array(
      fieldName,
      maxFiles
    )(
      req,
      res,
      error => {
        if (!error) {
          next();

          return;
        }

        if (
          error.code ===
          "LIMIT_FILE_SIZE"
        ) {
          return res.status(413).json({
            success: false,
            message:
              "One or more selected files are larger than the allowed upload limit."
          });
        }

        if (
          error.code ===
          "LIMIT_FILE_COUNT"
        ) {
          return res.status(400).json({
            success: false,
            message:
              `You may upload no more than ${maxFiles} files at once.`
          });
        }

        return res.status(400).json({
          success: false,
          message:
            error.message ||
            "The selected files could not be uploaded."
        });
      }
    );
  };
}

function getCloudinaryResourceType(
  mimeType
) {
  const normalizedMimeType =
    String(
      mimeType ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    normalizedMimeType.startsWith(
      "image/"
    )
  ) {
    return "image";
  }

  if (
    normalizedMimeType.startsWith(
      "video/"
    ) ||
    normalizedMimeType.startsWith(
      "audio/"
    )
  ) {
    return "video";
  }

  return "raw";
}


function getAssignmentAttachmentKind(
  mimeType
) {
  const normalizedMimeType =
    String(
      mimeType ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    normalizedMimeType.startsWith(
      "image/"
    )
  ) {
    return "image";
  }

  if (
    normalizedMimeType.startsWith(
      "video/"
    )
  ) {
    return "video";
  }

  if (
    normalizedMimeType.startsWith(
      "audio/"
    )
  ) {
    return "audio";
  }

  if (
    normalizedMimeType ===
      "application/pdf"
  ) {
    return "pdf";
  }

  if (
    normalizedMimeType.includes(
      "word"
    )
  ) {
    return "document";
  }

  if (
    normalizedMimeType.includes(
      "presentation"
    ) ||
    normalizedMimeType.includes(
      "powerpoint"
    )
  ) {
    return "presentation";
  }

  if (
    normalizedMimeType.includes(
      "spreadsheet"
    ) ||
    normalizedMimeType.includes(
      "excel"
    ) ||
    normalizedMimeType ===
      "text/csv"
  ) {
    return "spreadsheet";
  }

  if (
    normalizedMimeType ===
      "text/plain"
  ) {
    return "text";
  }

  return "file";
}
function sanitizeUploadedFileName(
  value
) {
  const fileName =
    String(
      value ||
      "attachment"
    )
      .trim()
      .replace(
        /[^\w.\-() ]+/g,
        "_"
      )
      .replace(
        /\s+/g,
        " "
      )
      .slice(
        0,
        180
      );

  return (
    fileName ||
    "attachment"
  );
}

function cloudinaryResponse(
  result,
  originalFile,
  mediaType
) {
  return {
    success: true,

    url:
      result.secure_url,

    secureUrl:
      result.secure_url,

    publicId:
      result.public_id,

    resourceType:
      result.resource_type ||
      mediaType,

    mediaType,

    width:
      result.width ||
      null,

    height:
      result.height ||
      null,

    duration:
      result.duration ||
      null,

    format:
      result.format ||
      null,

    bytes:
      result.bytes ||
      originalFile.size ||
      0,

    originalName:
      originalFile.originalname ||
      ""
  };
}

/* =========================================================
   POST /api/uploads/lesson-cover
========================================================= */

router.post(
  "/lesson-cover",
  auth,
  singleFileUpload("cover"),
  async (req, res) => {
    try {
      if (!userCanUpload(req)) {
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

      if (
        !LESSON_COVER_TYPES.has(
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Lesson covers must be JPG, PNG, WEBP, or GIF images."
        });
      }

      if (
        req.file.size >
        MAX_LESSON_COVER_SIZE
      ) {
        return res.status(413).json({
          success: false,
          message:
            "Lesson cover images must be 8 MB or smaller."
        });
      }

      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Your authenticated account could not be identified."
        });
      }

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

      return res.status(201).json(
        cloudinaryResponse(
          result,
          req.file,
          "image"
        )
      );
    } catch (error) {
      console.error(
        "Lesson cover upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Failed to upload the lesson cover image."
      });
    }
  }
);

/* =========================================================
   POST /api/uploads/lesson-video
========================================================= */

router.post(
  "/lesson-video",
  auth,
  singleFileUpload("video"),
  async (req, res) => {
    try {
      if (!userCanUpload(req)) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to upload lesson videos."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Please select a lesson video."
        });
      }

      if (
        !LESSON_VIDEO_TYPES.has(
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Lesson videos must be MP4, WEBM, or MOV files."
        });
      }

      if (
        req.file.size >
        MAX_LESSON_VIDEO_SIZE
      ) {
        return res.status(413).json({
          success: false,
          message:
            "Lesson videos must be 50 MB or smaller."
        });
      }

      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Your authenticated account could not be identified."
        });
      }

      const result =
        await uploadBufferToCloudinary(
          req.file.buffer,
          {
            folder:
              `aift/classes/lesson-videos/${userId}`,

            resourceType:
              "video",

            /*
              Image transformations must not be applied
              to uploaded video files.
            */
            transformation: []
          }
        );

      return res.status(201).json(
        cloudinaryResponse(
          result,
          req.file,
          "video"
        )
      );
    } catch (error) {
      console.error(
        "Lesson video upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Failed to upload the lesson video."
      });
    }
  }
);

/* =========================================================
   POST /api/uploads/assignment-attachments
========================================================= */

router.post(
  "/assignment-attachments",
  auth,
  multipleFileUpload(
    "files",
    MAX_ASSIGNMENT_ATTACHMENTS
  ),
  async (req, res) => {
    try {
      if (
        !userCanUploadAssignmentFiles(
          req
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to upload assignment files."
        });
      }

      const files =
        Array.isArray(
          req.files
        )
          ? req.files
          : [];

      if (!files.length) {
        return res.status(400).json({
          success: false,
          message:
            "Please select at least one assignment file."
        });
      }

      const userId =
        getAuthenticatedUserId(
          req
        );

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Your authenticated account could not be identified."
        });
      }

      for (
        const file of files
      ) {
        const mimeType =
          String(
            file?.mimetype ||
            ""
          )
            .trim()
            .toLowerCase();

        if (
          !ASSIGNMENT_ATTACHMENT_TYPES.has(
            mimeType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `${file.originalname || "A selected file"} is not a supported assignment file type.`
          });
        }

        if (
          Number(file.size || 0) >
          MAX_ASSIGNMENT_ATTACHMENT_SIZE
        ) {
          return res.status(413).json({
            success: false,
            message:
              `${file.originalname || "A selected file"} is larger than 50 MB.`
          });
        }
      }

      const assignmentId =
        String(
          req.body?.assignmentId ||
          "unassigned"
        )
          .trim()
          .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
          )
          .slice(
            0,
            80
          ) ||
        "unassigned";

      const uploadedFiles =
        await Promise.all(
          files.map(
            async file => {
              const resourceType =
                getCloudinaryResourceType(
                  file.mimetype
                );

              const result =
                await uploadBufferToCloudinary(
                  file.buffer,
                  {
                    folder:
                      [
                        "aift",
                        "assignments",
                        "submissions",
                        userId,
                        assignmentId
                      ].join("/"),

                    resourceType,

                    transformation:
                      resourceType ===
                        "image"
                        ? [
                            {
                              width: 2400,
                              height: 2400,
                              crop: "limit",
                              quality: "auto",
                              fetch_format: "auto"
                            }
                          ]
                        : []
                  }
                );

              return {
                url:
                  result.secure_url,

                secureUrl:
                  result.secure_url,

                publicId:
                  result.public_id,

                resourceType:
                  result.resource_type ||
                  resourceType,

                attachmentType:
                  getAssignmentAttachmentKind(
                    file.mimetype
                  ),

                originalName:
                  sanitizeUploadedFileName(
                    file.originalname
                  ),

                mimeType:
                  String(
                    file.mimetype ||
                    "application/octet-stream"
                  ),

                size:
                  Number(
                    result.bytes ||
                    file.size ||
                    0
                  ),

                format:
                  result.format ||
                  null,

                width:
                  result.width ||
                  null,

                height:
                  result.height ||
                  null,

                duration:
                  result.duration ||
                  null,

                uploadedBy:
                  userId,

                uploadedAt:
                  new Date()
                    .toISOString()
              };
            }
          )
        );

      return res.status(201).json({
        success: true,

        count:
          uploadedFiles.length,

        attachments:
          uploadedFiles
      });

    } catch (error) {
      console.error(
        "Assignment attachment upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Failed to upload assignment files."
      });
    }
  }
);


module.exports = router;
