const mongoose = require("mongoose");

const submissionAttachmentSchema =
  new mongoose.Schema(
    {
      url: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1200
      },

      secureUrl: {
        type: String,
        trim: true,
        maxlength: 1200,
        default: ""
      },

      publicId: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      originalName: {
        type: String,
        trim: true,
        maxlength: 255,
        default: "Attachment"
      },

      mimeType: {
        type: String,
        trim: true,
        maxlength: 150,
        default:
          "application/octet-stream"
      },

      attachmentType: {
        type: String,
        enum: [
          "image",
          "video",
          "audio",
          "pdf",
          "document",
          "presentation",
          "spreadsheet",
          "text",
          "file"
        ],
        default: "file"
      },

      resourceType: {
        type: String,
        enum: [
          "image",
          "video",
          "raw"
        ],
        default: "raw"
      },

      size: {
        type: Number,
        min: 0,
        default: 0
      },

      format: {
        type: String,
        trim: true,
        default: ""
      },

      width: {
        type: Number,
        default: null
      },

      height: {
        type: Number,
        default: null
      },

      duration: {
        type: Number,
        default: null
      },

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

const submissionRevisionSchema =
  new mongoose.Schema(
    {
      revisionNumber: {
        type: Number,
        required: true,
        min: 1
      },

      attemptNumber: {
        type: Number,
        required: true,
        min: 1
      },

      text: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

fileUrl: {
  type: String,
  trim: true,
  maxlength: 1200,
  default: null
},

attachments: {
  type: [submissionAttachmentSchema],
  default: []
},

      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "returned",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted"
      },

      grade: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null
      },

      feedback: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      changedByRole: {
        type: String,
        trim: true,
        default: ""
      },

      action: {
        type: String,
        enum: [
          "submitted",
          "updated",
          "returned",
          "resubmitted",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted"
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );


const submissionSchema =
  new mongoose.Schema(
    {
      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        default: null,
        index: true
      },

      assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Assignment",
        required: true,
        index: true
      },

      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      text: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

fileUrl: {
  type: String,
  trim: true,
  maxlength: 1200,
  default: null
},

attachments: {
  type: [submissionAttachmentSchema],
  default: [],
  validate: {
    validator(value) {
      return (
        Array.isArray(value) &&
        value.length <= 20
      );
    },

    message:
      "A submission may contain no more than 20 attachments."
  }
},

      grade: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null
      },

      feedback: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "returned",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted",
        index: true
      },

      submittedAt: {
        type: Date,
        default: Date.now,
        index: true
      },

      lastEditedAt: {
        type: Date,
        default: Date.now
      },

      reviewedAt: {
        type: Date,
        default: null
      },

      returnedAt: {
        type: Date,
        default: null
      },

      returnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      returnedReason: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      gradedAt: {
        type: Date,
        default: null
      },

      lockedAt: {
        type: Date,
        default: null
      },

      locked: {
        type: Boolean,
        default: false,
        index: true
      },

      attemptNumber: {
        type: Number,
        default: 1,
        min: 1
      },

      revisionNumber: {
        type: Number,
        default: 1,
        min: 1
      },

      submissionHistory: {
        type: [submissionRevisionSchema],
        default: []
      }
    },
    {
      timestamps: true
    }
  );


submissionSchema.index(
  {
    assignmentId: 1,
    studentId: 1
  },
  {
    unique: true
  }
);

submissionSchema.index({
  schoolId: 1,
  createdAt: -1
});

submissionSchema.index({
  teacherId: 1,
  createdAt: -1
});

submissionSchema.index({
  schoolId: 1,
  status: 1,
  submittedAt: -1
});

submissionSchema.index({
  studentId: 1,
  status: 1,
  submittedAt: -1
});

submissionSchema.index({
  assignmentId: 1,
  status: 1
});

module.exports =
  mongoose.model(
    "Submission",
    submissionSchema
  );
