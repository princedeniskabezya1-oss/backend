"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const AnalyticsEvent = require(
  "../models/AnalyticsEvent"
);

const AnalyticsDaily = require(
  "../models/AnalyticsDaily"
);

const User = require("../models/User");
const Class = require("../models/Class");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Attendance = require("../models/Attendance");
const SchoolOpportunity = require(
  "../models/SchoolOpportunity"
);

const {
  incrementDailyAnalytics
} = require(
  "../services/analyticsAggregationService"
);

/* =========================================================
   CONSTANTS
========================================================= */

const UNIQUE_EVENT_TYPES = new Set([
  "profile_unique_view",
  "post_unique_view",
  "student_unique_view",
  "teacher_unique_view",
  "class_unique_view"
]);

const PUBLIC_BROWSER_EVENT_TYPES = new Set([
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

  "student_view",
  "student_unique_view",

  "teacher_view",
  "teacher_unique_view",

  "class_view",
  "class_unique_view",

  "career_view",

  "search_impression",
  "search_click",

  "dashboard_view"
]);

const DAILY_SUM_FIELDS = [
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

  /* Posts */
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

  "participationScoreTotal",
  "participationScoreCount",

  "attendanceDurationMinutesTotal",
  "attendanceDurationCount",

  /* Assignments */
  "assignmentsCreated",
  "assignmentsViewed",
  "assignmentsUpdated",
  "assignmentsDeleted",
  "assignmentsSubmitted",
  "assignmentsResubmitted",
  "assignmentsReviewed",
  "assignmentsReturned",
  "assignmentsCompleted",

  "gradeTotal",
  "gradeCount",

  "reviewTimeMinutesTotal",
  "reviewTimeCount",

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

  /* Search */
  "searchImpressions",
  "searchClicks",

  /* Dashboard */
  "dashboardViews",
  "schoolLogins",
  "activeSessions",

  /* Audience */
  "uniqueVisitors",
  "returningVisitors",
  "newVisitors",

  /* Traffic */
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

  /* Devices */
  "deviceDesktop",
  "deviceMobile",
  "deviceTablet",
  "deviceBot",
  "deviceUnknown"
];

/* =========================================================
   GENERAL HELPERS
========================================================= */

function safeObjectId(value) {
  if (
    !value ||
    !mongoose.Types.ObjectId.isValid(
      String(value)
    )
  ) {
    return null;
  }

  return new mongoose.Types.ObjectId(
    String(value)
  );
}

function normalizeString(
  value,
  maximumLength = 200
) {
  return String(value || "")
    .trim()
    .slice(0, maximumLength);
}

function finiteNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nonNegativeNumber(
  value,
  fallback = 0
) {
  return Math.max(
    0,
    finiteNumber(value, fallback)
  );
}

function percentage(
  value,
  total,
  decimals = 2
) {
  const safeValue =
    nonNegativeNumber(value);

  const safeTotal =
    nonNegativeNumber(total);

  if (!safeTotal) {
    return 0;
  }

  return Number(
    (
      safeValue /
      safeTotal *
      100
    ).toFixed(decimals)
  );
}

function clampScore(value) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        finiteNumber(value)
      )
    )
  );
}

function average(
  total,
  count,
  decimals = 2
) {
  const safeTotal =
    nonNegativeNumber(total);

  const safeCount =
    nonNegativeNumber(count);

  if (!safeCount) {
    return 0;
  }

  return Number(
    (
      safeTotal /
      safeCount
    ).toFixed(decimals)
  );
}

function dateKey(value = new Date()) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function utcDayStart(value = new Date()) {
  return new Date(
    `${dateKey(value)}T00:00:00.000Z`
  );
}

function addUtcDays(
  value,
  numberOfDays
) {
  const date = new Date(value);

  date.setUTCDate(
    date.getUTCDate() +
    Number(numberOfDays || 0)
  );

  return date;
}

function actorIdFromRequest(req) {
  return safeObjectId(
    req.analyticsContext?.actorId ||
    req.user?._id ||
    req.user?.id
  );
}

/* =========================================================
   DATE RANGE
========================================================= */

function resolveDateRange(value) {
  const requestedRange =
    normalizeString(value || "30", 20)
      .toLowerCase();

  const now = new Date();

  if (requestedRange === "all") {
    return {
      key: "all",
      days: null,
      start: null,
      end: now,
      endExclusive:
        addUtcDays(
          utcDayStart(now),
          1
        ),
      label: "All time"
    };
  }

  const supportedRanges =
    new Set([
      7,
      30,
      90,
      180,
      365
    ]);

  const numericRange =
    Number(requestedRange);

  const days =
    supportedRanges.has(numericRange)
      ? numericRange
      : 30;

  const endDay =
    utcDayStart(now);

  const start =
    addUtcDays(
      endDay,
      -(days - 1)
    );

  const endExclusive =
    addUtcDays(
      endDay,
      1
    );

  return {
    key: String(days),
    days,
    start,
    end: now,
    endExclusive,
    label: `Last ${days} days`
  };
}

/* =========================================================
   AUTHORIZATION
========================================================= */

function canAccessSchoolAnalytics(
  user,
  schoolId
) {
  if (!user || !schoolId) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  if (
    user.role === "school" &&
    String(user._id) === String(schoolId)
  ) {
    return true;
  }

  return false;
}

async function validateSchoolAccount(
  schoolId
) {
  return User.findOne({
    _id: schoolId,
    role: "school",
    status: {
      $ne: "suspended"
    }
  })
    .select(
      [
        "_id",
        "name",
        "schoolName",
        "role",
        "followers",
        "profileViews",
        "postImpressions",
        "createdAt"
      ].join(" ")
    )
    .lean();
}

/* =========================================================
   METADATA HELPERS
========================================================= */

function safeMetadata(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}

function buildVisitorIdentity({
  actorId,
  sessionId,
  ipHash
}) {
  if (actorId) {
    return `actor:${String(actorId)}`;
  }

  if (sessionId) {
    return `session:${String(sessionId)}`;
  }

  if (ipHash) {
    return `visitor:${String(ipHash)}`;
  }

  return null;
}

function createDedupeKey({
  schoolId,
  eventType,
  entityType,
  entityId,
  actorId,
  sessionId,
  ipHash,
  occurredAt
}) {
  if (
    !UNIQUE_EVENT_TYPES.has(eventType)
  ) {
    return null;
  }

  const visitorIdentity =
    buildVisitorIdentity({
      actorId,
      sessionId,
      ipHash
    });

  if (!visitorIdentity) {
    /*
      We cannot safely classify an unidentified visitor as
      unique, so the event is skipped by the controller.
    */
    return null;
  }

  const entityIdentity =
    entityId
      ? String(entityId)
      : String(schoolId);

  const rawKey = [
    eventType,
    String(schoolId),
    entityType,
    entityIdentity,
    visitorIdentity,
    dateKey(occurredAt)
  ].join(":");

  /*
    Store a stable fixed-length digest rather than a long
    string containing session information.
  */
  return crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex");
}

/* =========================================================
   VISITOR CLASSIFICATION
========================================================= */

async function resolveVisitorType({
  schoolId,
  actorId,
  sessionId,
  ipHash,
  occurredAt
}) {
  const identityConditions = [];

  if (actorId) {
    identityConditions.push({
      actorId
    });
  }

  if (sessionId) {
    identityConditions.push({
      sessionId
    });
  }

  if (ipHash) {
    identityConditions.push({
      ipHash
    });
  }

  if (!identityConditions.length) {
    return "unknown";
  }

  const beginningOfToday =
    utcDayStart(occurredAt);

  const previousView =
    await AnalyticsEvent.exists({
      schoolId,

      eventType:
        "profile_unique_view",

      occurredAt: {
        $lt: beginningOfToday
      },

      $or: identityConditions
    });

  return previousView
    ? "returning"
    : "new";
}

/* =========================================================
   EVENT RECORDING
========================================================= */

async function recordEvent(req, res) {
  let mongoSession = null;

  try {
    const validated =
      req.validatedAnalyticsEvent ||
      req.body ||
      {};

    const schoolId =
      safeObjectId(
        validated.schoolId
      );

    const eventType =
      normalizeString(
        validated.eventType,
        100
      ).toLowerCase();

    const entityType =
      normalizeString(
        validated.entityType ||
        "school",
        100
      ).toLowerCase();

    const entityId =
      safeObjectId(
        validated.entityId
      );

    const context =
      req.analyticsContext || {};

    const actorId =
      actorIdFromRequest(req);

    const sessionId =
      normalizeString(
        context.sessionId ||
        req.body?.sessionId,
        128
      ) || null;

    const source =
      normalizeString(
        context.source ||
        validated.source ||
        "unknown",
        80
      ).toLowerCase();

    const deviceType =
      normalizeString(
        context.deviceType ||
        req.body?.deviceType ||
        "unknown",
        30
      ).toLowerCase();

    const ipHash =
      normalizeString(
        context.ipHash,
        128
      ) || null;

    const occurredAt =
      context.occurredAt instanceof Date
        ? context.occurredAt
        : new Date();

    const metadata = {
      ...safeMetadata(
        validated.metadata
      )
    };

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          "A valid schoolId is required."
      });
    }

    if (!eventType) {
      return res.status(400).json({
        success: false,
        message:
          "eventType is required."
      });
    }

    const school =
      await validateSchoolAccount(
        schoolId
      );

    if (!school) {
      return res.status(404).json({
        success: false,
        message:
          "School account was not found."
      });
    }

    /*
      Do not count the school owner viewing or interacting
      with their own public school profile.
    */
    const isSelfProfileActivity =
      actorId &&
      String(actorId) ===
        String(schoolId) &&
      [
        "profile_impression",
        "profile_view",
        "profile_unique_view",
        "profile_contact_click",
        "profile_website_click",
        "profile_message_click",
        "profile_share"
      ].includes(eventType);

    if (isSelfProfileActivity) {
      return res.status(200).json({
        success: true,
        recorded: false,
        skipped: true,
        reason: "self_activity"
      });
    }

    /*
      Browser clients may record only low-risk visibility and
      discovery events.

      Authoritative actions such as follow, attendance,
      submission, grading, likes, and saves should be recorded
      directly by the backend route that performs the action.
    */
    const isBrowserEventEndpoint =
      req.baseUrl ===
        "/api/analytics";

    if (
      isBrowserEventEndpoint &&
      !PUBLIC_BROWSER_EVENT_TYPES.has(
        eventType
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "This analytics event must be recorded by its authoritative backend route."
      });
    }

    if (
      eventType ===
        "profile_unique_view"
    ) {
      const visitorType =
        await resolveVisitorType({
          schoolId,
          actorId,
          sessionId,
          ipHash,
          occurredAt
        });

      metadata.visitorType =
        visitorType;
    }

    const dedupeKey =
      createDedupeKey({
        schoolId,
        eventType,
        entityType,
        entityId,
        actorId,
        sessionId,
        ipHash,
        occurredAt
      });

    if (
      UNIQUE_EVENT_TYPES.has(
        eventType
      ) &&
      !dedupeKey
    ) {
      return res.status(200).json({
        success: true,
        recorded: false,
        skipped: true,
        reason:
          "visitor_identity_unavailable"
      });
    }

    const expiresAt =
      new Date(occurredAt);

    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + 180
    );

    mongoSession =
      await mongoose.startSession();

    mongoSession.startTransaction();

    const createdEvents =
      await AnalyticsEvent.create(
        [
          {
            schoolId,
            actorId,
            sessionId,
            ipHash,

            eventType,
            entityType,
            entityId,

            source,
            metadata,
            dedupeKey,

            userAgent:
              context.userAgent ||
              null,

            referrer:
              context.referrer ||
              null,

            requestPath:
              context.requestPath ||
              null,

            deviceType,

            occurredAt,
            expiresAt
          }
        ],
        {
          session: mongoSession
        }
      );

    const event =
      createdEvents[0];

    await incrementDailyAnalytics({
      schoolId,
      eventType,
      occurredAt,
      source,
      deviceType,
      metadata,
      mongoSession
    });

    /*
      Preserve the existing all-time profileViews counter in
      the User model for compatibility with older frontend
      pages.

      Only normal profile views increase this counter.
      Unique views have their own daily metric.
    */
    if (
      eventType === "profile_view"
    ) {
      await User.updateOne(
        {
          _id: schoolId
        },
        {
          $inc: {
            profileViews: 1
          }
        },
        {
          session: mongoSession
        }
      );
    }

    await mongoSession
      .commitTransaction();

    return res.status(201).json({
      success: true,
      recorded: true,
      duplicate: false,
      eventId: event._id,
      occurredAt
    });
  } catch (error) {
    if (
      mongoSession?.inTransaction()
    ) {
      await mongoSession
        .abortTransaction()
        .catch(() => {});
    }

    /*
      MongoDB duplicate key code 11000 means an identical
      deduplicated event was already recorded.
    */
    if (error?.code === 11000) {
      return res.status(200).json({
        success: true,
        recorded: false,
        duplicate: true
      });
    }

    console.error(
      "recordEvent error:",
      {
        message: error.message,
        stack:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : error.stack,

        requestId:
          req.analyticsContext
            ?.requestId ||
          null
      }
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not record analytics event.",
      requestId:
        req.analyticsContext
          ?.requestId ||
        null
    });
  } finally {
    if (mongoSession) {
      await mongoSession
        .endSession()
        .catch(() => {});
    }
  }
}

/* =========================================================
   DAILY SUMMARY
========================================================= */

function createEmptyDailySummary() {
  return DAILY_SUM_FIELDS.reduce(
    (summary, field) => {
      summary[field] = 0;
      return summary;
    },
    {}
  );
}

function sumDailyDocuments(rows) {
  const summary =
    createEmptyDailySummary();

  for (const row of rows) {
    for (const field of DAILY_SUM_FIELDS) {
      summary[field] +=
        nonNegativeNumber(
          row?.[field]
        );
    }
  }

  return summary;
}

function emptyDailyRow(date) {
  return {
    date,

    ...createEmptyDailySummary(),

    netFollowers: 0,
    netPostLikes: 0,
    netPostSaves: 0,

    attendanceRate: 0,
    averageParticipationScore: 0,
    averageAttendanceDurationMinutes: 0,
    averageGrade: 0,
    averageReviewTimeMinutes: 0,

    publicEngagementRate: 0,
    searchClickThroughRate: 0
  };
}

function deriveDailyRow(row) {
  const output = {
    date: row.date
  };

  for (const field of DAILY_SUM_FIELDS) {
    output[field] =
      nonNegativeNumber(
        row[field]
      );
  }

  output.netFollowers =
    output.followersGained -
    output.followersLost;

  output.netPostLikes =
    Math.max(
      0,
      output.postLikesGained -
      output.postLikesRemoved
    );

  output.netPostSaves =
    Math.max(
      0,
      output.postSavesGained -
      output.postSavesRemoved
    );

  const attendanceTotal =
    output.attendancePresent +
    output.attendanceLate +
    output.attendanceAbsent +
    output.attendanceExcused;

  const weightedAttendance =
    output.attendancePresent +
    output.attendanceLate * 0.75 +
    output.attendanceExcused * 0.5;

  output.attendanceRate =
    percentage(
      weightedAttendance,
      attendanceTotal
    );

  output.averageParticipationScore =
    average(
      output.participationScoreTotal,
      output.participationScoreCount
    );

  output.averageAttendanceDurationMinutes =
    average(
      output.attendanceDurationMinutesTotal,
      output.attendanceDurationCount
    );

  output.averageGrade =
    average(
      output.gradeTotal,
      output.gradeCount
    );

  output.averageReviewTimeMinutes =
    average(
      output.reviewTimeMinutesTotal,
      output.reviewTimeCount
    );

  const interactions =
    output.netPostLikes +
    output.postComments +
    output.postReplies +
    output.postShares +
    output.netPostSaves;

  output.publicEngagementRate =
    percentage(
      interactions,
      output.postViews
    );

  output.searchClickThroughRate =
    percentage(
      output.searchClicks,
      output.searchImpressions
    );

  return output;
}

function fillDailyTimeline(
  rows,
  range
) {
  const rowMap = new Map(
    rows.map(row => [
      row.date,
      deriveDailyRow(row)
    ])
  );

  if (!range.start) {
    return [...rowMap.values()]
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );
  }

  const timeline = [];

  let cursor =
    new Date(range.start);

  while (
    cursor <
    range.endExclusive
  ) {
    const key =
      dateKey(cursor);

    timeline.push(
      rowMap.get(key) ||
      emptyDailyRow(key)
    );

    cursor =
      addUtcDays(cursor, 1);
  }

  return timeline;
}

/* =========================================================
   ATTENDANCE AND SUBMISSION CALCULATIONS
========================================================= */

function attendanceStatistics(rows) {
  const stats = {
    total: rows.length,

    present: 0,
    late: 0,
    absent: 0,
    excused: 0,

    meetingJoined: 0,
    requiresFollowUp: 0,

    participationTotal: 0,
    participationCount: 0,

    durationTotal: 0,
    durationCount: 0
  };

  for (const row of rows) {
    const status =
      normalizeString(
        row.status,
        30
      ).toLowerCase();

    if (
      Object.prototype.hasOwnProperty.call(
        stats,
        status
      )
    ) {
      stats[status] += 1;
    }

    if (row.meetingJoined === true) {
      stats.meetingJoined += 1;
    }

    if (
      row.requiresFollowUp === true
    ) {
      stats.requiresFollowUp += 1;
    }

    const participationScore =
      Number(row.participationScore);

    if (
      Number.isFinite(
        participationScore
      )
    ) {
      stats.participationTotal +=
        Math.max(
          0,
          Math.min(
            100,
            participationScore
          )
        );

      stats.participationCount += 1;
    }

    const durationMinutes =
      Number(row.durationMinutes);

    if (
      Number.isFinite(
        durationMinutes
      ) &&
      durationMinutes >= 0
    ) {
      stats.durationTotal +=
        durationMinutes;

      stats.durationCount += 1;
    }
  }

  const weightedAttendance =
    stats.present +
    stats.late * 0.75 +
    stats.excused * 0.5;

  return {
    ...stats,

    attendanceRate:
      percentage(
        weightedAttendance,
        stats.total
      ),

    presentRate:
      percentage(
        stats.present,
        stats.total
      ),

    lateRate:
      percentage(
        stats.late,
        stats.total
      ),

    absenceRate:
      percentage(
        stats.absent,
        stats.total
      ),

    excusedRate:
      percentage(
        stats.excused,
        stats.total
      ),

    meetingJoinRate:
      percentage(
        stats.meetingJoined,
        stats.total
      ),

    followUpRate:
      percentage(
        stats.requiresFollowUp,
        stats.total
      ),

    participationAverage:
      average(
        stats.participationTotal,
        stats.participationCount
      ),

    averageDurationMinutes:
      average(
        stats.durationTotal,
        stats.durationCount
      )
  };
}

function submissionStatistics(
  submissions,
  expectedSubmissions
) {
  let reviewed = 0;
  let returned = 0;
  let pending = 0;

  let gradeTotal = 0;
  let gradeCount = 0;

  let reviewMinutesTotal = 0;
  let reviewMinutesCount = 0;

  for (const submission of submissions) {
    const status =
      normalizeString(
        submission.status,
        30
      ).toLowerCase();

    if (status === "reviewed") {
      reviewed += 1;
    } else if (status === "returned") {
      returned += 1;
    } else {
      pending += 1;
    }

    const gradeMatch =
      String(
        submission.grade || ""
      ).match(
        /^(-?\d+(?:\.\d+)?)/
      );

    if (gradeMatch) {
      const grade =
        Number(gradeMatch[1]);

      if (
        Number.isFinite(grade) &&
        grade >= 0
      ) {
        gradeTotal += grade;
        gradeCount += 1;
      }
    }

    if (
      submission.submittedAt &&
      submission.reviewedAt
    ) {
      const submittedAt =
        new Date(
          submission.submittedAt
        );

      const reviewedAt =
        new Date(
          submission.reviewedAt
        );

      const difference =
        reviewedAt.getTime() -
        submittedAt.getTime();

      if (
        Number.isFinite(difference) &&
        difference >= 0
      ) {
        reviewMinutesTotal +=
          difference / 60000;

        reviewMinutesCount += 1;
      }
    }
  }

  return {
    total: submissions.length,
    reviewed,
    returned,
    pending,

    completionRate:
      percentage(
        submissions.length,
        expectedSubmissions
      ),

    reviewRate:
      percentage(
        reviewed + returned,
        submissions.length
      ),

    averageGrade:
      average(
        gradeTotal,
        gradeCount
      ),

    averageReviewTimeMinutes:
      average(
        reviewMinutesTotal,
        reviewMinutesCount
      )
  };
}

/* =========================================================
   PERFORMANCE SCORING
========================================================= */

function calculateOverallScore({
  attendanceRate,
  participationAverage,
  completionRate,
  teacherReviewRate,
  classUtilizationRate,
  publicEngagementScore,
  careerScore
}) {
  const weightedScore =
    clampScore(attendanceRate) * 0.24 +
    clampScore(participationAverage) * 0.16 +
    clampScore(completionRate) * 0.2 +
    clampScore(teacherReviewRate) * 0.14 +
    clampScore(classUtilizationRate) * 0.1 +
    clampScore(publicEngagementScore) * 0.1 +
    clampScore(careerScore) * 0.06;

  return clampScore(
    weightedScore
  );
}

function performanceBand(score) {
  const value =
    clampScore(score);

  if (value >= 85) {
    return {
      key: "excellent",
      label: "Excellent",
      color: "green"
    };
  }

  if (value >= 75) {
    return {
      key: "good",
      label: "Good",
      color: "green"
    };
  }

  if (value >= 50) {
    return {
      key: "needs_attention",
      label: "Needs attention",
      color: "orange"
    };
  }

  return {
    key: "poor",
    label: "Poor",
    color: "red"
  };
}

/* =========================================================
   RECOMMENDATIONS
========================================================= */

function buildRecommendations({
  attendance,
  submissions,
  studentsAtRisk,
  publicEngagementRate,
  currentFollowers,
  currentProfileViews,
  opportunityCount,
  classUtilizationRate
}) {
  const recommendations = [];

  if (attendance.attendanceRate < 75) {
    recommendations.push({
      level: "poor",
      category: "attendance",
      title:
        "Improve student attendance",
      message:
        `Attendance is ${attendance.attendanceRate}%. Review absent and late students and confirm that class schedules are accessible.`,
      action: "attendance"
    });
  }

  if (
    attendance.participationAverage <
    60
  ) {
    recommendations.push({
      level: "warning",
      category: "participation",
      title:
        "Increase classroom participation",
      message:
        `Average participation is ${attendance.participationAverage}%. Consider interactive lessons, attendance follow-ups, and student engagement plans.`,
      action: "attendance"
    });
  }

  if (
    submissions.completionRate <
    70
  ) {
    recommendations.push({
      level: "warning",
      category: "assignments",
      title:
        "Improve assignment completion",
      message:
        `Assignment completion is ${submissions.completionRate}%. Follow up with students who have not submitted required work.`,
      action: "classes"
    });
  }

  if (submissions.pending > 0) {
    recommendations.push({
      level:
        submissions.pending > 10
          ? "poor"
          : "warning",
      category: "teacher_reviews",
      title:
        "Complete pending reviews",
      message:
        `${submissions.pending} submission${submissions.pending === 1 ? "" : "s"} still require teacher review or feedback.`,
      action: "teachers"
    });
  }

  if (studentsAtRisk > 0) {
    recommendations.push({
      level: "poor",
      category: "student_risk",
      title:
        "Support students requiring attention",
      message:
        `${studentsAtRisk} student${studentsAtRisk === 1 ? "" : "s"} may require intervention based on attendance, participation, or missing submissions.`,
      action: "insights"
    });
  }

  if (classUtilizationRate < 60) {
    recommendations.push({
      level: "warning",
      category: "classes",
      title:
        "Improve class utilization",
      message:
        "Some active classes have little or no recorded learning activity during the selected period.",
      action: "classes"
    });
  }

  if (
    publicEngagementRate < 3 &&
    currentProfileViews > 0
  ) {
    recommendations.push({
      level: "warning",
      category: "public_engagement",
      title:
        "Increase public engagement",
      message:
        "Your school is receiving public views, but visitors are interacting with posts and updates at a low rate.",
      action: "overview"
    });
  }

  if (
    !currentFollowers &&
    !currentProfileViews
  ) {
    recommendations.push({
      level: "warning",
      category: "visibility",
      title:
        "Build public visibility",
      message:
        "Publish school updates and share your public school profile to attract students, teachers, employers, and partners.",
      action: "profile"
    });
  }

  if (opportunityCount < 3) {
    recommendations.push({
      level: "warning",
      category: "career",
      title:
        "Expand career opportunities",
      message:
        "Add more jobs, internships, company partnerships, or placement opportunities for students.",
      action: "portal"
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      level: "good",
      category: "overall",
      title:
        "School performance is healthy",
      message:
        "No critical performance risks were detected in the selected period. Continue monitoring attendance, learning outcomes, teacher reviews, and public engagement.",
      action: "overview"
    });
  }

  return recommendations;
}

/* =========================================================
   SCHOOL ANALYTICS
========================================================= */

async function getSchoolAnalytics(
  req,
  res
) {
  try {
    const schoolId =
      safeObjectId(
        req.params.schoolId
      );

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message:
          "A valid school ID is required."
      });
    }

    if (
      !canAccessSchoolAnalytics(
        req.user,
        schoolId
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to access this school analytics."
      });
    }

    const school =
      await validateSchoolAccount(
        schoolId
      );

    if (!school) {
      return res.status(404).json({
        success: false,
        message:
          "School account was not found."
      });
    }

    const range =
      resolveDateRange(
        req.query.range
      );

    const dailyQuery = {
      schoolId
    };

    if (range.start) {
      dailyQuery.dayStart = {
        $gte: range.start,
        $lt: range.endExclusive
      };
    }

    const attendanceQuery = {
      schoolId
    };

    const submissionQuery = {
      schoolId
    };

    if (range.start) {
      attendanceQuery.date = {
        $gte: range.start,
        $lt: range.endExclusive
      };

      submissionQuery.submittedAt = {
        $gte: range.start,
        $lt: range.endExclusive
      };
    }

    const linkedSchoolUserQuery = {
      role: null,

      $or: [
        {
          schoolId
        },
        {
          linkedSchoolId: schoolId
        },
        {
          companyId: schoolId
        },
        {
          createdBySchool: schoolId
        }
      ]
    };

    const [
      dailyRows,
      studentCount,
      teacherCount,
      activeClassCount,
      archivedClassCount,
      assignmentCount,
      periodSubmissions,
      periodAttendance,
      opportunityCount,
      atRiskAttendanceStudents
    ] = await Promise.all([
      AnalyticsDaily.find(dailyQuery)
        .sort({
          dayStart: 1
        })
        .lean(),

      User.countDocuments({
        ...linkedSchoolUserQuery,
        role: "student",
        status: {
          $ne: "suspended"
        }
      }),

      User.countDocuments({
        ...linkedSchoolUserQuery,
        role: "teacher",
        status: {
          $ne: "suspended"
        }
      }),

      Class.countDocuments({
        schoolId,
        status: {
          $ne: "archived"
        }
      }),

      Class.countDocuments({
        schoolId,
        status: "archived"
      }),

      Assignment.countDocuments({
        schoolId
      }),

      Submission.find(
        submissionQuery
      )
        .select(
          [
            "studentId",
            "status",
            "grade",
            "submittedAt",
            "reviewedAt"
          ].join(" ")
        )
        .lean(),

      Attendance.find(
        attendanceQuery
      )
        .select(
          [
            "studentId",
            "classId",
            "teacherId",
            "status",
            "participationScore",
            "meetingJoined",
            "durationMinutes",
            "requiresFollowUp",
            "date"
          ].join(" ")
        )
        .lean(),

      SchoolOpportunity.countDocuments({
        schoolId
      }),

      Attendance.distinct(
        "studentId",
        {
          ...attendanceQuery,

          $or: [
            {
              status: "absent"
            },
            {
              participationScore: {
                $lt: 50
              }
            },
            {
              requiresFollowUp: true
            }
          ]
        }
      )
    ]);

    const dailySummary =
      sumDailyDocuments(
        dailyRows
      );

    const daily =
      fillDailyTimeline(
        dailyRows,
        range
      );

    const attendance =
      attendanceStatistics(
        periodAttendance
      );

    const expectedSubmissions =
      studentCount *
      assignmentCount;

    const submissions =
      submissionStatistics(
        periodSubmissions,
        expectedSubmissions
      );

    const studentsAtRisk =
      new Set(
        atRiskAttendanceStudents
          .filter(Boolean)
          .map(String)
      ).size;

    const currentFollowers =
      Array.isArray(
        school.followers
      )
        ? school.followers.length
        : 0;

    const currentProfileViews =
      Math.max(
        nonNegativeNumber(
          school.profileViews
        ),
        dailySummary.profileViews
      );

    const netFollowers =
      dailySummary.followersGained -
      dailySummary.followersLost;

    const netPostLikes =
      Math.max(
        0,
        dailySummary.postLikesGained -
        dailySummary.postLikesRemoved
      );

    const netPostSaves =
      Math.max(
        0,
        dailySummary.postSavesGained -
        dailySummary.postSavesRemoved
      );

    const engagementTotal =
      netPostLikes +
      dailySummary.postComments +
      dailySummary.postReplies +
      dailySummary.postShares +
      netPostSaves;

    const publicEngagementRate =
      percentage(
        engagementTotal,
        dailySummary.postViews
      );

    const searchClickThroughRate =
      percentage(
        dailySummary.searchClicks,
        dailySummary.searchImpressions
      );

    const classActivityTotal =
      dailySummary.classViews +
      dailySummary.schedulesCreated +
      dailySummary.schedulesViewed +
      dailySummary.scheduleAttendances +
      dailySummary.attendanceRecordsCreated +
      dailySummary.assignmentsCreated +
      dailySummary.assignmentsSubmitted;

    const classUtilizationRate =
      activeClassCount
        ? clampScore(
            classActivityTotal /
            activeClassCount *
            10
          )
        : 0;

    const careerScore =
      clampScore(
        opportunityCount * 12 +
        dailySummary.careerApplications * 4 +
        dailySummary.careerPlacements * 15
      );

    const publicEngagementScore =
      clampScore(
        publicEngagementRate * 8 +
        Math.min(
          25,
          dailySummary.uniqueProfileViews
        )
      );

    const overallScore =
      calculateOverallScore({
        attendanceRate:
          attendance.attendanceRate,

        participationAverage:
          attendance.participationAverage,

        completionRate:
          submissions.completionRate,

        teacherReviewRate:
          submissions.reviewRate,

        classUtilizationRate,

        publicEngagementScore,

        careerScore
      });

    const overallPerformance =
      performanceBand(
        overallScore
      );

    const trafficSources = {
      direct:
        dailySummary.trafficDirect,

      feed:
        dailySummary.trafficFeed,

      network:
        dailySummary.trafficNetwork,

      search:
        dailySummary.trafficSearch,

      share:
        dailySummary.trafficShare,

      messages:
        dailySummary.trafficMessages,

      jobs:
        dailySummary.trafficJobs,

      notifications:
        dailySummary.trafficNotifications,

      external:
        dailySummary.trafficExternal,

      other:
        dailySummary.trafficOther
    };

    const devices = {
      desktop:
        dailySummary.deviceDesktop,

      mobile:
        dailySummary.deviceMobile,

      tablet:
        dailySummary.deviceTablet,

      bot:
        dailySummary.deviceBot,

      unknown:
        dailySummary.deviceUnknown
    };

    const recommendations =
      buildRecommendations({
        attendance,
        submissions,
        studentsAtRisk,
        publicEngagementRate,
        currentFollowers,
        currentProfileViews,
        opportunityCount,
        classUtilizationRate
      });

    return res.status(200).json({
      success: true,

      generatedAt:
        new Date(),

      range: {
        key:
          range.key,

        label:
          range.label,

        days:
          range.days,

        start:
          range.start,

        end:
          range.end
      },

      school: {
        _id:
          school._id,

        name:
          school.schoolName ||
          school.name ||
          "School"
      },

      summary: {
        /* Current totals */

        currentFollowers,
        currentProfileViews,

        studentCount,
        teacherCount,

        activeClassCount,
        archivedClassCount,

        assignmentCount,
        submissionCount:
          periodSubmissions.length,

        opportunityCount,

        studentsAtRisk,

        /* Public reach */

        profileImpressions:
          dailySummary.profileImpressions,

        profileViews:
          dailySummary.profileViews,

        uniqueProfileViews:
          dailySummary.uniqueProfileViews,

        uniqueVisitors:
          dailySummary.uniqueVisitors,

        newVisitors:
          dailySummary.newVisitors,

        returningVisitors:
          dailySummary.returningVisitors,

        followersGained:
          dailySummary.followersGained,

        followersLost:
          dailySummary.followersLost,

        netFollowers,

        /* Posts */

        postsCreated:
          dailySummary.postsCreated,

        postImpressions:
          dailySummary.postImpressions,

        postViews:
          dailySummary.postViews,

        uniquePostViews:
          dailySummary.uniquePostViews,

        postLikesGained:
          dailySummary.postLikesGained,

        postLikesRemoved:
          dailySummary.postLikesRemoved,

        netPostLikes,

        postComments:
          dailySummary.postComments,

        postReplies:
          dailySummary.postReplies,

        postShares:
          dailySummary.postShares,

        postSavesGained:
          dailySummary.postSavesGained,

        postSavesRemoved:
          dailySummary.postSavesRemoved,

        netPostSaves,

        engagementTotal,
        publicEngagementRate,

        /* Learning */

        attendance,
        submissions,

        classUtilizationRate,

        /* Career */

        careerViews:
          dailySummary.careerViews,

        careerApplications:
          dailySummary.careerApplications,

        careerInterviews:
          dailySummary.careerInterviews,

        careerOffers:
          dailySummary.careerOffers,

        careerPlacements:
          dailySummary.careerPlacements,

        careerScore,

        /* Search */

        searchImpressions:
          dailySummary.searchImpressions,

        searchClicks:
          dailySummary.searchClicks,

        searchClickThroughRate,

        /* Performance */

        publicEngagementScore,
        overallScore,
        overallPerformance
      },

      trafficSources,
      devices,
      recommendations,
      daily
    });
  } catch (error) {
    console.error(
      "getSchoolAnalytics error:",
      {
        message: error.message,
        stack:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : error.stack,

        schoolId:
          req.params.schoolId,

        userId:
          req.user?._id ||
          req.user?.id ||
          null
      }
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load school analytics."
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  recordEvent,
  getSchoolAnalytics,

  resolveDateRange,
  calculateOverallScore,
  performanceBand,
  attendanceStatistics,
  submissionStatistics
};
