const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Schedule = require("../models/Schedule");
const Class = require("../models/Class");

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


function canManageSchool(
  user,
  schoolId
) {
  if (
    !user ||
    !schoolId
  ) {
    return false;
  }

  const role =
    normalizeRole(
      user.role
    );

  if (role === "admin") {
    return true;
  }

  if (role !== "school") {
    return false;
  }

  return getUserSchoolIds(user)
    .includes(
      normalizeObjectId(
        schoolId
      )
    );
}


/* ============================================
   ASSIGNED CLASS SCHEDULE PERMISSION
============================================ */

function canManageAssignedClass(
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
    normalizeRole(
      user.role
    );

  const userId =
    normalizeObjectId(
      user._id
    );

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
      .includes(
        schoolId
      );
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

/* ============================================
GET SCHEDULES
============================================ */

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


      /* ========================================
         ADMIN
      ======================================== */

      if (role === "admin") {

        if (
          req.query.schoolId
        ) {
          query.schoolId =
            req.query.schoolId;
        }

      }


      /* ========================================
         SCHOOL
      ======================================== */

      else if (
        role === "school"
      ) {

        query.schoolId =
          user._id;

      }


      /* ========================================
         TEACHER
      ======================================== */

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
              item =>
                item._id
            )
        };

      }


      /* ========================================
         STUDENT
      ======================================== */

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
              item =>
                item._id
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


      /* ========================================
         CLASS FILTER
      ======================================== */

      if (
        req.query.classId
      ) {

        const classDoc =
          await Class.findById(
            req.query.classId
          );


        if (!classDoc) {
          return res.status(404).json({
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
          return res.status(403).json({
            message:
              "Not allowed to view this class schedule"
          });
        }


        if (
          role === "student"
        ) {

          const studentIds =
            Array.isArray(
              classDoc.studentIds
            )
              ? classDoc.studentIds
                  .map(
                    normalizeObjectId
                  )
              : [];


          if (
            !studentIds.includes(
              normalizeObjectId(
                user._id
              )
            )
          ) {
            return res.status(403).json({
              message:
                "Not enrolled in this class"
            });
          }

        }


        query.classId =
          classDoc._id;

      }


      if (
        req.query.teacherId
      ) {

        if (
          role === "teacher" &&
          normalizeObjectId(
            req.query.teacherId
          ) !==
          normalizeObjectId(
            user._id
          )
        ) {
          return res.status(403).json({
            message:
              "Not allowed to view another teacher's schedule"
          });
        }


        query.teacherId =
          role === "teacher"
            ? user._id
            : req.query.teacherId;

      }


      const schedules =
        await Schedule.find(
          query
        )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          )
          .sort({
            date:1,
            time:1,
            createdAt:-1
          });


      return res.json(
        schedules
      );

    } catch (err) {

      console.error(
        "GET /api/schedules error:",
        err
      );


      return res.status(500).json({
        message:
          "Failed to load schedules"
      });

    }
  }
);

/* ============================================
CREATE SCHEDULE
============================================ */

router.post(
  "/",
  auth,
  async (req, res) => {
    try {

      const {
        classId,
        teacherId,
        date,
        time,
        startTime,
        endTime,
        meetingLink,
        notes,
        title
      } = req.body;


      const role =
        normalizeRole(
          req.user.role
        );


      if (!classId) {
        return res.status(400).json({
          message:
            "classId is required"
        });
      }


      const classDoc =
        await Class.findById(
          classId
        );


      if (!classDoc) {
        return res.status(404).json({
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
        return res.status(403).json({
          message:
            "Not allowed to create a schedule for this class"
        });
      }


      /*
        Teacher cannot spoof another teacher ID.
      */
      const finalTeacherId =
        role === "teacher"
          ? req.user._id
          : (
              teacherId ||
              classDoc.teacherId ||
              null
            );


      const schedule =
        await Schedule.create({

          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          teacherId:
            finalTeacherId,

          title:
            title ||
            classDoc.title ||
            "Class Schedule",

          date:
            date ||
            null,

          time:
            time ||
            startTime ||
            null,

          startTime:
            startTime ||
            time ||
            null,

          endTime:
            endTime ||
            null,

          meetingLink:
            meetingLink ||
            classDoc.meetingLink ||
            null,

          notes:
            notes ||
            null

        });


      const populated =
        await Schedule.findById(
          schedule._id
        )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          );


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
            "schedule:new",
            populated
          );


        if (
          populated.teacherId?._id
        ) {

          io
            .to(
              String(
                populated.teacherId._id
              )
            )
            .emit(
              "schedule:new",
              populated
            );

        }

      }


      return res
        .status(201)
        .json(populated);

    } catch (err) {

      console.error(
        "POST /api/schedules error:",
        err
      );


      return res.status(500).json({
        message:
          "Failed to create schedule"
      });

    }
  }
);

/* ============================================
UPDATE SCHEDULE
============================================ */

router.patch(
  "/:id",
  auth,
  async (req, res) => {
    try {

      const schedule =
        await Schedule.findById(
          req.params.id
        );


      if (!schedule) {
        return res.status(404).json({
          message:
            "Schedule not found"
        });
      }


      const classDoc =
        await Class.findById(
          schedule.classId
        );


      if (!classDoc) {
        return res.status(404).json({
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
        return res.status(403).json({
          message:
            "Not allowed to update this schedule"
        });
      }


      const role =
        normalizeRole(
          req.user.role
        );


      /*
        Do not allow the schedule to be transferred
        to a different class through this endpoint.
      */

      const fields = [
        "title",
        "date",
        "time",
        "startTime",
        "endTime",
        "meetingLink",
        "notes",
        "status"
      ];


      /*
        School/admin can explicitly change teacherId.
        Assigned teachers cannot.
      */
      if (
        role === "school" ||
        role === "admin"
      ) {
        fields.push(
          "teacherId"
        );
      }


      fields.forEach(
        field => {

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
      );


      /*
        Keep core ownership synchronized
        with the actual class.
      */

      schedule.schoolId =
        classDoc.schoolId;

      schedule.classId =
        classDoc._id;


      if (
        role === "teacher"
      ) {
        schedule.teacherId =
          req.user._id;
      }


      await schedule.save();


      const populated =
        await Schedule.findById(
          schedule._id
        )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "teacherId",
            "name email profileImage subject"
          );


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
            "schedule:updated",
            populated
          );


        if (
          populated.teacherId?._id
        ) {

          io
            .to(
              String(
                populated.teacherId._id
              )
            )
            .emit(
              "schedule:updated",
              populated
            );

        }

      }


      return res.json(
        populated
      );

    } catch (err) {

      console.error(
        "PATCH /api/schedules/:id error:",
        err
      );


      return res.status(500).json({
        message:
          "Failed to update schedule"
      });

    }
  }
);
/* ============================================
DELETE SCHEDULE
============================================ */

router.delete(
  "/:id",
  auth,
  async (req, res) => {
    try {

      const schedule =
        await Schedule.findById(
          req.params.id
        );


      if (!schedule) {
        return res.status(404).json({
          message:
            "Schedule not found"
        });
      }


      const classDoc =
        await Class.findById(
          schedule.classId
        );


      if (!classDoc) {
        return res.status(404).json({
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
        return res.status(403).json({
          message:
            "Not allowed to delete this schedule"
        });
      }


      const scheduleId =
        schedule._id;


      await schedule.deleteOne();


      const io =
        req.app.get("io");


      const payload = {

        scheduleId:
          String(
            scheduleId
          ),

        classId:
          String(
            classDoc._id
          )

      };


      if (io) {

        io
          .to(
            String(
              classDoc.schoolId
            )
          )
          .emit(
            "schedule:deleted",
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
              "schedule:deleted",
              payload
            );

        }

      }


      return res.json({

        message:
          "Schedule deleted",

        scheduleId:
          String(
            scheduleId
          )

      });

    } catch (err) {

      console.error(
        "DELETE /api/schedules/:id error:",
        err
      );


      return res.status(500).json({
        message:
          "Failed to delete schedule"
      });

    }
  }
);

module.exports = router;
