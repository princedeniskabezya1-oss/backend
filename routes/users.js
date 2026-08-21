"use strict";

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const router = express.Router();

const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Notification = require("../models/Notification");

const AnalyticsEvent = require(
  "../models/AnalyticsEvent"
);
const AuthSession = require("../models/AuthSession");

const {
  incrementDailyAnalytics
} = require(
  "../services/analyticsAggregationService"
);

const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const upload = require("../middleware/upload");
const analyticsContext = require(
  "../middleware/analyticsContext"
);

const cloudinary = require("../config/cloudinary");
function canSchoolManageUser(manager, targetUser) {
  if (!manager || !targetUser) return false;

  if (manager.role === "admin") return true;
  if (manager.role !== "school") return false;

  const schoolId = String(manager._id || manager.id);

  return (
    String(targetUser.schoolId || "") === schoolId ||
    String(targetUser.linkedSchoolId || "") === schoolId ||
    String(targetUser.companyId || "") === schoolId ||
    String(targetUser.createdBySchool || "") === schoolId
  );
}
/* ============================================
   SCHOOL ANALYTICS HELPERS
============================================ */

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );
}

function resolveLinkedSchoolId(user) {
  if (!user) {
    return null;
  }

  if (
    String(user.role || "").toLowerCase() ===
    "school"
  ) {
    return user._id || user.id || null;
  }

  return (
    user.schoolId ||
    user.linkedSchoolId ||
    user.companyId ||
    user.createdBySchool ||
    null
  );
}

function analyticsExpiryDate(
  occurredAt = new Date()
) {
  const expiresAt = new Date(occurredAt);

  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + 180
  );

  return expiresAt;
}

/*
  Record a trusted analytics event after the backend has
  validated and performed the real action.

  This helper is not exposed directly to the browser.
*/
async function recordSchoolAnalyticsEvent({
  req,
  schoolId,
  eventType,
  entityType = "school",
  entityId = null,
  metadata = {},
  occurredAt = new Date(),
  mongoSession = null
}) {
  if (
    !schoolId ||
    !validObjectId(schoolId)
  ) {
    throw new TypeError(
      "A valid schoolId is required for school analytics."
    );
  }

  const context =
    req.analyticsContext || {};

  const actorId =
    req.user?._id ||
    req.user?.id ||
    null;

  const source =
    context.source ||
    "dashboard";

  const deviceType =
    context.deviceType ||
    "unknown";

  const eventPayload = {
    schoolId,
    actorId:
      actorId && validObjectId(actorId)
        ? actorId
        : null,

    sessionId:
      context.sessionId ||
      null,

    ipHash:
      context.ipHash ||
      null,

    eventType,
    entityType,

    entityId:
      entityId && validObjectId(entityId)
        ? entityId
        : null,

    source,

    metadata:
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
        ? metadata
        : {},

    userAgent:
      context.userAgent ||
      null,

    referrer:
      context.referrer ||
      null,

    requestPath:
      context.requestPath ||
      null,

    deviceType,

    occurredAt,

    expiresAt:
      analyticsExpiryDate(
        occurredAt
      )
  };

  const createOptions = {};

  if (mongoSession) {
    createOptions.session =
      mongoSession;
  }

  const events =
    await AnalyticsEvent.create(
      [eventPayload],
      createOptions
    );

  await incrementDailyAnalytics({
    schoolId,
    eventType,
    occurredAt,
    source,
    deviceType,
    metadata: eventPayload.metadata,
    mongoSession
  });

  return events[0];
}
/* ============================================
   ADMIN GET ALL USERS
============================================ */
router.get("/", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ============================================
   ADMIN CREATE USER
============================================ */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      password: hashed,
      role
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

/* ============================================
   SCHOOL CREATE TEACHER / STUDENT
============================================ */

router.post(
  "/school-create",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !["school", "admin"].includes(
          req.user.role
        )
      ) {
        return res.status(403).json({
          message:
            "Only a school or administrator can create school users."
        });
      }

      const {
        name,
        email,
        password,
        role,
        course,
        subject,
        department,
        bio
      } = req.body;

      const cleanName =
        String(name || "").trim();

      const cleanEmail =
        String(email || "")
          .trim()
          .toLowerCase();

      const cleanRole =
        String(role || "")
          .trim()
          .toLowerCase();

      if (
        !["teacher", "student"].includes(
          cleanRole
        )
      ) {
        return res.status(400).json({
          message:
            "Role must be teacher or student."
        });
      }

      if (
        !cleanName ||
        !cleanEmail ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Name, email, and password are required."
        });
      }

      const requestedSchoolId =
        req.user.role === "admin"
          ? req.body.schoolId
          : req.user._id;

      if (
        !requestedSchoolId ||
        !validObjectId(requestedSchoolId)
      ) {
        return res.status(400).json({
          message:
            "A valid school ID is required."
        });
      }

      const school = await User.findOne({
        _id: requestedSchoolId,
        role: "school",
        status: {
          $ne: "suspended"
        }
      })
        .select("_id role status")
        .lean();

      if (!school) {
        return res.status(404).json({
          message:
            "School account was not found."
        });
      }

      const existing =
        await User.findOne({
          email: cleanEmail
        })
          .select("_id")
          .lean();

      if (existing) {
        return res.status(409).json({
          message:
            "A user with this email already exists."
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          String(password),
          12
        );

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const createdUsers =
        await User.create(
          [
            {
              name: cleanName,
              email: cleanEmail,
              password: hashedPassword,
              role: cleanRole,

              schoolId:
                school._id,

              linkedSchoolId:
                school._id,

              companyId:
                school._id,

              createdBySchool:
                req.user._id,

              course:
                cleanRole === "student"
                  ? course || null
                  : null,

              subject:
                cleanRole === "teacher"
                  ? subject ||
                    department ||
                    null
                  : null,

              department:
                cleanRole === "teacher"
                  ? department ||
                    subject ||
                    null
                  : null,

              bio:
                bio ||
                null
            }
          ],
          {
            session: mongoSession
          }
        );

      const createdUser =
        createdUsers[0];

      const eventType =
        cleanRole === "student"
          ? "student_added"
          : "teacher_added";

      await recordSchoolAnalyticsEvent({
        req,

        schoolId:
          school._id,

        eventType,

        entityType:
          cleanRole,

        entityId:
          createdUser._id,

        metadata: {
          createdRole:
            cleanRole,

          createdByRole:
            req.user.role,

          course:
            cleanRole === "student"
              ? String(course || "")
                  .trim()
                  .slice(0, 200)
              : "",

          department:
            cleanRole === "teacher"
              ? String(
                  department ||
                  subject ||
                  ""
                )
                  .trim()
                  .slice(0, 200)
              : ""
        },

        mongoSession
      });

      await mongoSession
        .commitTransaction();

      const safeUser =
        await User.findById(
          createdUser._id
        ).select("-password");

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(school._id)
        ).emit(
          "user:new",
          safeUser
        );
      }

      return res
        .status(201)
        .json(safeUser);
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SCHOOL CREATE USER ERROR:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          message:
            "A user with this email already exists."
        });
      }

      return res.status(500).json({
        message:
          error.message ||
          "Failed to create school user."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ============================================
   GET CURRENT USER
============================================ */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    let score = 0;
    if (user.profileImage) score += 15;
    if (user.bannerImage) score += 10;
    if (user.bio) score += 15;
    if (user.skills?.length) score += 20;
    if (user.experience?.length) score += 20;
    if (user.cvUrl) score += 20;

    res.json({
      ...user.toObject(),
      completeness: score
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load user" });
  }
});

/* ============================================
   SCHOOL STUDIO SETTINGS
============================================ */

const SCHOOL_STUDIO_SETTINGS_DEFAULTS =
  Object.freeze({

    general: {

      language: "en",

      timezone: "Asia/Manila",

      weekStart: "monday"

    },


    appearance: {

      theme: "system",

      compactInterface: false,

      rememberSidebar: true

    },


    notifications: {

      assignments: true,

      attendance: true,

      messages: true,

      career: true,

      security: true,

      schoolUpdates: true,

      teacherActivity: true,

      studentActivity: true

    },


    privacy: {

      publicProfile: true,

      discoverable: true,

      showLocation: true,

      showWebsite: true,

      showStatistics: false,

      showPrograms: true,

      teacherPerformanceRestricted: true,

      studentAnalyticsRestricted: true

    },


    accessibility: {

      reducedMotion: false,

      highContrast: false,

      largerText: false

    },


    data: {

      allowAnalytics: true,

      allowProductImprovement: true,

      exportRequestedAt: null,

      deactivatedAt: null

    }

  });


/* ============================================
   SCHOOL SETTINGS HELPERS
============================================ */

function isPlainSchoolSettingsObject(
  value
) {

  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function mergeSchoolStudioSettings(
  settings = {}
) {

  const source =
    isPlainSchoolSettingsObject(
      settings
    )
      ? settings
      : {};


  return {

    general: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .general,

      ...(isPlainSchoolSettingsObject(
        source.general
      )
        ? source.general
        : {})

    },


    appearance: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .appearance,

      ...(isPlainSchoolSettingsObject(
        source.appearance
      )
        ? source.appearance
        : {})

    },


    notifications: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .notifications,

      ...(isPlainSchoolSettingsObject(
        source.notifications
      )
        ? source.notifications
        : {})

    },


    privacy: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .privacy,

      ...(isPlainSchoolSettingsObject(
        source.privacy
      )
        ? source.privacy
        : {})

    },


    accessibility: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .accessibility,

      ...(isPlainSchoolSettingsObject(
        source.accessibility
      )
        ? source.accessibility
        : {})

    },


    data: {

      ...SCHOOL_STUDIO_SETTINGS_DEFAULTS
        .data,

      ...(isPlainSchoolSettingsObject(
        source.data
      )
        ? source.data
        : {})

    }

  };

}


function applySchoolBooleanSetting(
  target,
  source,
  field
) {

  if (
    typeof source[field] ===
    "boolean"
  ) {

    target[field] =
      source[field];

  }

}


/* ============================================
   GET SCHOOL STUDIO SETTINGS

   GET /api/users/me/school-studio-settings
============================================ */

router.get(
  "/me/school-studio-settings",
  auth,
  async (req, res) => {

    try {

      const role =
        String(
          req.user.role || ""
        ).toLowerCase();


      if (
        ![
          "school",
          "admin"
        ].includes(role)
      ) {

        return res
          .status(403)
          .json({

            message:
              "Only school accounts can access School Studio settings."

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        )
          .select(
            "role schoolStudioSettings"
          )
          .lean();


      if (!user) {

        return res
          .status(404)
          .json({

            message:
              "School account not found."

          });

      }


      const settings =
        mergeSchoolStudioSettings(
          user.schoolStudioSettings
        );


      return res.json({

        settings

      });

    } catch (error) {

      console.error(
        "GET SCHOOL STUDIO SETTINGS ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to load School Studio settings."

        });

    }

  }
);


/* ============================================
   UPDATE SCHOOL STUDIO SETTINGS

   PATCH /api/users/me/school-studio-settings
============================================ */

router.patch(
  "/me/school-studio-settings",
  auth,
  async (req, res) => {

    try {

      const role =
        String(
          req.user.role || ""
        ).toLowerCase();


      if (
        ![
          "school",
          "admin"
        ].includes(role)
      ) {

        return res
          .status(403)
          .json({

            message:
              "Only school accounts can update School Studio settings."

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        );


      if (!user) {

        return res
          .status(404)
          .json({

            message:
              "School account not found."

          });

      }


      const body =
        isPlainSchoolSettingsObject(
          req.body
        )
          ? req.body
          : {};


      /*
        Support either:

        {
          general: {...},
          privacy: {...}
        }

        or:

        {
          settings: {
            general: {...},
            privacy: {...}
          }
        }
      */

      const incoming =
        isPlainSchoolSettingsObject(
          body.settings
        )
          ? body.settings
          : body;


      const current =
        mergeSchoolStudioSettings(
          user.schoolStudioSettings
        );


      /* ========================================
         GENERAL
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.general
        )
      ) {

        const general =
          incoming.general;


        if (
          typeof general.language ===
          "string"
        ) {

          const language =
            general.language
              .trim()
              .toLowerCase();


          if (
            ![
              "en"
            ].includes(language)
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Unsupported language setting."

              });

          }


          current.general.language =
            language;

        }


        if (
          typeof general.timezone ===
          "string"
        ) {

          const timezone =
            general.timezone
              .trim();


          if (
            !timezone ||
            timezone.length > 100
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Invalid timezone setting."

              });

          }


          /*
            Validate against the runtime's
            Intl timezone database.
          */

          try {

            new Intl.DateTimeFormat(
              "en-US",
              {
                timeZone:
                  timezone
              }
            ).format();

          } catch {

            return res
              .status(400)
              .json({

                message:
                  "Invalid timezone setting."

              });

          }


          current.general.timezone =
            timezone;

        }


        if (
          typeof general.weekStart ===
          "string"
        ) {

          const weekStart =
            general.weekStart
              .trim()
              .toLowerCase();


          if (
            ![
              "monday",
              "sunday"
            ].includes(
              weekStart
            )
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Invalid week start setting."

              });

          }


          current.general.weekStart =
            weekStart;

        }

      }


      /* ========================================
         APPEARANCE
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.appearance
        )
      ) {

        const appearance =
          incoming.appearance;


        if (
          typeof appearance.theme ===
          "string"
        ) {

          const theme =
            appearance.theme
              .trim()
              .toLowerCase();


          if (
            ![
              "light",
              "dark",
              "system"
            ].includes(theme)
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Invalid theme setting."

              });

          }


          current.appearance.theme =
            theme;

        }


        applySchoolBooleanSetting(
          current.appearance,
          appearance,
          "compactInterface"
        );


        applySchoolBooleanSetting(
          current.appearance,
          appearance,
          "rememberSidebar"
        );

      }


      /* ========================================
         NOTIFICATIONS
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.notifications
        )
      ) {

        const notifications =
          incoming.notifications;


        [
          "assignments",
          "attendance",
          "messages",
          "career",
          "security",
          "schoolUpdates",
          "teacherActivity",
          "studentActivity"

        ].forEach(
          field => {

            applySchoolBooleanSetting(
              current.notifications,
              notifications,
              field
            );

          }
        );

      }


      /* ========================================
         PRIVACY
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.privacy
        )
      ) {

        const privacy =
          incoming.privacy;


        [
          "publicProfile",
          "discoverable",
          "showLocation",
          "showWebsite",
          "showStatistics",
          "showPrograms",
          "teacherPerformanceRestricted",
          "studentAnalyticsRestricted"

        ].forEach(
          field => {

            applySchoolBooleanSetting(
              current.privacy,
              privacy,
              field
            );

          }
        );

      }


      /* ========================================
         ACCESSIBILITY
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.accessibility
        )
      ) {

        const accessibility =
          incoming.accessibility;


        [
          "reducedMotion",
          "highContrast",
          "largerText"

        ].forEach(
          field => {

            applySchoolBooleanSetting(
              current.accessibility,
              accessibility,
              field
            );

          }
        );

      }


      /* ========================================
         DATA PREFERENCES

         IMPORTANT:
         exportRequestedAt and deactivatedAt
         cannot be written from this generic
         settings endpoint.

         Dedicated protected actions will handle
         those later.
      ======================================== */

      if (
        isPlainSchoolSettingsObject(
          incoming.data
        )
      ) {

        const data =
          incoming.data;


        applySchoolBooleanSetting(
          current.data,
          data,
          "allowAnalytics"
        );


        applySchoolBooleanSetting(
          current.data,
          data,
          "allowProductImprovement"
        );

      }


      /* ========================================
         SAVE
      ======================================== */

      user.set(
        "schoolStudioSettings",
        current
      );


      await user.save();


      /*
        Keep the existing generic profile privacy
        fields synchronized with School Studio.

        These already exist in User.js.
      */

      const profileChanges = {};


      if (
        typeof current
          .privacy
          .publicProfile ===
        "boolean"
      ) {

        profileChanges.isPublic =
          current
            .privacy
            .publicProfile;

      }


      if (
        typeof current
          .privacy
          .discoverable ===
        "boolean"
      ) {

        profileChanges.allowProfileIndexing =
          current
            .privacy
            .discoverable;

      }


      if (
        Object.keys(
          profileChanges
        ).length
      ) {

        await User.updateOne(
          {
            _id: user._id
          },
          {
            $set:
              profileChanges
          }
        );

      }


      const savedUser =
        await User.findById(
          user._id
        )
          .select(
            "schoolStudioSettings"
          )
          .lean();


      return res.json({

        message:
          "School Studio settings updated successfully.",

        settings:
          mergeSchoolStudioSettings(
            savedUser
              ?.schoolStudioSettings
          )

      });

    } catch (error) {

      console.error(
        "UPDATE SCHOOL STUDIO SETTINGS ERROR:",
        error
      );


      if (
        error?.name ===
        "ValidationError"
      ) {

        return res
          .status(400)
          .json({

            message:
              "One or more School Studio settings are invalid."

          });

      }


      return res
        .status(500)
        .json({

          message:
            "Failed to update School Studio settings."

        });

    }

  }
);



/* ============================================
   STUDENT STUDIO SETTINGS
============================================ */

const STUDENT_STUDIO_SETTINGS_DEFAULTS =
  Object.freeze({

    /* -----------------------------------------
       APPEARANCE
    ----------------------------------------- */

    appearance: {

      theme: "light",

      compactInterface: false,

      rememberSidebar: true

    },


    /* -----------------------------------------
       LEARNING
    ----------------------------------------- */

    learning: {

      studyReminders: true,

      assignmentReminders: true,

      continueLearning: true,

      autoplayNextLesson: false,

      rememberLastClass: true

    },


    /* -----------------------------------------
       NOTIFICATIONS
    ----------------------------------------- */

    notifications: {

      assignments: true,

      grades: true,

      announcements: true,

      messages: true,

      certificates: true,

      career: true

    },


    /* -----------------------------------------
       KABEZYA AI
    ----------------------------------------- */

    ai: {

      personalization: true,

      classContext: true,

      learningHistory: true,

      suggestions: true

    },


    /* -----------------------------------------
       PRIVACY
    ----------------------------------------- */

    privacy: {

      portfolioVisibility:
        "public",

      profileDiscovery: true,

      activityVisibility: false,

      certificateVisibility: true

    },


    /* -----------------------------------------
       ACCESSIBILITY
    ----------------------------------------- */

    accessibility: {

      reducedMotion: false,

      highContrast: false,

      largerText: false

    }

  });


/* ============================================
   STUDENT SETTINGS HELPERS
============================================ */

function isPlainSettingsObject(
  value
) {

  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


function mergeStudentStudioSettings(
  settings = {}
) {

  const source =
    isPlainSettingsObject(
      settings
    )
      ? settings
      : {};


  return {

    appearance: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .appearance,

      ...(isPlainSettingsObject(
        source.appearance
      )
        ? source.appearance
        : {})

    },


    learning: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .learning,

      ...(isPlainSettingsObject(
        source.learning
      )
        ? source.learning
        : {})

    },


    notifications: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .notifications,

      ...(isPlainSettingsObject(
        source.notifications
      )
        ? source.notifications
        : {})

    },


    ai: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .ai,

      ...(isPlainSettingsObject(
        source.ai
      )
        ? source.ai
        : {})

    },


    privacy: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .privacy,

      ...(isPlainSettingsObject(
        source.privacy
      )
        ? source.privacy
        : {})

    },


    accessibility: {

      ...STUDENT_STUDIO_SETTINGS_DEFAULTS
        .accessibility,

      ...(isPlainSettingsObject(
        source.accessibility
      )
        ? source.accessibility
        : {})

    }

  };

}


function applyBooleanSetting(
  target,
  source,
  field
) {

  if (
    !target ||
    !source
  ) {

    return;

  }


  if (
    typeof source[field] ===
    "boolean"
  ) {

    target[field] =
      source[field];

  }

}


/* ============================================
   STUDENT STUDIO ROLE ACCESS
============================================ */

function canAccessStudentStudioSettings(
  user
) {

  const role =
    String(
      user?.role ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
    "talent" remains supported because the current
    Student Studio frontend already accepts legacy
    talent accounts.

    Admin is retained for platform support/admin use.
  */

  return [
    "student",
    "talent",
    "admin"
  ].includes(
    role
  );

}


/* ============================================
   GET STUDENT STUDIO SETTINGS

   GET /api/users/me/student-studio-settings
============================================ */

router.get(
  "/me/student-studio-settings",
  auth,
  async (req, res) => {

    try {

      if (
        !canAccessStudentStudioSettings(
          req.user
        )
      ) {

        return res
          .status(403)
          .json({

            message:
              "Student Studio settings are only available to student accounts."

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        )
          .select(
            "_id role studentStudioSettings"
          )
          .lean();


      if (!user) {

        return res
          .status(404)
          .json({

            message:
              "User not found."

          });

      }


      return res.json({

        settings:
          mergeStudentStudioSettings(
            user.studentStudioSettings
          )

      });


    } catch (error) {

      console.error(
        "GET STUDENT STUDIO SETTINGS ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to load Student Studio settings."

        });

    }

  }
);


/* ============================================
   UPDATE STUDENT STUDIO SETTINGS

   PATCH /api/users/me/student-studio-settings
============================================ */

router.patch(
  "/me/student-studio-settings",
  auth,
  async (req, res) => {

    try {

      if (
        !canAccessStudentStudioSettings(
          req.user
        )
      ) {

        return res
          .status(403)
          .json({

            message:
              "Student Studio settings are only available to student accounts."

          });

      }


      /* =========================================
         REQUEST BODY
      ========================================= */

      const incoming =
        isPlainSettingsObject(
          req.body?.settings
        )
          ? req.body.settings
          : req.body;


      if (
        !isPlainSettingsObject(
          incoming
        )
      ) {

        return res
          .status(400)
          .json({

            message:
              "A valid settings object is required."

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        );


      if (!user) {

        return res
          .status(404)
          .json({

            message:
              "User not found."

          });

      }


      const current =
        mergeStudentStudioSettings(

          user.studentStudioSettings
            ?.toObject

            ? user.studentStudioSettings
                .toObject()

            : user.studentStudioSettings

        );


      /* =========================================
         APPEARANCE
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.appearance
        )
      ) {

        const appearance =
          incoming.appearance;


        if (
          appearance.theme !==
          undefined
        ) {

          const theme =
            String(
              appearance.theme ||
              ""
            )
              .trim()
              .toLowerCase();


          if (
            ![
              "light",
              "dark",
              "system"
            ].includes(
              theme
            )
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Invalid Student Studio theme."

              });

          }


          current
            .appearance
            .theme =
            theme;

        }


        applyBooleanSetting(
          current.appearance,
          appearance,
          "compactInterface"
        );


        applyBooleanSetting(
          current.appearance,
          appearance,
          "rememberSidebar"
        );

      }


      /* =========================================
         LEARNING
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.learning
        )
      ) {

        [
          "studyReminders",
          "assignmentReminders",
          "continueLearning",
          "autoplayNextLesson",
          "rememberLastClass"

        ].forEach(
          field => {

            applyBooleanSetting(
              current.learning,
              incoming.learning,
              field
            );

          }
        );

      }


      /* =========================================
         NOTIFICATIONS
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.notifications
        )
      ) {

        [
          "assignments",
          "grades",
          "announcements",
          "messages",
          "certificates",
          "career"

        ].forEach(
          field => {

            applyBooleanSetting(
              current.notifications,
              incoming.notifications,
              field
            );

          }
        );

      }


      /* =========================================
         KABEZYA AI
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.ai
        )
      ) {

        [
          "personalization",
          "classContext",
          "learningHistory",
          "suggestions"

        ].forEach(
          field => {

            applyBooleanSetting(
              current.ai,
              incoming.ai,
              field
            );

          }
        );

      }


      /* =========================================
         PRIVACY
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.privacy
        )
      ) {

        const privacy =
          incoming.privacy;


        if (
          privacy.portfolioVisibility !==
          undefined
        ) {

          const visibility =
            String(
              privacy
                .portfolioVisibility ||
              ""
            )
              .trim()
              .toLowerCase();


          const allowedVisibility =
            new Set([
              "public",
              "connections",
              "private"
            ]);


          if (
            !allowedVisibility.has(
              visibility
            )
          ) {

            return res
              .status(400)
              .json({

                message:
                  "Invalid portfolio visibility."

              });

          }


          current
            .privacy
            .portfolioVisibility =
            visibility;

        }


        [
          "profileDiscovery",
          "activityVisibility",
          "certificateVisibility"

        ].forEach(
          field => {

            applyBooleanSetting(
              current.privacy,
              privacy,
              field
            );

          }
        );

      }


      /* =========================================
         ACCESSIBILITY
      ========================================= */

      if (
        isPlainSettingsObject(
          incoming.accessibility
        )
      ) {

        [
          "reducedMotion",
          "highContrast",
          "largerText"

        ].forEach(
          field => {

            applyBooleanSetting(
              current.accessibility,
              incoming.accessibility,
              field
            );

          }
        );

      }


      /* =========================================
         SAVE
      ========================================= */

      user.set(
        "studentStudioSettings",
        current
      );


      await user.save({
        validateModifiedOnly:
          true
      });


      /*
        Read the saved object again.

        This makes the API response reflect the
        actual persisted MongoDB/Mongoose state.
      */

      const savedUser =
        await User.findById(
          user._id
        )
          .select(
            "_id role studentStudioSettings"
          )
          .lean();


      if (!savedUser) {

        return res
          .status(404)
          .json({

            message:
              "User account could not be reloaded."

          });

      }


      return res.json({

        message:
          "Student Studio settings updated successfully.",

        settings:
          mergeStudentStudioSettings(
            savedUser.studentStudioSettings
          )

      });


    } catch (error) {

      console.error(
        "UPDATE STUDENT STUDIO SETTINGS ERROR:",
        error
      );


      if (
        error?.name ===
        "ValidationError"
      ) {

        return res
          .status(400)
          .json({

            message:
              "One or more Student Studio settings are invalid."

          });

      }


      return res
        .status(500)
        .json({

          message:
            "Failed to update Student Studio settings."

        });

    }

  }
);


/* ============================================
   FOLLOWERS / FOLLOWING
============================================ */
router.get("/me/followers", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "name profileImage headline role");
    res.json(user.followers);
  } catch (err) {
    res.status(500).json({ message: "Failed to load followers" });
  }
});

router.get("/me/following", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("following", "name profileImage headline role");
    res.json(user.following);
  } catch (err) {
    res.status(500).json({ message: "Failed to load following" });
  }
});

/* ============================================
   UPDATE PROFILE
============================================ */
router.patch(
  "/profile",
  auth,
upload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "bannerImage", maxCount: 1 },
  { name: "banner", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
  { name: "cv", maxCount: 1 }
]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

const assignIfPresent = (field) => {
  if (req.body[field] !== undefined) {
    user[field] = String(req.body[field]).trim();
  }
};

[
  "name",
  "headline",
  "bio",
  "location",
  "website",
  "companyName",
  "industry",
  "contactEmail",
  "contactPhone",
  "department",
  "profession",
  "availability",
  "workPreference",
  "preferredRole",
  "salaryExpectation",
  "noticePeriod",
  "workSetup",
  "preferredShift",
  "employmentType",
  "schoolName",
  "schoolDescription",
  "address",
   "phone",
"schoolType"
].forEach(assignIfPresent);

if (req.body.yearsOfExperience !== undefined || req.body.experienceYears !== undefined) {
  user.yearsOfExperience = Number(req.body.yearsOfExperience || req.body.experienceYears || 0);
}

if (req.body.programs) {
  try {
    const parsed = JSON.parse(req.body.programs);
    user.programs = Array.isArray(parsed) ? parsed : [];
  } catch {
    user.programs = String(req.body.programs)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }
}
      if (req.body.experience) {
        try { user.experience = JSON.parse(req.body.experience); } catch {}
      }
      if (req.body.education) {
        try { user.education = JSON.parse(req.body.education); } catch {}
      }
       if (req.body.portfolio) {
  try { user.portfolio = JSON.parse(req.body.portfolio); } catch {}
}
       if (req.body.employerPraise) {
  try { user.employerPraise = JSON.parse(req.body.employerPraise); } catch {}
}

if (req.body.achievements) {
  try { user.achievements = JSON.parse(req.body.achievements); } catch {}
}

if (req.body.performanceMetrics) {
  try { user.performanceMetrics = JSON.parse(req.body.performanceMetrics); } catch {}
}
      if (req.body.skills) {
  try { user.skills = JSON.parse(req.body.skills); } catch {}
}

if (req.body.languages) {
  try { user.languages = JSON.parse(req.body.languages); } catch {}
}

if (req.body.services) {
  try { user.services = JSON.parse(req.body.services); } catch {}
}

if (req.body.tools) {
  try { user.tools = JSON.parse(req.body.tools); } catch {}
}

if (req.body.industries) {
  try { user.industries = JSON.parse(req.body.industries); } catch {}
}

if (req.body.certifications) {
  try { user.certifications = JSON.parse(req.body.certifications); } catch {}
}
if (req.body.isPublic !== undefined) {
  user.isPublic =
    req.body.isPublic === "true" ||
    req.body.isPublic === true;
}

if (req.body.showEmail !== undefined) {
  user.showEmail =
    req.body.showEmail === "true" ||
    req.body.showEmail === true;
}

if (req.body.showPhone !== undefined) {
  user.showPhone =
    req.body.showPhone === "true" ||
    req.body.showPhone === true;
}

if (req.body.showCV !== undefined) {
  user.showCV =
    req.body.showCV === "true" ||
    req.body.showCV === true;
}

if (req.body.allowMessages !== undefined) {
  user.allowMessages =
    req.body.allowMessages === "true" ||
    req.body.allowMessages === true;
}

if (req.body.allowProfileIndexing !== undefined) {
  user.allowProfileIndexing =
    req.body.allowProfileIndexing === "true" ||
    req.body.allowProfileIndexing === true;
}
      const logoFile = req.files?.profileImage?.[0] || req.files?.logo?.[0];

if (logoFile) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_profiles", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(logoFile.buffer);
        });
        user.profileImage = result.secure_url;
   user.schoolLogo = result.secure_url;
      }

     const bannerFile =
  req.files?.bannerImage?.[0] ||
  req.files?.banner?.[0] ||
  req.files?.coverImage?.[0];

if (bannerFile) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_banners", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(bannerFile.buffer);
        });
        user.bannerImage = result.secure_url;
   user.schoolBanner = result.secure_url;
      }
       if (req.body.removeCV === "true") {
  user.cvUrl = "";
}

      if (req.files?.cv?.[0]) {
        const result = await new Promise((resolve, reject) => {
cloudinary.uploader.upload_stream(
  {
    folder: "aift_cvs",
    resource_type: "raw",
    type: "upload",
    access_mode: "public",
    use_filename: true,
    unique_filename: true
  },
  (error, output) => error ? reject(error) : resolve(output)
).end(req.files.cv[0].buffer);
        });
        user.cvUrl = result.secure_url;
      }

      await user.save();
      res.json(user);
    } catch (err) {
      console.error("PROFILE UPDATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ============================================
   FOLLOW / UNFOLLOW
============================================ */

router.patch(
  "/:id/follow",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      const currentUserId =
        req.user._id ||
        req.user.id;

      const targetUserId =
        req.params.id;

      if (
        !validObjectId(targetUserId)
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID."
        });
      }

      if (
        String(currentUserId) ===
        String(targetUserId)
      ) {
        return res.status(400).json({
          message:
            "You cannot follow yourself."
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const [
        currentUser,
        targetUser
      ] = await Promise.all([
        User.findById(currentUserId)
          .session(mongoSession),

        User.findById(targetUserId)
          .session(mongoSession)
      ]);

      if (!currentUser) {
        await mongoSession
          .abortTransaction();

        return res.status(401).json({
          message:
            "Current user was not found."
        });
      }

      if (!targetUser) {
        await mongoSession
          .abortTransaction();

        return res.status(404).json({
          message:
            "User not found."
        });
      }

      if (
        targetUser.status === "suspended"
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "This account is unavailable."
        });
      }

      const alreadyFollowing =
        Array.isArray(
          currentUser.following
        ) &&
        currentUser.following.some(
          id =>
            String(id) ===
            String(targetUser._id)
        );

      let following;

      if (alreadyFollowing) {
        currentUser.following.pull(
          targetUser._id
        );

        targetUser.followers.pull(
          currentUser._id
        );

        following = false;
      } else {
        currentUser.following.addToSet(
          targetUser._id
        );

        targetUser.followers.addToSet(
          currentUser._id
        );

        following = true;
      }

      await currentUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      await targetUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      if (following) {
        await Notification.create(
          [
            {
              user:
                targetUser._id,

              type:
                "follow",

              sender:
                currentUser._id,

              text:
                `${currentUser.name || "Someone"} started following you`,

              link:
                `/public-profile.html?id=${currentUser._id}`
            }
          ],
          {
            session:
              mongoSession
          }
        );
      }

      /*
        School follower analytics belongs only to target
        accounts whose role is school.

        Other user roles continue to follow normally, but they
        do not create school analytics records.
      */
      if (
        targetUser.role === "school"
      ) {
        await recordSchoolAnalyticsEvent({
          req,

          schoolId:
            targetUser._id,

          eventType:
            following
              ? "follow"
              : "unfollow",

          entityType:
            "school",

          entityId:
            targetUser._id,

          metadata: {
            followerRole:
              currentUser.role ||
              "unknown"
          },

          mongoSession
        });
      }

      await mongoSession
        .commitTransaction();

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(targetUser._id)
        ).emit(
          "user_follow_updated",
          {
            followerId:
              currentUser._id,

            targetId:
              targetUser._id,

            following,

            followers:
              targetUser.followers.length
          }
        );
      }

      return res.json({
        following,

        targetId:
          targetUser._id,

        followers:
          targetUser.followers.length
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "FOLLOW ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Follow operation failed."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ============================================
   PUBLIC NETWORK PREVIEW
   GET /api/users/network/public
============================================ */
router.get("/network/public", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 60, 100);

    const users = await User.find({
      role: { $in: ["talent", "agent", "employer", "school"] },
      isBlockedByEmployer: { $ne: true },
      status: { $ne: "suspended" },
      isPublic: { $ne: false }
    })
      .select(
        "_id name headline bio role profileImage bannerImage followers skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified department course companyId teamRole education experience expectedSalary companyName industry schoolName programs location"
      )
      .sort({
        aiftVerified: -1,
        aiftCertified: -1,
        createdAt: -1
      })
      .limit(limit);

    res.json(users);
  } catch (err) {
    console.error("PUBLIC NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load public network" });
  }
});

/* ============================================
   NETWORK
============================================ */
router.get("/network", auth, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id }
    }).select("_id name email headline bio role profileImage bannerImage followers following skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified department course companyId teamRole isBlockedByEmployer education experience expectedSalary companyName industry schoolName programs location");

    res.json(users);
  } catch (err) {
    console.error("NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});

/* ============================================
   JOB SEEKER DISCOVERY
============================================ */
router.get("/jobseekers/discover", auth, async (req, res) => {
  try {
    const query = {
      role: { $in: ["talent", "agent"] },
      isBlockedByEmployer: { $ne: true }
    };

    if (req.query.skill) {
      query.skills = { $in: [new RegExp(req.query.skill, "i")] };
    }

    if (req.query.keyword) {
      query.$or = [
        { name: new RegExp(req.query.keyword, "i") },
        { headline: new RegExp(req.query.keyword, "i") },
        { bio: new RegExp(req.query.keyword, "i") },
        { skills: { $in: [new RegExp(req.query.keyword, "i")] } }
      ];
    }

    if (req.query.department) {
      query.department = new RegExp(req.query.department, "i");
    }

    const users = await User.find(query)
      .select("_id name email role headline bio profileImage skills languages certifications profession availability workPreference yearsOfExperience aiftVerified aiftCertified education experience expectedSalary location companyId teamRole")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to discover job seekers" });
  }
});

/* ============================================
   EMPLOYER PUBLIC PROFILE
   GET /api/users/employer/:id/public
============================================ */
router.get("/employer/:id/public", async (req, res) => {
  try {
    const employer = await User.findById(req.params.id)
      .select(
        "_id name email role companyName headline bio location website profileImage bannerImage contactEmail contactPhone industry companyTags followers following aiftVerified aiftCertified createdAt"
      )
      .populate("followers", "_id name profileImage headline role")
      .populate("following", "_id name profileImage headline role");

    if (!employer) {
      return res.status(404).json({ message: "Employer not found" });
    }

    if (!["employer", "school"].includes(employer.role)) {
      return res.status(400).json({ message: "This profile is not an employer profile" });
    }

    const jobs = await Job.find({
      employerId: employer._id,
      status: "active"
    })
      .select("_id title location type salary description status createdAt viewsCount applicationsCount")
      .sort({ createdAt: -1 })
      .limit(20);

    const applicationsCount = await Application.countDocuments({
      employerId: employer._id
    });

    const team = await User.find({
      companyId: employer._id,
      isBlockedByEmployer: { $ne: true }
    })
      .select("_id name profileImage headline teamRole department profession location skills languages aiftVerified aiftCertified")
      .sort({ createdAt: -1 })
      .limit(60);

    let posts = [];
    try {
      const Post = require("../models/Post");

      posts = await Post.find({
        author: employer._id,
        isHiddenByAdmin: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("author", "name companyName profileImage headline role aiftVerified aiftCertified followers")
        .populate("comments.user", "name profileImage headline role")
        .populate("comments.replies.user", "name profileImage headline role");
    } catch (postErr) {
      console.warn("PUBLIC EMPLOYER POSTS SKIPPED:", postErr.message);
      posts = [];
    }

    res.json({
      employer,
      jobs,
      team,
      posts,
      stats: {
        activeJobs: jobs.length,
        totalApplications: applicationsCount,
        teamMembers: team.length,
        followers: employer.followers?.length || 0,
        following: employer.following?.length || 0,
        posts: posts.length
      }
    });
  } catch (err) {
    console.error("EMPLOYER PUBLIC PROFILE ERROR:", err);
    res.status(500).json({ message: "Failed to load employer public profile" });
  }
});
/* ============================================
   PUBLIC PROFILE
============================================ */
router.get("/:id/cv/inline", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("cvUrl showCV isPublic");

    if (!user || !user.cvUrl) {
      return res.status(404).send("CV not found");
    }

    if (user.showCV === false || user.isPublic === false) {
      return res.status(403).send("CV is private");
    }

    const fileRes = await fetch(user.cvUrl);

    if (!fileRes.ok) {
      return res.status(404).send("Could not load CV");
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=cv.pdf");
    res.setHeader("Cache-Control", "public, max-age=3600");

    return res.send(buffer);

  } catch (err) {
    console.error("INLINE CV ERROR:", err);
    res.status(500).send("CV preview failed");
  }
});

router.get("/:id/public", async (req, res) => {
  try {

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate(
        "followers",
        "name profileImage headline role"
      )
      .populate(
        "following",
        "name profileImage headline role"
      )
      .populate(
        "companyId",
        "name companyName profileImage bannerImage headline"
      )
      .populate(
        "schoolId",
        "name schoolName schoolLogo schoolBanner"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if(user.isPublic === false){
      return res.status(403).json({
        message: "This profile is private"
      });
    }

/*
  School profile views are recorded through the dedicated
  analytics event endpoint, which provides:

  - session deduplication
  - self-view prevention
  - unique visitor tracking
  - traffic-source tracking
  - device tracking

  Continue preserving the legacy counter behavior for other
  profile roles until their analytics migration is completed.
*/
if (user.role !== "school") {
  user.profileViews =
    Number(
      user.profileViews || 0
    ) + 1;

  await user.save({
    validateModifiedOnly: true
  });
}

    let posts = [];

    try{

      const Post =
        require("../models/Post");

      posts = await Post.find({
        author:user._id,
        isHiddenByAdmin:{
          $ne:true
        }
      })
      .sort({ createdAt:-1 })
      .limit(25)
      .populate(
        "author",
        "name profileImage headline role aiftVerified aiftCertified"
      );

    }catch(postErr){

      console.warn(
        "PUBLIC POSTS ERROR:",
        postErr.message
      );

    }

    res.json({
      user,
      posts,
      stats:{
        followers:user.followers?.length || 0,
        following:user.following?.length || 0,
        skills:user.skills?.length || 0,
        languages:user.languages?.length || 0,
        experience:user.experience?.length || 0,
        education:user.education?.length || 0,
        profileViews:user.profileViews || 0
      }
    });

  } catch (err) {

    console.error(
      "PUBLIC PROFILE ERROR:",
      err
    );

    res.status(500).json({
      message: "Failed to load profile"
    });

  }
});

/* ============================================
   ADMIN
============================================ */
router.patch("/:id", auth, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isAdmin = req.user.role === "admin";
    const isSchoolAllowed = canSchoolManageUser(req.user, targetUser);

    if (!isAdmin && !isSchoolAllowed) {
      return res.status(403).json({ message: "Not allowed to update this user" });
    }

    const allowedFields = [
      "name",
      "email",
      "role",
      "status",
      "course",
      "subject",
      "department",
      "bio",
      "teacherBio",
      "studentBio",
      "schoolId",
      "linkedSchoolId",
      "companyId"
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        targetUser[field] = req.body[field];
      }
    });

    if (req.body.password) {
      targetUser.password = await bcrypt.hash(req.body.password, 10);
    }

    if (!isAdmin) {
      if (!["teacher", "student"].includes(String(targetUser.role))) {
        return res.status(403).json({ message: "School can only update teachers/students" });
      }

      targetUser.schoolId = req.user._id;
      targetUser.linkedSchoolId = req.user._id;
      targetUser.companyId = req.user._id;
    }

    await targetUser.save();

    const updated = await User.findById(targetUser._id).select("-password");

    res.json(updated);
  } catch (err) {
    console.error("SCHOOL USER UPDATE ERROR:", err);
    res.status(400).json({ message: err.message || "Failed to update user" });
  }
});

router.patch("/:id/password", adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(req.params.id, { password: hashed });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("ADMIN PASSWORD ERROR:", err);
    res.status(400).json({ message: "Failed to update password" });
  }
});

router.delete(
  "/:id",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !validObjectId(req.params.id)
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID."
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const targetUser =
        await User.findById(
          req.params.id
        ).session(mongoSession);

      if (!targetUser) {
        await mongoSession
          .abortTransaction();

        return res.status(404).json({
          message:
            "User not found."
        });
      }

      const isAdmin =
        req.user.role === "admin";

      const isSchoolAllowed =
        canSchoolManageUser(
          req.user,
          targetUser
        );

      if (
        !isAdmin &&
        !isSchoolAllowed
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "Not allowed to remove this user."
        });
      }

      const targetRole =
        String(
          targetUser.role || ""
        ).toLowerCase();

      const linkedSchoolId =
        resolveLinkedSchoolId(
          targetUser
        );

      /*
        Administrators permanently delete users.

        When the deleted account belonged to a school as a
        teacher or student, record the removal first.
      */
      if (isAdmin) {
        if (
          linkedSchoolId &&
          ["teacher", "student"].includes(
            targetRole
          )
        ) {
          await recordSchoolAnalyticsEvent({
            req,

            schoolId:
              linkedSchoolId,

            eventType:
              targetRole === "teacher"
                ? "teacher_removed"
                : "student_removed",

            entityType:
              targetRole,

            entityId:
              targetUser._id,

            metadata: {
              removalType:
                "permanent_delete",

              removedByRole:
                req.user.role
            },

            mongoSession
          });
        }

        await targetUser.deleteOne({
          session: mongoSession
        });

        await mongoSession
          .commitTransaction();

        return res.json({
          message:
            "User deleted successfully."
        });
      }

      if (
        ![
          "teacher",
          "student",
          "talent"
        ].includes(targetRole)
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(403).json({
          message:
            "School can only remove teachers or students."
        });
      }

      const schoolId =
        req.user._id;

      targetUser.schoolId = null;
      targetUser.linkedSchoolId = null;
      targetUser.companyId = null;
      targetUser.createdBySchool = null;

      if (targetRole === "teacher") {
        targetUser.assignedClasses = [];
      }

      await targetUser.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      if (
        ["teacher", "student"].includes(
          targetRole
        )
      ) {
        await recordSchoolAnalyticsEvent({
          req,

          schoolId,

          eventType:
            targetRole === "teacher"
              ? "teacher_removed"
              : "student_removed",

          entityType:
            targetRole,

          entityId:
            targetUser._id,

          metadata: {
            removalType:
              "school_unlink",

            removedByRole:
              req.user.role
          },

          mongoSession
        });
      }

      await mongoSession
        .commitTransaction();

      const io =
        req.app.get("io");

      if (io) {
        io.to(
          String(schoolId)
        ).emit(
          "user:removed",
          {
            userId:
              targetUser._id,

            role:
              targetRole
          }
        );
      }

      return res.json({
        message:
          "User removed from school."
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SCHOOL USER DELETE ERROR:",
        error
      );

      return res.status(500).json({
        message:
          error.message ||
          "Failed to remove user."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

router.get("/activity", auth, async (req, res) => {
  const applications = await Application.find({ applicantId: req.user.id });
  const user = await User.findById(req.user.id);

  res.json({
    totalApplications: applications.length,
    savedJobs: user.savedJobs.length
  });
});

router.get("/suggestions", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const suggestions = await User.find({
      _id: { $ne: req.user.id, $nin: user.following || [] }
    })
      .limit(5)
      .select("name profileImage headline role");

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: "Failed to load suggestions" });
  }
});


/* ============================================
   ACCOUNT SELF-SERVICE HELPERS
============================================ */

function getSelfServiceAccountType(
  user
) {

  const role =
    String(
      user?.role ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    role === "student" ||
    role === "talent"
  ) {

    return "student";

  }


  if (
    role === "school"
  ) {

    return "school";

  }


  return null;

}


function getSelfServiceAccountLabel(
  user
) {

  return (
    getSelfServiceAccountType(
      user
    ) === "school"
      ? "School"
      : "Student"
  );

}


function canUseAccountSelfService(
  user
) {

  return Boolean(
    getSelfServiceAccountType(
      user
    )
  );

}


/* ============================================
   ACCOUNT DATA EXPORT REQUEST

   POST /api/users/me/data-export-request

   Supported:
   - school
   - student
   - legacy talent/student account
============================================ */

router.post(
  "/me/data-export-request",
  auth,
  async (req, res) => {

    try {

      /* ========================================
         ACCOUNT TYPE
      ======================================== */

      if (
        !canUseAccountSelfService(
          req.user
        )
      ) {

        return res
          .status(403)
          .json({

            message:
              "This account type cannot request a data export through this endpoint."

          });

      }


      const user =
        await User.findById(
          req.user._id ||
          req.user.id
        );


      if (!user) {

        return res
          .status(404)
          .json({

            message:
              "Account not found."

          });

      }


      const accountType =
        getSelfServiceAccountType(
          user
        );


      const accountLabel =
        getSelfServiceAccountLabel(
          user
        );


      const now =
        new Date();


      /* ========================================
         REQUEST RATE LIMIT

         One accepted request per 24 hours.

         This is server-side protection and must
         not depend on frontend button state.
      ======================================== */

      if (
        user.dataExportRequestedAt
      ) {

        const previous =
          new Date(
            user.dataExportRequestedAt
          )
            .getTime();


        const elapsed =
          Date.now() -
          previous;


        const oneDay =
          24 *
          60 *
          60 *
          1000;


        if (
          Number.isFinite(
            previous
          ) &&
          elapsed >= 0 &&
          elapsed < oneDay
        ) {

          return res
            .status(429)
            .json({

              message:
                "A data export was already requested recently. Please wait before requesting another export.",

              requestedAt:
                user.dataExportRequestedAt,

              retryAfterMs:
                oneDay -
                elapsed

            });

        }

      }


      /* ========================================
         RECORD REQUEST
      ======================================== */

      user.dataExportRequestedAt =
        now;


      /*
        Preserve the existing School Studio
        bookkeeping when this is a school account.
      */

      if (
        accountType === "school" &&
        user.schoolStudioSettings?.data
      ) {

        user
          .schoolStudioSettings
          .data
          .exportRequestedAt =
          now;

      }


      await user.save({
        validateModifiedOnly:
          true
      });


      return res
        .status(202)
        .json({

          message:
            `${accountLabel} data export requested successfully.`,

          requestedAt:
            now,

          status:
            "requested",

          accountType

        });


    } catch (error) {

      console.error(
        "ACCOUNT DATA EXPORT REQUEST ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to request account data export."

        });

    }

  }
);


/* ============================================
   DEACTIVATE ACCOUNT

   POST /api/users/me/deactivate

   Password verification is required.

   All active sessions are revoked after the
   account state has been persisted.
============================================ */

router.post(
  "/me/deactivate",
  auth,
  async (req, res) => {

    try {

      /* ========================================
         ACCOUNT TYPE
      ======================================== */

      if (
        !canUseAccountSelfService(
          req.user
        )
      ) {

        return res
          .status(403)
          .json({

            message:
              "This account type cannot be deactivated through this endpoint."

          });

      }


      const {
        password,
        reason
      } =
        req.body ||
        {};


      if (
        !password
      ) {

        return res
          .status(400)
          .json({

            message:
              "Password is required to deactivate the account."

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
              "Account not found."

          });

      }


      const accountType =
        getSelfServiceAccountType(
          user
        );


      const accountLabel =
        getSelfServiceAccountLabel(
          user
        );


      /* ========================================
         VERIFY PASSWORD
      ======================================== */

      const passwordMatches =
        await bcrypt.compare(
          String(
            password
          ),
          user.password
        );


      if (
        !passwordMatches
      ) {

        return res
          .status(400)
          .json({

            message:
              "Password is incorrect."

          });

      }


      /* ========================================
         EXISTING DELETION REQUEST

         An account already pending deletion
         should not be converted into a normal
         deactivation.
      ======================================== */

      if (
        user.deletionRequestedAt
      ) {

        return res
          .status(409)
          .json({

            message:
              "This account is already pending deletion.",

            deletionRequestedAt:
              user.deletionRequestedAt,

            deletionScheduledFor:
              user.deletionScheduledFor ||
              null

          });

      }


      /* ========================================
         IDEMPOTENT DEACTIVATION
      ======================================== */

      if (
        user.status ===
        "deactivated"
      ) {

        return res.json({

          message:
            `${accountLabel} account is already deactivated.`,

          deactivatedAt:
            user.deactivatedAt ||
            null,

          accountType

        });

      }


      const now =
        new Date();


      /* ========================================
         ACCOUNT STATE
      ======================================== */

      user.status =
        "deactivated";


      user.deactivatedAt =
        now;


      user.deactivationReason =
        String(
          reason ||
          ""
        )
          .trim()
          .slice(
            0,
            500
          ) ||
        null;


      /*
        Preserve School Studio's current data
        bookkeeping for school accounts.

        Student Studio does not need a duplicate
        deactivatedAt field because the top-level
        account field is authoritative.
      */

      if (
        accountType === "school" &&
        user.schoolStudioSettings?.data
      ) {

        user
          .schoolStudioSettings
          .data
          .deactivatedAt =
          now;

      }


      await user.save({
        validateModifiedOnly:
          true
      });


      /* ========================================
         REVOKE EVERY ACTIVE SESSION
      ======================================== */

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
              now,

            revokedReason:
              "account_deactivated"

          }

        }

      );


      return res.json({

        message:
          `${accountLabel} account deactivated successfully.`,

        deactivatedAt:
          now,

        accountType

      });


    } catch (error) {

      console.error(
        "DEACTIVATE ACCOUNT ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to deactivate account."

        });

    }

  }
);


/* ============================================
   REQUEST ACCOUNT DELETION

   POST /api/users/me/delete-account-request

   IMPORTANT:

   This does NOT immediately remove MongoDB
   records.

   The account is disabled immediately and a
   controlled deletion date is recorded.
============================================ */

router.post(
  "/me/delete-account-request",
  auth,
  async (req, res) => {

    try {

      /* ========================================
         ACCOUNT TYPE
      ======================================== */

      if (
        !canUseAccountSelfService(
          req.user
        )
      ) {

        return res
          .status(403)
          .json({

            message:
              "This account type cannot request account deletion through this endpoint."

          });

      }


      const {
        password,
        confirmation
      } =
        req.body ||
        {};


      if (
        !password ||
        !confirmation
      ) {

        return res
          .status(400)
          .json({

            message:
              "Password and confirmation are required."

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
              "Account not found."

          });

      }


      const accountType =
        getSelfServiceAccountType(
          user
        );


      const accountLabel =
        getSelfServiceAccountLabel(
          user
        );


      /* ========================================
         VERIFY PASSWORD
      ======================================== */

      const passwordMatches =
        await bcrypt.compare(
          String(
            password
          ),
          user.password
        );


      if (
        !passwordMatches
      ) {

        return res
          .status(400)
          .json({

            message:
              "Password is incorrect."

          });

      }


      /* ========================================
         DESTRUCTIVE CONFIRMATION

         School:
           requires exact school/account name.

         Student:
           requires exact student's account name.

         We intentionally keep this case-sensitive
         and exact after trimming whitespace.
      ======================================== */

      const expectedConfirmation =
        String(

          accountType === "school"
            ? (
                user.name ||
                user.companyName ||
                ""
              )
            : (
                user.name ||
                ""
              )

        )
          .trim();


      const suppliedConfirmation =
        String(
          confirmation ||
          ""
        )
          .trim();


      if (
        !expectedConfirmation ||
        suppliedConfirmation !==
        expectedConfirmation
      ) {

        return res
          .status(400)
          .json({

            message:
              accountType === "school"
                ? "Confirmation does not match the school account name."
                : "Confirmation does not match your account name.",

            confirmationRequired:
              expectedConfirmation

          });

      }


      /* ========================================
         IDEMPOTENT REQUEST
      ======================================== */

      if (
        user.deletionRequestedAt
      ) {

        return res.json({

          message:
            "Account deletion has already been requested.",

          requestedAt:
            user.deletionRequestedAt,

          scheduledFor:
            user.deletionScheduledFor ||
            null,

          status:
            "pending_deletion",

          accountType

        });

      }


      const now =
        new Date();


      /* ========================================
         30-DAY DELETION WINDOW

         A separate deletion worker/admin process
         must permanently remove eligible records
         after this time.

         This endpoint intentionally does not
         physically delete MongoDB documents.
      ======================================== */

      const scheduledFor =
        new Date(

          now.getTime() +

          30 *
          24 *
          60 *
          60 *
          1000

        );


      user.deletionRequestedAt =
        now;


      user.deletionScheduledFor =
        scheduledFor;


      user.status =
        "deactivated";


      user.deactivatedAt =
        user.deactivatedAt ||
        now;


      await user.save({
        validateModifiedOnly:
          true
      });


      /* ========================================
         REVOKE EVERY ACTIVE SESSION
      ======================================== */

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
              now,

            revokedReason:
              "account_deletion_requested"

          }

        }

      );


      return res
        .status(202)
        .json({

          message:
            `${accountLabel} account deletion requested successfully.`,

          requestedAt:
            now,

          scheduledFor,

          status:
            "pending_deletion",

          accountType

        });


    } catch (error) {

      console.error(
        "ACCOUNT DELETE REQUEST ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          message:
            "Failed to request account deletion."

        });

    }

  }
);

module.exports = router;
