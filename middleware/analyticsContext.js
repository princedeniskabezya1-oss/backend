"use strict";

const crypto = require("crypto");

/* =========================================================
   ALLOWED ANALYTICS SOURCES
========================================================= */

const ALLOWED_ANALYTICS_SOURCES = new Set([
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
]);

/* =========================================================
   ALLOWED DEVICE TYPES
========================================================= */

const ALLOWED_DEVICE_TYPES = new Set([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown"
]);

/* =========================================================
   HEADER AND IP HELPERS
========================================================= */

/*
  Some proxy headers may contain several comma-separated
  values. Only the first value represents the original client.
*/
function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "")
      .trim();
  }

  return String(value || "")
    .split(",")[0]
    .trim();
}

/*
  Resolve the original visitor IP address.

  Render forwards the original client address through proxy
  headers. server.js must already contain:

  app.set("trust proxy", 1);
*/
function getRequestIp(req) {
  return (
    firstHeaderValue(
      req.headers["cf-connecting-ip"]
    ) ||
    firstHeaderValue(
      req.headers["x-real-ip"]
    ) ||
    firstHeaderValue(
      req.headers["x-forwarded-for"]
    ) ||
    String(req.ip || "").trim() ||
    String(
      req.socket?.remoteAddress || ""
    ).trim() ||
    null
  );
}

/* =========================================================
   HASHING
========================================================= */

/*
  Create a stable HMAC hash.

  Raw IP addresses are never stored in analytics documents.
*/
function hashAnalyticsValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const salt = String(
    process.env.ANALYTICS_HASH_SALT ||
    ""
  ).trim();

  if (!salt) {
    throw new Error(
      "ANALYTICS_HASH_SALT is not configured."
    );
  }

  return crypto
    .createHmac("sha256", salt)
    .update(String(value))
    .digest("hex");
}

/* =========================================================
   SOURCE NORMALIZATION
========================================================= */

function normalizeAnalyticsSource(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .slice(0, 80);

  if (
    ALLOWED_ANALYTICS_SOURCES.has(source)
  ) {
    return source;
  }

  return "unknown";
}

/* =========================================================
   SESSION NORMALIZATION
========================================================= */

function normalizeAnalyticsSessionId(value) {
  const sessionId = String(value || "")
    .trim();

  if (!sessionId) {
    return null;
  }

  /*
    Session identifiers should be long enough to reduce
    collisions but short enough to prevent oversized input.
  */
  if (
    sessionId.length < 8 ||
    sessionId.length > 128
  ) {
    return null;
  }

  /*
    Allow UUIDs and generated session identifiers while
    rejecting spaces and unsafe punctuation.
  */
  if (
    !/^[a-zA-Z0-9._:-]+$/.test(
      sessionId
    )
  ) {
    return null;
  }

  return sessionId;
}

/* =========================================================
   URL SANITIZATION
========================================================= */

/*
  Remove query strings and URL fragments before storing a
  referrer or request path.

  Query strings may contain tokens, search text, email
  addresses, or other private data.
*/
function sanitizeUrlLikeValue(
  value,
  maximumLength = 1024
) {
  const text = String(value || "")
    .trim();

  if (!text) {
    return null;
  }

  const withoutFragment =
    text.split("#")[0];

  const withoutQuery =
    withoutFragment.split("?")[0];

  return withoutQuery
    .slice(0, maximumLength);
}

/* =========================================================
   USER AGENT HELPERS
========================================================= */

function normalizeUserAgent(value) {
  const userAgent = String(value || "")
    .trim();

  if (!userAgent) {
    return null;
  }

  return userAgent.slice(0, 512);
}

function detectDeviceType(userAgent) {
  const ua = String(
    userAgent || ""
  ).toLowerCase();

  if (!ua) {
    return "unknown";
  }

  if (
    /bot|crawler|spider|slurp|bingpreview|facebookexternalhit/.test(
      ua
    )
  ) {
    return "bot";
  }

  if (
    /ipad|tablet|kindle|silk|playbook/.test(
      ua
    )
  ) {
    return "tablet";
  }

  if (
    /mobile|iphone|ipod|android.*mobile|windows phone/.test(
      ua
    )
  ) {
    return "mobile";
  }

  return "desktop";
}

function normalizeDeviceType(
  value,
  userAgent
) {
  const supplied = String(value || "")
    .trim()
    .toLowerCase();

  if (
    ALLOWED_DEVICE_TYPES.has(supplied)
  ) {
    return supplied;
  }

  return detectDeviceType(userAgent);
}

/* =========================================================
   ACTOR AND SCHOOL HELPERS
========================================================= */

function resolveActorId(req) {
  return (
    req.user?._id ||
    req.user?.id ||
    null
  );
}

function resolveActorRole(req) {
  const role = String(
    req.user?.role || ""
  )
    .trim()
    .toLowerCase();

  return role || null;
}

function resolveActorSchoolId(req) {
  if (!req.user) {
    return null;
  }

  if (
    String(req.user.role || "")
      .toLowerCase() === "school"
  ) {
    return (
      req.user._id ||
      req.user.id ||
      null
    );
  }

  return (
    req.user.schoolId ||
    req.user.linkedSchoolId ||
    req.user.companyId ||
    null
  );
}

/* =========================================================
   REQUEST IDENTIFIER
========================================================= */

/*
  A request ID helps correlate logs when analytics processing
  fails. It is not a user identifier.
*/
function createRequestId(req) {
  const incoming = String(
    req.headers["x-request-id"] || ""
  )
    .trim()
    .slice(0, 128);

  if (
    incoming &&
    /^[a-zA-Z0-9._:-]+$/.test(incoming)
  ) {
    return incoming;
  }

  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    "req",
    Date.now(),
    crypto
      .randomBytes(8)
      .toString("hex")
  ].join("-");
}

/* =========================================================
   ANALYTICS CONTEXT MIDDLEWARE
========================================================= */

/*
  This middleware prepares trusted request context for the
  analytics controller.

  It does not create analytics events by itself.

  Expected order on the public analytics route:

  optionalAuth
  analyticsContext
  analyticsRateLimit
  validateAnalyticsEvent
  recordEvent
*/
function analyticsContext(req, res, next) {
  try {
    const rawIp =
      getRequestIp(req);

    const userAgent =
      normalizeUserAgent(
        req.headers["user-agent"]
      );

    const sessionId =
      normalizeAnalyticsSessionId(
        req.body?.sessionId ||
        req.headers[
          "x-analytics-session"
        ]
      );

    const source =
      normalizeAnalyticsSource(
        req.body?.source ||
        req.query?.source ||
        req.headers[
          "x-analytics-source"
        ]
      );

    const suppliedDeviceType =
      req.body?.deviceType ||
      req.body?.metadata?.deviceType ||
      req.headers[
        "x-device-type"
      ];

    const deviceType =
      normalizeDeviceType(
        suppliedDeviceType,
        userAgent
      );

    const occurredAt = new Date();

    req.analyticsContext = {
      requestId:
        createRequestId(req),

      actorId:
        resolveActorId(req),

      actorRole:
        resolveActorRole(req),

      actorSchoolId:
        resolveActorSchoolId(req),

      sessionId,

      source,

      ipHash:
        rawIp
          ? hashAnalyticsValue(rawIp)
          : null,

      userAgent,

      deviceType,

      referrer:
        sanitizeUrlLikeValue(
          req.headers.referer ||
          req.headers.referrer
        ),

      requestPath:
        sanitizeUrlLikeValue(
          req.originalUrl ||
          req.url
        ),

      occurredAt
    };

    return next();
  } catch (error) {
    console.error(
      "analyticsContext middleware error:",
      {
        message: error.message,
        method: req.method,
        path: req.originalUrl
      }
    );

    /*
      Analytics must never break a public page.

      If context creation fails, continue with a safe anonymous
      context. The controller can still decide whether to
      record or skip the event.
    */
    req.analyticsContext = {
      requestId:
        createRequestId(req),

      actorId:
        resolveActorId(req),

      actorRole:
        resolveActorRole(req),

      actorSchoolId:
        resolveActorSchoolId(req),

      sessionId: null,
      source: "unknown",
      ipHash: null,

      userAgent:
        normalizeUserAgent(
          req.headers["user-agent"]
        ),

      deviceType:
        detectDeviceType(
          req.headers["user-agent"]
        ),

      referrer: null,

      requestPath:
        sanitizeUrlLikeValue(
          req.originalUrl ||
          req.url
        ),

      occurredAt: new Date(),

      contextError: true
    };

    return next();
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = analyticsContext;

module.exports.ALLOWED_ANALYTICS_SOURCES =
  ALLOWED_ANALYTICS_SOURCES;

module.exports.ALLOWED_DEVICE_TYPES =
  ALLOWED_DEVICE_TYPES;

module.exports.firstHeaderValue =
  firstHeaderValue;

module.exports.getRequestIp =
  getRequestIp;

module.exports.hashAnalyticsValue =
  hashAnalyticsValue;

module.exports.normalizeAnalyticsSource =
  normalizeAnalyticsSource;

module.exports.normalizeAnalyticsSessionId =
  normalizeAnalyticsSessionId;

module.exports.sanitizeUrlLikeValue =
  sanitizeUrlLikeValue;

module.exports.normalizeUserAgent =
  normalizeUserAgent;

module.exports.detectDeviceType =
  detectDeviceType;

module.exports.normalizeDeviceType =
  normalizeDeviceType;

module.exports.resolveActorId =
  resolveActorId;

module.exports.resolveActorRole =
  resolveActorRole;

module.exports.resolveActorSchoolId =
  resolveActorSchoolId;

module.exports.createRequestId =
  createRequestId;
