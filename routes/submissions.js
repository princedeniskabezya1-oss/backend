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
    const {
      assignmentId,
      text,
      fileUrl
    } = req.body;

    if (!assignmentId) {
      return res.status(400).json({ message: "Assignment ID is required" });
    }

    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can submit assignments" });
    }

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (!canViewSchool(req.user, assignment.schoolId)) {
      return res.status(403).json({ message: "Not allowed to submit this assignment" });
    }

    const submission = await Submission.findOneAndUpdate(
      {
        assignmentId: assignment._id,
        studentId: req.user._id
      },
      {
        schoolId: assignment.schoolId,
        classId: assignment.classId || null,
        assignmentId: assignment._id,
        studentId: req.user._id,
        teacherId: assignment.teacherId || null,
        text: text || null,
        fileUrl: fileUrl || null,
        status: "submitted",
        submittedAt: new Date()
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    )
      .populate("assignmentId", "title dueDate")
      .populate("classId", "title subject classCode")
      .populate("studentId", "name email profileImage course")
      .populate("teacherId", "name email profileImage subject");

    const io = req.app.get("io");
    if (io) {
      io.to(String(assignment.schoolId)).emit("submission:new", submission);

      if (assignment.teacherId) {
        io.to(String(assignment.teacherId)).emit("submission:new", submission);
      }
    }

    res.status(201).json(submission);
  } catch (err) {
    console.error("POST /api/submissions error:", err);
    res.status(500).json({ message: "Failed to submit assignment" });
  }
});

/* ============================================
   GRADE / REVIEW SUBMISSION
============================================ */
router.patch("/:id/review", auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (!canGrade(req.user, submission)) {
      return res.status(403).json({ message: "Not allowed to review this submission" });
    }

    const { grade, feedback, status } = req.body;

    if (grade !== undefined) submission.grade = grade || null;
    if (feedback !== undefined) submission.feedback = feedback || null;

    submission.status = status || "reviewed";
    submission.reviewedAt = new Date();

    await submission.save();

    const populated = await Submission.findById(submission._id)
      .populate("assignmentId", "title dueDate")
      .populate("classId", "title subject classCode")
      .populate("studentId", "name email profileImage course")
      .populate("teacherId", "name email profileImage subject");

    const io = req.app.get("io");
    if (io) {
      io.to(String(submission.schoolId)).emit("submission:reviewed", populated);
      io.to(String(submission.studentId)).emit("submission:reviewed", populated);
    }

    res.json(populated);
  } catch (err) {
    console.error("PATCH /api/submissions/:id/review error:", err);
    res.status(500).json({ message: "Failed to review submission" });
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
