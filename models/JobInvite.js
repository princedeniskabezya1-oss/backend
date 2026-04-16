const mongoose = require("mongoose");

const JobInviteSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },

    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    message: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["sent", "viewed", "accepted", "declined"],
      default: "sent"
    },

    viewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

JobInviteSchema.index({ employerId: 1, createdAt: -1 });
JobInviteSchema.index({ candidateId: 1, createdAt: -1 });
JobInviteSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });

module.exports = mongoose.model("JobInvite", JobInviteSchema);