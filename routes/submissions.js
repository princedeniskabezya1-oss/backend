const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");

function canViewSchool(user, schoolId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && String(user._id) === String(schoolId)) return true;
  if (["teacher", "student"].includes(user.role) && String(user.schoolId || user.linkedSchoolId) === String(schoolId)) return true;
  return false;
}

function canGrade(user, submission) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && String(user._id) === String(submission.schoolId)) return true;
  if (user.role === "teacher" && String(user._id) === String(submission.teacherId)) return true;
  return false;
}

/* ============================================
   GET SUBMISSIONS
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

    const schoolId =
      req.query.schoolId ||
      user.schoolId ||
      user.linkedSchoolId ||
      user._id;

    const query = {};

    if (user.role === "admin") {
      if (req.query.schoolId) query.schoolId = req.query.schoolId;
    } else if (user.role === "school") {
      query.schoolId = user._id;
    } else if (user.role === "teacher") {
      query.$or = [
        { teacherId: user._id },
        { schoolId: user.schoolId || user.linkedSchoolId }
      ];
    } else if (user.role === "student") {
      query.studentId = user._id;
    } else {
      query.schoolId = schoolId;
    }

    if (req.query.assignmentId) query.assignmentId = req.query.assignmentId;
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.studentId) query.studentId = req.query.studentId;
    if (req.query.teacherId) query.teacherId = req.query.teacherId;

    const submissions = await Submission.find(query)
      .populate("assignmentId", "title dueDate")
      .populate("classId", "title subject classCode")
      .populate("studentId", "name email profileImage course")
      .populate("teacherId", "name email profileImage subject")
      .sort({ submittedAt: -1, createdAt: -1 });

    res.json(submissions);
  } catch (err) {
    console.error("GET /api/submissions error:", err);
    res.status(500).json({ message: "Failed to load submissions" });
  }
});

/* ============================================
   CREATE / SUBMIT ASSIGNMENT
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const assignmentId =
      String(
        req.body.assignmentId || ""
      ).trim();

    const text =
      String(
        req.body.text || ""
      ).trim();

    const fileUrl =
      String(
        req.body.fileUrl || ""
      ).trim();

    if (!assignmentId) {
      return res.status(400).json({
        message:
          "Assignment ID is required"
      });
    }

    if (
      !text &&
      !fileUrl
    ) {
      return res.status(400).json({
        message:
          "Write an answer or add a file URL"
      });
    }

    if (
      req.user.role !==
      "student"
    ) {
      return res.status(403).json({
        message:
          "Only students can submit assignments"
      });
    }

    const assignment =
      await Assignment.findById(
        assignmentId
      );

    if (!assignment) {
      return res.status(404).json({
        message:
          "Assignment not found"
      });
    }

    if (
      !canViewSchool(
        req.user,
        assignment.schoolId
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to submit this assignment"
      });
    }

    const existing =
      await Submission.findOne({
        assignmentId:
          assignment._id,

        studentId:
          req.user._id
      });

    const now =
      new Date();

    let submission;
    let socketEvent;
    let responseStatus;

    if (!existing) {
      submission =
        await Submission.create({
          schoolId:
            assignment.schoolId,

          classId:
            assignment.classId ||
            null,

          assignmentId:
            assignment._id,

          studentId:
            req.user._id,

          teacherId:
            assignment.teacherId ||
            null,

          text:
            text || null,

          fileUrl:
            fileUrl || null,

          status:
            "submitted",

          submittedAt:
            now,

          lastEditedAt:
            now,

          attemptNumber:
            1,

          revisionNumber:
            1,

          submissionHistory: [
            {
              revisionNumber: 1,
              attemptNumber: 1,
              text:
                text || null,
              fileUrl:
                fileUrl || null,
              status:
                "submitted",
              grade: null,
              feedback: null,
              changedBy:
                req.user._id,
              changedByRole:
                req.user.role,
              action:
                "submitted",
              createdAt:
                now
            }
          ]
        });

      socketEvent =
        "submission:new";

      responseStatus =
        201;
    } else {
      const currentStatus =
        String(
          existing.status || ""
        )
          .trim()
          .toLowerCase();

      const isLocked =
        existing.locked === true ||
        [
          "graded",
          "reviewed",
          "locked"
        ].includes(
          currentStatus
        ) ||
        (
          existing.grade !==
            undefined &&
          existing.grade !==
            null &&
          existing.grade !== ""
        );

      if (isLocked) {
        return res.status(403).json({
          message:
            "This submission has already been reviewed and can no longer be modified"
        });
      }

      const isResubmission =
        currentStatus ===
        "returned";

      existing.schoolId =
        assignment.schoolId;

      existing.classId =
        assignment.classId ||
        null;

      existing.teacherId =
        assignment.teacherId ||
        null;

      existing.text =
        text || null;

      existing.fileUrl =
        fileUrl || null;

      existing.status =
        "submitted";

      existing.submittedAt =
        now;

      existing.lastEditedAt =
        now;

      existing.reviewedAt =
        null;

      existing.returnedAt =
        null;

      existing.returnedBy =
        null;

      existing.returnedReason =
        "";

      existing.gradedAt =
        null;

      existing.lockedAt =
        null;

      existing.locked =
        false;

      existing.grade =
        null;

      existing.feedback =
        null;

      existing.revisionNumber =
        Math.max(
          1,
          Number(
            existing.revisionNumber ||
            1
          )
        ) + 1;

      if (isResubmission) {
        existing.attemptNumber =
          Math.max(
            1,
            Number(
              existing.attemptNumber ||
              1
            )
          ) + 1;
      }

      existing.submissionHistory.push({
        revisionNumber:
          existing.revisionNumber,

        attemptNumber:
          existing.attemptNumber,

        text:
          text || null,

        fileUrl:
          fileUrl || null,

        status:
          "submitted",

        grade:
          null,

        feedback:
          null,

        changedBy:
          req.user._id,

        changedByRole:
          req.user.role,

        action:
          isResubmission
            ? "resubmitted"
            : "updated",

        createdAt:
          now
      });

      await existing.save();

      submission =
        existing;

      socketEvent =
        isResubmission
          ? "submission:resubmitted"
          : "submission:updated";

      responseStatus =
        200;
    }

    const populated =
      await Submission.findById(
        submission._id
      )
        .populate(
          "assignmentId",
          "title dueDate classId"
        )
        .populate(
          "classId",
          "title subject classCode"
        )
        .populate(
          "studentId",
          "name email profileImage course"
        )
        .populate(
          "teacherId",
          "name email profileImage subject"
        )
        .populate(
          "returnedBy",
          "name email role profileImage"
        );

    const io =
      req.app.get("io");

    if (io) {
      io.to(
        String(
          assignment.schoolId
        )
      ).emit(
        socketEvent,
        populated
      );

      if (assignment.teacherId) {
        io.to(
          String(
            assignment.teacherId
          )
        ).emit(
          socketEvent,
          populated
        );
      }

      io.to(
        String(req.user._id)
      ).emit(
        socketEvent,
        populated
      );
    }

    return res
      .status(responseStatus)
      .json(populated);

  } catch (err) {
    console.error(
      "POST /api/submissions error:",
      err
    );

    return res.status(500).json({
      message:
        "Failed to submit assignment"
    });
  }
});

/* ============================================
   GRADE / REVIEW SUBMISSION
============================================ */
router.patch("/:id/review", auth, async (req, res) => {
  try {
    const submission =
      await Submission.findById(
        req.params.id
      );

    if (!submission) {
      return res.status(404).json({
        message:
          "Submission not found"
      });
    }

    if (
      !canGrade(
        req.user,
        submission
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to review this submission"
      });
    }

    const requestedStatus =
      String(
        req.body.status ||
        "reviewed"
      )
        .trim()
        .toLowerCase();

    const allowedStatuses = [
      "returned",
      "reviewed",
      "graded",
      "locked"
    ];

    if (
      !allowedStatuses.includes(
        requestedStatus
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid review status"
      });
    }

    const now =
      new Date();

    const feedback =
      req.body.feedback !==
        undefined
        ? String(
            req.body.feedback || ""
          ).trim()
        : submission.feedback;

    const grade =
      req.body.grade !==
        undefined
        ? String(
            req.body.grade || ""
          ).trim()
        : submission.grade;

    submission.feedback =
      feedback || null;

    submission.grade =
      grade || null;

    submission.status =
      requestedStatus;

    submission.reviewedAt =
      now;

    submission.lastEditedAt =
      now;

    submission.returnedAt =
      requestedStatus ===
        "returned"
        ? now
        : null;

    submission.returnedBy =
      requestedStatus ===
        "returned"
        ? req.user._id
        : null;

    submission.returnedReason =
      requestedStatus ===
        "returned"
        ? (
            String(
              req.body.returnedReason ||
              feedback ||
              ""
            ).trim()
          )
        : "";

    submission.gradedAt =
      requestedStatus ===
        "graded"
        ? now
        : null;

    submission.locked =
      [
        "graded",
        "reviewed",
        "locked"
      ].includes(
        requestedStatus
      );

    submission.lockedAt =
      submission.locked
        ? now
        : null;

    submission.revisionNumber =
      Math.max(
        1,
        Number(
          submission.revisionNumber ||
          1
        )
      ) + 1;

    submission.submissionHistory.push({
      revisionNumber:
        submission.revisionNumber,

      attemptNumber:
        Math.max(
          1,
          Number(
            submission.attemptNumber ||
            1
          )
        ),

      text:
        submission.text,

      fileUrl:
        submission.fileUrl,

      status:
        requestedStatus,

      grade:
        submission.grade,

      feedback:
        submission.feedback,

      changedBy:
        req.user._id,

      changedByRole:
        req.user.role,

      action:
        requestedStatus,

      createdAt:
        now
    });

    await submission.save();

    const populated =
      await Submission.findById(
        submission._id
      )
        .populate(
          "assignmentId",
          "title dueDate classId"
        )
        .populate(
          "classId",
          "title subject classCode"
        )
        .populate(
          "studentId",
          "name email profileImage course"
        )
        .populate(
          "teacherId",
          "name email profileImage subject"
        )
        .populate(
          "returnedBy",
          "name email role profileImage"
        );

    const io =
      req.app.get("io");

    if (io) {
      const eventName =
        requestedStatus ===
          "returned"
          ? "submission:returned"
          : requestedStatus ===
              "graded"
            ? "submission:graded"
            : "submission:reviewed";

      io.to(
        String(
          submission.schoolId
        )
      ).emit(
        eventName,
        populated
      );

      io.to(
        String(
          submission.studentId
        )
      ).emit(
        eventName,
        populated
      );

      if (submission.teacherId) {
        io.to(
          String(
            submission.teacherId
          )
        ).emit(
          eventName,
          populated
        );
      }
    }

    return res.json(
      populated
    );

  } catch (err) {
    console.error(
      "PATCH /api/submissions/:id/review error:",
      err
    );

    return res.status(500).json({
      message:
        "Failed to review submission"
    });
  }
});

/* ============================================
   DELETE SUBMISSION
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const isOwner = String(submission.studentId) === String(req.user._id);

    if (!isOwner && !canGrade(req.user, submission)) {
      return res.status(403).json({ message: "Not allowed to delete submission" });
    }

    await submission.deleteOne();

    res.json({ message: "Submission deleted" });
  } catch (err) {
    console.error("DELETE /api/submissions/:id error:", err);
    res.status(500).json({ message: "Failed to delete submission" });
  }
});

module.exports = router;
