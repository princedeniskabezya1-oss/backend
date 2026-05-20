const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
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
      enum: ["submitted", "reviewed", "returned"],
      default: "submitted",
      index: true
    },

    submittedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    reviewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ schoolId: 1, createdAt: -1 });
submissionSchema.index({ teacherId: 1, createdAt: -1 });

module.exports = mongoose.model("Submission", submissionSchema);
