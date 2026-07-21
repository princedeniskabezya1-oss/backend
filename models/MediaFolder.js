const mongoose = require("mongoose");

const {
  Schema
} = mongoose;

/* =========================================================
   MEDIA FOLDER SCHEMA
========================================================= */

const MediaFolderSchema =
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

      parentFolderId: {
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

        minlength:
          1,

        maxlength:
          120
      },

      normalizedName: {
        type:
          String,

        required:
          true,

        trim:
          true,

        lowercase:
          true
      },

      description: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          ""
      },

      color: {
        type:
          String,

        trim:
          true,

        maxlength:
          30,

        default:
          ""
      },

      isShared: {
        type:
          Boolean,

        default:
          false
      },

      isArchived: {
        type:
          Boolean,

        default:
          false,

        index:
          true
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

      createdBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
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

MediaFolderSchema.pre(
  "validate",
  function normalizeFolder(
    next
  ) {
    this.name =
      String(
        this.name ||
        ""
      )
        .trim()
        .replace(
          /\s+/g,
          " "
        );

    this.normalizedName =
      this.name.toLowerCase();

    next();
  }
);

/* =========================================================
   INDEXES
========================================================= */

MediaFolderSchema.index(
  {
    schoolId:
      1,

    classId:
      1,

    parentFolderId:
      1,

    normalizedName:
      1,

    isDeleted:
      1
  },
  {
    unique:
      true,

    partialFilterExpression: {
      isDeleted:
        false
    }
  }
);

MediaFolderSchema.index({
  schoolId:
    1,

  classId:
    1,

  ownerId:
    1,

  createdAt:
    -1
});

MediaFolderSchema.index({
  parentFolderId:
    1,

  isDeleted:
    1,

  name:
    1
});

module.exports =
  mongoose.model(
    "MediaFolder",
    MediaFolderSchema
  );
