const mongoose = require("mongoose");

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
        maxlength: 800,
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
        maxlength: 800,
        default: null
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
