"use strict";

const {
  rateLimit,
  ipKeyGenerator
} = require("express-rate-limit");

/* =========================================================
   RATE LIMIT CONFIGURATION
========================================================= */

/*
  Public analytics requests can come from:

  - logged-in users
  - anonymous browser sessions
  - visitors without session storage
  - users behind shared internet connections

  The key priority is:

  1. Authenticated actor ID
  2. Analytics session ID
  3. Hashed IP address
  4. Express IP fallback

  This avoids relying only on a raw IP address.
*/
function analyticsRateLimitKey(req) {
  const actorId =
    req.analyticsContext?.actorId;

  if (actorId) {
    return `actor:${String(actorId)}`;
  }

  const sessionId =
    req.analyticsContext?.sessionId;

  if (sessionId) {
    return `session:${String(sessionId)}`;
  }

  const ipHash =
    req.analyticsContext?.ipHash;

  if (ipHash) {
    return `iphash:${String(ipHash)}`;
  }

  /*
    express-rate-limit requires IPv6-safe key generation when
    falling back to req.ip.
  */
  return ipKeyGenerator(req.ip);
}

/* =========================================================
   GENERAL ANALYTICS EVENT LIMITER
========================================================= */

/*
  Allows up to 120 analytics event requests per minute for
  one authenticated user, browser session, or anonymous
  visitor.

  Normal browsing should stay far below this limit.

  A higher limit is needed because one page can legitimately
  record several events, such as:

  - profile impression
  - profile view
  - unique profile view
  - post impressions
  - search impressions
*/
const analyticsRateLimit = rateLimit({
  windowMs: 60 * 1000,

  limit: 120,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: analyticsRateLimitKey,

  /*
    Successful and failed requests both count because repeated
    invalid requests can also be abusive.
  */
  skipSuccessfulRequests: false,
  skipFailedRequests: false,

  /*
    Browser preflight requests must not consume the event
    allowance.
  */
  skip(req) {
    return req.method === "OPTIONS";
  },

  handler(req, res) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        Number(
          req.rateLimit?.resetTime
            ? new Date(
                req.rateLimit.resetTime
              ).getTime() - Date.now()
            : 60000
        ) / 1000
      )
    );

    res.setHeader(
      "Retry-After",
      String(retryAfterSeconds)
    );

    return res.status(429).json({
      success: false,

      message:
        "Too many analytics events were received. Please wait before trying again.",

      retryAfterSeconds,

      requestId:
        req.analyticsContext?.requestId ||
        null
    });
  }
});

/* =========================================================
   STRICT PROFILE-VIEW LIMITER
========================================================= */

/*
  Profile views deserve a stricter secondary limiter because
  they are public and could otherwise be spammed to inflate
  school analytics.

  This middleware may later be applied specifically to a
  profile-view route if profile tracking is separated from
  the general event endpoint.
*/
const profileViewRateLimit = rateLimit({
  windowMs: 60 * 1000,

  limit: 30,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: analyticsRateLimitKey,

  skip(req) {
    return req.method === "OPTIONS";
  },

  handler(req, res) {
    return res.status(429).json({
      success: false,

      message:
        "Too many profile-view requests were received. Please try again shortly.",

      requestId:
        req.analyticsContext?.requestId ||
        null
    });
  }
});

/* =========================================================
   STRICT SEARCH-EVENT LIMITER
========================================================= */

/*
  Search input may fire many times while the user is typing.

  The frontend should debounce search analytics, but the
  backend also applies a defensive limit.
*/
const searchAnalyticsRateLimit = rateLimit({
  windowMs: 60 * 1000,

  limit: 60,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: analyticsRateLimitKey,

  skip(req) {
    return req.method === "OPTIONS";
  },

  handler(req, res) {
    return res.status(429).json({
      success: false,

      message:
        "Too many search analytics requests were received. Please wait before searching again.",

      requestId:
        req.analyticsContext?.requestId ||
        null
    });
  }
});

/* =========================================================
   PRIVATE ANALYTICS DASHBOARD LIMITER
========================================================= */

/*
  Protects the private analytics dashboard endpoint from
  repeated rapid reloads and expensive date-range queries.

  This should be applied to:

  GET /api/analytics/school/:schoolId
*/
const analyticsDashboardRateLimit = rateLimit({
  windowMs: 60 * 1000,

  limit: 30,

  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator(req) {
    const userId =
      req.user?._id ||
      req.user?.id;

    if (userId) {
      return `dashboard-user:${String(userId)}`;
    }

    return ipKeyGenerator(req.ip);
  },

  skip(req) {
    return req.method === "OPTIONS";
  },

  handler(req, res) {
    return res.status(429).json({
      success: false,

      message:
        "The analytics dashboard was requested too frequently. Please wait a moment and try again."
    });
  }
});

/* =========================================================
   EXPORTS
========================================================= */

module.exports = analyticsRateLimit;

module.exports.analyticsRateLimit =
  analyticsRateLimit;

module.exports.profileViewRateLimit =
  profileViewRateLimit;

module.exports.searchAnalyticsRateLimit =
  searchAnalyticsRateLimit;

module.exports.analyticsDashboardRateLimit =
  analyticsDashboardRateLimit;

module.exports.analyticsRateLimitKey =
  analyticsRateLimitKey;
