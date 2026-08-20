const jwt = require("jsonwebtoken");

const User = require("../models/User");
const AuthSession = require("../models/AuthSession");


/* ============================================
   SESSION ACTIVITY THROTTLE

   Avoid writing to MongoDB on every single
   authenticated request.
============================================ */

const SESSION_ACTIVITY_UPDATE_INTERVAL_MS =
  5 * 60 * 1000;


/* ============================================
   AUTH MIDDLEWARE
============================================ */

module.exports =
  async function auth(
    req,
    res,
    next
  ) {

    /* ============================================
       AUTHORIZATION HEADER
    ============================================ */

    const authHeader =
      req.headers.authorization;


    if (
      !authHeader ||
      !authHeader.startsWith(
        "Bearer "
      )
    ) {

      return res
        .status(401)
        .json({

          message:
            "No token provided",

          code:
            "NO_TOKEN"

        });

    }


    const token =
      authHeader
        .slice(7)
        .trim();


    if (!token) {

      return res
        .status(401)
        .json({

          message:
            "No token provided",

          code:
            "NO_TOKEN"

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


      if (
        !decoded ||
        !decoded.id
      ) {

        return res
          .status(401)
          .json({

            message:
              "Invalid token",

            code:
              "INVALID_TOKEN"

          });

      }


      /* ============================================
         REQUIRE SERVER SESSION

         Tokens created before the session upgrade
         do not contain sid.

         Those users must sign in again once.
      ============================================ */

      const sessionId =
        String(
          decoded.sid ||
          ""
        )
          .trim();


      if (!sessionId) {

        return res
          .status(401)
          .json({

            message:
              "Your session needs to be refreshed. Please sign in again.",

            code:
              "SESSION_UPGRADE_REQUIRED"

          });

      }


      /* ============================================
         LOAD USER
      ============================================ */

      const user =
        await User.findById(
          decoded.id
        )
          .select(
            "-password"
          );


      if (!user) {

        return res
          .status(401)
          .json({

            message:
              "User not found",

            code:
              "USER_NOT_FOUND"

          });

      }


      /* ============================================
         ACCOUNT STATUS
      ============================================ */

      if (
        user.status ===
        "suspended"
      ) {

        return res
          .status(403)
          .json({

            message:
              "Account suspended",

            code:
              "ACCOUNT_SUSPENDED"

          });

      }


      if (
        user.isBlockedByEmployer ===
        true
      ) {

        return res
          .status(403)
          .json({

            message:
              "Your employer has restricted access to this account.",

            code:
              "EMPLOYER_RESTRICTED"

          });

      }


      /* ============================================
         PASSWORD CHANGE INVALIDATION
      ============================================ */

      if (
        user.passwordChangedAt
      ) {

        const changedAt =
          new Date(
            user.passwordChangedAt
          ).getTime();


        const issuedAt =
          Number(
            decoded.iat || 0
          ) * 1000;


        if (
          !issuedAt ||
          issuedAt < changedAt
        ) {

          return res
            .status(401)
            .json({

              message:
                "Your session expired because your password was changed. Please sign in again.",

              code:
                "PASSWORD_CHANGED"

            });

        }

      }


      /* ============================================
         LOAD AUTH SESSION
      ============================================ */

      const session =
        await AuthSession.findOne({

          userId:
            user._id,

          sessionId

        });


      if (!session) {

        return res
          .status(401)
          .json({

            message:
              "Session not found. Please sign in again.",

            code:
              "SESSION_NOT_FOUND"

          });

      }


      /* ============================================
         REVOKED SESSION
      ============================================ */

      if (
        session.revokedAt
      ) {

        return res
          .status(401)
          .json({

            message:
              "This session has been signed out.",

            code:
              "SESSION_REVOKED"

          });

      }


      /* ============================================
         EXPIRED SESSION
      ============================================ */

      const now =
        new Date();


      if (
        !session.expiresAt ||
        session.expiresAt <= now
      ) {

        /*
          Mark expired for audit visibility.
          MongoDB TTL cleanup may later remove it.
        */

        if (
          !session.revokedAt
        ) {

          try {

            session.revokedAt =
              now;


            session.revokedReason =
              "expired";


            await session.save();

          } catch (
            sessionExpireError
          ) {

            console.error(
              "SESSION EXPIRE UPDATE ERROR:",
              sessionExpireError
            );

          }

        }


        return res
          .status(401)
          .json({

            message:
              "Session expired. Please sign in again.",

            code:
              "SESSION_EXPIRED"

          });

      }


      /* ============================================
         JWT ROLE CONSISTENCY

         The database remains authoritative.
      ============================================ */

      if (
        decoded.role &&
        String(decoded.role) !==
          String(user.role)
      ) {

        return res
          .status(401)
          .json({

            message:
              "Your account access changed. Please sign in again.",

            code:
              "ROLE_CHANGED"

          });

      }


      /* ============================================
         SESSION ACTIVITY UPDATE

         Throttled to reduce MongoDB writes.
      ============================================ */

      const lastActiveAt =
        session.lastActiveAt
          ? new Date(
              session.lastActiveAt
            ).getTime()
          : 0;


      if (
        !lastActiveAt ||
        Date.now() -
          lastActiveAt >=
          SESSION_ACTIVITY_UPDATE_INTERVAL_MS
      ) {

        /*
          Do not block the request if the activity
          timestamp update fails.
        */

        AuthSession.updateOne(

          {
            _id:
              session._id,

            revokedAt:
              null
          },

          {
            $set: {

              lastActiveAt:
                now

            }
          }

        ).catch(
          error => {

            console.error(
              "SESSION ACTIVITY UPDATE ERROR:",
              error
            );

          }
        );

      }


      /* ============================================
         REQUEST AUTH CONTEXT
      ============================================ */

      req.user =
        user;


      req.auth = {

        token,

        decoded,

        sessionId:

          session.sessionId,

        session:

          {
            id:
              session._id,

            sessionId:
              session.sessionId,

            deviceName:
              session.deviceName,

            deviceType:
              session.deviceType,

            browser:
              session.browser,

            operatingSystem:
              session.operatingSystem,

            createdAt:
              session.createdAt,

            lastActiveAt:
              session.lastActiveAt,

            expiresAt:
              session.expiresAt

          }

      };


      return next();


    } catch (error) {

      /* ============================================
         JWT EXPIRED
      ============================================ */

      if (
        error?.name ===
        "TokenExpiredError"
      ) {

        return res
          .status(401)
          .json({

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
        error?.name ===
          "JsonWebTokenError" ||
        error?.name ===
          "NotBeforeError"
      ) {

        return res
          .status(401)
          .json({

            message:
              "Invalid token",

            code:
              "INVALID_TOKEN"

          });

      }


      /* ============================================
         UNEXPECTED AUTH FAILURE
      ============================================ */

      console.error(
        "AUTH MIDDLEWARE ERROR:",
        error
      );


      return res
        .status(401)
        .json({

          message:
            "Authentication failed",

          code:
            "AUTH_FAILED"

        });

    }

  };
