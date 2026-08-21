const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const AuthSession = require("../models/AuthSession");

const auth = require("../middleware/auth");


const router = express.Router();


/* ============================================
   AUTH CONFIGURATION
============================================ */

const AUTH_SESSION_DURATION_MS =
  7 * 24 * 60 * 60 * 1000;


/* ============================================
   CLIENT IP
============================================ */

function getClientIp(req) {

  const forwardedFor =
    req.headers["x-forwarded-for"];


  if (
    typeof forwardedFor === "string" &&
    forwardedFor.trim()
  ) {

    return forwardedFor
      .split(",")[0]
      .trim();

  }


  return (
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );

}


/* ============================================
   DEVICE INFORMATION

   Lightweight detection using the request
   User-Agent. No additional npm package needed.
============================================ */

function getDeviceInformation(req) {

  const userAgent =
    String(
      req.headers["user-agent"] ||
      ""
    )
      .trim()
      .slice(0, 1000);


  const lower =
    userAgent.toLowerCase();


  /* --------------------------------------------
     DEVICE TYPE
  -------------------------------------------- */

  let deviceType =
    "unknown";


  if (
    /ipad|tablet|kindle|silk/.test(
      lower
    )
  ) {

    deviceType =
      "tablet";

  } else if (
    /mobile|iphone|android/.test(
      lower
    )
  ) {

    deviceType =
      "mobile";

  } else if (
    userAgent
  ) {

    deviceType =
      "desktop";

  }


  /* --------------------------------------------
     BROWSER
  -------------------------------------------- */

  let browser =
    "Unknown browser";


  if (
    /edg\//i.test(
      userAgent
    )
  ) {

    browser =
      "Microsoft Edge";

  } else if (
    /opr\//i.test(
      userAgent
    )
  ) {

    browser =
      "Opera";

  } else if (
    /chrome\//i.test(
      userAgent
    )
  ) {

    browser =
      "Google Chrome";

  } else if (
    /firefox\//i.test(
      userAgent
    )
  ) {

    browser =
      "Mozilla Firefox";

  } else if (
    /safari\//i.test(
      userAgent
    ) &&
    !/chrome\//i.test(
      userAgent
    )
  ) {

    browser =
      "Safari";

  }


  /* --------------------------------------------
     OPERATING SYSTEM
  -------------------------------------------- */

  let operatingSystem =
    "Unknown OS";


  if (
    /windows nt/i.test(
      userAgent
    )
  ) {

    operatingSystem =
      "Windows";

  } else if (
    /iphone|ipad|ipod/i.test(
      userAgent
    )
  ) {

    operatingSystem =
      "iOS";

  } else if (
    /android/i.test(
      userAgent
    )
  ) {

    operatingSystem =
      "Android";

  } else if (
    /mac os x|macintosh/i.test(
      userAgent
    )
  ) {

    operatingSystem =
      "macOS";

  } else if (
    /linux/i.test(
      userAgent
    )
  ) {

    operatingSystem =
      "Linux";

  }


  /* --------------------------------------------
     DISPLAY NAME
  -------------------------------------------- */

  let deviceName =
    `${browser} on ${operatingSystem}`;


  if (
    deviceType === "mobile"
  ) {

    deviceName =
      `${browser} on mobile`;

  }


  if (
    deviceType === "tablet"
  ) {

    deviceName =
      `${browser} on tablet`;

  }


  return {

    deviceType,

    browser,

    operatingSystem,

    deviceName,

    userAgent

  };

}


/* ============================================
   CREATE AUTH SESSION
============================================ */

async function createAuthSession(
  req,
  user
) {

  const now =
    new Date();


  const expiresAt =
    new Date(
      now.getTime() +
      AUTH_SESSION_DURATION_MS
    );


  const sessionId =
    crypto.randomUUID();


  const device =
    getDeviceInformation(
      req
    );


  const session =
    await AuthSession.create({

      userId:
        user._id,

      sessionId,

      deviceName:
        device.deviceName,

      deviceType:
        device.deviceType,

      browser:
        device.browser,

      operatingSystem:
        device.operatingSystem,

      userAgent:
        device.userAgent,

      ipAddress:
        getClientIp(req),

      createdAt:
        now,

      lastActiveAt:
        now,

      expiresAt,

      revokedAt:
        null,

      revokedReason:
        null

    });


  return session;

}


/* ============================================
   REGISTER
============================================ */

router.post(
  "/register",
  async (req, res) => {

    try {

      const {
        name,
        email,
        password,
        role,
        referralCode
      } = req.body;


      if (
        !name ||
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({

            message:
              "Name, email and password are required"

          });

      }


      if (
        String(password).length < 8
      ) {

        return res
          .status(400)
          .json({

            message:
              "Password must be at least 8 characters"

          });

      }


      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();


      const existingUser =
        await User.findOne({

          email:
            normalizedEmail

        });


      if (
        existingUser
      ) {

        return res
          .status(400)
          .json({

            message:
              "User already exists"

          });

      }


      const salt =
        await bcrypt.genSalt(10);


      const hashedPassword =
        await bcrypt.hash(
          password,
          salt
        );


      let referredByUser =
        null;


      if (
        referralCode
      ) {

        referredByUser =
          await User.findOne({

            referralCode:
              String(
                referralCode
              ).trim()

          });

      }


      const user =
        await User.create({

          name:
            String(name).trim(),

          email:
            normalizedEmail,

          password:
            hashedPassword,

          role:
            role ||
            "talent",

          referredBy:
            referredByUser
              ? referredByUser._id
              : null

        });


      if (
        user.role ===
        "agent"
      ) {

        user.referralCode =
          "HF" +
          user._id
            .toString()
            .slice(-6)
            .toUpperCase();


        await user.save();

      }


      if (
        referredByUser
      ) {

        referredByUser.totalReferrals +=
          1;


        await referredByUser.save();

      }


      return res
        .status(201)
        .json({

          message:
            "User registered successfully"

        });


    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            error.message

        });

    }

  }
);


/* ============================================
   LOGIN

   Creates a real server-side session and
   embeds the session ID inside the JWT.
============================================ */

router.post(
  "/login",
  async (req, res) => {

    let createdSession =
      null;


    try {

      const {
        email,
        password
      } = req.body || {};


      if (
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({

            message:
              "Email and password are required"

          });

      }


      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();


      const user =
        await User.findOne({

          email:
            normalizedEmail

        });


      /*
        Keep the same public error whether the
        email or password is incorrect.
      */

      if (
        !user ||
        !user.password
      ) {

        return res
          .status(400)
          .json({

            message:
              "Invalid credentials"

          });

      }


/* ========================================
   ACCOUNT ACCESS STATUS
======================================== */

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
  user.status ===
  "deactivated"
) {

  const deletionPending =
    Boolean(
      user.deletionRequestedAt
    );


  return res
    .status(403)
    .json({

      message:
        deletionPending
          ? "This account is pending deletion and cannot be signed in."
          : "This account has been deactivated.",

      code:
        deletionPending
          ? "ACCOUNT_PENDING_DELETION"
          : "ACCOUNT_DEACTIVATED",

      deactivatedAt:
        user.deactivatedAt ||
        null,

      deletionRequestedAt:
        user.deletionRequestedAt ||
        null,

      deletionScheduledFor:
        user.deletionScheduledFor ||
        null

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


      const isMatch =
        await bcrypt.compare(
          String(password),
          user.password
        );


      if (
        !isMatch
      ) {

        return res
          .status(400)
          .json({

            message:
              "Invalid credentials"

          });

      }


      /* ========================================
         CREATE SESSION
      ======================================== */

      createdSession =
        await createAuthSession(
          req,
          user
        );


      /* ========================================
         CREATE JWT

         sid = server session identifier
      ======================================== */

      const token =
        jwt.sign(
          {

            id:
              user._id.toString(),

            role:
              user.role,

            sid:
              createdSession.sessionId

          },

          process.env.JWT_SECRET,

          {
            expiresIn:
              "7d"
          }
        );


      /* ========================================
         LOGIN ACTIVITY
      ======================================== */

      user.lastLoginAt =
        new Date();


      await user.save();


      /* ========================================
         RESPONSE

         Existing frontend fields are preserved.
      ======================================== */

      return res.json({

        token,

        user: {

          id:
            user._id,

          name:
            user.name,

          email:
            user.email,

          role:
            user.role,

          referralCode:
            user.referralCode ||
            null,

          commissionEarned:
            user.commissionEarned ||
            0,

          profileImage:
            user.profileImage ||
            null,

          companyName:
            user.companyName ||
            null,

          companyId:
            user.companyId ||
            null,

          teamRole:
            user.teamRole ||
            null

        },

        session: {

          id:
            createdSession.sessionId,

          deviceName:
            createdSession.deviceName,

          deviceType:
            createdSession.deviceType,

          browser:
            createdSession.browser,

          operatingSystem:
            createdSession.operatingSystem,

          createdAt:
            createdSession.createdAt,

          expiresAt:
            createdSession.expiresAt

        }

      });


    } catch (error) {

      /*
        If login failed after a session record
        was created but before the response was
        completed, revoke that partial session.
      */

      if (
        createdSession?._id
      ) {

        try {

          await AuthSession.updateOne(

            {
              _id:
                createdSession._id
            },

            {
              $set: {

                revokedAt:
                  new Date(),

                revokedReason:
                  "security_action"

              }
            }

          );

        } catch (
          cleanupError
        ) {

          console.error(
            "LOGIN SESSION CLEANUP ERROR:",
            cleanupError
          );

        }

      }


      console.error(
        "LOGIN ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Unable to sign in at this time"

        });

    }

  }
);


/* ============================================
   ACTIVE AUTH SESSIONS

   GET /api/auth/sessions
============================================ */

router.get(
  "/sessions",
  auth,
  async (req, res) => {

    try {

      const userId =
        req.user._id ||
        req.user.id;


      const currentSessionId =
        String(
          req.auth?.sessionId ||
          ""
        );


      const now =
        new Date();


      const sessions =
        await AuthSession.find({

          userId,

          revokedAt:
            null,

          expiresAt: {
            $gt: now
          }

        })
          .sort({
            lastActiveAt: -1,
            createdAt: -1
          })
          .lean();


      const safeSessions =
        sessions.map(
          session => {

            const rawIp =
              String(
                session.ipAddress ||
                ""
              );


            /*
              Do not expose the full IP address
              in the UI.

              Keep only a masked representation.
            */

            let maskedIp =
              null;


            if(rawIp){

              if(
                rawIp.includes(":")
              ){

                /*
                  IPv6
                */

                const parts =
                  rawIp.split(":");


                maskedIp =
                  parts
                    .slice(0, 3)
                    .join(":") +
                  ":••••";

              }else{

                /*
                  IPv4
                */

                const parts =
                  rawIp.split(".");


                if(
                  parts.length === 4
                ){

                  maskedIp =
                    `${parts[0]}.${parts[1]}.•••.•••`;

                }else{

                  maskedIp =
                    "Hidden";

                }

              }

            }


            return {

              sessionId:
                session.sessionId,

              current:
                session.sessionId ===
                currentSessionId,

              deviceName:
                session.deviceName ||
                "Unknown device",

              deviceType:
                session.deviceType ||
                "unknown",

              browser:
                session.browser ||
                "Unknown browser",

              operatingSystem:
                session.operatingSystem ||
                "Unknown OS",

              maskedIp,

              createdAt:
                session.createdAt,

              lastActiveAt:
                session.lastActiveAt,

              expiresAt:
                session.expiresAt

            };

          }
        );


      return res.json({

        sessions:
          safeSessions,

        total:
          safeSessions.length

      });


    } catch (error) {

      console.error(
        "GET AUTH SESSIONS ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to load active sessions"

        });

    }

  }
);


/* ============================================
   REVOKE ONE SESSION

   DELETE /api/auth/sessions/:sessionId
============================================ */

router.delete(
  "/sessions/:sessionId",
  auth,
  async (req, res) => {

    try {

      const userId =
        req.user._id ||
        req.user.id;


      const targetSessionId =
        String(
          req.params.sessionId ||
          ""
        )
          .trim();


      if(!targetSessionId){

        return res
          .status(400)
          .json({

            message:
              "Session ID is required"

          });

      }


      const targetSession =
        await AuthSession.findOne({

          userId,

          sessionId:
            targetSessionId

        });


      if(!targetSession){

        return res
          .status(404)
          .json({

            message:
              "Session not found"

          });

      }


      if(targetSession.revokedAt){

        return res.json({

          message:
            "Session is already signed out"

        });

      }


      targetSession.revokedAt =
        new Date();


      targetSession.revokedReason =
        "logout";


      await targetSession.save();


      const currentSessionId =
        String(
          req.auth?.sessionId ||
          ""
        );


      const current =
        targetSessionId ===
        currentSessionId;


      return res.json({

        message:
          current
            ? "Current session signed out successfully"
            : "Session signed out successfully",

        currentSessionRevoked:
          current

      });


    } catch (error) {

      console.error(
        "REVOKE AUTH SESSION ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to sign out session"

        });

    }

  }
);


/* ============================================
   SIGN OUT ALL OTHER DEVICES

   POST /api/auth/sessions/logout-others
============================================ */

router.post(
  "/sessions/logout-others",
  auth,
  async (req, res) => {

    try {

      const userId =
        req.user._id ||
        req.user.id;


      const currentSessionId =
        String(
          req.auth?.sessionId ||
          ""
        )
          .trim();


      if(!currentSessionId){

        return res
          .status(401)
          .json({

            message:
              "Current session is unavailable"

          });

      }


      const result =
        await AuthSession.updateMany(

          {

            userId,

            sessionId: {
              $ne:
                currentSessionId
            },

            revokedAt:
              null,

            expiresAt: {
              $gt:
                new Date()
            }

          },

          {

            $set: {

              revokedAt:
                new Date(),

              revokedReason:
                "logout_others"

            }

          }

        );


      return res.json({

        message:
          "Other devices signed out successfully",

        revokedCount:
          Number(
            result.modifiedCount ||
            0
          )

      });


    } catch (error) {

      console.error(
        "LOGOUT OTHER SESSIONS ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to sign out other devices"

        });

    }

  }
);

/* ============================================
   GET CURRENT USER
============================================ */

router.get(
  "/me",
  auth,
  async (req, res) => {

    try {

      const user =
        req.user;


      if (
        !user
      ) {

        return res
          .status(404)
          .json({

            message:
              "User not found"

          });

      }


      return res.json({

        id:
          user._id,

        name:
          user.name,

        email:
          user.email,

        role:
          user.role,

        referralCode:
          user.referralCode ||
          null,

        commissionEarned:
          user.commissionEarned ||
          0,

        referredBy:
          user.referredBy ||
          null,

        profileImage:
          user.profileImage ||
          null,

        companyName:
          user.companyName ||
          null,

        companyId:
          user.companyId ||
          null,

        teamRole:
          user.teamRole ||
          null

      });


    } catch (error) {

      console.error(
        "AUTH ME ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            error.message

        });

    }

  }
);


/* ============================================
   CHANGE CURRENT USER PASSWORD

   PATCH /api/auth/change-password
============================================ */

router.patch(
  "/change-password",
  auth,
  async (req, res) => {

    try {

      const {
        currentPassword,
        newPassword,
        confirmPassword
      } = req.body || {};


      if (
        !currentPassword ||
        !newPassword
      ) {

        return res
          .status(400)
          .json({

            message:
              "Current password and new password are required"

          });

      }


      if (
        confirmPassword !==
          undefined &&
        String(newPassword) !==
          String(confirmPassword)
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password and confirmation do not match"

          });

      }


      const cleanNewPassword =
        String(
          newPassword
        );


      if (
        cleanNewPassword.length <
        8
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password must be at least 8 characters"

          });

      }


      if (
        cleanNewPassword.length >
        128
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password is too long"

          });

      }


      if (
        !/[A-Za-z]/.test(
          cleanNewPassword
        ) ||
        !/\d/.test(
          cleanNewPassword
        )
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password must contain at least one letter and one number"

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        );


      if (
        !user ||
        !user.password
      ) {

        return res
          .status(404)
          .json({

            message:
              "User account not found"

          });

      }


      const currentPasswordMatches =
        await bcrypt.compare(
          String(
            currentPassword
          ),
          user.password
        );


      if (
        !currentPasswordMatches
      ) {

        return res
          .status(400)
          .json({

            message:
              "Current password is incorrect"

          });

      }


      const sameAsCurrent =
        await bcrypt.compare(
          cleanNewPassword,
          user.password
        );


      if (
        sameAsCurrent
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password must be different from your current password"

          });

      }


      const salt =
        await bcrypt.genSalt(
          12
        );


      user.password =
        await bcrypt.hash(
          cleanNewPassword,
          salt
        );


      user.passwordChangedAt =
        new Date();


      await user.save();


      /*
        Revoke every currently tracked session
        belonging to this account.

        This complements passwordChangedAt and
        immediately closes every server-side
        session after a password change.
      */

      await AuthSession.updateMany(

        {
          userId:
            user._id,

          revokedAt:
            null
        },

        {
          $set: {

            revokedAt:
              new Date(),

            revokedReason:
              "password_changed"

          }
        }

      );


      return res.json({

        message:
          "Password changed successfully"

      });


    } catch (error) {

      console.error(
        "CHANGE PASSWORD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to change password"

        });

    }

  }
);


/* ============================================
   CREATE FIRST ADMIN
   ONE TIME ONLY
============================================ */

router.post(
  "/create-first-admin",
  async (req, res) => {

    try {

      const {
        setupKey,
        name,
        email,
        password
      } = req.body;


      if (
        !process.env.ADMIN_SETUP_KEY
      ) {

        return res
          .status(500)
          .json({

            message:
              "Admin setup key is not configured"

          });

      }


      if (
        setupKey !==
        process.env.ADMIN_SETUP_KEY
      ) {

        return res
          .status(403)
          .json({

            message:
              "Invalid admin setup key"

          });

      }


      if (
        !name ||
        !email ||
        !password
      ) {

        return res
          .status(400)
          .json({

            message:
              "Name, email and password are required"

          });

      }


      if (
        String(password).length <
        8
      ) {

        return res
          .status(400)
          .json({

            message:
              "Admin password must be at least 8 characters"

          });

      }


      const existingAdmin =
        await User.findOne({

          role:
            "admin"

        });


      if (
        existingAdmin
      ) {

        return res
          .status(403)
          .json({

            message:
              "Admin already exists"

          });

      }


      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();


      const existingUser =
        await User.findOne({

          email:
            normalizedEmail

        });


      if (
        existingUser
      ) {

        return res
          .status(400)
          .json({

            message:
              "Email already exists"

          });

      }


      const salt =
        await bcrypt.genSalt(
          10
        );


      const hashedPassword =
        await bcrypt.hash(
          password,
          salt
        );


      const admin =
        await User.create({

          name:
            String(name).trim(),

          email:
            normalizedEmail,

          password:
            hashedPassword,

          role:
            "admin",

          status:
            "active",

          aiftVerified:
            true,

          isVerified:
            true

        });


      return res
        .status(201)
        .json({

          message:
            "First admin created successfully",

          admin: {

            id:
              admin._id,

            name:
              admin.name,

            email:
              admin.email,

            role:
              admin.role

          }

        });


    } catch (error) {

      console.error(
        "CREATE FIRST ADMIN ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            error.message

        });

    }

  }
);


/* ============================================
   RESET ADMIN PASSWORD
============================================ */

router.post(
  "/reset-admin-password",
  async (req, res) => {

    try {

      const {
        setupKey,
        email,
        newPassword
      } = req.body;


      if (
        setupKey !==
        process.env.ADMIN_SETUP_KEY
      ) {

        return res
          .status(403)
          .json({

            message:
              "Invalid setup key"

          });

      }


      if (
        !email ||
        !newPassword
      ) {

        return res
          .status(400)
          .json({

            message:
              "Email and new password are required"

          });

      }


      if (
        String(newPassword).length <
        8
      ) {

        return res
          .status(400)
          .json({

            message:
              "New password must be at least 8 characters"

          });

      }


      const admin =
        await User.findOne({

          email:
            String(email)
              .toLowerCase()
              .trim(),

          role:
            "admin"

        });


      if (
        !admin
      ) {

        return res
          .status(404)
          .json({

            message:
              "Admin not found"

          });

      }


      const salt =
        await bcrypt.genSalt(
          12
        );


      admin.password =
        await bcrypt.hash(
          String(
            newPassword
          ),
          salt
        );


      admin.passwordChangedAt =
        new Date();


      await admin.save();


      await AuthSession.updateMany(

        {
          userId:
            admin._id,

          revokedAt:
            null
        },

        {
          $set: {

            revokedAt:
              new Date(),

            revokedReason:
              "password_changed"

          }
        }

      );


      return res.json({

        message:
          "Admin password updated successfully"

      });


    } catch (error) {

      console.error(
        "RESET ADMIN PASSWORD ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to reset admin password"

        });

    }

  }
);


module.exports = router;
