"use strict";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

/* =========================================================
   TOKEN HELPERS
========================================================= */

/*
  Extract a Bearer token safely.

  Accepted format:

  Authorization: Bearer <token>
*/
function extractBearerToken(req) {
  const authorization = String(
    req.headers.authorization || ""
  ).trim();

  if (!authorization) {
    return null;
  }

  const match = authorization.match(
    /^Bearer\s+(.+)$/i
  );

  if (!match || !match[1]) {
    return null;
  }

  const token = String(
    match[1]
  ).trim();

  return token || null;
}

/*
  Resolve the user ID from the JWT payload.

  Your current auth middleware uses decoded.id, so that is
  the primary supported field. The fallbacks make this helper
  safer if token generation changes later.
*/
function resolveDecodedUserId(decoded) {
  return (
    decoded?.id ||
    decoded?._id ||
    decoded?.userId ||
    decoded?.sub ||
    null
  );
}

/* =========================================================
   OPTIONAL AUTHENTICATION
========================================================= */

/*
  This middleware attempts authentication without requiring it.

  Main use cases:

  - Public school-profile analytics
  - Public post views
  - Public profile views
  - Search impressions
  - Shared-link traffic

  Behavior:

  - Valid token:
    req.user contains the authenticated user.

  - Missing token:
    req.user remains null and the request continues.

  - Expired or invalid token:
    req.user remains null and the request continues.

  - Suspended or blocked account:
    req.user remains null and the request continues.

  Public analytics must never prevent the public page from
  loading.
*/
async function optionalAuth(req, res, next) {
  try {
    /*
      Another middleware may already have authenticated the
      user. Preserve that user rather than querying again.
    */
    if (req.user) {
      return next();
    }

    req.user = null;

    const token = extractBearerToken(req);

    if (!token) {
      return next();
    }

    if (!process.env.JWT_SECRET) {
      console.error(
        "optionalAuth: JWT_SECRET is not configured."
      );

      return next();
    }

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );
    } catch (error) {
      /*
        Optional authentication intentionally ignores invalid,
        expired, malformed, and unsupported tokens.
      */
      return next();
    }

    const userId =
      resolveDecodedUserId(decoded);

    if (
      !userId ||
      !mongoose.Types.ObjectId.isValid(
        String(userId)
      )
    ) {
      return next();
    }

    /*
      Load only the fields required for analytics ownership,
      actor attribution, school relationship checks, and
      account restrictions.
    */
    const user = await User.findById(userId)
      .select(
        [
          "_id",
          "name",
          "role",
          "status",
          "schoolId",
          "linkedSchoolId",
          "companyId",
          "createdBySchool",
          "isBlockedByEmployer"
        ].join(" ")
      );

    if (!user) {
      return next();
    }

    /*
      Suspended users must not be treated as authenticated
      analytics actors.
    */
    if (user.status === "suspended") {
      return next();
    }

    /*
      Employer-blocked accounts must not be treated as active
      analytics actors.
    */
    if (
      user.isBlockedByEmployer === true
    ) {
      return next();
    }

    req.user = user;

    return next();
  } catch (error) {
    /*
      Optional authentication must fail open for public pages.

      A database or JWT-related error is logged for developers,
      but it does not block the visitor.
    */
    console.error(
      "optionalAuth middleware error:",
      error
    );

    req.user = null;

    return next();
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = optionalAuth;

module.exports.extractBearerToken =
  extractBearerToken;

module.exports.resolveDecodedUserId =
  resolveDecodedUserId;
