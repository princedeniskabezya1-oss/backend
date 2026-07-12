"use strict";

const express = require("express");

const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const analyticsContext = require("../middleware/analyticsContext");
const analyticsRateLimit = require("../middleware/analyticsRateLimit");
const validateAnalyticsEvent = require(
  "../middleware/validateAnalyticsEvent"
);

const {
  recordEvent,
  getSchoolAnalytics
} = require("../controllers/analyticsController");

const router = express.Router();

/*
  Public and authenticated analytics collection.

  Important:
  Browsers may submit low-risk public events such as views,
  impressions and search clicks.

  Security-sensitive events such as follow, unfollow,
  post-like, attendance and assignment submission should
  also be recorded directly by their backend action routes.
*/
router.post(
  "/events",
  optionalAuth,
  analyticsContext,
  analyticsRateLimit,
  validateAnalyticsEvent,
  recordEvent
);

/*
  The authenticated school owner loads their analytics.

  The controller must also confirm that the logged-in user
  owns the requested school analytics.
*/
router.get(
  "/school/:schoolId",
  auth,
  getSchoolAnalytics
);

module.exports = router;
