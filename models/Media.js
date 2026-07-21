const mongoose = require("mongoose");

const {
  Schema
} = mongoose;

/* =========================================================
   SUBSCHEMAS
========================================================= */

const MediaUsageSchema =
  new Schema(
    {
      moduleType: {
        type:
          String,

        enum: [
          "presentation",
          "lesson",
          "assignment",
          "quiz",
          "class",
          "website",
          "certificate",
          "profile",
          "other"
        ],

        required:
          true
      },

      moduleId: {
        type:
          Schema.Types.ObjectId,

        default:
          null
      },

      slideId: {
        type:
          String,

        trim:
          true,

        default:
          ""
      },

      label: {
        type:
          String,

        trim:
          true,

        maxlength:
          180,

        default:
          ""
      },

      usedAt: {
        type:
          Date,

        default:
          Date.now
      }
    },
    {
      _id:
        true
    }
  );

/* =========================================================
   MEDIA SCHEMA
========================================================= */

const MediaSchema =
  new Schema(
    {
      schoolId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },

      classId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Class",

        default:
          null,

        index:
          true
      },

      ownerId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },

      uploadedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },

      folderId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "MediaFolder",

        default:
          null,

        index:
          true
      },

      name: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          255
      },

      originalName: {
        type:
          String,

        trim:
          true,

        maxlength:
          255,

        default:
          ""
      },

      normalizedName: {
        type:
          String,

        required:
          true,

        trim:
          true,

        lowercase:
          true,

        index:
          true
      },

      mediaType: {
        type:
          String,

        enum: [
          "image",
          "video",
          "audio",
          "document",
          "other"
        ],

        required:
          true,

        index:
          true
      },

      mimeType: {
        type:
          String,

        required:
          true,

        trim:
          true,

        lowercase:
          true,

        maxlength:
          150
      },

      extension: {
        type:
          String,

        trim:
          true,

        lowercase:
          true,

        maxlength:
          20,

        default:
          ""
      },

      url: {
        type:
          String,

        required:
          true,

        trim:
          true
      },

      secureUrl: {
        type:
          String,

        trim:
          true,

        default:
          ""
      },

      thumbnailUrl: {
        type:
          String,

        trim:
          true,

        default:
          ""
      },

      publicId: {
        type:
          String,

        required:
          true,

        trim:
          true,

        index:
          true
      },

      resourceType: {
        type:
          String,

        enum: [
          "image",
          "video",
          "raw"
        ],

        required:
          true
      },

      cloudinaryAssetId: {
        type:
          String,

        trim:
          true,

        default:
          ""
      },

      format: {
        type:
          String,

        trim:
          true,

        lowercase:
          true,

        default:
          ""
      },

      size: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      width: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      height: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      duration: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      pages: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      altText: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          ""
      },

      caption: {
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          ""
      },

      tags: {
        type: [
          String
        ],

        default: []
      },

      favoriteBy: {
        type: [
          {
            type:
              Schema.Types.ObjectId,

            ref:
              "User"
          }
        ],

        default: []
      },

      usage: {
        type: [
          MediaUsageSchema
        ],

        default: []
      },

      usageCount: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      downloadCount: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      checksum: {
        type:
          String,

        trim:
          true,

        index:
          true,

        default:
          ""
      },

      status: {
        type:
          String,

        enum: [
          "processing",
          "ready",
          "failed"
        ],

        default:
          "ready",

        index:
          true
      },

      processingError: {
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          ""
      },

      isShared: {
        type:
          Boolean,

        default:
          false
      },

      isDeleted: {
        type:
          Boolean,

        default:
          false,

        index:
          true
      },

      deletedAt: {
        type:
          Date,

        default:
          null
      },

      deletedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },

      metadata: {
        type:
          Schema.Types.Mixed,

        default: {}
      }
    },
    {
      timestamps:
        true,

      versionKey:
        false
    }
  );

/* =========================================================
   NORMALIZATION
========================================================= */

MediaSchema.pre(
  "validate",
  function normalizeMedia(
    next
  ) {
    this.name =
      String(
        this.name ||
        this.originalName ||
        "Untitled file"
      )
        .trim()
        .replace(
          /\s+/g,
          " "
        );

    this.originalName =
      String(
        this.originalName ||
        this.name
      ).trim();

    this.normalizedName =
      this.name.toLowerCase();

    this.mimeType =
      String(
        this.mimeType ||
        "application/octet-stream"
      )
        .trim()
        .toLowerCase();

    this.tags =
      Array.from(
        new Set(
          (
            Array.isArray(
              this.tags
            )
              ? this.tags
              : []
          )
            .map(tag =>
              String(
                tag ||
                ""
              )
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        )
      )
        .slice(
          0,
          30
        );

    this.usageCount =
      Array.isArray(
        this.usage
      )
        ? this.usage.length
        : 0;

    next();
  }
);

/* =========================================================
   INDEXES
========================================================= */

MediaSchema.index({
  schoolId:
    1,

  classId:
    1,

  isDeleted:
    1,

  createdAt:
    -1
});

MediaSchema.index({
  schoolId:
    1,

  classId:
    1,

  folderId:
    1,

  isDeleted:
    1,

  createdAt:
    -1
});

MediaSchema.index({
  schoolId:
    1,

  classId:
    1,

  mediaType:
    1,

  isDeleted:
    1,

  createdAt:
    -1
});

MediaSchema.index({
  uploadedBy:
    1,

  createdAt:
    -1
});

MediaSchema.index({
  favoriteBy:
    1,

  schoolId:
    1,

  classId:
    1
});

MediaSchema.index({
  checksum:
    1,

  schoolId:
    1,

  classId:
    1
});

MediaSchema.index(
  {
    name:
      "text",

    originalName:
      "text",

    altText:
      "text",

    caption:
      "text",

    tags:
      "text"
  },
  {
    name:
      "media_library_search"
  }
);

/* =========================================================
   VIRTUALS
========================================================= */

MediaSchema.virtual(
  "isImage"
).get(
  function isImage() {
    return this.mediaType ===
      "image";
  }
);

MediaSchema.virtual(
  "isVideo"
).get(
  function isVideo() {
    return this.mediaType ===
      "video";
  }
);

MediaSchema.set(
  "toJSON",
  {
    virtuals:
      true
  }
);

MediaSchema.set(
  "toObject",
  {
    virtuals:
      true
  }
);

module.exports =
  mongoose.model(
    "Media",
    MediaSchema
  );
