const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
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

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    instructions: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    dueDate: {
      type: Date,
      default: null,
      index: true
    },

    attachmentUrl: {
      type: String,
      trim: true,
      maxlength: 800,
      default: null
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true
    }
  },
  { timestamps: true }
);

assignmentSchema.index({ schoolId: 1, createdAt: -1 });
assignmentSchema.index({ classId: 1, dueDate: 1 });
assignmentSchema.index({ teacherId: 1, dueDate: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
