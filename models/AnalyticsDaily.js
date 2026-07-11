const mongoose = require("mongoose");

const analyticsDailySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    date: {
      type: String,
      required: true,
      index: true
    },

    profileViews: {
      type: Number,
      default: 0
    },

    uniqueProfileViews: {
      type: Number,
      default: 0
    },

    followersGained: {
      type: Number,
      default: 0
    },

    followersLost: {
      type: Number,
      default: 0
    },

    postImpressions: {
      type: Number,
      default: 0
    },

    postViews: {
      type: Number,
      default: 0
    },

    postLikes: {
      type: Number,
      default: 0
    },

    postComments: {
      type: Number,
      default: 0
    },

    postShares: {
      type: Number,
      default: 0
    },

    postSaves: {
      type: Number,
      default: 0
    },

    studentViews: {
      type: Number,
      default: 0
    },

    studentsAdded: {
      type: Number,
      default: 0
    },

    classViews: {
      type: Number,
      default: 0
    },

    classesCreated: {
      type: Number,
      default: 0
    },

    attendancePresent: {
      type: Number,
      default: 0
    },

    attendanceLate: {
      type: Number,
      default: 0
    },

    attendanceAbsent: {
      type: Number,
      default: 0
    },

    attendanceExcused: {
      type: Number,
      default: 0
    },

    assignmentsCreated: {
      type: Number,
      default: 0
    },

    assignmentsSubmitted: {
      type: Number,
      default: 0
    },

    assignmentsReviewed: {
      type: Number,
      default: 0
    },

    careerViews: {
      type: Number,
      default: 0
    },

    careerApplications: {
      type: Number,
      default: 0
    },

    careerPlacements: {
      type: Number,
      default: 0
    },

    searchImpressions: {
      type: Number,
      default: 0
    },

    searchClicks: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

analyticsDailySchema.index(
  {
    schoolId: 1,
    date: 1
  },
  {
    unique: true
  }
);

module.exports = mongoose.model(
  "AnalyticsDaily",
  analyticsDailySchema
);
