const express = require("express");

const {
  recordEvent,
  getSchoolAnalytics
} = require("../controllers/analyticsController");

const auth = require("../middleware/auth");

const router = express.Router();

/*
  Public actions can be recorded even when the visitor is not logged in.
  Use optionalAuth here if your project already has one.
*/
router.post(
  "/events",
  recordEvent
);

/*
  Private school dashboard analytics.
*/
router.get(
  "/school/:schoolId",
  auth,
  getSchoolAnalytics
);

module.exports = router;
