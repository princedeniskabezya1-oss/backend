const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    company: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      default: "Full-time",
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    salary: {
      type: String,
      default: ""
    },

    skills: {
      type: [String],
      default: []
    },

    experienceLevel: {
      type: String,
      enum: ["junior", "mid", "senior"],
      default: "junior"
    },

    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected", "closed"],
      default: "active"
    },

    /* ==============================
       ANALYTICS
    ============================== */
    viewsCount: {
      type: Number,
      default: 0
    },
    uniqueViewers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    saveCount: {
      type: Number,
      default: 0
    },
    inviteCount: {
      type: Number,
      default: 0
    },
    clickApplyCount: {
      type: Number,
      default: 0
    },
    shortlistCount: {
      type: Number,
      default: 0
    },
    interviewCount: {
      type: Number,
      default: 0
    },
    offerCount: {
      type: Number,
      default: 0
    },
    hiredCount: {
      type: Number,
      default: 0
    },
    lastViewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

JobSchema.index({ employerId: 1, createdAt: -1 });
JobSchema.index({ status: 1, createdAt: -1 });
JobSchema.index({ skills: 1 });
JobSchema.index({ title: "text", company: "text", description: "text", location: "text" });

module.exports = mongoose.model("Job", JobSchema);