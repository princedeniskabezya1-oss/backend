"use strict";

const crypto = require("crypto");

const ALLOWED_SOURCES = new Set([
  "direct",
  "feed",
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
  "unknown"
]);

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "")
    .split(",")[0]
    .trim();
}

function getRequestIp(req) {
  return (
    firstHeaderValue(req.headers["cf-connecting-ip"]) ||
    firstHeaderValue(req.headers["x-real-ip"]) ||
    firstHeaderValue(req.headers["x-forwarded-for"]) ||
    String(req.socket?.remoteAddress || "").trim() ||
    null
  );
}

function hashValue(value) {
  if (!value) {
    return null;
  }

  const salt =
    process.env.ANALYTICS_HASH_SALT ||
    process.env.JWT_SECRET;

  if (!salt) {
    throw new Error(
      "ANALYTICS_HASH_SALT must be configured."
    );
  }

  return crypto
    .createHmac("sha256", salt)
    .update(String(value))
    .digest("hex");
}

function normalizeSource(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return ALLOWED_SOURCES.has(source)
    ? source
    : "unknown";
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").trim();

  if (!sessionId) {
    return null;
  }

  /*
    Accept UUID-like and generated session identifiers,
    but block excessively long or unsafe values.
  */
  if (
    sessionId.length < 8 ||
    sessionId.length > 128
  ) {
    return null;
  }

  if (!/^[a-zA-Z0-9._:-]+$/.test(sessionId)) {
    return null;
  }

  return sessionId;
}

function analyticsContext(req, res, next) {
  try {
    const rawIp = getRequestIp(req);

    const sessionId = normalizeSessionId(
      req.body?.sessionId ||
      req.headers["x-analytics-session"]
    );

    req.analyticsContext = {
      actorId:
        req.user?._id ||
        req.user?.id ||
        null,

      sessionId,

      source: normalizeSource(
        req.body?.source ||
        req.query?.source ||
        req.headers["x-analytics-source"]
      ),

      ipHash: rawIp
        ? hashValue(rawIp)
        : null,

      userAgent: String(
        req.headers["user-agent"] || ""
      ).slice(0, 512),

      referrer: String(
        req.headers.referer ||
        req.headers.referrer ||
        ""
      ).slice(0, 1024),

      requestPath: String(
        req.originalUrl ||
        req.url ||
        ""
      ).slice(0, 1024),

      occurredAt: new Date()
    };

    return next();
  } catch (error) {
    console.error(
      "analyticsContext error:",
      error
    );

    /*
      Analytics must never break the main application.
    */
    req.analyticsContext = {
      actorId:
        req.user?._id ||
        req.user?.id ||
        null,

      sessionId: null,
      source: "unknown",
      ipHash: null,
      userAgent: null,
      referrer: null,
      requestPath: null,
      occurredAt: new Date()
    };

    return next();
  }
}

module.exports = analyticsContext;
