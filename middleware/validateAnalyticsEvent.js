"use strict";

const mongoose = require("mongoose");

const ALLOWED_EVENT_TYPES = new Set([
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
  "post_unsave",

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
  "schedule_view",
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
]);

const ALLOWED_ENTITY_TYPES = new Set([
  "school",
  "post",
  "student",
  "teacher",
  "class",
  "schedule",
  "assignment",
  "submission",
  "opportunity",
  "application"
]);

const ALLOWED_METADATA_KEYS = new Set([
  "tab",
  "section",
  "position",
  "resultIndex",
  "searchTerm",
  "contentType",
  "status",
  "deviceType",
  "viewerRole",
  "durationMs"
]);

function sanitizeString(value, maximumLength = 200) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .trim()
    .slice(0, maximumLength);
}

function sanitizeMetadata(metadata) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return {};
  }

  const clean = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      clean[key] =
        typeof value === "string"
          ? sanitizeString(value, 300)
          : value;
    }
  }

  return clean;
}

function validateAnalyticsEvent(req, res, next) {
  const schoolId = sanitizeString(
    req.body?.schoolId,
    64
  );

  const eventType = sanitizeString(
    req.body?.eventType,
    80
  );

  const entityType =
    sanitizeString(
      req.body?.entityType,
      80
    ) || "school";

  const entityId = sanitizeString(
    req.body?.entityId,
    64
  );

  if (
    !schoolId ||
    !mongoose.Types.ObjectId.isValid(schoolId)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid schoolId is required."
    });
  }

  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return res.status(400).json({
      success: false,
      message: "Unsupported analytics event type."
    });
  }

  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return res.status(400).json({
      success: false,
      message: "Unsupported analytics entity type."
    });
  }

  if (
    entityId &&
    !mongoose.Types.ObjectId.isValid(entityId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid analytics entityId."
    });
  }

  req.validatedAnalyticsEvent = {
    schoolId,
    eventType,
    entityType,
    entityId: entityId || null,
    source:
      req.analyticsContext?.source ||
      "unknown",

    metadata: sanitizeMetadata(
      req.body?.metadata
    )
  };

  return next();
}

module.exports = validateAnalyticsEvent;
