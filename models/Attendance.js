// models/Attendance.js
const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
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

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      default: null,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["present", "late", "absent", "excused"],
      default: "present",
      required: true,
      index: true,
    },

    participationScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    source: {
      type: String,
      enum: ["manual", "bulk", "schedule", "system"],
      default: "manual",
    },
  },
  { timestamps: true }
);

AttendanceSchema.index(
  {
    schoolId: 1,
    classId: 1,
    studentId: 1,
    date: 1,
  },
  { unique: true }
);

AttendanceSchema.index({
  schoolId: 1,
  teacherId: 1,
  date: -1,
});

AttendanceSchema.index({
  schoolId: 1,
  studentId: 1,
  date: -1,
});

module.exports = mongoose.model("Attendance", AttendanceSchema);
