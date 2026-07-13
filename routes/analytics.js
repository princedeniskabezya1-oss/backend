"use strict";

const express = require("express");

const {
  recordEvent,
  getSchoolAnalytics
} = require(
  "../controllers/analyticsController"
);

const auth = require(
  "../middleware/auth"
);

const optionalAuth = require(
  "../middleware/optionalAuth"
);

const analyticsContext = require(
  "../middleware/analyticsContext"
);

const analyticsRateLimit = require(
  "../middleware/analyticsRateLimit"
);

const {
  analyticsDashboardRateLimit
} = require(
  "../middleware/analyticsRateLimit"
);

const validateAnalyticsEvent = require(
  "../middleware/validateAnalyticsEvent"
);

const router = express.Router();

/* =========================================================
   PUBLIC ANALYTICS EVENT COLLECTION
========================================================= */

/*
  POST /api/analytics/events

  This endpoint accepts only low-risk visibility and discovery
  events from the browser, such as:

  - profile impressions
  - profile views
  - unique profile views
  - post impressions
  - post views
  - unique post views
  - search impressions
  - search clicks

  Important actions such as follow, unfollow, like, comment,
  save, attendance, assignment submission, and grading must be
  recorded by the real backend route that performs the action.
*/
router.post(
  "/events",

  /*
    Attempt to identify a logged-in user, but continue when
    the visitor is anonymous or has no valid token.
  */
  optionalAuth,

  /*
    Create trusted analytics context containing:

    - actor ID
    - session ID
    - hashed visitor IP
    - source
    - device type
    - sanitized referrer
    - request path
    - request ID
  */
  analyticsContext,

  /*
    Protect the public analytics endpoint against flooding.
  */
  analyticsRateLimit,

  /*
    Validate event type, entity type, IDs, and metadata before
    the request reaches the controller.
  */
  validateAnalyticsEvent,

  /*
    Record the raw event and increment the daily aggregate.
  */
  recordEvent
);

/* =========================================================
   PRIVATE SCHOOL ANALYTICS DASHBOARD
========================================================= */

/*
  GET /api/analytics/school/:schoolId?range=30

  Supported ranges:

  7
  30
  90
  180
  365
  all

  The controller verifies that the authenticated user is:

  - the school that owns the analytics, or
  - an administrator
*/
router.get(
  "/school/:schoolId",

  /*
    This route requires a valid authenticated session.
  */
  auth,

  /*
    Prevent rapid repeated analytics queries.
  */
  analyticsDashboardRateLimit,

  getSchoolAnalytics
);

/* =========================================================
   HEALTH CHECK
========================================================= */

/*
  GET /api/analytics/health

  This route confirms that the analytics router has been
  mounted correctly. It does not expose private data.
*/
router.get(
  "/health",
  (req, res) => {
    return res.status(200).json({
      success: true,
      service: "school-analytics",
      status: "available",
      timestamp: new Date()
    });
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
