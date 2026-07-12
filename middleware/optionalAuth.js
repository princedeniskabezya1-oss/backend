"use strict";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

function extractBearerToken(req) {
  const authorization = String(
    req.headers.authorization || ""
  ).trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/);

  if (
    String(scheme).toLowerCase() !== "bearer" ||
    !token
  ) {
    return null;
  }

  return token.trim();
}

function resolveTokenUserId(payload) {
  return (
    payload?.id ||
    payload?._id ||
    payload?.userId ||
    payload?.sub ||
    null
  );
}

async function optionalAuth(req, res, next) {
  try {
    req.user = req.user || null;

    const token = extractBearerToken(req);

    if (!token) {
      return next();
    }

    const secret =
      process.env.JWT_SECRET ||
      process.env.JWT_KEY;

    if (!secret) {
      console.error(
        "optionalAuth: JWT_SECRET is not configured."
      );

      return next();
    }

    let payload;

    try {
      payload = jwt.verify(token, secret);
    } catch (error) {
      /*
        Optional authentication must not block guests when
        a token is missing, expired, or invalid.
      */
      return next();
    }

    const userId = resolveTokenUserId(payload);

    if (
      !userId ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return next();
    }

    const user = await User.findById(userId)
      .select(
        "_id role email name firstName lastName schoolId employerId"
      )
      .lean();

    if (user) {
      req.user = user;
    }

    return next();
  } catch (error) {
    console.error("optionalAuth error:", error);
    return next();
  }
}

module.exports = optionalAuth;
