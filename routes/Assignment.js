const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Class = require("../models/Class");

/* ============================================
   ASSIGNMENT ACCESS HELPERS
============================================ */

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

  const role = normalizeRole(user.role);

  const candidates = [
    user.schoolId,
    user.linkedSchoolId
  ];

  if (role === "school") {
    candidates.push(user._id);
  }

  return [
    ...new Set(
      candidates
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
}


function getUserSchoolId(user) {
  return getUserSchoolIds(user)[0] || null;
}


function canManageSchool(user, schoolId) {
  if (!user || !schoolId) {
    return false;
  }

  const role = normalizeRole(user.role);

  if (role === "admin") {
    return true;
  }

  const normalizedSchoolId =
    normalizeObjectId(schoolId);

  const belongsToSchool =
    getUserSchoolIds(user)
      .includes(normalizedSchoolId);

  if (role === "school") {
    return belongsToSchool;
  }

  if (role === "teacher") {
    return belongsToSchool;
  }

  return false;
}


function canManageAssignment(user, assignment) {
  if (!user || !assignment) {
    return false;
  }

  const role = normalizeRole(user.role);

  if (role === "admin") {
    return true;
  }

  if (
    !canManageSchool(
      user,
      assignment.schoolId
    )
  ) {
    return false;
  }

  /*
    School accounts can manage every assignment belonging
    to their school.
  */
  if (role === "school") {
    return true;
  }

  /*
    Teachers can manage assignments belonging to their school.

    When the assignment has a specific teacher, only that
    teacher may modify it. Assignments with no teacher remain
    manageable by school-linked teachers.
  */
  if (role === "teacher") {
    const assignmentTeacherId =
      normalizeObjectId(
        assignment.teacherId
      );

    if (!assignmentTeacherId) {
      return true;
    }

    return (
      assignmentTeacherId ===
      normalizeObjectId(user._id)
    );
  }

  return false;
}

/* ============================================
   GET ASSIGNMENTS
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

    const schoolId =
      req.query.schoolId ||
      getUserSchoolId(user);

    const query = {};

    const role =
      normalizeRole(user.role);

    if (role === "admin") {
      if (req.query.schoolId) {
        query.schoolId =
          req.query.schoolId;
      }
    } else if (role === "school") {
      query.schoolId =
        getUserSchoolId(user);
    } else if (role === "teacher") {
      const teacherSchoolIds =
        getUserSchoolIds(user);

      if (!teacherSchoolIds.length) {
        return res.status(403).json({
          message: "Teacher is not linked to a school"
        });
      }

      query.$or = [
        {
          teacherId: user._id
        },
        {
          schoolId: {
            $in: teacherSchoolIds
          }
        }
      ];
    } else if (role === "student") {
      const studentSchoolIds =
        getUserSchoolIds(user);

      if (!studentSchoolIds.length) {
        return res.status(403).json({
          message: "Student is not linked to a school"
        });
      }

      query.schoolId = {
        $in: studentSchoolIds
      };
    } else {
      return res.status(403).json({
        message: "Not allowed to view assignments"
      });
    }

    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.teacherId) query.teacherId = req.query.teacherId;

    const assignments = await Assignment.find(query)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject")
      .sort({ dueDate: 1, createdAt: -1 });

    res.json(assignments);
  } catch (err) {
    console.error("GET /api/assignments error:", err);
    res.status(500).json({ message: "Failed to load assignments" });
  }
});

/* ============================================
   CREATE ASSIGNMENT
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      teacherId,
      title,
      instructions,
      description,
      dueDate,
      attachmentUrl
    } = req.body;

    const role =
      normalizeRole(req.user.role);

    const finalSchoolId =
      role === "school"
        ? getUserSchoolId(req.user)
        : schoolId || getUserSchoolId(req.user);

    if (!finalSchoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    if (!canManageSchool(req.user, finalSchoolId)) {
      return res.status(403).json({ message: "Not allowed to create assignment" });
    }

    if (!title) {
      return res.status(400).json({ message: "Assignment title is required" });
    }

    let classDoc = null;

    if (classId) {
      classDoc = await Class.findById(classId);

      if (!classDoc) {
        return res.status(404).json({ message: "Class not found" });
      }

      if (String(classDoc.schoolId) !== String(finalSchoolId)) {
        return res.status(403).json({ message: "Class does not belong to this school" });
      }
    }

    const assignment = await Assignment.create({
      schoolId: finalSchoolId,
      classId: classId || null,
          teacherId:
        role === "teacher"
          ? req.user._id
          : (
              teacherId ||
              classDoc?.teacherId ||
              null
            ),
      title,
      instructions: instructions || description || null,
      description: description || instructions || null,
      dueDate: dueDate || null,
      attachmentUrl: attachmentUrl || null
    });

    const populated = await Assignment.findById(assignment._id)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject");

    const io = req.app.get("io");
    if (io) {
      io.to(String(finalSchoolId)).emit("assignment:new", populated);
      if (populated.teacherId?._id) {
        io.to(String(populated.teacherId._id)).emit("assignment:new", populated);
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/assignments error:", err);
    res.status(500).json({ message: "Failed to create assignment" });
  }
});

/* ============================================
   UPDATE ASSIGNMENT
============================================ */
router.patch("/:id", auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (!canManageAssignment(req.user, assignment)) {
      return res.status(403).json({
        message: "Not allowed to update assignment"
      });
    }

    const role =
      normalizeRole(req.user.role);

    const fields = [
      "classId",
      "title",
      "instructions",
      "description",
      "dueDate",
      "attachmentUrl",
      "status"
    ];

    /*
      School and admin accounts may reassign the teacher.

      Teachers cannot transfer an assignment to a different
      teacher through a crafted request.
    */
    if (
      role === "school" ||
      role === "admin"
    ) {
      fields.push("teacherId");
    }

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        const value =
          req.body[field];

        assignment[field] =
          value === "" ||
          value === null
            ? null
            : value;
      }
    });

    if (role === "teacher") {
      assignment.teacherId =
        req.user._id;
    }

        if (assignment.classId) {
      const classDoc =
        await Class.findById(
          assignment.classId
        );

      if (!classDoc) {
        return res.status(404).json({
          message: "Class not found"
        });
      }

      if (
        normalizeObjectId(classDoc.schoolId) !==
        normalizeObjectId(assignment.schoolId)
      ) {
        return res.status(403).json({
          message: "Class does not belong to this school"
        });
      }

      if (
        role === "teacher" &&
        classDoc.teacherId &&
        normalizeObjectId(classDoc.teacherId) !==
        normalizeObjectId(req.user._id)
      ) {
        return res.status(403).json({
          message: "Not allowed to assign work to this class"
        });
      }
    }

    await assignment.save();

    const populated =
      await Assignment.findById(
        assignment._id
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
            assignment.schoolId
          )
        )
        .emit(
          "assignment:updated",
          populated
        );

      if (populated.teacherId?._id) {
        io
          .to(
            String(
              populated.teacherId._id
            )
          )
          .emit(
            "assignment:updated",
            populated
          );
      }
    }

    return res.json(populated);
  } catch (err) {
    console.error("PATCH /api/assignments/:id error:", err);
    res.status(500).json({ message: "Failed to update assignment" });
  }
});

/* ============================================
   DELETE ASSIGNMENT
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const assignment =
      await Assignment.findById(
        req.params.id
      );

    if (!assignment) {
      return res.status(404).json({
        message: "Assignment not found"
      });
    }

    if (
      !canManageAssignment(
        req.user,
        assignment
      )
    ) {
      return res.status(403).json({
        message: "Not allowed to delete assignment"
      });
    }

    const assignmentId =
      assignment._id;

    /*
      Remove dependent submission records before deleting
      the assignment so the database does not retain orphaned
      student work pointing to a missing assignment.
    */
    const submissionDeleteResult =
      await Submission.deleteMany({
        assignmentId
      });

    await assignment.deleteOne();

    const io =
      req.app.get("io");

    if (io) {
      const payload = {
        assignmentId:
          String(assignmentId),

        classId:
          assignment.classId
            ? String(assignment.classId)
            : null,

        deletedSubmissionCount:
          submissionDeleteResult.deletedCount ||
          0
      };

      io
        .to(
          String(
            assignment.schoolId
          )
        )
        .emit(
          "assignment:deleted",
          payload
        );

      if (assignment.teacherId) {
        io
          .to(
            String(
              assignment.teacherId
            )
          )
          .emit(
            "assignment:deleted",
            payload
          );
      }
    }

    return res.json({
      message: "Assignment deleted",
      assignmentId:
        String(assignmentId),
      deletedSubmissionCount:
        submissionDeleteResult.deletedCount ||
        0
    });
  } catch (err) {
    console.error(
      "DELETE /api/assignments/:id error:",
      err
    );

    return res.status(500).json({
      message: "Failed to delete assignment"
    });
  }
});

module.exports = router;
