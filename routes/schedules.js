"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const auth = require("../middleware/auth");
const Schedule = require("../models/Schedule");
const Class = require("../models/Class");


/* =========================================================
   CONSTANTS
========================================================= */

const SESSION_STATUSES = new Set([
  "scheduled",
  "started",
  "completed",
  "missed",
  "cancelled",
  "rescheduled"
]);

const TEACHER_ATTENDANCE_STATUSES = new Set([
  "pending",
  "present",
  "late",
  "missed",
  "excused"
]);

const SESSION_TYPES = new Set([
  "online",
  "physical",
  "hybrid"
]);

const LEGACY_STATUSES = new Set([
  "scheduled",
  "completed",
  "cancelled"
]);

const DEFAULT_LATE_GRACE_MINUTES = 15;


/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    administrator: "admin",
    instructor: "teacher",
    faculty: "teacher",
    learner: "student"
  };

  return aliases[role] || role;
}


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const result = String(value).trim();

  return result || fallback;
}


/* =========================================================
   OBJECT ID NORMALIZATION

   Avoid recursive ObjectId normalization.
========================================================= */

function normalizeObjectId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    value instanceof mongoose.Types.ObjectId
  ) {
    return value.toHexString();
  }

  if (
    typeof value === "object" &&
    typeof value.toHexString === "function"
  ) {
    try {
      return String(
        value.toHexString()
      ).trim();
    } catch (_) {
      return "";
    }
  }

  if (
    typeof value === "object" &&
    value._id !== undefined &&
    value._id !== value
  ) {
    return normalizeObjectId(
      value._id
    );
  }

  try {
    const result =
      String(value).trim();

    return result === "[object Object]"
      ? ""
      : result;
  } catch (_) {
    return "";
  }
}


function sameId(first, second) {
  const firstId =
    normalizeObjectId(first);

  const secondId =
    normalizeObjectId(second);

  return Boolean(
    firstId &&
    secondId &&
    firstId === secondId
  );
}


function isValidObjectId(value) {
  const id =
    normalizeObjectId(value);

  return Boolean(
    id &&
    mongoose.Types.ObjectId.isValid(id)
  );
}


/* =========================================================
   SCHOOL IDS
========================================================= */

function getUserSchoolIds(user) {
  if (!user) {
    return [];
  }

  const role =
    normalizeRole(user.role);

  const values = [
    user.schoolId,
    user.linkedSchoolId
  ];

  if (role === "school") {
    values.push(user._id);
  }

  return [
    ...new Set(
      values
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
}


/* =========================================================
   SCHOOL MANAGEMENT PERMISSION
========================================================= */

function canManageSchool(user, schoolId) {
  if (
    !user ||
    !schoolId
  ) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  if (role === "admin") {
    return true;
  }

  if (role !== "school") {
    return false;
  }

  return getUserSchoolIds(user)
    .includes(
      normalizeObjectId(schoolId)
    );
}


/* =========================================================
   CLASS PERMISSIONS
========================================================= */

function canManageAssignedClass(user, classDoc) {
  if (
    !user ||
    !classDoc
  ) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  const userId =
    normalizeObjectId(user._id);

  const schoolId =
    normalizeObjectId(
      classDoc.schoolId
    );

  const teacherId =
    normalizeObjectId(
      classDoc.teacherId
    );

  if (role === "admin") {
    return true;
  }

  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(schoolId);
  }

  if (role === "teacher") {
    return Boolean(
      userId &&
      teacherId &&
      userId === teacherId
    );
  }

  return false;
}


function isStudentEnrolled(
  user,
  classDoc
) {
  if (
    !user ||
    !classDoc
  ) {
    return false;
  }

  const userId =
    normalizeObjectId(user._id);

  const studentIds =
    Array.isArray(classDoc.studentIds)
      ? classDoc.studentIds
          .map(normalizeObjectId)
          .filter(Boolean)
      : [];

  return studentIds.includes(
    userId
  );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function normalizeDateInput(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}


function normalizeTime(value) {
  const time =
    safeString(value);

  if (!time) {
    return "";
  }

  const match =
    time.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (!match) {
    return "";
  }

  const hours =
    Number(match[1]);

  const minutes =
    Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return "";
  }

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0")
  ].join(":");
}


/* =========================================================
   BUILD DATE + TIME

   The application currently stores:
     date
     startTime
     endTime

   This helper also creates canonical Date values for
   operational tracking.

   NOTE:
   This uses the backend runtime's interpretation of the
   supplied date/time. Later, if your Schools operate across
   multiple time zones, add an explicit School timezone field.
========================================================= */

function combineDateAndTime(
  dateValue,
  timeValue
) {
  const date =
    normalizeDateInput(
      dateValue
    );

  const time =
    normalizeTime(
      timeValue
    );

  if (
    !date ||
    !time
  ) {
    return null;
  }

  const [
    hours,
    minutes
  ] = time
    .split(":")
    .map(Number);

  const result =
    new Date(date);

  result.setHours(
    hours,
    minutes,
    0,
    0
  );

  return result;
}


/* =========================================================
   SYNCHRONIZE SCHEDULE DATETIMES
========================================================= */

function synchronizeScheduleTimes(
  schedule
) {
  if (!schedule) {
    return;
  }

  const startTime =
    normalizeTime(
      schedule.startTime ||
      schedule.time
    );

  const endTime =
    normalizeTime(
      schedule.endTime
    );

  if (startTime) {
    schedule.startTime =
      startTime;

    schedule.time =
      startTime;
  }

  if (endTime) {
    schedule.endTime =
      endTime;
  }

  schedule.scheduledStartAt =
    combineDateAndTime(
      schedule.date,
      startTime
    );

  schedule.scheduledEndAt =
    combineDateAndTime(
      schedule.date,
      endTime
    );
}


/* =========================================================
   LEGACY STATUS SYNCHRONIZATION
========================================================= */

function synchronizeLegacyStatus(
  schedule
) {
  if (!schedule) {
    return;
  }

  switch (
    schedule.sessionStatus
  ) {
    case "completed":
      schedule.status =
        "completed";
      break;

    case "cancelled":
      schedule.status =
        "cancelled";
      break;

    default:
      schedule.status =
        "scheduled";
      break;
  }
}


/* =========================================================
   POPULATE SCHEDULE
========================================================= */

async function populateSchedule(
  scheduleId
) {
  return Schedule.findById(
    scheduleId
  )
    .populate(
      "classId",
      "title subject classCode schoolId teacherId studentIds meetingLink"
    )
    .populate(
      "teacherId",
      "name email profileImage subject"
    )
    .populate(
      "createdBy",
      "name email role profileImage"
    )
    .populate(
      "completionConfirmedBy",
      "name email role"
    )
    .populate(
      "cancelledBy",
      "name email role"
    )
    .populate(
      "rescheduledBy",
      "name email role"
    )
    .populate(
      "reviewedBy",
      "name email role"
    );
}


/* =========================================================
   SOCKET HELPERS
========================================================= */

function getIo(req) {
  return req.app.get("io");
}


function emitScheduleEvent(
  req,
  eventName,
  payload,
  {
    schoolId = "",
    teacherId = "",
    classId = ""
  } = {}
) {
  const io =
    getIo(req);

  if (!io) {
    return;
  }

  const rooms =
    new Set();

  [
    schoolId,
    teacherId,
    classId
  ]
    .map(normalizeObjectId)
    .filter(Boolean)
    .forEach(
      id => rooms.add(id)
    );

  rooms.forEach(
    room => {
      io
        .to(room)
        .emit(
          eventName,
          payload
        );
    }
  );
}


/* =========================================================
   SCHEDULE ACCESS
========================================================= */

async function getScheduleAccessContext(
  req,
  schedule
) {
  if (!schedule) {
    return {
      allowed: false,
      classDoc: null
    };
  }

  const classDoc =
    await Class.findById(
      schedule.classId
    );

  if (!classDoc) {
    return {
      allowed: false,
      classDoc: null
    };
  }

  const role =
    normalizeRole(
      req.user.role
    );

  if (
    role === "admin" ||
    role === "school" ||
    role === "teacher"
  ) {
    return {
      allowed:
        canManageAssignedClass(
          req.user,
          classDoc
        ),

      classDoc
    };
  }

  if (role === "student") {
    return {
      allowed:
        isStudentEnrolled(
          req.user,
          classDoc
        ),

      classDoc
    };
  }

  return {
    allowed: false,
    classDoc
  };
}


/* =========================================================
   TEACHER ASSIGNMENT VALIDATION

   School/Admin may supply teacherId, but that teacher must
   match the teacher assigned to the class.

   This prevents School schedules from accidentally assigning
   an unrelated teacher to a class.

   If you later support multiple teachers per class, this
   helper is where that rule should be expanded.
========================================================= */

function resolveTeacherForClass(
  user,
  classDoc,
  requestedTeacherId
) {
  const role =
    normalizeRole(
      user.role
    );

  const assignedTeacherId =
    normalizeObjectId(
      classDoc.teacherId
    );

  if (role === "teacher") {
    return normalizeObjectId(
      user._id
    );
  }

  const requested =
    normalizeObjectId(
      requestedTeacherId
    );

  if (
    requested &&
    assignedTeacherId &&
    requested !== assignedTeacherId
  ) {
    const error =
      new Error(
        "The selected teacher is not assigned to this class"
      );

    error.statusCode =
      400;

    throw error;
  }

  return (
    requested ||
    assignedTeacherId ||
    ""
  );
}


/* =========================================================
   AUTOMATIC OPERATIONAL EVALUATION

   This does NOT require a cron job merely to display an
   accurate status when schedules are loaded.

   A future scheduled worker can use the same logic to send
   proactive School alerts.
========================================================= */

function evaluateScheduleOperationalState(
  schedule,
  now = new Date()
) {
  if (!schedule) {
    return false;
  }

  let changed =
    false;

  const terminalStatuses =
    new Set([
      "completed",
      "cancelled",
      "rescheduled"
    ]);

  if (
    terminalStatuses.has(
      schedule.sessionStatus
    )
  ) {
    schedule.trackingEvaluatedAt =
      now;

    return changed;
  }

  const scheduledStartAt =
    schedule.scheduledStartAt
      ? new Date(
          schedule.scheduledStartAt
        )
      : null;

  const scheduledEndAt =
    schedule.scheduledEndAt
      ? new Date(
          schedule.scheduledEndAt
        )
      : null;

  /*
    Detect late Teacher after grace period.
  */

  if (
    schedule.sessionStatus ===
      "scheduled" &&
    scheduledStartAt &&
    !schedule.actualStartAt &&
    !schedule.teacherJoinedAt
  ) {
    const graceBoundary =
      new Date(
        scheduledStartAt.getTime() +
        DEFAULT_LATE_GRACE_MINUTES *
          60 *
          1000
      );

    if (
      now >= graceBoundary &&
      (
        !scheduledEndAt ||
        now < scheduledEndAt
      )
    ) {
      if (
        schedule.teacherAttendanceStatus !==
        "late"
      ) {
        schedule.teacherAttendanceStatus =
          "late";

        changed =
          true;
      }

      const lateMinutes =
        Math.max(
          0,
          Math.floor(
            (
              now.getTime() -
              scheduledStartAt.getTime()
            ) /
            60000
          )
        );

      if (
        schedule.teacherLateMinutes !==
        lateMinutes
      ) {
        schedule.teacherLateMinutes =
          lateMinutes;

        changed =
          true;
      }
    }
  }

  /*
    Automatically flag a session as missed once its scheduled
    end passes without any evidence that the Teacher started.
  */

  if (
    schedule.sessionStatus ===
      "scheduled" &&
    scheduledEndAt &&
    now > scheduledEndAt &&
    !schedule.actualStartAt &&
    !schedule.teacherJoinedAt
  ) {
    schedule.sessionStatus =
      "missed";

    schedule.status =
      "scheduled";

    schedule.teacherAttendanceStatus =
      "missed";

    schedule.missedAt =
      schedule.missedAt ||
      now;

    schedule.missedDetectedAutomatically =
      true;

    schedule.requiresReview =
      true;

    schedule.reviewReason =
      schedule.reviewReason ||
      "Scheduled session ended without a recorded teacher start.";

    changed =
      true;
  }

  schedule.trackingEvaluatedAt =
    now;

  return changed;
}


/* =========================================================
   GET SCHEDULES
========================================================= */

router.get(
  "/",
  auth,
  async (req, res) => {
    try {
      const user =
        req.user;

      const role =
        normalizeRole(
          user.role
        );

      const query = {};

      /* =====================================================
         ADMIN
      ===================================================== */

      if (role === "admin") {
        if (
          req.query.schoolId
        ) {
          query.schoolId =
            req.query.schoolId;
        }
      }

      /* =====================================================
         SCHOOL
      ===================================================== */

      else if (
        role === "school"
      ) {
        query.schoolId =
          user._id;
      }

      /* =====================================================
         TEACHER
      ===================================================== */

      else if (
        role === "teacher"
      ) {
        const assignedClasses =
          await Class.find({
            teacherId:
              user._id
          })
            .select("_id")
            .lean();

        query.classId = {
          $in:
            assignedClasses.map(
              item => item._id
            )
        };
      }

      /* =====================================================
         STUDENT
      ===================================================== */

      else if (
        role === "student"
      ) {
        const enrolledClasses =
          await Class.find({
            studentIds:
              user._id
          })
            .select("_id")
            .lean();

        query.classId = {
          $in:
            enrolledClasses.map(
              item => item._id
            )
        };
      }

      else {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to view schedules"
          });
      }

      /* =====================================================
         CLASS FILTER
      ===================================================== */

      if (
        req.query.classId
      ) {
        if (
          !isValidObjectId(
            req.query.classId
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Invalid classId"
            });
        }

        const classDoc =
          await Class.findById(
            req.query.classId
          );

        if (!classDoc) {
          return res
            .status(404)
            .json({
              message:
                "Class not found"
            });
        }

        if (
          role === "teacher" &&
          !canManageAssignedClass(
            user,
            classDoc
          )
        ) {
          return res
            .status(403)
            .json({
              message:
                "Not allowed to view this class schedule"
            });
        }

        if (
          role === "student" &&
          !isStudentEnrolled(
            user,
            classDoc
          )
        ) {
          return res
            .status(403)
            .json({
              message:
                "Not enrolled in this class"
            });
        }

        if (
          role === "school" &&
          !canManageAssignedClass(
            user,
            classDoc
          )
        ) {
          return res
            .status(403)
            .json({
              message:
                "Class does not belong to this school"
            });
        }

        query.classId =
          classDoc._id;
      }

      /* =====================================================
         TEACHER FILTER
      ===================================================== */

      if (
        req.query.teacherId
      ) {
        if (
          role === "teacher" &&
          !sameId(
            req.query.teacherId,
            user._id
          )
        ) {
          return res
            .status(403)
            .json({
              message:
                "Not allowed to view another teacher's schedule"
            });
        }

        query.teacherId =
          role === "teacher"
            ? user._id
            : req.query.teacherId;
      }

      /* =====================================================
         STATUS FILTER
      ===================================================== */

      if (
        req.query.sessionStatus
      ) {
        const requestedStatus =
          safeString(
            req.query.sessionStatus
          ).toLowerCase();

        if (
          !SESSION_STATUSES.has(
            requestedStatus
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Invalid sessionStatus"
            });
        }

        query.sessionStatus =
          requestedStatus;
      }

      /* =====================================================
         DATE RANGE
      ===================================================== */

      if (
        req.query.from ||
        req.query.to
      ) {
        query.date = {};

        if (
          req.query.from
        ) {
          const from =
            normalizeDateInput(
              req.query.from
            );

          if (!from) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid from date"
              });
          }

          query.date.$gte =
            from;
        }

        if (
          req.query.to
        ) {
          const to =
            normalizeDateInput(
              req.query.to
            );

          if (!to) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid to date"
              });
          }

          to.setHours(
            23,
            59,
            59,
            999
          );

          query.date.$lte =
            to;
        }
      }

      let schedules =
        await Schedule.find(
          query
        )
          .populate(
            "classId",
            "title subject classCode schoolId teacherId"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          )
          .populate(
            "createdBy",
            "name email role profileImage"
          )
          .sort({
            scheduledStartAt: 1,
            date: 1,
            time: 1,
            createdAt: -1
          });

      /*
        Upgrade old records lazily and evaluate operational
        status whenever schedules are read.
      */

      const now =
        new Date();

      const changedSchedules =
        [];

      for (
        const schedule of schedules
      ) {
        let changed =
          false;

        if (
          !schedule.scheduledStartAt
        ) {
          synchronizeScheduleTimes(
            schedule
          );

          changed =
            true;
        }

        if (
          !schedule.sessionStatus
        ) {
          schedule.sessionStatus =
            schedule.status === "completed"
              ? "completed"
              : schedule.status === "cancelled"
                ? "cancelled"
                : "scheduled";

          changed =
            true;
        }

        if (
          evaluateScheduleOperationalState(
            schedule,
            now
          )
        ) {
          changed =
            true;
        }

        synchronizeLegacyStatus(
          schedule
        );

        if (changed) {
          await schedule.save();

          changedSchedules.push(
            schedule
          );
        }
      }

      return res.json(
        schedules
      );

    } catch (err) {
      console.error(
        "GET /api/schedules error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to load schedules"
        });
    }
  }
);


/* =========================================================
   GET SINGLE SCHEDULE
========================================================= */

router.get(
  "/:id",
  auth,
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid schedule ID"
          });
      }

      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const access =
        await getScheduleAccessContext(
          req,
          schedule
        );

      if (!access.allowed) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to view this schedule"
          });
      }

      synchronizeScheduleTimes(
        schedule
      );

      evaluateScheduleOperationalState(
        schedule
      );

      synchronizeLegacyStatus(
        schedule
      );

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "GET /api/schedules/:id error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to load schedule"
        });
    }
  }
);


/* =========================================================
   CREATE SCHEDULE
========================================================= */

router.post(
  "/",
  auth,
  async (req, res) => {
    try {
      const role =
        normalizeRole(
          req.user.role
        );

      if (
        ![
          "admin",
          "school",
          "teacher"
        ].includes(role)
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to create schedules"
          });
      }

      const {
        classId,
        teacherId,
        title,
        date,
        time,
        startTime,
        endTime,
        meetingLink,
        notes,
        sessionType,
        location
      } = req.body;

      if (
        !classId ||
        !isValidObjectId(classId)
      ) {
        return res
          .status(400)
          .json({
            message:
              "A valid classId is required"
          });
      }

      const classDoc =
        await Class.findById(
          classId
        );

      if (!classDoc) {
        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });
      }

      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to create a schedule for this class"
          });
      }

      const finalTeacherId =
        resolveTeacherForClass(
          req.user,
          classDoc,
          teacherId
        );

      if (!finalTeacherId) {
        return res
          .status(400)
          .json({
            message:
              "This class does not have an assigned teacher"
          });
      }

      const normalizedDate =
        normalizeDateInput(
          date
        );

      const normalizedStartTime =
        normalizeTime(
          startTime ||
          time
        );

      const normalizedEndTime =
        normalizeTime(
          endTime
        );

      if (!normalizedDate) {
        return res
          .status(400)
          .json({
            message:
              "A valid schedule date is required"
          });
      }

      if (!normalizedStartTime) {
        return res
          .status(400)
          .json({
            message:
              "A valid start time is required"
          });
      }

      if (
        normalizedEndTime &&
        normalizedEndTime <=
          normalizedStartTime
      ) {
        return res
          .status(400)
          .json({
            message:
              "End time must be later than start time"
          });
      }

      const finalSessionType =
        safeString(
          sessionType,
          meetingLink
            ? "online"
            : "physical"
        ).toLowerCase();

      if (
        !SESSION_TYPES.has(
          finalSessionType
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid sessionType"
          });
      }

      const schedule =
        new Schedule({
          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          teacherId:
            finalTeacherId,

          createdBy:
            req.user._id,

          createdByRole:
            role,

          title:
            safeString(
              title,
              classDoc.title ||
              "Class Schedule"
            ),

          date:
            normalizedDate,

          time:
            normalizedStartTime,

          startTime:
            normalizedStartTime,

          endTime:
            normalizedEndTime ||
            null,

          meetingLink:
            safeString(
              meetingLink,
              classDoc.meetingLink ||
              ""
            ) || null,

          notes:
            safeString(notes) ||
            null,

          sessionType:
            finalSessionType,

          location:
            safeString(location) ||
            null,

          status:
            "scheduled",

          sessionStatus:
            "scheduled",

          teacherAttendanceStatus:
            "pending",

          lastActivityAt:
            new Date()
        });

      synchronizeScheduleTimes(
        schedule
      );

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:new",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res
        .status(201)
        .json(populated);

    } catch (err) {
      console.error(
        "POST /api/schedules error:",
        err
      );

      const statusCode =
        Number(
          err?.statusCode
        ) || 500;

      return res
        .status(statusCode)
        .json({
          message:
            statusCode === 500
              ? "Failed to create schedule"
              : err.message
        });
    }
  }
);


/* =========================================================
   UPDATE BASIC SCHEDULE DETAILS

   School/Admin:
     title/date/time/teacher/etc.

   Teacher:
     may update editable teaching details, but cannot change
     ownership/class/teacher.
========================================================= */

router.patch(
  "/:id",
  auth,
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid schedule ID"
          });
      }

      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const classDoc =
        await Class.findById(
          schedule.classId
        );

      if (!classDoc) {
        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });
      }

      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this schedule"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      if (
        [
          "started",
          "completed",
          "missed",
          "cancelled"
        ].includes(
          schedule.sessionStatus
        ) &&
        (
          req.body.date !== undefined ||
          req.body.startTime !== undefined ||
          req.body.time !== undefined ||
          req.body.endTime !== undefined
        )
      ) {
        return res
          .status(409)
          .json({
            message:
              "Use the reschedule action to change the time of a started, completed, missed, or cancelled session"
          });
      }

      const fields = [
        "title",
        "meetingLink",
        "notes",
        "sessionType",
        "location"
      ];

      for (
        const field of fields
      ) {
        if (
          req.body[field] !==
          undefined
        ) {
          const value =
            req.body[field];

          schedule[field] =
            value === "" ||
            value === null
              ? null
              : value;
        }
      }

      if (
        req.body.date !==
        undefined
      ) {
        const date =
          normalizeDateInput(
            req.body.date
          );

        if (!date) {
          return res
            .status(400)
            .json({
              message:
                "Invalid schedule date"
            });
        }

        schedule.date =
          date;
      }

      if (
        req.body.startTime !==
          undefined ||
        req.body.time !==
          undefined
      ) {
        const startTime =
          normalizeTime(
            req.body.startTime ||
            req.body.time
          );

        if (!startTime) {
          return res
            .status(400)
            .json({
              message:
                "Invalid start time"
            });
        }

        schedule.startTime =
          startTime;

        schedule.time =
          startTime;
      }

      if (
        req.body.endTime !==
        undefined
      ) {
        if (
          req.body.endTime === "" ||
          req.body.endTime === null
        ) {
          schedule.endTime =
            null;
        } else {
          const endTime =
            normalizeTime(
              req.body.endTime
            );

          if (!endTime) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid end time"
              });
          }

          schedule.endTime =
            endTime;
        }
      }

      if (
        schedule.endTime &&
        schedule.startTime &&
        schedule.endTime <=
          schedule.startTime
      ) {
        return res
          .status(400)
          .json({
            message:
              "End time must be later than start time"
          });
      }

      if (
        req.body.sessionType !==
        undefined
      ) {
        const sessionType =
          safeString(
            req.body.sessionType
          ).toLowerCase();

        if (
          !SESSION_TYPES.has(
            sessionType
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Invalid sessionType"
            });
        }

        schedule.sessionType =
          sessionType;
      }

      /*
        School/Admin may change teacher assignment, but only
        to the teacher currently assigned to this class.
      */

      if (
        (
          role === "school" ||
          role === "admin"
        ) &&
        req.body.teacherId !==
          undefined
      ) {
        schedule.teacherId =
          resolveTeacherForClass(
            req.user,
            classDoc,
            req.body.teacherId
          );
      }

      if (
        role === "teacher"
      ) {
        schedule.teacherId =
          req.user._id;
      }

      schedule.schoolId =
        classDoc.schoolId;

      schedule.classId =
        classDoc._id;

      /*
        Existing Teacher frontend may still send status.
        Support completed/cancelled temporarily, while the
        dedicated lifecycle endpoints below become canonical.
      */

      if (
        req.body.status !==
        undefined
      ) {
        const status =
          safeString(
            req.body.status
          ).toLowerCase();

        if (
          !LEGACY_STATUSES.has(
            status
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Invalid schedule status"
            });
        }

        if (
          status === "scheduled"
        ) {
          schedule.sessionStatus =
            "scheduled";

          schedule.status =
            "scheduled";
        }

        if (
          status === "completed"
        ) {
          schedule.sessionStatus =
            "completed";

          schedule.status =
            "completed";

          schedule.teacherMarkedCompleteAt =
            schedule.teacherMarkedCompleteAt ||
            new Date();
        }

        if (
          status === "cancelled"
        ) {
          schedule.sessionStatus =
            "cancelled";

          schedule.status =
            "cancelled";

          schedule.cancelledAt =
            schedule.cancelledAt ||
            new Date();

          schedule.cancelledBy =
            req.user._id;
        }
      }

      synchronizeScheduleTimes(
        schedule
      );

      synchronizeLegacyStatus(
        schedule
      );

      schedule.lastActivityAt =
        new Date();

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "PATCH /api/schedules/:id error:",
        err
      );

      const statusCode =
        Number(
          err?.statusCode
        ) || 500;

      return res
        .status(statusCode)
        .json({
          message:
            statusCode === 500
              ? "Failed to update schedule"
              : err.message
        });
    }
  }
);


/* =========================================================
   START SESSION

   This is the Teacher accountability event.

   Teachers can start only their assigned class.
   School/Admin may start for operational/manual correction.
========================================================= */

router.post(
  "/:id/start",
  auth,
  async (req, res) => {
    try {
      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const access =
        await getScheduleAccessContext(
          req,
          schedule
        );

      if (!access.allowed) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to start this session"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      if (
        ![
          "teacher",
          "school",
          "admin"
        ].includes(role)
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to start this session"
          });
      }

      if (
        schedule.sessionStatus ===
        "completed"
      ) {
        return res
          .status(409)
          .json({
            message:
              "This session is already completed"
          });
      }

      if (
        schedule.sessionStatus ===
        "cancelled"
      ) {
        return res
          .status(409)
          .json({
            message:
              "A cancelled session cannot be started"
          });
      }

      const now =
        new Date();

      synchronizeScheduleTimes(
        schedule
      );

      schedule.sessionStatus =
        "started";

      schedule.status =
        "scheduled";

      schedule.actualStartAt =
        schedule.actualStartAt ||
        now;

      /*
        Only an actual Teacher action should count as the
        teacher's join event.

        School/Admin manually starting a session should not
        falsely prove that the Teacher attended.
      */

      if (role === "teacher") {
        schedule.teacherJoinedAt =
          schedule.teacherJoinedAt ||
          now;

        if (
          schedule.scheduledStartAt
        ) {
          const scheduledStart =
            new Date(
              schedule.scheduledStartAt
            );

          const lateMinutes =
            Math.max(
              0,
              Math.floor(
                (
                  now.getTime() -
                  scheduledStart.getTime()
                ) /
                60000
              )
            );

          schedule.teacherLateMinutes =
            lateMinutes;

          schedule.teacherAttendanceStatus =
            lateMinutes >
              DEFAULT_LATE_GRACE_MINUTES
              ? "late"
              : "present";
        } else {
          schedule.teacherAttendanceStatus =
            "present";
        }
      }

      schedule.missedAt =
        null;

      schedule.missedReason =
        null;

      schedule.missedDetectedAutomatically =
        false;

      schedule.lastActivityAt =
        now;

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:started",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "POST /api/schedules/:id/start error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to start session"
        });
    }
  }
);


/* =========================================================
   COMPLETE SESSION
========================================================= */

router.post(
  "/:id/complete",
  auth,
  async (req, res) => {
    try {
      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const access =
        await getScheduleAccessContext(
          req,
          schedule
        );

      if (!access.allowed) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to complete this session"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      if (
        ![
          "teacher",
          "school",
          "admin"
        ].includes(role)
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to complete this session"
          });
      }

      if (
        schedule.sessionStatus ===
        "cancelled"
      ) {
        return res
          .status(409)
          .json({
            message:
              "A cancelled session cannot be completed"
          });
      }

      const now =
        new Date();

      schedule.sessionStatus =
        "completed";

      schedule.status =
        "completed";

      schedule.actualStartAt =
        schedule.actualStartAt ||
        schedule.teacherJoinedAt ||
        now;

      schedule.actualEndAt =
        now;

      if (role === "teacher") {
        schedule.teacherJoinedAt =
          schedule.teacherJoinedAt ||
          schedule.actualStartAt;

        schedule.teacherLeftAt =
          now;

        schedule.teacherMarkedCompleteAt =
          now;

        if (
          schedule.teacherAttendanceStatus ===
          "pending"
        ) {
          schedule.teacherAttendanceStatus =
            "present";
        }
      }

      if (
        schedule.actualStartAt
      ) {
        schedule.teacherSessionDurationMinutes =
          Math.max(
            0,
            Math.round(
              (
                now.getTime() -
                new Date(
                  schedule.actualStartAt
                ).getTime()
              ) /
              60000
            )
          );
      }

      if (
        req.body.completionNotes !==
        undefined
      ) {
        schedule.completionNotes =
          safeString(
            req.body.completionNotes
          ) || null;
      }

      /*
        School/Admin completion counts as explicit
        administrative confirmation.
      */

      if (
        role === "school" ||
        role === "admin"
      ) {
        schedule.completionConfirmedBy =
          req.user._id;

        schedule.completionConfirmedAt =
          now;

        schedule.requiresReview =
          false;

        schedule.reviewedBy =
          req.user._id;

        schedule.reviewedAt =
          now;
      }

      schedule.lastActivityAt =
        now;

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:completed",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "POST /api/schedules/:id/complete error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to complete session"
        });
    }
  }
);


/* =========================================================
   CANCEL SESSION
========================================================= */

router.post(
  "/:id/cancel",
  auth,
  async (req, res) => {
    try {
      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const access =
        await getScheduleAccessContext(
          req,
          schedule
        );

      if (!access.allowed) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to cancel this session"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      if (
        ![
          "teacher",
          "school",
          "admin"
        ].includes(role)
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to cancel this session"
          });
      }

      if (
        schedule.sessionStatus ===
        "completed"
      ) {
        return res
          .status(409)
          .json({
            message:
              "A completed session cannot be cancelled"
          });
      }

      const reason =
        safeString(
          req.body.reason ||
          req.body.cancelReason
        );

      if (
        role === "teacher" &&
        !reason
      ) {
        return res
          .status(400)
          .json({
            message:
              "A cancellation reason is required"
          });
      }

      const now =
        new Date();

      schedule.sessionStatus =
        "cancelled";

      schedule.status =
        "cancelled";

      schedule.cancelledAt =
        now;

      schedule.cancelledBy =
        req.user._id;

      schedule.cancelReason =
        reason ||
        null;

      /*
        Teacher cancellation is visible to School review.
      */

      if (role === "teacher") {
        schedule.requiresReview =
          true;

        schedule.reviewReason =
          reason
            ? `Teacher cancelled session: ${reason}`
            : "Teacher cancelled session";
      }

      schedule.lastActivityAt =
        now;

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:cancelled",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "POST /api/schedules/:id/cancel error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to cancel session"
        });
    }
  }
);


/* =========================================================
   RESCHEDULE SESSION

   The same Schedule document remains authoritative while
   preserving full change history.
========================================================= */

router.post(
  "/:id/reschedule",
  auth,
  async (req, res) => {
    try {
      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const access =
        await getScheduleAccessContext(
          req,
          schedule
        );

      if (!access.allowed) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to reschedule this session"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      if (
        ![
          "teacher",
          "school",
          "admin"
        ].includes(role)
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to reschedule this session"
          });
      }

      if (
        schedule.sessionStatus ===
        "completed"
      ) {
        return res
          .status(409)
          .json({
            message:
              "A completed session cannot be rescheduled"
          });
      }

      const newDate =
        normalizeDateInput(
          req.body.date
        );

      const newStartTime =
        normalizeTime(
          req.body.startTime ||
          req.body.time
        );

      const newEndTime =
        normalizeTime(
          req.body.endTime
        );

      if (!newDate) {
        return res
          .status(400)
          .json({
            message:
              "A valid new date is required"
          });
      }

      if (!newStartTime) {
        return res
          .status(400)
          .json({
            message:
              "A valid new start time is required"
          });
      }

      if (
        newEndTime &&
        newEndTime <=
          newStartTime
      ) {
        return res
          .status(400)
          .json({
            message:
              "End time must be later than start time"
          });
      }

      const reason =
        safeString(
          req.body.reason ||
          req.body.rescheduleReason
        );

      if (
        role === "teacher" &&
        !reason
      ) {
        return res
          .status(400)
          .json({
            message:
              "A reschedule reason is required"
          });
      }

      const previousDate =
        schedule.date;

      const previousStartTime =
        schedule.startTime ||
        schedule.time;

      const previousEndTime =
        schedule.endTime;

      const now =
        new Date();

      schedule.rescheduleHistory.push({
        previousDate,
        previousStartTime,
        previousEndTime,

        newDate,
        newStartTime,
        newEndTime:
          newEndTime ||
          null,

        reason:
          reason ||
          null,

        changedBy:
          req.user._id,

        changedAt:
          now
      });

      schedule.date =
        newDate;

      schedule.time =
        newStartTime;

      schedule.startTime =
        newStartTime;

      schedule.endTime =
        newEndTime ||
        null;

      schedule.rescheduledAt =
        now;

      schedule.rescheduledBy =
        req.user._id;

      schedule.rescheduleReason =
        reason ||
        null;

      schedule.rescheduleCount =
        Number(
          schedule.rescheduleCount ||
          0
        ) + 1;

      /*
        The schedule is still an active future session after
        rescheduling. We preserve the reschedule event in
        history rather than leaving the active record stuck
        in "rescheduled".
      */

      schedule.sessionStatus =
        "scheduled";

      schedule.status =
        "scheduled";

      schedule.actualStartAt =
        null;

      schedule.actualEndAt =
        null;

      schedule.teacherJoinedAt =
        null;

      schedule.teacherLeftAt =
        null;

      schedule.teacherAttendanceStatus =
        "pending";

      schedule.teacherLateMinutes =
        0;

      schedule.teacherSessionDurationMinutes =
        0;

      schedule.missedAt =
        null;

      schedule.missedReason =
        null;

      schedule.missedDetectedAutomatically =
        false;

      if (role === "teacher") {
        schedule.requiresReview =
          true;

        schedule.reviewReason =
          reason
            ? `Teacher rescheduled session: ${reason}`
            : "Teacher rescheduled session";
      }

      synchronizeScheduleTimes(
        schedule
      );

      schedule.lastActivityAt =
        now;

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:rescheduled",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "POST /api/schedules/:id/reschedule error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to reschedule session"
        });
    }
  }
);


/* =========================================================
   SCHOOL / ADMIN REVIEW

   Used for:
     missed sessions
     teacher cancellations
     teacher reschedules
     future operational exceptions
========================================================= */

router.post(
  "/:id/review",
  auth,
  async (req, res) => {
    try {
      const role =
        normalizeRole(
          req.user.role
        );

      if (
        role !== "school" &&
        role !== "admin"
      ) {
        return res
          .status(403)
          .json({
            message:
              "Only School or Admin can review sessions"
          });
      }

      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const classDoc =
        await Class.findById(
          schedule.classId
        );

      if (!classDoc) {
        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });
      }

      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to review this session"
          });
      }

      schedule.requiresReview =
        false;

      schedule.reviewedAt =
        new Date();

      schedule.reviewedBy =
        req.user._id;

      if (
        req.body.reviewReason !==
        undefined
      ) {
        schedule.reviewReason =
          safeString(
            req.body.reviewReason
          ) || null;
      }

      schedule.lastActivityAt =
        new Date();

      await schedule.save();

      const populated =
        await populateSchedule(
          schedule._id
        );

      emitScheduleEvent(
        req,
        "schedule:reviewed",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      emitScheduleEvent(
        req,
        "schedule:updated",
        populated,
        {
          schoolId:
            schedule.schoolId,

          teacherId:
            schedule.teacherId,

          classId:
            schedule.classId
        }
      );

      return res.json(
        populated
      );

    } catch (err) {
      console.error(
        "POST /api/schedules/:id/review error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to review session"
        });
    }
  }
);


/* =========================================================
   SCHOOL OPERATIONS SUMMARY

   Example:
     GET /api/schedules/operations/summary

   Optional:
     ?from=...
     ?to=...
     ?teacherId=...
========================================================= */

router.get(
  "/operations/summary",
  auth,
  async (req, res) => {
    try {
      const role =
        normalizeRole(
          req.user.role
        );

      if (
        role !== "school" &&
        role !== "admin"
      ) {
        return res
          .status(403)
          .json({
            message:
              "Only School or Admin can view schedule operations"
          });
      }

      const query = {};

      if (role === "school") {
        query.schoolId =
          req.user._id;
      } else if (
        req.query.schoolId
      ) {
        query.schoolId =
          req.query.schoolId;
      }

      if (
        req.query.teacherId
      ) {
        query.teacherId =
          req.query.teacherId;
      }

      if (
        req.query.from ||
        req.query.to
      ) {
        query.date = {};

        if (
          req.query.from
        ) {
          const from =
            normalizeDateInput(
              req.query.from
            );

          if (!from) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid from date"
              });
          }

          query.date.$gte =
            from;
        }

        if (
          req.query.to
        ) {
          const to =
            normalizeDateInput(
              req.query.to
            );

          if (!to) {
            return res
              .status(400)
              .json({
                message:
                  "Invalid to date"
              });
          }

          to.setHours(
            23,
            59,
            59,
            999
          );

          query.date.$lte =
            to;
        }
      }

      const schedules =
        await Schedule.find(
          query
        ).lean();

      const summary = {
        total:
          schedules.length,

        scheduled:
          0,

        started:
          0,

        completed:
          0,

        missed:
          0,

        cancelled:
          0,

        requiringReview:
          0,

        teacherPresent:
          0,

        teacherLate:
          0,

        teacherMissed:
          0,

        totalExpectedStudents:
          0,

        totalPresentStudents:
          0,

        totalLateStudents:
          0,

        totalAbsentStudents:
          0,

        totalExcusedStudents:
          0
      };

      for (
        const schedule of schedules
      ) {
        const status =
          safeString(
            schedule.sessionStatus,
            "scheduled"
          );

        if (
          Object.prototype.hasOwnProperty.call(
            summary,
            status
          )
        ) {
          summary[status] += 1;
        }

        if (
          schedule.requiresReview
        ) {
          summary.requiringReview +=
            1;
        }

        if (
          schedule.teacherAttendanceStatus ===
          "present"
        ) {
          summary.teacherPresent +=
            1;
        }

        if (
          schedule.teacherAttendanceStatus ===
          "late"
        ) {
          summary.teacherLate +=
            1;
        }

        if (
          schedule.teacherAttendanceStatus ===
          "missed"
        ) {
          summary.teacherMissed +=
            1;
        }

        summary.totalExpectedStudents +=
          Number(
            schedule.expectedStudentCount ||
            0
          );

        summary.totalPresentStudents +=
          Number(
            schedule.presentStudentCount ||
            0
          );

        summary.totalLateStudents +=
          Number(
            schedule.lateStudentCount ||
            0
          );

        summary.totalAbsentStudents +=
          Number(
            schedule.absentStudentCount ||
            0
          );

        summary.totalExcusedStudents +=
          Number(
            schedule.excusedStudentCount ||
            0
          );
      }

      const completedOrMissed =
        summary.completed +
        summary.missed;

      summary.teacherCompletionRate =
        completedOrMissed > 0
          ? Number(
              (
                summary.completed /
                completedOrMissed *
                100
              ).toFixed(1)
            )
          : 0;

      const attendanceDenominator =
        summary.totalExpectedStudents;

      summary.studentAttendanceRate =
        attendanceDenominator > 0
          ? Number(
              (
                (
                  summary.totalPresentStudents +
                  summary.totalLateStudents
                ) /
                attendanceDenominator *
                100
              ).toFixed(1)
            )
          : 0;

      return res.json(
        summary
      );

    } catch (err) {
      console.error(
        "GET /api/schedules/operations/summary error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to load schedule operations"
        });
    }
  }
);


/* =========================================================
   DELETE SCHEDULE

   Preserve your current hard-delete behavior for compatibility.

   Later we can restrict hard deletion of completed sessions
   and use archival instead, because historical School records
   generally should not disappear.
========================================================= */

router.delete(
  "/:id",
  auth,
  async (req, res) => {
    try {
      if (
        !isValidObjectId(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid schedule ID"
          });
      }

      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res
          .status(404)
          .json({
            message:
              "Schedule not found"
          });
      }

      const classDoc =
        await Class.findById(
          schedule.classId
        );

      if (!classDoc) {
        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });
      }

      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Not allowed to delete this schedule"
          });
      }

      const role =
        normalizeRole(
          req.user.role
        );

      /*
        Teachers should not erase historical accountability
        after the session has begun.

        School/Admin retain administrative control.
      */

      if (
        role === "teacher" &&
        [
          "started",
          "completed",
          "missed",
          "cancelled"
        ].includes(
          schedule.sessionStatus
        )
      ) {
        return res
          .status(403)
          .json({
            message:
              "Started or historical sessions cannot be deleted by a teacher"
          });
      }

      const payload = {
        scheduleId:
          String(
            schedule._id
          ),

        classId:
          String(
            classDoc._id
          ),

        teacherId:
          normalizeObjectId(
            schedule.teacherId
          ),

        schoolId:
          normalizeObjectId(
            schedule.schoolId
          )
      };

      const schoolId =
        schedule.schoolId;

      const teacherId =
        schedule.teacherId;

      const classId =
        schedule.classId;

      await schedule.deleteOne();

      emitScheduleEvent(
        req,
        "schedule:deleted",
        payload,
        {
          schoolId,
          teacherId,
          classId
        }
      );

      return res.json({
        message:
          "Schedule deleted",

        scheduleId:
          payload.scheduleId
      });

    } catch (err) {
      console.error(
        "DELETE /api/schedules/:id error:",
        err
      );

      return res
        .status(500)
        .json({
          message:
            "Failed to delete schedule"
        });
    }
  }
);


module.exports = router;
