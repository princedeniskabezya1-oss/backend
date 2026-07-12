"use strict";

const mongoose = require("mongoose");

const {
  Schema
} = mongoose;

/* =========================================================
   DAILY ANALYTICS COUNTER FIELDS
========================================================= */

/*
  These fields contain additive daily counters.

  Controllers and services may increment them, while the
  dashboard sums them across 7, 30, 90, 180, or 365 days.
*/
const DAILY_COUNTER_FIELDS = [
  /* Public profile */
  "profileImpressions",
  "profileViews",
  "uniqueProfileViews",
  "profileContactClicks",
  "profileWebsiteClicks",
  "profileMessageClicks",
  "profileShares",

  /* Followers */
  "followersGained",
  "followersLost",

  /* Posts and school updates */
  "postsCreated",
  "postImpressions",
  "postViews",
  "uniquePostViews",
  "postLikesGained",
  "postLikesRemoved",
  "postComments",
  "postReplies",
  "postShares",
  "postSavesGained",
  "postSavesRemoved",

  /* Students */
  "studentViews",
  "uniqueStudentViews",
  "studentsAdded",
  "studentsRemoved",
  "studentsEnrolled",
  "studentsCompletedPrograms",

  /* Teachers */
  "teacherViews",
  "uniqueTeacherViews",
  "teachersAdded",
  "teachersRemoved",
  "teachersAssigned",
  "teachersUnassigned",

  /* Classes */
  "classViews",
  "uniqueClassViews",
  "classesCreated",
  "classesStarted",
  "classesCompleted",
  "classesArchived",
  "classEnrollments",
  "classUnenrollments",

  /* Schedules */
  "schedulesCreated",
  "schedulesViewed",
  "schedulesUpdated",
  "schedulesCancelled",
  "scheduleAttendances",

  /* Attendance */
  "attendanceRecordsCreated",
  "attendanceRecordsUpdated",
  "attendancePresent",
  "attendanceLate",
  "attendanceAbsent",
  "attendanceExcused",
  "meetingJoins",
  "attendanceFollowUps",

  /* Assignments and submissions */
  "assignmentsCreated",
  "assignmentsViewed",
  "assignmentsUpdated",
  "assignmentsDeleted",
  "assignmentsSubmitted",
  "assignmentsResubmitted",
  "assignmentsReviewed",
  "assignmentsReturned",
  "assignmentsCompleted",

  /* Career Hub */
  "careerViews",
  "careerOpportunitiesCreated",
  "careerOpportunitiesUpdated",
  "careerOpportunitiesArchived",
  "careerApplications",
  "careerApplicationsReviewed",
  "careerInterviews",
  "careerOffers",
  "careerPlacements",

  /* Search and discovery */
  "searchImpressions",
  "searchClicks",

  /* Dashboard activity */
  "dashboardViews",
  "schoolLogins",
  "activeSessions"
];

/* =========================================================
   DAILY ANALYTICS SCHEMA
========================================================= */

const analyticsDailyDefinition = {
  /*
    School that owns this daily analytics document.
  */
  schoolId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  /*
    UTC calendar day in YYYY-MM-DD format.

    Example:
    2026-07-12

    The aggregation service must always generate this value
    in UTC to prevent duplicate days across time zones.
  */
  date: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 10,
    match: /^\d{4}-\d{2}-\d{2}$/,
    index: true
  },

  /*
    Actual UTC start time of this analytics day.

    This makes MongoDB date-range queries easier and avoids
    relying only on string comparisons.
  */
  dayStart: {
    type: Date,
    required: true,
    index: true
  },

  /*
    UTC end boundary for this analytics day.

    This value is exclusive and normally represents the
    beginning of the following day.
  */
  dayEnd: {
    type: Date,
    required: true
  },

  /* =======================================================
     PUBLIC PROFILE
  ======================================================= */

  profileImpressions: {
    type: Number,
    default: 0,
    min: 0
  },

  profileViews: {
    type: Number,
    default: 0,
    min: 0
  },

  uniqueProfileViews: {
    type: Number,
    default: 0,
    min: 0
  },

  profileContactClicks: {
    type: Number,
    default: 0,
    min: 0
  },

  profileWebsiteClicks: {
    type: Number,
    default: 0,
    min: 0
  },

  profileMessageClicks: {
    type: Number,
    default: 0,
    min: 0
  },

  profileShares: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     FOLLOWERS
  ======================================================= */

  followersGained: {
    type: Number,
    default: 0,
    min: 0
  },

  followersLost: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     POSTS AND SCHOOL UPDATES
  ======================================================= */

  postsCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  postImpressions: {
    type: Number,
    default: 0,
    min: 0
  },

  postViews: {
    type: Number,
    default: 0,
    min: 0
  },

  uniquePostViews: {
    type: Number,
    default: 0,
    min: 0
  },

  postLikesGained: {
    type: Number,
    default: 0,
    min: 0
  },

  postLikesRemoved: {
    type: Number,
    default: 0,
    min: 0
  },

  postComments: {
    type: Number,
    default: 0,
    min: 0
  },

  postReplies: {
    type: Number,
    default: 0,
    min: 0
  },

  postShares: {
    type: Number,
    default: 0,
    min: 0
  },

  postSavesGained: {
    type: Number,
    default: 0,
    min: 0
  },

  postSavesRemoved: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     STUDENTS
  ======================================================= */

  studentViews: {
    type: Number,
    default: 0,
    min: 0
  },

  uniqueStudentViews: {
    type: Number,
    default: 0,
    min: 0
  },

  studentsAdded: {
    type: Number,
    default: 0,
    min: 0
  },

  studentsRemoved: {
    type: Number,
    default: 0,
    min: 0
  },

  studentsEnrolled: {
    type: Number,
    default: 0,
    min: 0
  },

  studentsCompletedPrograms: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     TEACHERS
  ======================================================= */

  teacherViews: {
    type: Number,
    default: 0,
    min: 0
  },

  uniqueTeacherViews: {
    type: Number,
    default: 0,
    min: 0
  },

  teachersAdded: {
    type: Number,
    default: 0,
    min: 0
  },

  teachersRemoved: {
    type: Number,
    default: 0,
    min: 0
  },

  teachersAssigned: {
    type: Number,
    default: 0,
    min: 0
  },

  teachersUnassigned: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     CLASSES
  ======================================================= */

  classViews: {
    type: Number,
    default: 0,
    min: 0
  },

  uniqueClassViews: {
    type: Number,
    default: 0,
    min: 0
  },

  classesCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  classesStarted: {
    type: Number,
    default: 0,
    min: 0
  },

  classesCompleted: {
    type: Number,
    default: 0,
    min: 0
  },

  classesArchived: {
    type: Number,
    default: 0,
    min: 0
  },

  classEnrollments: {
    type: Number,
    default: 0,
    min: 0
  },

  classUnenrollments: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     SCHEDULES
  ======================================================= */

  schedulesCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  schedulesViewed: {
    type: Number,
    default: 0,
    min: 0
  },

  schedulesUpdated: {
    type: Number,
    default: 0,
    min: 0
  },

  schedulesCancelled: {
    type: Number,
    default: 0,
    min: 0
  },

  scheduleAttendances: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     ATTENDANCE
  ======================================================= */

  attendanceRecordsCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceRecordsUpdated: {
    type: Number,
    default: 0,
    min: 0
  },

  attendancePresent: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceLate: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceAbsent: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceExcused: {
    type: Number,
    default: 0,
    min: 0
  },

  meetingJoins: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceFollowUps: {
    type: Number,
    default: 0,
    min: 0
  },

  /*
    Sum of participationScore values recorded during the day.

    The dashboard calculates the average using:

    participationScoreTotal / participationScoreCount
  */
  participationScoreTotal: {
    type: Number,
    default: 0,
    min: 0
  },

  participationScoreCount: {
    type: Number,
    default: 0,
    min: 0
  },

  /*
    Sum and count of class attendance duration values.

    This supports average learning-session duration without
    storing every raw event forever.
  */
  attendanceDurationMinutesTotal: {
    type: Number,
    default: 0,
    min: 0
  },

  attendanceDurationCount: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     ASSIGNMENTS AND SUBMISSIONS
  ======================================================= */

  assignmentsCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsViewed: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsUpdated: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsDeleted: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsSubmitted: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsResubmitted: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsReviewed: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsReturned: {
    type: Number,
    default: 0,
    min: 0
  },

  assignmentsCompleted: {
    type: Number,
    default: 0,
    min: 0
  },

  /*
    Numeric grade accumulation for submissions whose grade
    can be interpreted as a number.

    Non-numeric grades remain available in raw events but do
    not contribute to the average.
  */
  gradeTotal: {
    type: Number,
    default: 0,
    min: 0
  },

  gradeCount: {
    type: Number,
    default: 0,
    min: 0
  },

  /*
    Review-time accumulation in minutes.

    This supports average teacher response time.
  */
  reviewTimeMinutesTotal: {
    type: Number,
    default: 0,
    min: 0
  },

  reviewTimeCount: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     CAREER HUB
  ======================================================= */

  careerViews: {
    type: Number,
    default: 0,
    min: 0
  },

  careerOpportunitiesCreated: {
    type: Number,
    default: 0,
    min: 0
  },

  careerOpportunitiesUpdated: {
    type: Number,
    default: 0,
    min: 0
  },

  careerOpportunitiesArchived: {
    type: Number,
    default: 0,
    min: 0
  },

  careerApplications: {
    type: Number,
    default: 0,
    min: 0
  },

  careerApplicationsReviewed: {
    type: Number,
    default: 0,
    min: 0
  },

  careerInterviews: {
    type: Number,
    default: 0,
    min: 0
  },

  careerOffers: {
    type: Number,
    default: 0,
    min: 0
  },

  careerPlacements: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     SEARCH AND DISCOVERY
  ======================================================= */

  searchImpressions: {
    type: Number,
    default: 0,
    min: 0
  },

  searchClicks: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     DASHBOARD AND ACCOUNT USAGE
  ======================================================= */

  dashboardViews: {
    type: Number,
    default: 0,
    min: 0
  },

  schoolLogins: {
    type: Number,
    default: 0,
    min: 0
  },

  activeSessions: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     DAILY UNIQUE-AUDIENCE ESTIMATES
  ======================================================= */

  /*
    These counts are written by the aggregation service after
    deduplicated raw events are accepted.
  */
  uniqueVisitors: {
    type: Number,
    default: 0,
    min: 0
  },

  returningVisitors: {
    type: Number,
    default: 0,
    min: 0
  },

  newVisitors: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     TRAFFIC SOURCE COUNTERS
  ======================================================= */

  trafficDirect: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficFeed: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficNetwork: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficSearch: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficShare: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficMessages: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficJobs: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficNotifications: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficExternal: {
    type: Number,
    default: 0,
    min: 0
  },

  trafficOther: {
    type: Number,
    default: 0,
    min: 0
  },

  /* =======================================================
     DEVICE COUNTERS
  ======================================================= */

  deviceDesktop: {
    type: Number,
    default: 0,
    min: 0
  },

  deviceMobile: {
    type: Number,
    default: 0,
    min: 0
  },

  deviceTablet: {
    type: Number,
    default: 0,
    min: 0
  },

  deviceBot: {
    type: Number,
    default: 0,
    min: 0
  },

  deviceUnknown: {
    type: Number,
    default: 0,
    min: 0
  }
};

/* =========================================================
   SCHEMA CREATION
========================================================= */

const analyticsDailySchema = new Schema(
  analyticsDailyDefinition,
  {
    timestamps: true,
    strict: true,
    versionKey: false
  }
);

/* =========================================================
   NORMALIZATION
========================================================= */

analyticsDailySchema.pre(
  "validate",
  function normalizeAnalyticsDaily(next) {
    /*
      Normalize the stored date string.
    */
    if (this.date) {
      this.date = String(this.date).trim();
    }

    /*
      If dayStart is missing but date is valid, construct the
      UTC start of that day.
    */
    if (
      !this.dayStart &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        String(this.date || "")
      )
    ) {
      this.dayStart = new Date(
        `${this.date}T00:00:00.000Z`
      );
    }

    /*
      If dayEnd is missing, set it to the beginning of the
      following UTC day.
    */
    if (this.dayStart && !this.dayEnd) {
      const nextDay = new Date(
        this.dayStart
      );

      nextDay.setUTCDate(
        nextDay.getUTCDate() + 1
      );

      this.dayEnd = nextDay;
    }

    /*
      Protect counters from invalid negative values in normal
      document-save operations.

      Atomic $inc operations are validated by the analytics
      service before being written.
    */
    const numericFields = [
      ...DAILY_COUNTER_FIELDS,

      "participationScoreTotal",
      "participationScoreCount",
      "attendanceDurationMinutesTotal",
      "attendanceDurationCount",
      "gradeTotal",
      "gradeCount",
      "reviewTimeMinutesTotal",
      "reviewTimeCount",

      "uniqueVisitors",
      "returningVisitors",
      "newVisitors",

      "trafficDirect",
      "trafficFeed",
      "trafficNetwork",
      "trafficSearch",
      "trafficShare",
      "trafficMessages",
      "trafficJobs",
      "trafficNotifications",
      "trafficExternal",
      "trafficOther",

      "deviceDesktop",
      "deviceMobile",
      "deviceTablet",
      "deviceBot",
      "deviceUnknown"
    ];

    numericFields.forEach(field => {
      const value = Number(this[field] || 0);

      this[field] =
        Number.isFinite(value) && value >= 0
          ? value
          : 0;
    });

    next();
  }
);

/* =========================================================
   VIRTUAL METRICS
========================================================= */

/*
  Net follower movement for the day.
*/
analyticsDailySchema.virtual(
  "netFollowers"
).get(function getNetFollowers() {
  return (
    Number(this.followersGained || 0) -
    Number(this.followersLost || 0)
  );
});

/*
  Net likes after accounting for unlikes.
*/
analyticsDailySchema.virtual(
  "netPostLikes"
).get(function getNetPostLikes() {
  return Math.max(
    0,
    Number(this.postLikesGained || 0) -
      Number(this.postLikesRemoved || 0)
  );
});

/*
  Net saves after accounting for unsaves.
*/
analyticsDailySchema.virtual(
  "netPostSaves"
).get(function getNetPostSaves() {
  return Math.max(
    0,
    Number(this.postSavesGained || 0) -
      Number(this.postSavesRemoved || 0)
  );
});

/*
  Average participation score for the day.
*/
analyticsDailySchema.virtual(
  "averageParticipationScore"
).get(function getAverageParticipationScore() {
  const count =
    Number(this.participationScoreCount || 0);

  if (!count) {
    return 0;
  }

  return Number(
    (
      Number(
        this.participationScoreTotal || 0
      ) / count
    ).toFixed(2)
  );
});

/*
  Average class attendance duration in minutes.
*/
analyticsDailySchema.virtual(
  "averageAttendanceDurationMinutes"
).get(function getAverageAttendanceDurationMinutes() {
  const count =
    Number(this.attendanceDurationCount || 0);

  if (!count) {
    return 0;
  }

  return Number(
    (
      Number(
        this.attendanceDurationMinutesTotal || 0
      ) / count
    ).toFixed(2)
  );
});

/*
  Average numeric grade.
*/
analyticsDailySchema.virtual(
  "averageGrade"
).get(function getAverageGrade() {
  const count =
    Number(this.gradeCount || 0);

  if (!count) {
    return 0;
  }

  return Number(
    (
      Number(this.gradeTotal || 0) /
      count
    ).toFixed(2)
  );
});

/*
  Average teacher review time in minutes.
*/
analyticsDailySchema.virtual(
  "averageReviewTimeMinutes"
).get(function getAverageReviewTimeMinutes() {
  const count =
    Number(this.reviewTimeCount || 0);

  if (!count) {
    return 0;
  }

  return Number(
    (
      Number(
        this.reviewTimeMinutesTotal || 0
      ) / count
    ).toFixed(2)
  );
});

/*
  Public engagement rate based on visible post activity.
*/
analyticsDailySchema.virtual(
  "publicEngagementRate"
).get(function getPublicEngagementRate() {
  const views =
    Number(this.postViews || 0);

  if (!views) {
    return 0;
  }

  const interactions =
    Number(this.netPostLikes || 0) +
    Number(this.postComments || 0) +
    Number(this.postReplies || 0) +
    Number(this.postShares || 0) +
    Number(this.netPostSaves || 0);

  return Number(
    (
      interactions /
      views *
      100
    ).toFixed(2)
  );
});

/*
  Search click-through rate.
*/
analyticsDailySchema.virtual(
  "searchClickThroughRate"
).get(function getSearchClickThroughRate() {
  const impressions =
    Number(this.searchImpressions || 0);

  if (!impressions) {
    return 0;
  }

  return Number(
    (
      Number(this.searchClicks || 0) /
      impressions *
      100
    ).toFixed(2)
  );
});

/*
  Attendance rate where late attendance receives partial
  credit and excused absences receive limited credit.
*/
analyticsDailySchema.virtual(
  "attendanceRate"
).get(function getAttendanceRate() {
  const present =
    Number(this.attendancePresent || 0);

  const late =
    Number(this.attendanceLate || 0);

  const absent =
    Number(this.attendanceAbsent || 0);

  const excused =
    Number(this.attendanceExcused || 0);

  const total =
    present +
    late +
    absent +
    excused;

  if (!total) {
    return 0;
  }

  const weightedAttendance =
    present +
    late * 0.75 +
    excused * 0.5;

  return Number(
    (
      weightedAttendance /
      total *
      100
    ).toFixed(2)
  );
});

/* =========================================================
   JSON AND OBJECT OUTPUT
========================================================= */

analyticsDailySchema.set(
  "toJSON",
  {
    virtuals: true
  }
);

analyticsDailySchema.set(
  "toObject",
  {
    virtuals: true
  }
);

/* =========================================================
   DATABASE INDEXES
========================================================= */

/*
  Exactly one aggregate document per school per UTC day.
*/
analyticsDailySchema.index(
  {
    schoolId: 1,
    date: 1
  },
  {
    unique: true
  }
);

/*
  Efficient date-range graph queries.
*/
analyticsDailySchema.index({
  schoolId: 1,
  dayStart: -1
});

/*
  Efficient globally ordered daily processing.
*/
analyticsDailySchema.index({
  dayStart: -1,
  schoolId: 1
});

/*
  Supports scheduled maintenance and aggregate rebuilds.
*/
analyticsDailySchema.index({
  updatedAt: -1
});

/* =========================================================
   STATIC HELPERS
========================================================= */

/*
  Generate a UTC date key in YYYY-MM-DD format.
*/
analyticsDailySchema.statics.createDateKey =
  function createDateKey(value = new Date()) {
    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      throw new TypeError(
        "A valid date is required to create an analytics date key."
      );
    }

    return date
      .toISOString()
      .slice(0, 10);
  };

/*
  Generate UTC day boundaries.
*/
analyticsDailySchema.statics.createDayBounds =
  function createDayBounds(value = new Date()) {
    const dateKey =
      this.createDateKey(value);

    const dayStart = new Date(
      `${dateKey}T00:00:00.000Z`
    );

    const dayEnd = new Date(
      dayStart
    );

    dayEnd.setUTCDate(
      dayEnd.getUTCDate() + 1
    );

    return {
      date: dateKey,
      dayStart,
      dayEnd
    };
  };

/*
  Return the list of counters that the aggregation service
  is allowed to increment directly.
*/
analyticsDailySchema.statics.getCounterFields =
  function getCounterFields() {
    return [
      ...DAILY_COUNTER_FIELDS
    ];
  };

/* =========================================================
   MODEL EXPORTS
========================================================= */

const AnalyticsDaily =
  mongoose.models.AnalyticsDaily ||
  mongoose.model(
    "AnalyticsDaily",
    analyticsDailySchema
  );

module.exports = AnalyticsDaily;

module.exports.DAILY_COUNTER_FIELDS =
  DAILY_COUNTER_FIELDS;
