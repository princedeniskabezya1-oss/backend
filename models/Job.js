const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: "Full-time",
    },
    description: {
      type: String,
      required: true,
    },
    salary: {
      type: String,
    },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected"],
      default: "pending", // 🔥 jobs must be approved by admin
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Job", JobSchema);
