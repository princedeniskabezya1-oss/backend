const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    assigneeId: {
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

    description: {
      type: String,
      default: ""
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },

    category: {
      type: String,
      default: "general"
    },

    dueDate: {
      type: String,
      default: null
    },

    linkedScheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      default: null
    },

    status: {
      type: String,
      enum: ["todo", "in_progress", "done", "cancelled"],
      default: "todo"
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

TaskSchema.index({ employerId: 1, createdAt: -1 });
TaskSchema.index({ assigneeId: 1, status: 1 });

module.exports = mongoose.model("Task", TaskSchema);