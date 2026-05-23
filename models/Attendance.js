// models/Attendance.js
const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
  {
    /* SCHOOL */

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* CLASS */

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },

    /* TEACHER */

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* STUDENT */

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* OPTIONAL SCHEDULE */

    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      default: null,
      index: true,
    },

    /* ATTENDANCE DATE */

    date: {
      type: Date,
      required: true,
      index: true,
    },

    /* ATTENDANCE STATUS */

    status: {
      type: String,
      enum: [
        "present",
        "late",
        "absent",
        "excused",
      ],
      default: "present",
      required: true,
      index: true,
    },

    /* PARTICIPATION */

    participationScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    participationNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    /* ATTENDANCE NOTES */

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    /* WHO MARKED IT */

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* HOW IT WAS CREATED */

    source: {
      type: String,
      enum: [
        "manual",
        "bulk",
        "schedule",
        "system",
      ],
      default: "manual",
    },

    /* SESSION */

    sessionType: {
      type: String,
      enum: [
        "online",
        "physical",
        "hybrid",
      ],
      default: "online",
    },

    /* OPTIONAL MEETING DATA */

    meetingJoined: {
      type: Boolean,
      default: false,
    },

    joinTime: {
      type: Date,
      default: null,
    },

    leaveTime: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },
        /* FLAGS */

    isLateExcused: {
      type: Boolean,
      default: false,
    },

    requiresFollowUp: {
      type: Boolean,
      default: false,
    },

    /* PERFORMANCE */

    engagementLevel: {
      type: String,
      enum: [
        "low",
        "medium",
        "high",
      ],
      default: "medium",
    },

    /* DEVICE / LOCATION */

    deviceType: {
      type: String,
      default: "",
      trim: true,
    },

    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },

    /* EXTRA */

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/* PREVENT DUPLICATES */

AttendanceSchema.index(
  {
    schoolId: 1,
    classId: 1,
    studentId: 1,
    date: 1,
  },
  {
    unique: true,
  }
);

/* TEACHER ANALYTICS */

AttendanceSchema.index({
  schoolId: 1,
  teacherId: 1,
  date: -1,
});

/* STUDENT ANALYTICS */

AttendanceSchema.index({
  schoolId: 1,
  studentId: 1,
  date: -1,
});

/* CLASS ANALYTICS */

AttendanceSchema.index({
  schoolId: 1,
  classId: 1,
  date: -1,
});

/* STATUS FILTERING */

AttendanceSchema.index({
  schoolId: 1,
  status: 1,
  date: -1,
});

/* VIRTUAL FIELD */

AttendanceSchema.virtual("attendanceScore").get(function () {
  if (this.status === "present") return 100;
  if (this.status === "late") return 70;
  if (this.status === "excused") return 50;
  return 0;
});

/* JSON SETTINGS */

AttendanceSchema.set("toJSON", {
  virtuals: true,
});

AttendanceSchema.set("toObject", {
  virtuals: true,
});

module.exports = mongoose.model(
  "Attendance",
  AttendanceSchema
);
