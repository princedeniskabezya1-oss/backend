const jwt = require("jsonwebtoken");
const User = require("../models/User");


module.exports = async function auth(
  req,
  res,
  next
) {

  /* ============================================
     READ AUTHORIZATION HEADER
  ============================================ */

  const authHeader =
    req.headers.authorization;


  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {

    return res.status(401).json({
      message: "No token provided"
    });

  }


  const token =
    authHeader.slice(7).trim();


  if (!token) {

    return res.status(401).json({
      message: "No token provided"
    });

  }


  try {

    /* ============================================
       VERIFY JWT
    ============================================ */

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );


    if (!decoded?.id) {

      return res.status(401).json({
        message: "Invalid token"
      });

    }


    /* ============================================
       LOAD CURRENT USER

       Password remains excluded.

       passwordChangedAt MUST remain available
       because it is used for session invalidation.
    ============================================ */

    const user =
      await User.findById(
        decoded.id
      ).select("-password");


    if (!user) {

      return res.status(401).json({
        message: "User not found"
      });

    }


    /* ============================================
       PASSWORD-CHANGE TOKEN INVALIDATION

       JWT iat is expressed in seconds.
       MongoDB Date is expressed in milliseconds.

       Any token issued before the password was
       changed is no longer accepted.
    ============================================ */

    if (user.passwordChangedAt) {

      const passwordChangedAtSeconds =
        Math.floor(
          new Date(
            user.passwordChangedAt
          ).getTime() / 1000
        );


      const tokenIssuedAt =
        Number(
          decoded.iat || 0
        );


      if (
        !tokenIssuedAt ||
        tokenIssuedAt <
          passwordChangedAtSeconds
      ) {

        return res.status(401).json({
          message:
            "Your session expired because your password was changed. Please sign in again.",
          code:
            "PASSWORD_CHANGED"
        });

      }

    }


    /* ============================================
       ACCOUNT STATUS
    ============================================ */

    if (
      user.status ===
      "suspended"
    ) {

      return res.status(403).json({
        message:
          "Account suspended"
      });

    }


    /* ============================================
       EMPLOYER ACCESS RESTRICTION
    ============================================ */

    if (
      user.isBlockedByEmployer ===
      true
    ) {

      return res.status(403).json({
        message:
          "Your employer has restricted access to this account."
      });

    }


    /* ============================================
       AUTHENTICATED USER
    ============================================ */

    req.user =
      user;


    /*
      Keep the decoded JWT available for routes
      that need token/session metadata later.
    */

    req.auth =
      decoded;


    return next();


  } catch (err) {

    /* ============================================
       EXPIRED TOKEN
    ============================================ */

    if (
      err?.name ===
      "TokenExpiredError"
    ) {

      return res.status(401).json({
        message:
          "Session expired. Please sign in again.",
        code:
          "TOKEN_EXPIRED"
      });

    }


    /* ============================================
       INVALID JWT
    ============================================ */

    if (
      err?.name ===
      "JsonWebTokenError" ||
      err?.name ===
      "NotBeforeError"
    ) {

      return res.status(401).json({
        message:
          "Invalid token",
        code:
          "INVALID_TOKEN"
      });

    }


    /* ============================================
       UNEXPECTED AUTH ERROR
    ============================================ */

    console.error(
      "AUTH MIDDLEWARE ERROR:",
      err
    );


    return res.status(401).json({
      message:
        "Authentication failed",
      code:
        "AUTH_FAILED"
    });

  }

};
