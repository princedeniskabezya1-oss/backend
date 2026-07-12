"use strict";

const mongoose = require("mongoose");

const AnalyticsDaily = require(
  "../models/AnalyticsDaily"
);

/* =========================================================
   EVENT-TO-COUNTER MAPPING
========================================================= */

/*
  Each analytics event may increment one or more daily
  counters.

  Example:

  attendance_present increments:
  - attendanceRecordsCreated
  - attendancePresent

  post_unlike increments:
  - postLikesRemoved

  We do not decrement historical counters. Positive and
  negative actions are stored separately so reports can show
  gained, lost, and net values accurately.
*/
const EVENT_COUNTER_MAP = Object.freeze({
  /* Public profile */

  profile_impression: [
    "profileImpressions"
  ],

  profile_view: [
    "profileViews"
  ],

  profile_unique_view: [
    "uniqueProfileViews",
    "uniqueVisitors"
  ],

  profile_contact_click: [
    "profileContactClicks"
  ],

  profile_website_click: [
    "profileWebsiteClicks"
  ],

  profile_message_click: [
    "profileMessageClicks"
  ],

  profile_share: [
    "profileShares"
  ],

  /* Followers */

  follow: [
    "followersGained"
  ],

  unfollow: [
    "followersLost"
  ],

  /* Posts and school updates */

  post_created: [
    "postsCreated"
  ],

  post_impression: [
    "postImpressions"
  ],

  post_view: [
    "postViews"
  ],

  post_unique_view: [
    "uniquePostViews"
  ],

  post_like: [
    "postLikesGained"
  ],

  post_unlike: [
    "postLikesRemoved"
  ],

  post_comment: [
    "postComments"
  ],

  post_reply: [
    "postReplies"
  ],

  post_share: [
    "postShares"
  ],

  post_save: [
    "postSavesGained"
  ],

  post_unsave: [
    "postSavesRemoved"
  ],

  /* Students */

  student_view: [
    "studentViews"
  ],

  student_unique_view: [
    "uniqueStudentViews"
  ],

  student_added: [
    "studentsAdded"
  ],

  student_removed: [
    "studentsRemoved"
  ],

  student_enrolled: [
    "studentsEnrolled"
  ],

  student_completed_program: [
    "studentsCompletedPrograms"
  ],

  /* Teachers */

  teacher_view: [
    "teacherViews"
  ],

  teacher_unique_view: [
    "uniqueTeacherViews"
  ],

  teacher_added: [
    "teachersAdded"
  ],

  teacher_removed: [
    "teachersRemoved"
  ],

  teacher_assigned: [
    "teachersAssigned"
  ],

  teacher_unassigned: [
    "teachersUnassigned"
  ],

  /* Classes */

  class_created: [
    "classesCreated"
  ],

  class_view: [
    "classViews"
  ],

  class_unique_view: [
    "uniqueClassViews"
  ],

  class_enrolled: [
    "classEnrollments"
  ],

  class_unenrolled: [
    "classUnenrollments"
  ],

  class_started: [
    "classesStarted"
  ],

  class_completed: [
    "classesCompleted"
  ],

  class_archived: [
    "classesArchived"
  ],

  /* Schedules */

  schedule_created: [
    "schedulesCreated"
  ],

  schedule_view: [
    "schedulesViewed"
  ],

  schedule_updated: [
    "schedulesUpdated"
  ],

  schedule_cancelled: [
    "schedulesCancelled"
  ],

  schedule_attended: [
    "scheduleAttendances"
  ],

  /* Attendance */

  attendance_created: [
    "attendanceRecordsCreated"
  ],

  attendance_updated: [
    "attendanceRecordsUpdated"
  ],

  attendance_present: [
    "attendanceRecordsCreated",
    "attendancePresent"
  ],

  attendance_late: [
    "attendanceRecordsCreated",
    "attendanceLate"
  ],

  attendance_absent: [
    "attendanceRecordsCreated",
    "attendanceAbsent"
  ],

  attendance_excused: [
    "attendanceRecordsCreated",
    "attendanceExcused"
  ],

  /* Assignments and submissions */

  assignment_created: [
    "assignmentsCreated"
  ],

  assignment_view: [
    "assignmentsViewed"
  ],

  assignment_updated: [
    "assignmentsUpdated"
  ],

  assignment_deleted: [
    "assignmentsDeleted"
  ],

  assignment_submitted: [
    "assignmentsSubmitted"
  ],

  assignment_resubmitted: [
    "assignmentsResubmitted"
  ],

  assignment_reviewed: [
    "assignmentsReviewed"
  ],

  assignment_returned: [
    "assignmentsReturned"
  ],

  assignment_completed: [
    "assignmentsCompleted"
  ],

  /* Career Hub */

  career_view: [
    "careerViews"
  ],

  career_opportunity_created: [
    "careerOpportunitiesCreated"
  ],

  career_opportunity_updated: [
    "careerOpportunitiesUpdated"
  ],

  career_opportunity_archived: [
    "careerOpportunitiesArchived"
  ],

  career_application: [
    "careerApplications"
  ],

  career_application_reviewed: [
    "careerApplicationsReviewed"
  ],

  career_interview: [
    "careerInterviews"
  ],

  career_offer: [
    "careerOffers"
  ],

  career_placement: [
    "careerPlacements"
  ],

  /* Search and discovery */

  search_impression: [
    "searchImpressions"
  ],

  search_click: [
    "searchClicks"
  ],

  /* Dashboard and account usage */

  dashboard_view: [
    "dashboardViews"
  ],

  school_login: [
    "schoolLogins"
  ],

  school_active_session: [
    "activeSessions"
  ]
});

/* =========================================================
   TRAFFIC SOURCE MAPPING
========================================================= */

const SOURCE_COUNTER_MAP = Object.freeze({
  direct: "trafficDirect",
  feed: "trafficFeed",
  home: "trafficFeed",
  network: "trafficNetwork",
  search: "trafficSearch",
  share: "trafficShare",
  messages: "trafficMessages",
  jobs: "trafficJobs",
  notification: "trafficNotifications",
  external: "trafficExternal"
});

/*
  Traffic-source metrics should represent discovery and
  public reach, not every private dashboard action.
*/
const TRAFFIC_EVENT_TYPES = new Set([
  "profile_impression",
  "profile_view",
  "profile_unique_view",
  "profile_contact_click",
  "profile_website_click",
  "profile_message_click",
  "profile_share",

  "post_impression",
  "post_view",
  "post_unique_view",
  "post_like",
  "post_comment",
  "post_reply",
  "post_share",
  "post_save",

  "student_view",
  "student_unique_view",

  "teacher_view",
  "teacher_unique_view",

  "class_view",
  "class_unique_view",

  "career_view",

  "search_impression",
  "search_click"
]);

/* =========================================================
   DEVICE MAPPING
========================================================= */

const DEVICE_COUNTER_MAP = Object.freeze({
  desktop: "deviceDesktop",
  mobile: "deviceMobile",
  tablet: "deviceTablet",
  bot: "deviceBot",
  unknown: "deviceUnknown"
});

/* =========================================================
   ALLOWED COUNTERS
========================================================= */

const ALLOWED_COUNTER_FIELDS = new Set(
  typeof AnalyticsDaily.getCounterFields === "function"
    ? AnalyticsDaily.getCounterFields()
    : []
);

/*
  These fields are legitimate daily numeric accumulators but
  are not simple event counters returned by getCounterFields.
*/
[
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
].forEach(field => {
  ALLOWED_COUNTER_FIELDS.add(field);
});

/* =========================================================
   GENERAL HELPERS
========================================================= */

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );
}

function toFiniteNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function toNonNegativeNumber(
  value,
  fallback = 0
) {
  return Math.max(
    0,
    toFiniteNumber(value, fallback)
  );
}

function normalizeEventType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeSource(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return source || "unknown";
}

function normalizeDeviceType(value) {
  const device = String(value || "")
    .trim()
    .toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    DEVICE_COUNTER_MAP,
    device
  )
    ? device
    : "unknown";
}

function normalizeOccurredAt(value) {
  const date = new Date(
    value || Date.now()
  );

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

/* =========================================================
   DATE HELPERS
========================================================= */

function dateKey(value = new Date()) {
  const date = normalizeOccurredAt(value);

  return date
    .toISOString()
    .slice(0, 10);
}

function createDayBounds(
  value = new Date()
) {
  if (
    typeof AnalyticsDaily.createDayBounds ===
    "function"
  ) {
    return AnalyticsDaily.createDayBounds(
      value
    );
  }

  const date = dateKey(value);

  const dayStart = new Date(
    `${date}T00:00:00.000Z`
  );

  const dayEnd = new Date(
    dayStart
  );

  dayEnd.setUTCDate(
    dayEnd.getUTCDate() + 1
  );

  return {
    date,
    dayStart,
    dayEnd
  };
}

/* =========================================================
   INCREMENT BUILDING
========================================================= */

function addIncrement(
  increments,
  field,
  amount = 1
) {
  if (
    !field ||
    !ALLOWED_COUNTER_FIELDS.has(field)
  ) {
    return;
  }

  const safeAmount =
    toNonNegativeNumber(amount);

  if (!safeAmount) {
    return;
  }

  increments[field] =
    toNonNegativeNumber(
      increments[field]
    ) + safeAmount;
}

function buildBaseEventIncrements({
  eventType,
  amount = 1
}) {
  const normalizedType =
    normalizeEventType(eventType);

  const fields =
    EVENT_COUNTER_MAP[normalizedType];

  const increments = {};

  if (!Array.isArray(fields)) {
    return increments;
  }

  fields.forEach(field => {
    addIncrement(
      increments,
      field,
      amount
    );
  });

  return increments;
}

/* =========================================================
   TRAFFIC AND DEVICE INCREMENTS
========================================================= */

function addTrafficIncrement({
  increments,
  eventType,
  source,
  amount = 1
}) {
  const normalizedEventType =
    normalizeEventType(eventType);

  if (
    !TRAFFIC_EVENT_TYPES.has(
      normalizedEventType
    )
  ) {
    return;
  }

  const normalizedSource =
    normalizeSource(source);

  const field =
    SOURCE_COUNTER_MAP[normalizedSource] ||
    "trafficOther";

  addIncrement(
    increments,
    field,
    amount
  );
}

function addDeviceIncrement({
  increments,
  eventType,
  deviceType,
  amount = 1
}) {
  const normalizedEventType =
    normalizeEventType(eventType);

  if (
    !TRAFFIC_EVENT_TYPES.has(
      normalizedEventType
    )
  ) {
    return;
  }

  const normalizedDevice =
    normalizeDeviceType(deviceType);

  const field =
    DEVICE_COUNTER_MAP[normalizedDevice];

  addIncrement(
    increments,
    field,
    amount
  );
}

/* =========================================================
   ATTENDANCE METRICS
========================================================= */

function addAttendanceMetrics({
  increments,
  metadata
}) {
  const safeMetadata =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? metadata
      : {};

  if (
    safeMetadata.participationScore !==
    undefined
  ) {
    const participationScore = Math.min(
      100,
      toNonNegativeNumber(
        safeMetadata.participationScore
      )
    );

    addIncrement(
      increments,
      "participationScoreTotal",
      participationScore
    );

    addIncrement(
      increments,
      "participationScoreCount",
      1
    );
  }

  if (
    safeMetadata.durationMinutes !==
    undefined
  ) {
    const durationMinutes =
      toNonNegativeNumber(
        safeMetadata.durationMinutes
      );

    addIncrement(
      increments,
      "attendanceDurationMinutesTotal",
      durationMinutes
    );

    addIncrement(
      increments,
      "attendanceDurationCount",
      1
    );
  }

  if (
    safeMetadata.meetingJoined === true
  ) {
    addIncrement(
      increments,
      "meetingJoins",
      1
    );
  }

  if (
    safeMetadata.requiresFollowUp === true
  ) {
    addIncrement(
      increments,
      "attendanceFollowUps",
      1
    );
  }
}

/* =========================================================
   SUBMISSION AND REVIEW METRICS
========================================================= */

function parseNumericGrade(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const text = String(value).trim();

  /*
    Supports values such as:

    85
    85%
    85 / 100

    Letter grades such as A or B+ are intentionally ignored.
  */
  const match = text.match(
    /^(-?\d+(?:\.\d+)?)/
  );

  if (!match) {
    return null;
  }

  const grade = Number(match[1]);

  if (
    !Number.isFinite(grade) ||
    grade < 0
  ) {
    return null;
  }

  return grade;
}

function addSubmissionMetrics({
  increments,
  metadata
}) {
  const safeMetadata =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? metadata
      : {};

  const numericGrade =
    parseNumericGrade(
      safeMetadata.grade
    );

  if (numericGrade !== null) {
    addIncrement(
      increments,
      "gradeTotal",
      numericGrade
    );

    addIncrement(
      increments,
      "gradeCount",
      1
    );
  }

  if (
    safeMetadata.reviewTimeMinutes !==
    undefined
  ) {
    const reviewTimeMinutes =
      toNonNegativeNumber(
        safeMetadata.reviewTimeMinutes
      );

    addIncrement(
      increments,
      "reviewTimeMinutesTotal",
      reviewTimeMinutes
    );

    addIncrement(
      increments,
      "reviewTimeCount",
      1
    );
  }
}

/* =========================================================
   VISITOR CLASSIFICATION
========================================================= */

function addVisitorClassification({
  increments,
  eventType,
  metadata
}) {
  if (
    normalizeEventType(eventType) !==
    "profile_unique_view"
  ) {
    return;
  }

  const safeMetadata =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? metadata
      : {};

  if (
    safeMetadata.visitorType ===
    "returning"
  ) {
    addIncrement(
      increments,
      "returningVisitors",
      1
    );

    return;
  }

  if (
    safeMetadata.visitorType ===
    "new"
  ) {
    addIncrement(
      increments,
      "newVisitors",
      1
    );
  }
}

/* =========================================================
   BUILD COMPLETE DAILY UPDATE
========================================================= */

function buildDailyIncrements({
  eventType,
  amount = 1,
  source = "unknown",
  deviceType = "unknown",
  metadata = {}
}) {
  const normalizedEventType =
    normalizeEventType(eventType);

  const safeAmount =
    Math.max(
      1,
      Math.floor(
        toNonNegativeNumber(amount, 1)
      )
    );

  const increments =
    buildBaseEventIncrements({
      eventType: normalizedEventType,
      amount: safeAmount
    });

  addTrafficIncrement({
    increments,
    eventType: normalizedEventType,
    source,
    amount: safeAmount
  });

  addDeviceIncrement({
    increments,
    eventType: normalizedEventType,
    deviceType,
    amount: safeAmount
  });

  if (
    normalizedEventType.startsWith(
      "attendance_"
    )
  ) {
    addAttendanceMetrics({
      increments,
      metadata
    });
  }

  if (
    [
      "assignment_reviewed",
      "assignment_returned",
      "assignment_completed"
    ].includes(normalizedEventType)
  ) {
    addSubmissionMetrics({
      increments,
      metadata
    });
  }

  addVisitorClassification({
    increments,
    eventType: normalizedEventType,
    metadata
  });

  return increments;
}

/* =========================================================
   DAILY ANALYTICS WRITE
========================================================= */

async function incrementDailyAnalytics({
  schoolId,
  eventType,
  occurredAt = new Date(),
  amount = 1,
  source = "unknown",
  deviceType = "unknown",
  metadata = {},
  mongoSession = null
}) {
  if (!isValidObjectId(schoolId)) {
    throw new TypeError(
      "A valid schoolId is required to increment daily analytics."
    );
  }

  const normalizedEventType =
    normalizeEventType(eventType);

  if (!normalizedEventType) {
    throw new TypeError(
      "eventType is required to increment daily analytics."
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      EVENT_COUNTER_MAP,
      normalizedEventType
    )
  ) {
    /*
      Unknown analytics events are ignored rather than
      breaking the main application action.

      Validation middleware should normally prevent this.
    */
    return {
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      skipped: true,
      reason: "unsupported_event_type"
    };
  }

  const normalizedOccurredAt =
    normalizeOccurredAt(occurredAt);

  const {
    date,
    dayStart,
    dayEnd
  } = createDayBounds(
    normalizedOccurredAt
  );

  const increments =
    buildDailyIncrements({
      eventType: normalizedEventType,
      amount,
      source,
      deviceType,
      metadata
    });

  if (!Object.keys(increments).length) {
    return {
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      skipped: true,
      reason: "no_daily_counters"
    };
  }

  const updateOptions = {
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true
  };

  if (mongoSession) {
    updateOptions.session =
      mongoSession;
  }

  return AnalyticsDaily.updateOne(
    {
      schoolId,
      date
    },
    {
      $setOnInsert: {
        schoolId,
        date,
        dayStart,
        dayEnd
      },

      $inc: increments
    },
    updateOptions
  );
}

/* =========================================================
   MANUAL METRIC INCREMENT
========================================================= */

/*
  This helper is useful when a backend route needs to update
  a controlled numeric metric that does not correspond to one
  event type.

  Example:

  incrementDailyMetric({
    schoolId,
    field: "participationScoreTotal",
    amount: 85
  });

  Do not accept the field directly from a browser request.
*/
async function incrementDailyMetric({
  schoolId,
  field,
  amount,
  occurredAt = new Date(),
  mongoSession = null
}) {
  if (!isValidObjectId(schoolId)) {
    throw new TypeError(
      "A valid schoolId is required to increment a daily metric."
    );
  }

  if (
    !field ||
    !ALLOWED_COUNTER_FIELDS.has(field)
  ) {
    throw new TypeError(
      "The requested analytics metric is not allowed."
    );
  }

  const safeAmount =
    toNonNegativeNumber(amount);

  if (!safeAmount) {
    return {
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      skipped: true,
      reason: "zero_amount"
    };
  }

  const normalizedOccurredAt =
    normalizeOccurredAt(occurredAt);

  const {
    date,
    dayStart,
    dayEnd
  } = createDayBounds(
    normalizedOccurredAt
  );

  const updateOptions = {
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true
  };

  if (mongoSession) {
    updateOptions.session =
      mongoSession;
  }

  return AnalyticsDaily.updateOne(
    {
      schoolId,
      date
    },
    {
      $setOnInsert: {
        schoolId,
        date,
        dayStart,
        dayEnd
      },

      $inc: {
        [field]: safeAmount
      }
    },
    updateOptions
  );
}

/* =========================================================
   ROLLBACK SUPPORT
========================================================= */

/*
  This is intended only for trusted backend compensation
  logic when an operation fails after a daily increment was
  committed.

  Do not expose this function to a public API endpoint.

  It uses an aggregation pipeline to ensure the counter never
  falls below zero.
*/
async function decrementDailyMetricSafely({
  schoolId,
  field,
  amount = 1,
  occurredAt = new Date(),
  mongoSession = null
}) {
  if (!isValidObjectId(schoolId)) {
    throw new TypeError(
      "A valid schoolId is required to decrement a daily metric."
    );
  }

  if (
    !field ||
    !ALLOWED_COUNTER_FIELDS.has(field)
  ) {
    throw new TypeError(
      "The requested analytics metric is not allowed."
    );
  }

  const safeAmount =
    toNonNegativeNumber(amount);

  if (!safeAmount) {
    return {
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      skipped: true,
      reason: "zero_amount"
    };
  }

  const {
    date
  } = createDayBounds(
    occurredAt
  );

  const updateOptions = {};

  if (mongoSession) {
    updateOptions.session =
      mongoSession;
  }

  return AnalyticsDaily.updateOne(
    {
      schoolId,
      date
    },
    [
      {
        $set: {
          [field]: {
            $max: [
              0,
              {
                $subtract: [
                  {
                    $ifNull: [
                      `$${field}`,
                      0
                    ]
                  },
                  safeAmount
                ]
              }
            ]
          }
        }
      }
    ],
    updateOptions
  );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  EVENT_COUNTER_MAP,
  SOURCE_COUNTER_MAP,
  DEVICE_COUNTER_MAP,
  TRAFFIC_EVENT_TYPES,

  dateKey,
  createDayBounds,
  buildDailyIncrements,

  incrementDailyAnalytics,
  incrementDailyMetric,
  decrementDailyMetricSafely
};
