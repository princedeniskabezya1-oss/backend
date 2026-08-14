const mongoose = require("mongoose");

const resourceSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         DISPLAY
      ===================================================== */

      title: {
        type: String,
        trim: true,
        maxlength: 255,
        default: ""
      },


      description: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },


      /* =====================================================
         FILE / RESOURCE LOCATION
      ===================================================== */

      url: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },


      secureUrl: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },


      /* =====================================================
         RESOURCE CATEGORY
      ===================================================== */

      type: {
        type: String,

        enum: [
          "link",
          "file",
          "image",
          "video",
          "audio",
          "document",
          "pdf",
          "presentation",
          "spreadsheet",
          "archive",
          "other"
        ],

        default: "file",

        index: true
      },


      /* =====================================================
         UPLOAD SOURCE

         link:
           manually entered external URL

         upload:
           uploaded directly from user's device
      ===================================================== */

      source: {
        type: String,

        enum: [
          "link",
          "upload"
        ],

        default: "upload"
      },


      /* =====================================================
         ORIGINAL FILE INFORMATION
      ===================================================== */

      originalName: {
        type: String,
        trim: true,
        maxlength: 255,
        default: ""
      },


      mimeType: {
        type: String,
        trim: true,
        maxlength: 150,
        default: ""
      },


      size: {
        type: Number,
        min: 0,
        default: 0
      },


      format: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ""
      },


      /* =====================================================
         CLOUDINARY

         publicId is required to safely delete the underlying
         Cloudinary object later.

         resourceType is usually:
           image
           video
           raw
      ===================================================== */

      publicId: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },


      resourceType: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ""
      },


      /* =====================================================
         MEDIA METADATA
      ===================================================== */

      width: {
        type: Number,
        min: 0,
        default: null
      },


      height: {
        type: Number,
        min: 0,
        default: null
      },


      duration: {
        type: Number,
        min: 0,
        default: null
      },


      /* =====================================================
         AUDIT
      ===================================================== */

      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },


      uploadedAt: {
        type: Date,
        default: Date.now
      }

    },
    {
      _id: true
    }
  );

const classLessonSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },

    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassModule",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    summary: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      default: "",
    },

    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    coverUrl: {
      type: String,
      default: "",
      trim: true,
    },

    resources: {
      type: [resourceSchema],
      default: [],
    },

    order: {
      type: Number,
      default: 0,
      index: true,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },

    previewEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClassLesson", classLessonSchema);
