const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Readable } = require("stream");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Media = require("../models/Media");
const MediaFolder = require("../models/MediaFolder");
const ClassModel = require("../models/Class");

const router = express.Router();

/* =========================================================
   CONSTANTS
========================================================= */

const MANAGEMENT_ROLES = new Set([
  "admin",
  "school",
  "teacher"
]);

const READ_ROLES = new Set([
  "admin",
  "school",
  "teacher",
  "student"
]);

const MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "other"
]);

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac"
]);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv"
]);

const MAX_IMAGE_SIZE =
  15 * 1024 * 1024;

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;

const MAX_AUDIO_SIZE =
  50 * 1024 * 1024;

const MAX_DOCUMENT_SIZE =
  50 * 1024 * 1024;

const DEFAULT_PAGE_SIZE =
  40;

const MAX_PAGE_SIZE =
  100;

/* =========================================================
   GENERAL HELPERS
========================================================= */

function safeString(
  value,
  fallback = ""
) {
  return String(
    value ??
    fallback
  ).trim();
}

function normalizeRole(user) {
  return safeString(
    user?.role
  ).toLowerCase();
}

function getUserId(req) {
  return safeString(
    req.user?._id ||
    req.user?.id
  );
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(
    safeString(value)
  );
}

function objectIdEquals(
  first,
  second
) {
  if (!first || !second) {
    return false;
  }

  return String(first) ===
    String(second);
}

function escapeRegex(value) {
  return safeString(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function normalizeName(value) {
  return safeString(value)
    .replace(/\s+/g, " ");
}

function normalizeTags(value) {
  const source =
    Array.isArray(value)
      ? value
      : safeString(value)
          .split(",");

  return Array.from(
    new Set(
      source
        .map(tag =>
          safeString(tag)
            .toLowerCase()
        )
        .filter(Boolean)
    )
  ).slice(0, 30);
}

function getPagination(req) {
  const requestedPage =
    Number.parseInt(
      req.query.page,
      10
    );

  const requestedLimit =
    Number.parseInt(
      req.query.limit,
      10
    );

  const page =
    Number.isFinite(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isFinite(requestedLimit) &&
    requestedLimit > 0
      ? Math.min(
          requestedLimit,
          MAX_PAGE_SIZE
        )
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    limit,
    skip:
      (page - 1) * limit
  };
}

function parseBoolean(
  value,
  fallback = false
) {
  if (
    value === true ||
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
}

/* =========================================================
   ACCOUNT AND SCHOOL HELPERS
========================================================= */

function getUserSchoolId(user) {
  const role =
    normalizeRole(user);

  if (role === "school") {
    return safeString(
      user?._id ||
      user?.id
    );
  }

  return safeString(
    user?.schoolId ||
    user?.linkedSchoolId ||
    user?.companyId
  );
}

function canManageMedia(user) {
  return MANAGEMENT_ROLES.has(
    normalizeRole(user)
  );
}

function canReadMedia(user) {
  return READ_ROLES.has(
    normalizeRole(user)
  );
}

/* =========================================================
   CLASS ACCESS
========================================================= */

function classTeacherMatches(
  classDocument,
  userId
) {
  if (
    objectIdEquals(
      classDocument?.teacherId,
      userId
    ) ||
    objectIdEquals(
      classDocument?.createdBy,
      userId
    ) ||
    objectIdEquals(
      classDocument?.ownerId,
      userId
    )
  ) {
    return true;
  }

  const possibleTeacherArrays = [
    classDocument?.teachers,
    classDocument?.teacherIds,
    classDocument?.instructors,
    classDocument?.instructorIds
  ];

  return possibleTeacherArrays.some(
    collection =>
      Array.isArray(collection) &&
      collection.some(entry =>
        objectIdEquals(
          entry?._id || entry,
          userId
        )
      )
  );
}

function classStudentMatches(
  classDocument,
  userId
) {
  const possibleStudentArrays = [
    classDocument?.students,
    classDocument?.studentIds,
    classDocument?.enrolledStudents,
    classDocument?.members
  ];

  return possibleStudentArrays.some(
    collection =>
      Array.isArray(collection) &&
      collection.some(entry =>
        objectIdEquals(
          entry?._id ||
          entry?.studentId ||
          entry?.userId ||
          entry,
          userId
        )
      )
  );
}

async function resolveClassAccess(
  req,
  {
    classId,
    requireManagement = false
  } = {}
) {
  const role =
    normalizeRole(
      req.user
    );

  const userId =
    getUserId(req);

  if (!userId) {
    return {
      allowed: false,
      status: 401,
      message:
        "Your authenticated account could not be identified."
    };
  }

  if (!canReadMedia(req.user)) {
    return {
      allowed: false,
      status: 403,
      message:
        "Your account cannot access the Media Library."
    };
  }

  if (
    requireManagement &&
    !canManageMedia(req.user)
  ) {
    return {
      allowed: false,
      status: 403,
      message:
        "You are not allowed to manage Media Library files."
    };
  }

  if (role === "admin") {
    if (!classId) {
      const requestedSchoolId =
        safeString(
          req.query.schoolId ||
          req.body?.schoolId
        );

      return {
        allowed: true,
        schoolId:
          requestedSchoolId || null,
        classId:
          null,
        classDocument:
          null
      };
    }
  }

  if (!classId) {
    const schoolId =
      getUserSchoolId(
        req.user
      );

    if (!schoolId) {
      return {
        allowed: false,
        status: 400,
        message:
          "A class ID or school account is required."
      };
    }

    return {
      allowed: true,
      schoolId,
      classId: null,
      classDocument: null
    };
  }

  if (!isValidObjectId(classId)) {
    return {
      allowed: false,
      status: 400,
      message:
        "The class ID is invalid."
    };
  }

  const classDocument =
    await ClassModel
      .findById(classId)
      .lean();

  if (!classDocument) {
    return {
      allowed: false,
      status: 404,
      message:
        "The selected class could not be found."
    };
  }

  const classSchoolId =
    safeString(
      classDocument.schoolId ||
      classDocument.ownerSchoolId ||
      classDocument.createdFor
    );

  if (!classSchoolId) {
    return {
      allowed: false,
      status: 409,
      message:
        "The class does not have a valid school relationship."
    };
  }

  if (role === "admin") {
    return {
      allowed: true,
      schoolId:
        classSchoolId,
      classId:
        safeString(
          classDocument._id
        ),
      classDocument
    };
  }

  const userSchoolId =
    getUserSchoolId(
      req.user
    );

  if (
    !userSchoolId ||
    !objectIdEquals(
      userSchoolId,
      classSchoolId
    )
  ) {
    return {
      allowed: false,
      status: 403,
      message:
        "This class does not belong to your school."
    };
  }

  if (role === "school") {
    return {
      allowed: true,
      schoolId:
        classSchoolId,
      classId:
        safeString(
          classDocument._id
        ),
      classDocument
    };
  }

  if (role === "teacher") {
    if (
      !classTeacherMatches(
        classDocument,
        userId
      )
    ) {
      return {
        allowed: false,
        status: 403,
        message:
          "You are not assigned to this class."
      };
    }

    return {
      allowed: true,
      schoolId:
        classSchoolId,
      classId:
        safeString(
          classDocument._id
        ),
      classDocument
    };
  }

  if (role === "student") {
    if (requireManagement) {
      return {
        allowed: false,
        status: 403,
        message:
          "Students cannot manage Media Library files."
      };
    }

    const linkedClassId =
      safeString(
        req.user?.classId
      );

    const studentHasAccess =
      objectIdEquals(
        linkedClassId,
        classDocument._id
      ) ||
      classStudentMatches(
        classDocument,
        userId
      );

    if (!studentHasAccess) {
      return {
        allowed: false,
        status: 403,
        message:
          "You are not enrolled in this class."
      };
    }

    return {
      allowed: true,
      schoolId:
        classSchoolId,
      classId:
        safeString(
          classDocument._id
        ),
      classDocument
    };
  }

  return {
    allowed: false,
    status: 403,
    message:
      "You are not allowed to access this class."
  };
}

function sendAccessError(
  res,
  access
) {
  return res
    .status(
      access.status || 403
    )
    .json({
      success: false,
      message:
        access.message ||
        "Access denied."
    });
}

/* =========================================================
   FILE TYPE HELPERS
========================================================= */

function classifyMediaFile(file) {
  const mimeType =
    safeString(
      file?.mimetype
    ).toLowerCase();

  if (
    IMAGE_MIME_TYPES.has(
      mimeType
    ) ||
    mimeType.startsWith(
      "image/"
    )
  ) {
    return "image";
  }

  if (
    VIDEO_MIME_TYPES.has(
      mimeType
    ) ||
    mimeType.startsWith(
      "video/"
    )
  ) {
    return "video";
  }

  if (
    AUDIO_MIME_TYPES.has(
      mimeType
    ) ||
    mimeType.startsWith(
      "audio/"
    )
  ) {
    return "audio";
  }

  if (
    DOCUMENT_MIME_TYPES.has(
      mimeType
    )
  ) {
    return "document";
  }

  return "other";
}

function getResourceType(
  mediaType
) {
  if (mediaType === "image") {
    return "image";
  }

  if (
    mediaType === "video" ||
    mediaType === "audio"
  ) {
    return "video";
  }

  return "raw";
}

function getFileExtension(
  fileName
) {
  return safeString(
    path
      .extname(
        safeString(fileName)
      )
      .replace(
        /^\./,
        ""
      )
  ).toLowerCase();
}

function getMediaSizeLimit(
  mediaType
) {
  switch (mediaType) {
    case "image":
      return MAX_IMAGE_SIZE;

    case "video":
      return MAX_VIDEO_SIZE;

    case "audio":
      return MAX_AUDIO_SIZE;

    case "document":
      return MAX_DOCUMENT_SIZE;

    default:
      return 0;
  }
}

function getMediaSizeLabel(
  mediaType
) {
  switch (mediaType) {
    case "image":
      return "15 MB";

    case "video":
      return "100 MB";

    case "audio":
      return "50 MB";

    case "document":
      return "50 MB";

    default:
      return "the permitted size";
  }
}

function validateUploadedFile(file) {
  if (!file) {
    return {
      valid: false,
      status: 400,
      message:
        "Please select a file to upload."
    };
  }

  const mediaType =
    classifyMediaFile(
      file
    );

  if (
    !MEDIA_TYPES.has(
      mediaType
    ) ||
    mediaType === "other"
  ) {
    return {
      valid: false,
      status: 400,
      message:
        "This file type is not supported by the Media Library."
    };
  }

  const limit =
    getMediaSizeLimit(
      mediaType
    );

  if (
    !limit ||
    Number(file.size) >
      limit
  ) {
    return {
      valid: false,
      status: 413,
      message:
        `${mediaType} files must be ${getMediaSizeLabel(
          mediaType
        )} or smaller.`
    };
  }

  return {
    valid: true,
    mediaType,
    resourceType:
      getResourceType(
        mediaType
      )
  };
}

/* =========================================================
   CHECKSUM
========================================================= */

function createFileChecksum(
  buffer
) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

/* =========================================================
   CLOUDINARY HELPERS
========================================================= */

function sanitizeCloudinaryFolderPart(
  value
) {
  return safeString(value)
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )
    .slice(0, 100);
}

function buildCloudinaryFolder({
  schoolId,
  classId,
  mediaType
}) {
  const schoolPart =
    sanitizeCloudinaryFolderPart(
      schoolId
    );

  const classPart =
    sanitizeCloudinaryFolderPart(
      classId ||
      "shared"
    );

  const typePart =
    sanitizeCloudinaryFolderPart(
      mediaType
    );

  return [
    "aift",
    "media",
    schoolPart,
    classPart,
    typePart
  ].join("/");
}

function uploadBufferToCloudinary(
  fileBuffer,
  {
    folder,
    resourceType,
    mediaType
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
        mediaType === "image"
      ) {
        options.transformation = [
          {
            width: 2400,
            height: 2400,
            crop: "limit",
            quality: "auto",
            fetch_format: "auto"
          }
        ];
      }

      const stream =
        cloudinary.uploader
          .upload_stream(
            options,
            (
              error,
              result
            ) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(result);
            }
          );

      Readable
        .from(fileBuffer)
        .pipe(stream);
    }
  );
}

function destroyCloudinaryAsset(
  media
) {
  return new Promise(
    (resolve, reject) => {
      cloudinary.uploader.destroy(
        media.publicId,
        {
          resource_type:
            media.resourceType ||
            getResourceType(
              media.mediaType
            ),

          invalidate:
            true
        },
        (
          error,
          result
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );
    }
  );
}

function createThumbnailUrl(
  result,
  mediaType
) {
  if (
    mediaType === "image"
  ) {
    return safeString(
      result.secure_url
    );
  }

  if (
    mediaType === "video"
  ) {
    const secureUrl =
      safeString(
        result.secure_url
      );

    if (!secureUrl) {
      return "";
    }

    return secureUrl.replace(
      /\.[a-z0-9]+$/i,
      ".jpg"
    );
  }

  return "";
}

/* =========================================================
   MULTER WRAPPERS
========================================================= */

function singleMediaUpload(
  req,
  res,
  next
) {
  upload.single("file")(
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
        return res
          .status(413)
          .json({
            success: false,
            message:
              "The selected file is larger than the maximum upload limit."
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "The selected file could not be uploaded."
        });
    }
  );
}

function multipleMediaUpload(
  req,
  res,
  next
) {
  upload.array(
    "files",
    20
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
        return res
          .status(413)
          .json({
            success: false,
            message:
              "One or more files are larger than the maximum upload limit."
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "The selected files could not be uploaded."
        });
    }
  );
}

/* =========================================================
   FOLDER VALIDATION
========================================================= */

async function validateFolderForAccess({
  folderId,
  schoolId,
  classId
}) {
  if (!folderId) {
    return {
      valid: true,
      folder: null
    };
  }

  if (!isValidObjectId(folderId)) {
    return {
      valid: false,
      status: 400,
      message:
        "The selected folder ID is invalid."
    };
  }

  const folder =
    await MediaFolder.findOne({
      _id:
        folderId,

      schoolId,

      classId:
        classId || null,

      isDeleted:
        false
    });

  if (!folder) {
    return {
      valid: false,
      status: 404,
      message:
        "The selected media folder could not be found."
    };
  }

  return {
    valid: true,
    folder
  };
}

/* =========================================================
   SOCKET HELPERS
========================================================= */

function getMediaRoom(
  schoolId,
  classId
) {
  return classId
    ? `media:class:${classId}`
    : `media:school:${schoolId}`;
}

function emitMediaEvent(
  req,
  eventName,
  payload,
  schoolId,
  classId
) {
  try {
    const io =
      req.app.get("io");

    if (!io) {
      return;
    }

    io.to(
      getMediaRoom(
        schoolId,
        classId
      )
    ).emit(
      eventName,
      payload
    );

    io.to(
      String(schoolId)
    ).emit(
      eventName,
      payload
    );
  } catch (error) {
    console.error(
      "Media socket event error:",
      error
    );
  }
}

/* =========================================================
   RESPONSE TRANSFORMATION
========================================================= */

function serializeMedia(
  media,
  userId
) {
  const source =
    typeof media.toObject ===
    "function"
      ? media.toObject()
      : media;

  const favoriteBy =
    Array.isArray(
      source.favoriteBy
    )
      ? source.favoriteBy
      : [];

  return {
    ...source,

    id:
      String(
        source._id ||
        source.id
      ),

    favorite:
      favoriteBy.some(
        favoriteId =>
          objectIdEquals(
            favoriteId,
            userId
          )
      ),

    alt:
      source.altText ||
      "",

    type:
      source.mediaType,

    uploadedById:
      source.uploadedBy?._id ||
      source.uploadedBy ||
      null,

    uploadedByName:
      source.uploadedBy?.name ||
      source.uploadedBy?.email ||
      "",

    folderName:
      source.folderId?.name ||
      "",

    folderId:
      source.folderId?._id ||
      source.folderId ||
      null,

    favoriteBy:
      undefined
  };
}

/* =========================================================
   SORTING
========================================================= */

function buildMediaSort(
  sortValue
) {
  switch (
    safeString(
      sortValue
    ).toLowerCase()
  ) {
    case "oldest":
      return {
        createdAt: 1
      };

    case "name-asc":
    case "name":
      return {
        normalizedName: 1,
        createdAt: -1
      };

    case "name-desc":
      return {
        normalizedName: -1,
        createdAt: -1
      };

    case "size-asc":
      return {
        size: 1,
        createdAt: -1
      };

    case "size-desc":
      return {
        size: -1,
        createdAt: -1
      };

    case "most-used":
      return {
        usageCount: -1,
        createdAt: -1
      };

    case "least-used":
      return {
        usageCount: 1,
        createdAt: -1
      };

    case "recently-edited":
      return {
        updatedAt: -1
      };

    case "newest":
    default:
      return {
        createdAt: -1
      };
  }
}

/* =========================================================
   MEDIA QUERY BUILDER
========================================================= */

function buildMediaQuery({
  req,
  access
}) {
  const userId =
    getUserId(req);

  const category =
    safeString(
      req.query.category ||
      "all"
    ).toLowerCase();

  const mediaType =
    safeString(
      req.query.type
    ).toLowerCase();

  const folderId =
    safeString(
      req.query.folderId
    );

  const search =
    safeString(
      req.query.search ||
      req.query.q
    );

  const query = {
    schoolId:
      access.schoolId,

    classId:
      access.classId ||
      null
  };

  if (
    category === "trash" ||
    parseBoolean(
      req.query.trash
    )
  ) {
    query.isDeleted =
      true;
  } else {
    query.isDeleted =
      false;
  }

  if (
    category === "favorites"
  ) {
    query.favoriteBy =
      userId;
  }

  if (
    category === "recent"
  ) {
    query.createdAt = {
      $gte:
        new Date(
          Date.now() -
          30 *
          24 *
          60 *
          60 *
          1000
        )
    };
  }

  if (
    MEDIA_TYPES.has(category) &&
    category !== "other"
  ) {
    query.mediaType =
      category;
  }

  if (
    MEDIA_TYPES.has(mediaType)
  ) {
    query.mediaType =
      mediaType;
  }

  if (folderId) {
    if (
      folderId === "unfiled" ||
      folderId === "none"
    ) {
      query.folderId =
        null;
    } else if (
      isValidObjectId(
        folderId
      )
    ) {
      query.folderId =
        folderId;
    }
  }

  if (
    safeString(
      req.query.usage
    ) === "used"
  ) {
    query.usageCount = {
      $gt: 0
    };
  }

  if (
    safeString(
      req.query.usage
    ) === "unused"
  ) {
    query.usageCount =
      0;
  }

  if (search) {
    const pattern =
      new RegExp(
        escapeRegex(search),
        "i"
      );

    query.$or = [
      {
        name:
          pattern
      },
      {
        originalName:
          pattern
      },
      {
        altText:
          pattern
      },
      {
        caption:
          pattern
      },
      {
        tags:
          pattern
      },
      {
        mimeType:
          pattern
      }
    ];
  }

  return query;
}

/* =========================================================
   GET /api/media
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const classId =
        safeString(
          req.query.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              false
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const {
        page,
        limit,
        skip
      } =
        getPagination(req);

      const query =
        buildMediaQuery({
          req,
          access
        });

      const sort =
        buildMediaSort(
          req.query.sort
        );

      const [
        items,
        total
      ] =
        await Promise.all([
          Media
            .find(query)
            .populate(
              "folderId",
              "name color"
            )
            .populate(
              "uploadedBy",
              "name email profileImage"
            )
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),

          Media.countDocuments(
            query
          )
        ]);

      const userId =
        getUserId(req);

      return res.json({
        success:
          true,

        items:
          items.map(item =>
            serializeMedia(
              item,
              userId
            )
          ),

        pagination: {
          page,
          limit,
          total,

          pages:
            Math.ceil(
              total / limit
            ),

          hasMore:
            skip +
            items.length <
            total
        }
      });
    } catch (error) {
      console.error(
        "Get media error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to load the Media Library."
        });
    }
  }
);

/* =========================================================
   GET /api/media/:id
========================================================= */

router.get(
  "/:id",
  auth,
  async (
    req,
    res,
    next
  ) => {
    try {
      if (
        [
          "folders",
          "storage",
          "bulk"
        ].includes(
          safeString(
            req.params.id
          )
        )
      ) {
        return next();
      }

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media
          .findById(
            req.params.id
          )
          .populate(
            "folderId",
            "name color"
          )
          .populate(
            "uploadedBy",
            "name email profileImage"
          );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              false
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot access this media item."
          });
      }

      return res.json({
        success:
          true,

        item:
          serializeMedia(
            media,
            getUserId(req)
          )
      });
    } catch (error) {
      console.error(
        "Get media item error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to load the media item."
        });
    }
  }
);

/* =========================================================
   POST /api/media/upload
========================================================= */

router.post(
  "/upload",
  auth,
  singleMediaUpload,
  async (
    req,
    res
  ) => {
    let cloudinaryResult =
      null;

    try {
      const classId =
        safeString(
          req.body.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              true
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const validation =
        validateUploadedFile(
          req.file
        );

      if (!validation.valid) {
        return res
          .status(
            validation.status
          )
          .json({
            success:
              false,

            message:
              validation.message
          });
      }

      const folderId =
        safeString(
          req.body.folderId
        );

      const folderValidation =
        await validateFolderForAccess({
          folderId:
            folderId || null,

          schoolId:
            access.schoolId,

          classId:
            access.classId
        });

      if (
        !folderValidation.valid
      ) {
        return res
          .status(
            folderValidation.status
          )
          .json({
            success:
              false,

            message:
              folderValidation.message
          });
      }

      const checksum =
        createFileChecksum(
          req.file.buffer
        );

      const existing =
        await Media.findOne({
          schoolId:
            access.schoolId,

          classId:
            access.classId ||
            null,

          checksum,

          size:
            req.file.size,

          isDeleted:
            false
        });

      if (existing) {
        return res
          .status(200)
          .json({
            success:
              true,

            duplicate:
              true,

            message:
              "This file already exists in the Media Library.",

            item:
              serializeMedia(
                existing,
                getUserId(req)
              )
          });
      }

      const cloudinaryFolder =
        buildCloudinaryFolder({
          schoolId:
            access.schoolId,

          classId:
            access.classId,

          mediaType:
            validation.mediaType
        });

      cloudinaryResult =
        await uploadBufferToCloudinary(
          req.file.buffer,
          {
            folder:
              cloudinaryFolder,

            resourceType:
              validation.resourceType,

            mediaType:
              validation.mediaType
          }
        );

      const originalName =
        normalizeName(
          req.file.originalname ||
          "Untitled file"
        );

      const requestedName =
        normalizeName(
          req.body.name ||
          originalName
        );

      const media =
        await Media.create({
          schoolId:
            access.schoolId,

          classId:
            access.classId ||
            null,

          ownerId:
            access.schoolId,

          uploadedBy:
            getUserId(req),

          folderId:
            folderValidation.folder?._id ||
            null,

          name:
            requestedName,

          originalName,

          normalizedName:
            requestedName.toLowerCase(),

          mediaType:
            validation.mediaType,

          mimeType:
            req.file.mimetype,

          extension:
            getFileExtension(
              originalName
            ),

          url:
            cloudinaryResult.secure_url,

          secureUrl:
            cloudinaryResult.secure_url,

          thumbnailUrl:
            createThumbnailUrl(
              cloudinaryResult,
              validation.mediaType
            ),

          publicId:
            cloudinaryResult.public_id,

          resourceType:
            cloudinaryResult.resource_type ||
            validation.resourceType,

          cloudinaryAssetId:
            cloudinaryResult.asset_id ||
            "",

          format:
            cloudinaryResult.format ||
            getFileExtension(
              originalName
            ),

          size:
            cloudinaryResult.bytes ||
            req.file.size ||
            0,

          width:
            cloudinaryResult.width ||
            0,

          height:
            cloudinaryResult.height ||
            0,

          duration:
            cloudinaryResult.duration ||
            0,

          altText:
            safeString(
              req.body.altText ||
              req.body.alt
            ),

          caption:
            safeString(
              req.body.caption
            ),

          tags:
            normalizeTags(
              req.body.tags
            ),

          checksum,

          status:
            "ready",

          metadata: {
            cloudinaryFolder,

            originalEncoding:
              req.file.encoding ||
              "",

            uploadSource:
              safeString(
                req.body.source ||
                "media-library"
              )
          }
        });

      emitMediaEvent(
        req,
        "media:created",
        {
          item:
            serializeMedia(
              media,
              getUserId(req)
            )
        },
        access.schoolId,
        access.classId
      );

      return res
        .status(201)
        .json({
          success:
            true,

          duplicate:
            false,

          item:
            serializeMedia(
              media,
              getUserId(req)
            )
        });
    } catch (error) {
      console.error(
        "Media upload error:",
        error
      );

      if (
        cloudinaryResult?.public_id
      ) {
        try {
          await cloudinary.uploader.destroy(
            cloudinaryResult.public_id,
            {
              resource_type:
                cloudinaryResult.resource_type ||
                "image",

              invalidate:
                true
            }
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Failed to clean up Cloudinary asset:",
            cleanupError
          );
        }
      }

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to upload the media file."
        });
    }
  }
);

/* =========================================================
   POST /api/media/upload-multiple
========================================================= */

router.post(
  "/upload-multiple",
  auth,
  multipleMediaUpload,
  async (
    req,
    res
  ) => {
    try {
      const files =
        Array.isArray(
          req.files
        )
          ? req.files
          : [];

      if (!files.length) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Please select at least one file."
          });
      }

      const classId =
        safeString(
          req.body.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              true
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const folderValidation =
        await validateFolderForAccess({
          folderId:
            safeString(
              req.body.folderId
            ) || null,

          schoolId:
            access.schoolId,

          classId:
            access.classId
        });

      if (
        !folderValidation.valid
      ) {
        return res
          .status(
            folderValidation.status
          )
          .json({
            success:
              false,

            message:
              folderValidation.message
          });
      }

      const uploaded = [];
      const failed = [];

      for (
        const file of files
      ) {
        let result =
          null;

        try {
          const validation =
            validateUploadedFile(
              file
            );

          if (
            !validation.valid
          ) {
            failed.push({
              name:
                file.originalname,

              message:
                validation.message
            });

            continue;
          }

          const checksum =
            createFileChecksum(
              file.buffer
            );

          const duplicate =
            await Media.findOne({
              schoolId:
                access.schoolId,

              classId:
                access.classId ||
                null,

              checksum,

              size:
                file.size,

              isDeleted:
                false
            });

          if (duplicate) {
            uploaded.push({
              ...serializeMedia(
                duplicate,
                getUserId(req)
              ),

              duplicate:
                true
            });

            continue;
          }

          result =
            await uploadBufferToCloudinary(
              file.buffer,
              {
                folder:
                  buildCloudinaryFolder({
                    schoolId:
                      access.schoolId,

                    classId:
                      access.classId,

                    mediaType:
                      validation.mediaType
                  }),

                resourceType:
                  validation.resourceType,

                mediaType:
                  validation.mediaType
              }
            );

          const originalName =
            normalizeName(
              file.originalname ||
              "Untitled file"
            );

          const media =
            await Media.create({
              schoolId:
                access.schoolId,

              classId:
                access.classId ||
                null,

              ownerId:
                access.schoolId,

              uploadedBy:
                getUserId(req),

              folderId:
                folderValidation.folder?._id ||
                null,

              name:
                originalName,

              originalName,

              normalizedName:
                originalName.toLowerCase(),

              mediaType:
                validation.mediaType,

              mimeType:
                file.mimetype,

              extension:
                getFileExtension(
                  originalName
                ),

              url:
                result.secure_url,

              secureUrl:
                result.secure_url,

              thumbnailUrl:
                createThumbnailUrl(
                  result,
                  validation.mediaType
                ),

              publicId:
                result.public_id,

              resourceType:
                result.resource_type ||
                validation.resourceType,

              cloudinaryAssetId:
                result.asset_id ||
                "",

              format:
                result.format ||
                "",

              size:
                result.bytes ||
                file.size ||
                0,

              width:
                result.width ||
                0,

              height:
                result.height ||
                0,

              duration:
                result.duration ||
                0,

              tags:
                normalizeTags(
                  req.body.tags
                ),

              checksum,

              status:
                "ready"
            });

          uploaded.push(
            serializeMedia(
              media,
              getUserId(req)
            )
          );

          emitMediaEvent(
            req,
            "media:created",
            {
              item:
                serializeMedia(
                  media,
                  getUserId(req)
                )
            },
            access.schoolId,
            access.classId
          );
        } catch (error) {
          if (
            result?.public_id
          ) {
            try {
              await cloudinary.uploader.destroy(
                result.public_id,
                {
                  resource_type:
                    result.resource_type ||
                    "image",

                  invalidate:
                    true
                }
              );
            } catch (
              cleanupError
            ) {
              console.error(
                "Multiple upload cleanup error:",
                cleanupError
              );
            }
          }

          failed.push({
            name:
              file.originalname,

            message:
              error?.message ||
              "Upload failed."
          });
        }
      }

      return res
        .status(
          uploaded.length
            ? 201
            : 400
        )
        .json({
          success:
            uploaded.length > 0,

          uploaded,

          failed,

          summary: {
            total:
              files.length,

            uploaded:
              uploaded.length,

            failed:
              failed.length
          }
        });
    } catch (error) {
      console.error(
        "Multiple media upload error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to upload the selected files."
        });
    }
  }
);

/* =========================================================
   PATCH /api/media/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot modify this media item."
          });
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "name"
        )
      ) {
        const name =
          normalizeName(
            req.body.name
          );

        if (!name) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "The media name cannot be empty."
            });
        }

        media.name =
          name;

        media.normalizedName =
          name.toLowerCase();
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "altText"
        ) ||
        Object.prototype.hasOwnProperty.call(
          req.body,
          "alt"
        )
      ) {
        media.altText =
          safeString(
            req.body.altText ??
            req.body.alt
          ).slice(0, 500);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "caption"
        )
      ) {
        media.caption =
          safeString(
            req.body.caption
          ).slice(
            0,
            1000
          );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "tags"
        )
      ) {
        media.tags =
          normalizeTags(
            req.body.tags
          );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "folderId"
        )
      ) {
        const folderId =
          safeString(
            req.body.folderId
          );

        const folderValidation =
          await validateFolderForAccess({
            folderId:
              folderId || null,

            schoolId:
              access.schoolId,

            classId:
              access.classId
          });

        if (
          !folderValidation.valid
        ) {
          return res
            .status(
              folderValidation.status
            )
            .json({
              success:
                false,

              message:
                folderValidation.message
            });
        }

        media.folderId =
          folderValidation.folder?._id ||
          null;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "isShared"
        )
      ) {
        media.isShared =
          parseBoolean(
            req.body.isShared
          );
      }

      await media.save();

      const populated =
        await Media
          .findById(
            media._id
          )
          .populate(
            "folderId",
            "name color"
          )
          .populate(
            "uploadedBy",
            "name email profileImage"
          );

      emitMediaEvent(
        req,
        "media:updated",
        {
          item:
            serializeMedia(
              populated,
              getUserId(req)
            )
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        item:
          serializeMedia(
            populated,
            getUserId(req)
          )
      });
    } catch (error) {
      console.error(
        "Update media error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to update the media item."
        });
    }
  }
);

/* =========================================================
   POST /api/media/:id/favorite
========================================================= */

router.post(
  "/:id/favorite",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              false
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot favorite this media item."
          });
      }

      const userId =
        getUserId(req);

      const alreadyFavorite =
        media.favoriteBy.some(
          favoriteId =>
            objectIdEquals(
              favoriteId,
              userId
            )
        );

      if (alreadyFavorite) {
        media.favoriteBy =
          media.favoriteBy.filter(
            favoriteId =>
              !objectIdEquals(
                favoriteId,
                userId
              )
          );
      } else {
        media.favoriteBy.push(
          userId
        );
      }

      await media.save();

      return res.json({
        success:
          true,

        favorite:
          !alreadyFavorite,

        item:
          serializeMedia(
            media,
            userId
          )
      });
    } catch (error) {
      console.error(
        "Favorite media error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to update the favorite state."
        });
    }
  }
);

/* =========================================================
   POST /api/media/:id/usage
========================================================= */

router.post(
  "/:id/usage",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              false
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const allowedModuleTypes =
        new Set([
          "presentation",
          "lesson",
          "assignment",
          "quiz",
          "class",
          "website",
          "certificate",
          "profile",
          "other"
        ]);

      const moduleType =
        safeString(
          req.body.moduleType ||
          "other"
        ).toLowerCase();

      if (
        !allowedModuleTypes.has(
          moduleType
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media usage type is invalid."
          });
      }

      const moduleId =
        safeString(
          req.body.moduleId
        );

      if (
        moduleId &&
        !isValidObjectId(
          moduleId
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media usage module ID is invalid."
          });
      }

      media.usage.push({
        moduleType,

        moduleId:
          moduleId || null,

        slideId:
          safeString(
            req.body.slideId
          ),

        label:
          safeString(
            req.body.label
          ).slice(
            0,
            180
          ),

        usedAt:
          new Date()
      });

      media.usageCount =
        media.usage.length;

      await media.save();

      emitMediaEvent(
        req,
        "media:usage-updated",
        {
          mediaId:
            String(media._id),

          usageCount:
            media.usageCount
        },
        media.schoolId,
        media.classId
      );

      return res.json({
        success:
          true,

        usageCount:
          media.usageCount
      });
    } catch (error) {
      console.error(
        "Media usage tracking error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to record media usage."
        });
    }
  }
);

/* =========================================================
   DELETE /api/media/:id
   SOFT DELETE
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot delete this media item."
          });
      }

      media.isDeleted =
        true;

      media.deletedAt =
        new Date();

      media.deletedBy =
        getUserId(req);

      await media.save();

      emitMediaEvent(
        req,
        "media:deleted",
        {
          mediaId:
            String(media._id),

          softDelete:
            true
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        message:
          "Media moved to Trash."
      });
    } catch (error) {
      console.error(
        "Delete media error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to move the media item to Trash."
        });
    }
  }
);

/* =========================================================
   POST /api/media/:id/restore
========================================================= */

router.post(
  "/:id/restore",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot restore this media item."
          });
      }

      media.isDeleted =
        false;

      media.deletedAt =
        null;

      media.deletedBy =
        null;

      await media.save();

      emitMediaEvent(
        req,
        "media:restored",
        {
          item:
            serializeMedia(
              media,
              getUserId(req)
            )
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        item:
          serializeMedia(
            media,
            getUserId(req)
          )
      });
    } catch (error) {
      console.error(
        "Restore media error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to restore the media item."
        });
    }
  }
);

/* =========================================================
   DELETE /api/media/:id/permanent
========================================================= */

router.delete(
  "/:id/permanent",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The media ID is invalid."
          });
      }

      const media =
        await Media.findById(
          req.params.id
        );

      if (!media) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media item could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                media.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          media.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot permanently delete this media item."
          });
      }

      const role =
        normalizeRole(
          req.user
        );

      if (
        !media.isDeleted &&
        role !== "admin"
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Move the media item to Trash before permanently deleting it."
          });
      }

      await destroyCloudinaryAsset(
        media
      );

      await media.deleteOne();

      emitMediaEvent(
        req,
        "media:deleted",
        {
          mediaId:
            String(media._id),

          permanent:
            true
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        message:
          "Media permanently deleted."
      });
    } catch (error) {
      console.error(
        "Permanent media deletion error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to permanently delete the media item."
        });
    }
  }
);

/* =========================================================
   GET /api/media-folders
   FOLDER ROUTES ARE KEPT UNDER /folders
========================================================= */

router.get(
  "/folders/list",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const classId =
        safeString(
          req.query.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              false
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const parentFolderId =
        safeString(
          req.query.parentFolderId
        );

      const query = {
        schoolId:
          access.schoolId,

        classId:
          access.classId ||
          null,

        isDeleted:
          false
      };

      if (parentFolderId) {
        if (
          !isValidObjectId(
            parentFolderId
          )
        ) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "The parent folder ID is invalid."
            });
        }

        query.parentFolderId =
          parentFolderId;
      } else {
        query.parentFolderId =
          null;
      }

      const folders =
        await MediaFolder
          .find(query)
          .sort({
            name:
              1
          })
          .lean();

      const folderIds =
        folders.map(
          folder =>
            folder._id
        );

      const counts =
        folderIds.length
          ? await Media.aggregate([
              {
                $match: {
                  folderId: {
                    $in:
                      folderIds
                  },

                  isDeleted:
                    false
                }
              },
              {
                $group: {
                  _id:
                    "$folderId",

                  count: {
                    $sum:
                      1
                  }
                }
              }
            ])
          : [];

      const countMap =
        new Map(
          counts.map(entry => [
            String(entry._id),
            entry.count
          ])
        );

      return res.json({
        success:
          true,

        folders:
          folders.map(folder => ({
            ...folder,

            id:
              String(folder._id),

            itemCount:
              countMap.get(
                String(
                  folder._id
                )
              ) || 0
          }))
      });
    } catch (error) {
      console.error(
        "Get media folders error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to load media folders."
        });
    }
  }
);

/* =========================================================
   POST /api/media/folders
========================================================= */

router.post(
  "/folders",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const classId =
        safeString(
          req.body.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              true
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const name =
        normalizeName(
          req.body.name
        );

      if (!name) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Enter a folder name."
          });
      }

      if (
        name.length >
        120
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Folder names must be 120 characters or fewer."
          });
      }

      const parentFolderId =
        safeString(
          req.body.parentFolderId
        );

      if (parentFolderId) {
        const parentValidation =
          await validateFolderForAccess({
            folderId:
              parentFolderId,

            schoolId:
              access.schoolId,

            classId:
              access.classId
          });

        if (
          !parentValidation.valid
        ) {
          return res
            .status(
              parentValidation.status
            )
            .json({
              success:
                false,

              message:
                parentValidation.message
            });
        }
      }

      const duplicate =
        await MediaFolder.findOne({
          schoolId:
            access.schoolId,

          classId:
            access.classId ||
            null,

          parentFolderId:
            parentFolderId ||
            null,

          normalizedName:
            name.toLowerCase(),

          isDeleted:
            false
        });

      if (duplicate) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "A folder with that name already exists in this location."
          });
      }

      const folder =
        await MediaFolder.create({
          schoolId:
            access.schoolId,

          classId:
            access.classId ||
            null,

          ownerId:
            access.schoolId,

          parentFolderId:
            parentFolderId ||
            null,

          name,

          normalizedName:
            name.toLowerCase(),

          description:
            safeString(
              req.body.description
            ).slice(
              0,
              500
            ),

          color:
            safeString(
              req.body.color
            ).slice(
              0,
              30
            ),

          createdBy:
            getUserId(req),

          updatedBy:
            getUserId(req)
        });

      emitMediaEvent(
        req,
        "folder:created",
        {
          folder
        },
        access.schoolId,
        access.classId
      );

      return res
        .status(201)
        .json({
          success:
            true,

          folder: {
            ...folder.toObject(),

            id:
              String(folder._id),

            itemCount:
              0
          }
        });
    } catch (error) {
      console.error(
        "Create media folder error:",
        error
      );

      if (
        error?.code ===
        11000
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "A folder with that name already exists."
          });
      }

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to create the media folder."
        });
    }
  }
);

/* =========================================================
   PATCH /api/media/folders/:id
========================================================= */

router.patch(
  "/folders/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The folder ID is invalid."
          });
      }

      const folder =
        await MediaFolder.findById(
          req.params.id
        );

      if (!folder) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media folder could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                folder.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          folder.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot modify this folder."
          });
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "name"
        )
      ) {
        const name =
          normalizeName(
            req.body.name
          );

        if (!name) {
          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "The folder name cannot be empty."
            });
        }

        const duplicate =
          await MediaFolder.findOne({
            _id: {
              $ne:
                folder._id
            },

            schoolId:
              folder.schoolId,

            classId:
              folder.classId ||
              null,

            parentFolderId:
              folder.parentFolderId ||
              null,

            normalizedName:
              name.toLowerCase(),

            isDeleted:
              false
          });

        if (duplicate) {
          return res
            .status(409)
            .json({
              success:
                false,

              message:
                "A folder with that name already exists in this location."
            });
        }

        folder.name =
          name;

        folder.normalizedName =
          name.toLowerCase();
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "description"
        )
      ) {
        folder.description =
          safeString(
            req.body.description
          ).slice(
            0,
            500
          );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body,
          "color"
        )
      ) {
        folder.color =
          safeString(
            req.body.color
          ).slice(
            0,
            30
          );
      }

      folder.updatedBy =
        getUserId(req);

      await folder.save();

      emitMediaEvent(
        req,
        "folder:updated",
        {
          folder
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        folder: {
          ...folder.toObject(),

          id:
            String(folder._id)
        }
      });
    } catch (error) {
      console.error(
        "Update media folder error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to update the media folder."
        });
    }
  }
);

/* =========================================================
   DELETE /api/media/folders/:id
========================================================= */

router.delete(
  "/folders/:id",
  auth,
  async (
    req,
    res
  ) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The folder ID is invalid."
          });
      }

      const folder =
        await MediaFolder.findById(
          req.params.id
        );

      if (!folder) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "The media folder could not be found."
          });
      }

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                folder.classId
              ),

            requireManagement:
              true
          }
        );

      if (
        !access.allowed ||
        !objectIdEquals(
          access.schoolId,
          folder.schoolId
        )
      ) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "You cannot delete this folder."
          });
      }

      const childFolderCount =
        await MediaFolder.countDocuments({
          parentFolderId:
            folder._id,

          isDeleted:
            false
        });

      if (
        childFolderCount >
        0
      ) {
        return res
          .status(409)
          .json({
            success:
              false,

            message:
              "Move or delete the folders inside this folder first."
          });
      }

      const moveFilesToRoot =
        parseBoolean(
          req.query.moveFilesToRoot,
          true
        );

      if (
        moveFilesToRoot
      ) {
        await Media.updateMany(
          {
            folderId:
              folder._id,

            isDeleted:
              false
          },
          {
            $set: {
              folderId:
                null
            }
          }
        );
      } else {
        const mediaCount =
          await Media.countDocuments({
            folderId:
              folder._id,

            isDeleted:
              false
          });

        if (
          mediaCount >
          0
        ) {
          return res
            .status(409)
            .json({
              success:
                false,

              message:
                "Move or delete the files inside this folder first."
            });
        }
      }

      folder.isDeleted =
        true;

      folder.deletedAt =
        new Date();

      folder.updatedBy =
        getUserId(req);

      await folder.save();

      emitMediaEvent(
        req,
        "folder:deleted",
        {
          folderId:
            String(folder._id)
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        message:
          "Media folder deleted."
      });
    } catch (error) {
      console.error(
        "Delete media folder error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to delete the media folder."
        });
    }
  }
);

/* =========================================================
   POST /api/media/bulk
========================================================= */

router.post(
  "/bulk",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const ids =
        Array.isArray(
          req.body.ids
        )
          ? Array.from(
              new Set(
                req.body.ids
                  .map(safeString)
                  .filter(
                    isValidObjectId
                  )
              )
            ).slice(
              0,
              100
            )
          : [];

      if (!ids.length) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Select at least one media item."
          });
      }

      const action =
        safeString(
          req.body.action
        ).toLowerCase();

      const supportedActions =
        new Set([
          "delete",
          "restore",
          "move",
          "favorite",
          "unfavorite"
        ]);

      if (
        !supportedActions.has(
          action
        )
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "The selected bulk action is not supported."
          });
      }

      const mediaItems =
        await Media.find({
          _id: {
            $in:
              ids
          }
        });

      if (!mediaItems.length) {
        return res
          .status(404)
          .json({
            success:
              false,

            message:
              "No matching media items were found."
          });
      }

      const firstMedia =
        mediaItems[0];

      const access =
        await resolveClassAccess(
          req,
          {
            classId:
              safeString(
                firstMedia.classId
              ),

            requireManagement:
              action !==
              "favorite" &&
              action !==
              "unfavorite"
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const allAccessible =
        mediaItems.every(
          media =>
            objectIdEquals(
              media.schoolId,
              access.schoolId
            ) &&
            objectIdEquals(
              media.classId || "",
              access.classId || ""
            )
        );

      if (!allAccessible) {
        return res
          .status(403)
          .json({
            success:
              false,

            message:
              "One or more selected media items are outside this class."
          });
      }

      let update = {};
      let folder =
        null;

      if (action === "delete") {
        update = {
          $set: {
            isDeleted:
              true,

            deletedAt:
              new Date(),

            deletedBy:
              getUserId(req)
          }
        };
      }

      if (action === "restore") {
        update = {
          $set: {
            isDeleted:
              false,

            deletedAt:
              null,

            deletedBy:
              null
          }
        };
      }

      if (action === "move") {
        const folderValidation =
          await validateFolderForAccess({
            folderId:
              safeString(
                req.body.folderId
              ) || null,

            schoolId:
              access.schoolId,

            classId:
              access.classId
          });

        if (
          !folderValidation.valid
        ) {
          return res
            .status(
              folderValidation.status
            )
            .json({
              success:
                false,

              message:
                folderValidation.message
            });
        }

        folder =
          folderValidation.folder;

        update = {
          $set: {
            folderId:
              folder?._id ||
              null
          }
        };
      }

      if (action === "favorite") {
        update = {
          $addToSet: {
            favoriteBy:
              getUserId(req)
          }
        };
      }

      if (
        action ===
        "unfavorite"
      ) {
        update = {
          $pull: {
            favoriteBy:
              getUserId(req)
          }
        };
      }

      const result =
        await Media.updateMany(
          {
            _id: {
              $in:
                ids
            }
          },
          update
        );

      emitMediaEvent(
        req,
        "media:bulk-updated",
        {
          ids,

          action,

          folderId:
            folder?._id ||
            null
        },
        access.schoolId,
        access.classId
      );

      return res.json({
        success:
          true,

        action,

        matched:
          result.matchedCount ??
          result.n ??
          0,

        modified:
          result.modifiedCount ??
          result.nModified ??
          0
      });
    } catch (error) {
      console.error(
        "Bulk media action error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to update the selected media items."
        });
    }
  }
);

/* =========================================================
   GET /api/media/storage/summary
========================================================= */

router.get(
  "/storage/summary",
  auth,
  async (
    req,
    res
  ) => {
    try {
      const classId =
        safeString(
          req.query.classId
        );

      const access =
        await resolveClassAccess(
          req,
          {
            classId,
            requireManagement:
              false
          }
        );

      if (!access.allowed) {
        return sendAccessError(
          res,
          access
        );
      }

      const result =
        await Media.aggregate([
          {
            $match: {
              schoolId:
                new mongoose.Types.ObjectId(
                  access.schoolId
                ),

              classId:
                access.classId
                  ? new mongoose.Types.ObjectId(
                      access.classId
                    )
                  : null,

              isDeleted:
                false
            }
          },
          {
            $group: {
              _id:
                "$mediaType",

              size: {
                $sum:
                  "$size"
              },

              count: {
                $sum:
                  1
              }
            }
          }
        ]);

      const byType = {
        image: {
          count: 0,
          size: 0
        },

        video: {
          count: 0,
          size: 0
        },

        audio: {
          count: 0,
          size: 0
        },

        document: {
          count: 0,
          size: 0
        },

        other: {
          count: 0,
          size: 0
        }
      };

      result.forEach(entry => {
        if (
          byType[
            entry._id
          ]
        ) {
          byType[
            entry._id
          ] = {
            count:
              entry.count,

            size:
              entry.size
          };
        }
      });

      const totalSize =
        Object.values(
          byType
        ).reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.size ||
              0
            ),
          0
        );

      const totalCount =
        Object.values(
          byType
        ).reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.count ||
              0
            ),
          0
        );

      return res.json({
        success:
          true,

        storage: {
          totalSize,
          totalCount,
          byType
        }
      });
    } catch (error) {
      console.error(
        "Media storage summary error:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          message:
            error?.message ||
            "Failed to calculate Media Library storage."
        });
    }
  }
);

module.exports = router;
