const mongoose =
  require("mongoose");


const studentResourceSchema =
  new mongoose.Schema(
    {
      studentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },

      schoolId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true
      },

      classId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Class",

        default:
          null,

        index:
          true
      },

      title: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          255
      },

      description: {
        type:
          String,

        trim:
          true,

        maxlength:
          2000,

        default:
          ""
      },

      url: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          1200
      },

      secureUrl: {
        type:
          String,

        trim:
          true,

        maxlength:
          1200,

        default:
          ""
      },

      publicId: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          ""
      },

      originalName: {
        type:
          String,

        trim:
          true,

        maxlength:
          255,

        default:
          "Learning resource"
      },

      mimeType: {
        type:
          String,

        trim:
          true,

        maxlength:
          150,

        default:
          "application/octet-stream"
      },

      attachmentType: {
        type:
          String,

        enum: [
          "image",
          "pdf",
          "document",
          "presentation",
          "spreadsheet",
          "text",
          "file"
        ],

        default:
          "file",

        index:
          true
      },

      resourceType: {
        type:
          String,

        enum: [
          "image",
          "raw"
        ],

        default:
          "raw"
      },

      size: {
        type:
          Number,

        min:
          0,

        default:
          0
      },

      format: {
        type:
          String,

        trim:
          true,

        maxlength:
          50,

        default:
          ""
      },

      width: {
        type:
          Number,

        default:
          null
      },

      height: {
        type:
          Number,

        default:
          null
      },

      category: {
        type:
          String,

        enum: [
          "note",
          "study-material",
          "reference",
          "assignment",
          "other"
        ],

        default:
          "note",

        index:
          true
      },

      tags: {
        type: [
          String
        ],

        default:
          [],

        validate: {
          validator(value) {
            return (
              Array.isArray(
                value
              ) &&
              value.length <=
                20
            );
          },

          message:
            "A personal resource may contain no more than 20 tags."
        }
      },

      saved: {
        type:
          Boolean,

        default:
          false,

        index:
          true
      },

      uploadedAt: {
        type:
          Date,

        default:
          Date.now,

        index:
          true
      }
    },
    {
      timestamps:
        true
    }
  );


studentResourceSchema.index({
  studentId:
    1,

  createdAt:
    -1
});


studentResourceSchema.index({
  studentId:
    1,

  classId:
    1,

  createdAt:
    -1
});


studentResourceSchema.index({
  studentId:
    1,

  attachmentType:
    1,

  createdAt:
    -1
});


studentResourceSchema.index({
  studentId:
    1,

  saved:
    1,

  createdAt:
    -1
});


module.exports =
  mongoose.model(
    "StudentResource",
    studentResourceSchema
  );
