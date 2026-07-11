const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    sessionId: {
      type: String,
      default: null,
      index: true
    },

    eventType: {
      type: String,
      required: true,
      enum: [
        "profile_view",
        "profile_unique_view",

        "follow",
        "unfollow",

        "post_impression",
        "post_view",
        "post_like",
        "post_unlike",
        "post_comment",
        "post_share",
        "post_save",

        "student_view",
        "student_added",
        "student_removed",

        "teacher_view",
        "teacher_added",
        "teacher_removed",

        "class_created",
        "class_view",
        "class_enrolled",
        "class_completed",

        "schedule_created",
        "schedule_attended",

        "attendance_present",
        "attendance_late",
        "attendance_absent",
        "attendance_excused",

        "assignment_created",
        "assignment_view",
        "assignment_submitted",
        "assignment_reviewed",
        "assignment_completed",

        "career_view",
        "career_opportunity_created",
        "career_application",
        "career_placement",

        "search_impression",
        "search_click"
      ],
      index: true
    },

    entityType: {
      type: String,
      enum: [
        "school",
        "post",
        "student",
        "teacher",
        "class",
        "schedule",
        "assignment",
        "opportunity",
        "application"
      ],
      default: "school"
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    source: {
      type: String,
      enum: [
        "direct",
        "feed",
        "network",
        "jobs",
        "search",
        "profile",
        "share",
        "messages",
        "career_hub",
        "dashboard",
        "unknown"
      ],
      default: "unknown"
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    ipHash: {
      type: String,
      default: null,
      index: true
    },

    userAgent: {
      type: String,
      default: null
    },

    occurredAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

analyticsEventSchema.index({
  schoolId: 1,
  eventType: 1,
  occurredAt: -1
});

analyticsEventSchema.index({
  schoolId: 1,
  actorId: 1,
  eventType: 1,
  occurredAt: -1
});

analyticsEventSchema.index({
  schoolId: 1,
  entityId: 1,
  eventType: 1,
  occurredAt: -1
});

module.exports = mongoose.model(
  "AnalyticsEvent",
  analyticsEventSchema
);
