const mongoose = require("mongoose");

const ScheduleSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    shiftType: {
      type: String,
      enum: ["morning", "mid", "night", "flex", "custom"],
      default: "custom"
    },

    locationType: {
      type: String,
      enum: ["onsite", "remote", "hybrid"],
      default: "onsite"
    },

    startDate: {
      type: String,
      required: true
    },

    endDate: {
      type: String,
      required: true
    },

    startTime: {
      type: String,
      required: true
    },

    endTime: {
      type: String,
      required: true
    },

    recurrence: {
      type: String,
      enum: ["once", "daily", "weekly", "monthly"],
      default: "once"
    },

    timezone: {
      type: String,
      default: "Asia/Manila"
    },

    notes: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled"
    }
  },
  { timestamps: true }
);

ScheduleSchema.index({ employerId: 1, createdAt: -1 });
ScheduleSchema.index({ agentId: 1, startDate: 1 });

module.exports = mongoose.model("Schedule", ScheduleSchema);