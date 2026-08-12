// routes/attendance.js
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Class = require("../models/Class");
const { summarizeAttendance } = require("../utils/attendanceStats");

let auth;

try {
  auth = require("../middleware/authMiddleware");
} catch {
  auth = require("../middleware/auth");
}

function getUserId(req) {
  return req.user?._id || req.user?.id || req.userId || null;
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function cleanId(id) {
  if (!id) return null;
  if (id === "null" || id === "undefined") return null;
  if (!isValidId(id)) return null;
  return id;
}

/* =========================================================
   ROLE + ID HELPERS
========================================================= */

function normalizeRole(value) {
  const role =
    String(value || "")
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


function normalizeObjectId(value) {
  if (!value) {
    return "";
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return String(value._id);
  }

  return String(value);
}


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
   VIEW CLASS ATTENDANCE
========================================================= */

function canViewClassAttendance(
  user,
  classDoc
) {
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

  const studentIds =
    Array.isArray(
      classDoc.studentIds
    )
      ? classDoc.studentIds
          .map(normalizeObjectId)
          .filter(Boolean)
      : [];

  if (role === "admin") {
    return true;
  }

  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(schoolId);
  }

  if (role === "teacher") {
    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId === teacherId
    );
  }

  if (role === "student") {
    return (
      Boolean(userId) &&
      studentIds.includes(userId)
    );
  }

  return false;
}


/* =========================================================
   MANAGE CLASS ATTENDANCE
========================================================= */

function canManageClassAttendance(
  user,
  classDoc
) {
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
    return (
      Boolean(userId) &&
      Boolean(teacherId) &&
      userId === teacherId
    );
  }

  return false;
}


/* =========================================================
   LOAD AND AUTHORIZE CLASS
========================================================= */

async function loadAttendanceClass(
  req,
  classId,
  {
    write = false
  } = {}
) {
  const normalizedClassId =
    cleanId(classId);

  if (!normalizedClassId) {
    return {
      error: {
        status: 400,
        message:
          "Valid classId is required."
      }
    };
  }

  const classDoc =
    await Class.findById(
      normalizedClassId
    );

  if (!classDoc) {
    return {
      error: {
        status: 404,
        message:
          "Class not found."
      }
    };
  }

  const allowed =
    write
      ? canManageClassAttendance(
          req.user,
          classDoc
        )
      : canViewClassAttendance(
          req.user,
          classDoc
        );

  if (!allowed) {
    return {
      error: {
        status: 403,
        message:
          write
            ? "Not allowed to manage attendance for this class."
            : "Not allowed to view attendance for this class."
      }
    };
  }

  return {
    classDoc
  };
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);
  return date;
}

async function resolveSchoolId(req) {
  const direct = cleanId(req.query.schoolId || req.body.schoolId);

  if (direct) return direct;

  const userId = getUserId(req);

  if (!userId) return null;

  const user = await User.findById(userId).select(
    "role schoolId companyId employerId"
  );

  if (!user) return null;

  if (user.role === "school") return user._id;

  return user.schoolId || user.companyId || user.employerId || null;
}

function buildDateFilter(query) {
  const filter = {};

  if (query.date) {
    const date = normalizeDate(query.date);
    if (!date) return null;

    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    filter.$gte = date;
    filter.$lt = next;

    return filter;
  }

  if (query.from || query.to) {
    if (query.from) {
      const from = normalizeDate(query.from);
      if (!from) return null;
      filter.$gte = from;
    }

    if (query.to) {
      const to = normalizeDate(query.to);
      if (!to) return null;
      to.setDate(to.getDate() + 1);
      filter.$lt = to;
    }

    return filter;
  }

  return undefined;
}

function populateAttendance(query) {

  return query
    .populate(
      "studentId",
      "name email profileImage avatar course role"
    )
    .populate(
      "teacherId",
      "name email profileImage avatar subject role"
    )
    .populate(
      "classId",
      "title name subject classCode studentIds teacherId schoolId"
    )
    .populate(
      "scheduleId",
      "date time meetingLink classId teacherId"
    )
    .populate(
      "markedBy",
      "name email role"
    );

}

/* GET /api/attendance */
/* =========================================================
   GET /api/attendance
========================================================= */

router.get(
  "/",
  auth,
  async (req, res) => {
    try {

      const role =
        normalizeRole(
          req.user.role
        );

      const classId =
        cleanId(
          req.query.classId
        );

      const studentId =
        cleanId(
          req.query.studentId
        );

      const requestedTeacherId =
        cleanId(
          req.query.teacherId
        );

      const scheduleId =
        cleanId(
          req.query.scheduleId
        );

      const filter = {};


      /* ============================================
         CLASS-SCOPED ATTENDANCE
      ============================================ */

      if (classId) {

        const access =
          await loadAttendanceClass(
            req,
            classId,
            {
              write:false
            }
          );

        if (access.error) {
          return res
            .status(
              access.error.status
            )
            .json({
              message:
                access.error.message
            });
        }

        const classDoc =
          access.classDoc;

        filter.classId =
          classDoc._id;

        filter.schoolId =
          classDoc.schoolId;


        /*
          Students may only inspect their own
          attendance records.
        */
        if (
          role === "student"
        ) {

          filter.studentId =
            req.user._id;

        } else if (studentId) {

          filter.studentId =
            studentId;

        }


        /*
          Assigned teachers are automatically
          scoped to themselves.

          A crafted teacherId query cannot expose
          another teacher's records.
        */
        if (
          role === "teacher"
        ) {

          filter.teacherId =
            req.user._id;

        } else if (
          requestedTeacherId
        ) {

          filter.teacherId =
            requestedTeacherId;

        }

      } else {

        /* ============================================
           NON CLASS-SCOPED ATTENDANCE
        ============================================ */

        if (
          role === "admin"
        ) {

          const schoolId =
            cleanId(
              req.query.schoolId
            );

          if (schoolId) {
            filter.schoolId =
              schoolId;
          }

        } else if (
          role === "school"
        ) {

          filter.schoolId =
            req.user._id;

        } else if (
          role === "teacher"
        ) {

          /*
            Teacher can only see attendance
            connected to themselves.
          */

          filter.teacherId =
            req.user._id;

          const schoolIds =
            getUserSchoolIds(
              req.user
            );

          if (
            schoolIds.length
          ) {

            filter.schoolId = {
              $in:
                schoolIds
            };

          }

        } else if (
          role === "student"
        ) {

          filter.studentId =
            req.user._id;

        } else {

          return res
            .status(403)
            .json({
              message:
                "Not allowed to view attendance."
            });

        }

      }


      if (scheduleId) {
        filter.scheduleId =
          scheduleId;
      }


      if (
        req.query.status
      ) {
        filter.status =
          req.query.status;
      }


      const dateFilter =
        buildDateFilter(
          req.query
        );


      if (
        dateFilter ===
        null
      ) {
        return res.status(400).json({
          message:
            "Invalid date filter."
        });
      }


      if (dateFilter) {
        filter.date =
          dateFilter;
      }


      const records =
        await populateAttendance(
          Attendance.find(
            filter
          ).sort({
            date:-1,
            createdAt:-1
          })
        ).lean();


      return res.json(
        records
      );

    } catch (err) {

      console.error(
        "GET /api/attendance failed:",
        err
      );

      return res.status(500).json({
        message:
          "Unable to load attendance.",
        error:
          err.message
      });

    }
  }
);

/* =========================================================
   POST /api/attendance
========================================================= */

router.post(
  "/",
  auth,
  async (req, res) => {
    try {
      const markedBy =
        getUserId(req);

      const classId =
        cleanId(
          req.body.classId
        );

      const studentId =
        cleanId(
          req.body.studentId
        );

      const scheduleId =
        cleanId(
          req.body.scheduleId
        );

      const date =
        normalizeDate(
          req.body.date
        );

      if (!markedBy) {
        return res.status(401).json({
          message:
            "Unauthorized."
        });
      }

      if (!classId) {
        return res.status(400).json({
          message:
            "Valid classId is required."
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "Valid studentId is required."
        });
      }

      if (!date) {
        return res.status(400).json({
          message:
            "Valid date is required."
        });
      }


      /* ============================================
         VERIFY CLASS + TEACHER ACCESS
      ============================================ */

      const access =
        await loadAttendanceClass(
          req,
          classId,
          {
            write: true
          }
        );

      if (access.error) {
        return res
          .status(
            access.error.status
          )
          .json({
            message:
              access.error.message
          });
      }

      const classDoc =
        access.classDoc;


      /* ============================================
         VERIFY STUDENT IS ENROLLED
      ============================================ */

      const enrolledStudents =
        Array.isArray(
          classDoc.studentIds
        )
          ? classDoc.studentIds
              .map(
                normalizeObjectId
              )
          : [];

      if (
        !enrolledStudents.includes(
          normalizeObjectId(
            studentId
          )
        )
      ) {
        return res.status(403).json({
          message:
            "Student is not enrolled in this class."
        });
      }


      /* ============================================
         STATUS
      ============================================ */

      const allowedStatuses = [
        "present",
        "late",
        "absent",
        "excused"
      ];

      const status =
        allowedStatuses.includes(
          req.body.status
        )
          ? req.body.status
          : "present";


      const participationScore =
        Math.max(
          0,
          Math.min(
            100,
            Number(
              req.body
                .participationScore ||
              0
            )
          )
        );


      /* ============================================
         AUTHORITATIVE OWNERSHIP

         Never trust schoolId or teacherId sent
         by the browser.
      ============================================ */

      const schoolId =
        classDoc.schoolId;

      const teacherId =
        classDoc.teacherId;


      if (!teacherId) {
        return res.status(409).json({
          message:
            "This class does not have an assigned teacher."
        });
      }


      const record =
        await Attendance.findOneAndUpdate(
          {
            schoolId,
            classId:
              classDoc._id,
            studentId,
            date
          },
          {
            schoolId,

            classId:
              classDoc._id,

            teacherId,

            studentId,

            scheduleId,

            date,

            status,

            participationScore,

            notes:
              req.body.notes ||
              "",

            markedBy,

            source:
              req.body.source ||
              "manual"
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert:
              true
          }
        );


      const populated =
        await populateAttendance(
          Attendance.findById(
            record._id
          )
        ).lean();


      const io =
        req.app.get("io");

      if (io) {
        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "attendance:updated",
            populated
          );

        io
          .to(
            String(
              classDoc.teacherId
            )
          )
          .emit(
            "attendance:updated",
            populated
          );

        io
          .to(
            String(
              studentId
            )
          )
          .emit(
            "attendance:updated",
            populated
          );
      }


      return res
        .status(201)
        .json(populated);

    } catch (err) {
      console.error(
        "POST /api/attendance failed:",
        err
      );

      return res.status(500).json({
        message:
          "Unable to save attendance.",
        error:
          err.message
      });
    }
  }
);

/* =========================================================
   PATCH /api/attendance/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (req, res) => {
    try {

      if (
        !isValidId(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid attendance ID."
        });
      }


      const attendance =
        await Attendance.findById(
          req.params.id
        );


      if (!attendance) {
        return res.status(404).json({
          message:
            "Attendance not found."
        });
      }


      /* ============================================
         AUTHORIZE THROUGH THE REAL CLASS
      ============================================ */

      const access =
        await loadAttendanceClass(
          req,
          attendance.classId,
          {
            write:true
          }
        );


      if (access.error) {
        return res
          .status(
            access.error.status
          )
          .json({
            message:
              access.error.message
          });
      }


      const classDoc =
        access.classDoc;


      /*
        Defensive consistency check.

        The attendance record must belong to
        the same school as the real class.
      */
      if (
        normalizeObjectId(
          attendance.schoolId
        ) !==
        normalizeObjectId(
          classDoc.schoolId
        )
      ) {
        return res.status(409).json({
          message:
            "Attendance record does not match the class."
        });
      }


      const allowedStatuses = [
        "present",
        "late",
        "absent",
        "excused"
      ];


      if (
        req.body.status !==
        undefined
      ) {

        if (
          !allowedStatuses.includes(
            req.body.status
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid status."
          });
        }

        attendance.status =
          req.body.status;

      }


      if (
        req.body
          .participationScore !==
        undefined
      ) {

        attendance.participationScore =
          Math.max(
            0,
            Math.min(
              100,
              Number(
                req.body
                  .participationScore ||
                0
              )
            )
          );

      }


      if (
        req.body.notes !==
        undefined
      ) {

        attendance.notes =
          req.body.notes ||
          "";

      }


      if (
        req.body.date !==
        undefined
      ) {

        const date =
          normalizeDate(
            req.body.date
          );


        if (!date) {
          return res.status(400).json({
            message:
              "Invalid date."
          });
        }


        attendance.date =
          date;

      }


      if (
        req.body.scheduleId !==
        undefined
      ) {

        attendance.scheduleId =
          cleanId(
            req.body.scheduleId
          );

      }


      /*
        Ownership cannot be changed by request body.
      */

      attendance.schoolId =
        classDoc.schoolId;

      attendance.classId =
        classDoc._id;

      attendance.teacherId =
        classDoc.teacherId;

      attendance.markedBy =
        getUserId(req);


      await attendance.save();


      const populated =
        await populateAttendance(
          Attendance.findById(
            attendance._id
          )
        ).lean();


      const io =
        req.app.get("io");


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "attendance:updated",
            populated
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "attendance:updated",
              populated
            );

        }


        if (
          attendance.studentId
        ) {

          io
            .to(
              String(
                attendance.studentId
              )
            )
            .emit(
              "attendance:updated",
              populated
            );

        }

      }


      return res.json(
        populated
      );

    } catch (err) {

      console.error(
        "PATCH /api/attendance/:id failed:",
        err
      );


      return res.status(500).json({
        message:
          "Unable to update attendance.",
        error:
          err.message
      });

    }
  }
);

/* =========================================================
   DELETE /api/attendance/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (req, res) => {
    try {

      if (
        !isValidId(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid attendance ID."
        });
      }


      const attendance =
        await Attendance.findById(
          req.params.id
        );


      if (!attendance) {
        return res.status(404).json({
          message:
            "Attendance not found."
        });
      }


      const access =
        await loadAttendanceClass(
          req,
          attendance.classId,
          {
            write:true
          }
        );


      if (access.error) {
        return res
          .status(
            access.error.status
          )
          .json({
            message:
              access.error.message
          });
      }


      const classDoc =
        access.classDoc;


      await attendance.deleteOne();


      const io =
        req.app.get("io");


      const payload = {

        attendanceId:
          String(
            attendance._id
          ),

        classId:
          String(
            classDoc._id
          ),

        studentId:
          attendance.studentId
            ? String(
                attendance.studentId
              )
            : null

      };


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "attendance:deleted",
            payload
          );


        if (
          classDoc.teacherId
        ) {

          io
            .to(
              String(
                classDoc.teacherId
              )
            )
            .emit(
              "attendance:deleted",
              payload
            );

        }


        if (
          attendance.studentId
        ) {

          io
            .to(
              String(
                attendance.studentId
              )
            )
            .emit(
              "attendance:deleted",
              payload
            );

        }

      }


      return res.json({
        message:
          "Attendance deleted successfully.",

        deletedId:
          String(
            attendance._id
          )
      });

    } catch (err) {

      console.error(
        "DELETE /api/attendance/:id failed:",
        err
      );


      return res.status(500).json({
        message:
          "Unable to delete attendance.",
        error:
          err.message
      });

    }
  }
);
/* =========================================================
   POST /api/attendance/bulk
========================================================= */

router.post(
  "/bulk",
  auth,
  async (req, res) => {
    try {
      const markedBy =
        getUserId(req);

      const classId =
        cleanId(
          req.body.classId
        );

      const scheduleId =
        cleanId(
          req.body.scheduleId
        );

      const date =
        normalizeDate(
          req.body.date
        );

      const records =
        Array.isArray(
          req.body.records
        )
          ? req.body.records
          : [];


      if (!markedBy) {
        return res.status(401).json({
          message:
            "Unauthorized."
        });
      }


      if (!classId) {
        return res.status(400).json({
          message:
            "Valid classId is required."
        });
      }


      if (!date) {
        return res.status(400).json({
          message:
            "Valid date is required."
        });
      }


      if (!records.length) {
        return res.status(400).json({
          message:
            "No attendance records provided."
        });
      }


      /* ============================================
         VERIFY CLASS ACCESS
      ============================================ */

      const access =
        await loadAttendanceClass(
          req,
          classId,
          {
            write: true
          }
        );


      if (access.error) {
        return res
          .status(
            access.error.status
          )
          .json({
            message:
              access.error.message
          });
      }


      const classDoc =
        access.classDoc;


      if (!classDoc.teacherId) {
        return res.status(409).json({
          message:
            "This class does not have an assigned teacher."
        });
      }


      const schoolId =
        classDoc.schoolId;

      const teacherId =
        classDoc.teacherId;


      /* ============================================
         ENROLLED STUDENTS
      ============================================ */

      const enrolledStudentIds =
        new Set(
          (
            Array.isArray(
              classDoc.studentIds
            )
              ? classDoc.studentIds
              : []
          )
            .map(
              normalizeObjectId
            )
            .filter(Boolean)
        );


      const allowedStatuses = [
        "present",
        "late",
        "absent",
        "excused"
      ];


      const operations =
        records
          .map(item => {
            const studentId =
              cleanId(
                item.studentId
              );

            if (!studentId) {
              return null;
            }


            /*
              Never create attendance for a
              student outside this class.
            */

            if (
              !enrolledStudentIds.has(
                normalizeObjectId(
                  studentId
                )
              )
            ) {
              return null;
            }


            const status =
              allowedStatuses.includes(
                item.status
              )
                ? item.status
                : "present";


            const participationScore =
              Math.max(
                0,
                Math.min(
                  100,
                  Number(
                    item
                      .participationScore ||
                    0
                  )
                )
              );


            return {
              updateOne: {
                filter: {
                  schoolId,

                  classId:
                    classDoc._id,

                  studentId,

                  date
                },

                update: {
                  $set: {
                    schoolId,

                    classId:
                      classDoc._id,

                    teacherId,

                    studentId,

                    scheduleId,

                    date,

                    status,

                    participationScore,

                    notes:
                      item.notes ||
                      "",

                    markedBy,

                    source:
                      "bulk"
                  }
                },

                upsert:
                  true
              }
            };
          })
          .filter(Boolean);


      if (!operations.length) {
        return res.status(400).json({
          message:
            "No valid enrolled student records were provided."
        });
      }


      await Attendance.bulkWrite(
        operations,
        {
          ordered: false
        }
      );


      const saved =
        await populateAttendance(
          Attendance.find({
            schoolId,

            classId:
              classDoc._id,

            date
          }).sort({
            createdAt: -1
          })
        ).lean();


      const io =
        req.app.get("io");


      if (io) {
        const payload = {
          classId:
            String(
              classDoc._id
            ),

          date,

          count:
            saved.length,

          records:
            saved
        };


        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "attendance:bulk-updated",
            payload
          );


        io
          .to(
            String(
              classDoc.teacherId
            )
          )
          .emit(
            "attendance:bulk-updated",
            payload
          );
      }


      return res.status(201).json({
        message:
          "Attendance saved successfully.",

        count:
          saved.length,

        records:
          saved
      });

    } catch (err) {
      console.error(
        "POST /api/attendance/bulk failed:",
        err
      );

      return res.status(500).json({
        message:
          "Unable to save bulk attendance.",

        error:
          err.message
      });
    }
  }
);

/* =========================================================
   GET /api/attendance/summary
========================================================= */

router.get(
  "/summary",
  auth,
  async (req, res) => {
    try {

      const role =
        normalizeRole(
          req.user.role
        );


      const classId =
        cleanId(
          req.query.classId
        );

      const requestedStudentId =
        cleanId(
          req.query.studentId
        );

      const requestedTeacherId =
        cleanId(
          req.query.teacherId
        );


      const filter = {};


      if (classId) {

        const access =
          await loadAttendanceClass(
            req,
            classId,
            {
              write:false
            }
          );


        if (access.error) {
          return res
            .status(
              access.error.status
            )
            .json({
              message:
                access.error.message
            });
        }


        const classDoc =
          access.classDoc;


        filter.classId =
          classDoc._id;

        filter.schoolId =
          classDoc.schoolId;


        if (
          role === "student"
        ) {

          filter.studentId =
            req.user._id;

        } else if (
          requestedStudentId
        ) {

          filter.studentId =
            requestedStudentId;

        }


        if (
          role === "teacher"
        ) {

          filter.teacherId =
            req.user._id;

        } else if (
          requestedTeacherId
        ) {

          filter.teacherId =
            requestedTeacherId;

        }

      } else {

        if (
          role === "admin"
        ) {

          const schoolId =
            cleanId(
              req.query.schoolId
            );

          if (schoolId) {
            filter.schoolId =
              schoolId;
          }

        } else if (
          role === "school"
        ) {

          filter.schoolId =
            req.user._id;

        } else if (
          role === "teacher"
        ) {

          filter.teacherId =
            req.user._id;

        } else if (
          role === "student"
        ) {

          filter.studentId =
            req.user._id;

        } else {

          return res.status(403).json({
            message:
              "Not allowed to view attendance summary."
          });

        }

      }


      const dateFilter =
        buildDateFilter(
          req.query
        );


      if (
        dateFilter ===
        null
      ) {

        return res.status(400).json({
          message:
            "Invalid date filter."
        });

      }


      if (dateFilter) {
        filter.date =
          dateFilter;
      }


      const records =
        await Attendance.find(
          filter
        ).lean();


      const summary =
        summarizeAttendance(
          records
        );


      return res.json({

        classId:
          classId ||
          null,

        filters: {

          studentId:
            filter.studentId ||
            null,

          teacherId:
            filter.teacherId ||
            null,

          from:
            req.query.from ||
            null,

          to:
            req.query.to ||
            null

        },

        ...summary

      });

    } catch (err) {

      console.error(
        "GET /api/attendance/summary failed:",
        err
      );


      return res.status(500).json({
        message:
          "Unable to load attendance summary.",
        error:
          err.message
      });

    }
  }
);

module.exports = router;
