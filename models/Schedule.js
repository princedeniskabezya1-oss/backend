const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
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
      trim: true,
      maxlength: 140,
      default: "Class Schedule"
    },

    date: {
      type: Date,
      default: null,
      index: true
    },

    time: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null
    },

    startTime: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null
    },

    endTime: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null
    },

    meetingLink: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: null
    },

    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
      index: true
    }
  },
  { timestamps: true }
);

scheduleSchema.index({ schoolId: 1, date: 1 });
scheduleSchema.index({ teacherId: 1, date: 1 });
scheduleSchema.index({ classId: 1, date: 1 });

module.exports = mongoose.model("Schedule", scheduleSchema);
