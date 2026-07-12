"use strict";

const mongoose = require("mongoose");

const {
  Schema
} = mongoose;

/* =========================================================
   ANALYTICS EVENT TYPES
========================================================= */

/*
  These are the only raw analytics events the system accepts.

  Important events such as follows, likes, attendance,
  submissions, and grading should be recorded by the backend
  route that successfully performs the action.
*/
const ANALYTICS_EVENT_TYPES = [
  /* Public school profile */
  "profile_impression",
  "profile_view",
  "profile_unique_view",
  "profile_contact_click",
  "profile_website_click",
  "profile_message_click",
  "profile_share",

  /* Followers */
  "follow",
  "unfollow",

  /* Posts and updates */
  "post_impression",
  "post_view",
  "post_unique_view",
  "post_like",
  "post_unlike",
  "post_comment",
  "post_reply",
  "post_share",
  "post_save",
  "post_unsave",

  /* Students */
  "student_view",
  "student_added",
  "student_removed",
  "student_enrolled",
  "student_completed_program",

  /* Teachers */
  "teacher_view",
  "teacher_added",
  "teacher_removed",
  "teacher_assigned",
  "teacher_unassigned",

  /* Classes */
  "class_created",
  "class_view",
  "class_unique_view",
  "class_enrolled",
  "class_unenrolled",
  "class_started",
  "class_completed",
  "class_archived",

  /* Schedules */
  "schedule_created",
  "schedule_view",
  "schedule_updated",
  "schedule_cancelled",
  "schedule_attended",

  /* Attendance */
  "attendance_created",
  "attendance_updated",
  "attendance_present",
  "attendance_late",
  "attendance_absent",
  "attendance_excused",

  /* Assignments and submissions */
  "assignment_created",
  "assignment_view",
  "assignment_updated",
  "assignment_deleted",
  "assignment_submitted",
  "assignment_resubmitted",
  "assignment_reviewed",
  "assignment_returned",
  "assignment_completed",

  /* Career Hub */
  "career_view",
  "career_opportunity_created",
  "career_opportunity_updated",
  "career_opportunity_archived",
  "career_application",
  "career_application_reviewed",
  "career_interview",
  "career_offer",
  "career_placement",

  /* Search and discovery */
  "search_impression",
  "search_click",

  /* Authentication and active usage */
  "dashboard_view",
  "school_login",
  "school_active_session"
];

/* =========================================================
   ANALYTICS ENTITY TYPES
========================================================= */

const ANALYTICS_ENTITY_TYPES = [
  "school",
  "post",
  "school_update",
  "student",
  "teacher",
  "class",
  "schedule",
  "attendance",
  "assignment",
  "submission",
  "opportunity",
  "application",
  "partnership",
  "search_result"
];

/* =========================================================
   TRAFFIC SOURCES
========================================================= */

const ANALYTICS_SOURCES = [
  "direct",
  "feed",
  "home",
  "network",
  "jobs",
  "search",
  "profile",
  "share",
  "messages",
  "career_hub",
  "dashboard",
  "notification",
  "email",
  "external",
  "classroom",
  "student_portal",
  "teacher_portal",
  "unknown"
];

/* =========================================================
   ANALYTICS EVENT SCHEMA
========================================================= */

const analyticsEventSchema = new Schema(
  {
    /*
      The school that owns this analytics event.

      Every event must belong to one school so private
      analytics can be queried securely and efficiently.
    */
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /*
      Logged-in user who performed the action.

      This remains null for anonymous visitors.
    */
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    /*
      Anonymous browser-session identifier.

      This is generated on the frontend and is useful for
      deduplicating anonymous views without storing private
      browser information.
    */
    sessionId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
      index: true
    },

    /*
      Hashed representation of the visitor IP address.

      Never store the raw IP address in this collection.
    */
    ipHash: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
      index: true
    },

    /*
      Specific action represented by this record.
    */
    eventType: {
      type: String,
      required: true,
      enum: ANALYTICS_EVENT_TYPES,
      index: true
    },

    /*
      Type of object involved in the event.
    */
    entityType: {
      type: String,
      required: true,
      enum: ANALYTICS_ENTITY_TYPES,
      default: "school",
      index: true
    },

    /*
      ID of the post, class, student, assignment, submission,
      opportunity, or other object connected to the event.
    */
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true
    },

    /*
      Where the visitor or action originated.
    */
    source: {
      type: String,
      enum: ANALYTICS_SOURCES,
      default: "unknown",
      index: true
    },

    /*
      Optional controlled metadata.

      Controllers and validation middleware must whitelist
      metadata keys before saving them.
    */
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({})
    },

    /*
      Deduplication key generated by the analytics service.

      Examples:

      profile_unique_view:
      schoolId + visitor identity + date

      post_unique_view:
      postId + visitor identity + date

      follow:
      target school + follower + relationship version
    */
    dedupeKey: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    /*
      Browser user-agent string, truncated by middleware.

      This can support desktop/mobile/browser breakdowns
      without storing more sensitive information.
    */
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: null
    },

    /*
      Referring page URL.

      Middleware must remove query values that may contain
      private tokens or personal information.
    */
    referrer: {
      type: String,
      trim: true,
      maxlength: 1024,
      default: null
    },

    /*
      Backend route or frontend page connected to the event.
    */
    requestPath: {
      type: String,
      trim: true,
      maxlength: 1024,
      default: null
    },

    /*
      Device category determined from controlled metadata or
      the user-agent parser.
    */
    deviceType: {
      type: String,
      enum: [
        "desktop",
        "mobile",
        "tablet",
        "bot",
        "unknown"
      ],
      default: "unknown",
      index: true
    },

    /*
      Time when the actual action happened.

      This is different from createdAt when events are queued
      briefly before being written.
    */
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    /*
      Raw event expiration date.

      MongoDB's TTL index removes old raw events while daily
      aggregate documents remain available for long-term
      reports and line charts.
    */
    expiresAt: {
      type: Date,
      required: true,
      default: function createDefaultExpiryDate() {
        const expiry = new Date();

        expiry.setDate(
          expiry.getDate() + 180
        );

        return expiry;
      }
    }
  },
  {
    timestamps: true,

    /*
      Prevent Mongoose from silently saving fields that are
      not defined in this schema.
    */
    strict: true,

    /*
      Store an optimistic concurrency version only when the
      document is edited. Raw events are normally immutable.
    */
    versionKey: false
  }
);

/* =========================================================
   VALIDATION AND NORMALIZATION
========================================================= */

analyticsEventSchema.pre(
  "validate",
  function normalizeAnalyticsEvent(next) {
    if (this.sessionId) {
      this.sessionId = String(
        this.sessionId
      ).trim();
    }

    if (this.ipHash) {
      this.ipHash = String(
        this.ipHash
      ).trim();
    }

    if (this.dedupeKey) {
      this.dedupeKey = String(
        this.dedupeKey
      ).trim();
    }

    if (this.userAgent) {
      this.userAgent = String(
        this.userAgent
      )
        .trim()
        .slice(0, 512);
    }

    if (this.referrer) {
      this.referrer = String(
        this.referrer
      )
        .trim()
        .slice(0, 1024);
    }

    if (this.requestPath) {
      this.requestPath = String(
        this.requestPath
      )
        .trim()
        .slice(0, 1024);
    }

    /*
      Ensure occurredAt is always a valid date.
    */
    if (
      !this.occurredAt ||
      Number.isNaN(
        new Date(this.occurredAt).getTime()
      )
    ) {
      this.occurredAt = new Date();
    }

    /*
      Ensure expiresAt is always later than occurredAt.
    */
    if (
      !this.expiresAt ||
      Number.isNaN(
        new Date(this.expiresAt).getTime()
      ) ||
      new Date(this.expiresAt) <=
        new Date(this.occurredAt)
    ) {
      const expiry = new Date(
        this.occurredAt
      );

      expiry.setDate(
        expiry.getDate() + 180
      );

      this.expiresAt = expiry;
    }

    next();
  }
);

/* =========================================================
   QUERY INDEXES
========================================================= */

/*
  Primary school timeline query.
*/
analyticsEventSchema.index({
  schoolId: 1,
  occurredAt: -1
});

/*
  Date-range query for one event type.
*/
analyticsEventSchema.index({
  schoolId: 1,
  eventType: 1,
  occurredAt: -1
});

/*
  Actor-based school analytics.
*/
analyticsEventSchema.index({
  schoolId: 1,
  actorId: 1,
  eventType: 1,
  occurredAt: -1
});

/*
  Anonymous session-based analytics.
*/
analyticsEventSchema.index({
  schoolId: 1,
  sessionId: 1,
  eventType: 1,
  occurredAt: -1
});

/*
  Anonymous hashed-visitor analytics.
*/
analyticsEventSchema.index({
  schoolId: 1,
  ipHash: 1,
  eventType: 1,
  occurredAt: -1
});

/*
  Entity-level reports such as one post, class, assignment,
  student, teacher, or opportunity.
*/
analyticsEventSchema.index({
  schoolId: 1,
  entityType: 1,
  entityId: 1,
  eventType: 1,
  occurredAt: -1
});

/*
  Traffic-source reporting.
*/
analyticsEventSchema.index({
  schoolId: 1,
  source: 1,
  occurredAt: -1
});

/*
  Device reporting.
*/
analyticsEventSchema.index({
  schoolId: 1,
  deviceType: 1,
  occurredAt: -1
});

/*
  A non-null dedupe key must be unique within one school.

  Multiple documents without a dedupe key are still allowed
  because the index only includes string dedupeKey values.
*/
analyticsEventSchema.index(
  {
    schoolId: 1,
    dedupeKey: 1
  },
  {
    unique: true,

    partialFilterExpression: {
      dedupeKey: {
        $type: "string"
      }
    }
  }
);

/*
  Automatically delete raw analytics events when expiresAt
  is reached.

  expireAfterSeconds: 0 means the document expires at the
  exact date stored in expiresAt.
*/
analyticsEventSchema.index(
  {
    expiresAt: 1
  },
  {
    expireAfterSeconds: 0
  }
);

/* =========================================================
   IMMUTABILITY PROTECTION
========================================================= */

/*
  Raw analytics events should normally never be updated.

  This method is available for application code that needs
  to confirm whether an event is considered immutable.
*/
analyticsEventSchema.methods.isImmutableEvent =
  function isImmutableEvent() {
    return true;
  };

/* =========================================================
   MODEL EXPORTS
========================================================= */

const AnalyticsEvent =
  mongoose.models.AnalyticsEvent ||
  mongoose.model(
    "AnalyticsEvent",
    analyticsEventSchema
  );

module.exports = AnalyticsEvent;

/*
  Export controlled constants so middleware and services can
  use the same event, entity, and source lists without
  maintaining separate conflicting copies.
*/
module.exports.ANALYTICS_EVENT_TYPES =
  ANALYTICS_EVENT_TYPES;

module.exports.ANALYTICS_ENTITY_TYPES =
  ANALYTICS_ENTITY_TYPES;

module.exports.ANALYTICS_SOURCES =
  ANALYTICS_SOURCES;
