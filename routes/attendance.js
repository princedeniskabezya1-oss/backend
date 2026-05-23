// routes/attendance.js
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Attendance = require("../models/Attendance");
const User = require("../models/User");
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

async function populateAttendance(query) {
  return query
    .populate("studentId", "name email profileImage avatar course role")
    .populate("teacherId", "name email profileImage avatar subject role")
    .populate("classId", "title name subject classCode students teacherId")
    .populate("scheduleId", "date time meetingLink classId teacherId")
    .populate("markedBy", "name email role");
}

/**
 * GET /api/attendance
 */
router.get("/", auth, async (req, res) => {
  try {
    const schoolId = await resolveSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({ message: "schoolId is required." });
    }

    const filter = { schoolId };

    const classId = cleanId(req.query.classId);
    const studentId = cleanId(req.query.studentId);
    const teacherId = cleanId(req.query.teacherId);
    const scheduleId = cleanId(req.query.scheduleId);

    if (classId) filter.classId = classId;
    if (studentId) filter.studentId = studentId;
    if (teacherId) filter.teacherId = teacherId;
    if (scheduleId) filter.scheduleId = scheduleId;

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const dateFilter = buildDateFilter(req.query);

    if (dateFilter === null) {
      return res.status(400).json({ message: "Invalid date filter." });
    }

    if (dateFilter) filter.date = dateFilter;

    const records = await populateAttendance(
      Attendance.find(filter).sort({ date: -1, createdAt: -1 })
    ).lean();

    return res.json(records);
  } catch (err) {
    console.error("GET /api/attendance failed:", err);
    return res.status(500).json({
      message: "Unable to load attendance.",
      error: err.message,
    });
  }
});

/**
 * POST /api/attendance
 */
router.post("/", auth, async (req, res) => {
  try {
    const schoolId = await resolveSchoolId(req);
    const markedBy = getUserId(req);

    const classId = cleanId(req.body.classId);
    const teacherId = cleanId(req.body.teacherId);
    const studentId = cleanId(req.body.studentId);
    const scheduleId = cleanId(req.body.scheduleId);

    const date = normalizeDate(req.body.date);

    if (!schoolId) return res.status(400).json({ message: "schoolId is required." });
    if (!classId) return res.status(400).json({ message: "classId is required." });
    if (!teacherId) return res.status(400).json({ message: "teacherId is required." });
    if (!studentId) return res.status(400).json({ message: "studentId is required." });
    if (!date) return res.status(400).json({ message: "Valid date is required." });
    if (!markedBy) return res.status(401).json({ message: "Unauthorized." });

    const allowed = ["present", "late", "absent", "excused"];
    const status = allowed.includes(req.body.status)
      ? req.body.status
      : "present";

    const participationScore = Math.max(
      0,
      Math.min(100, Number(req.body.participationScore || 0))
    );

    const record = await Attendance.findOneAndUpdate(
      {
        schoolId,
        classId,
        studentId,
        date,
      },
      {
        schoolId,
        classId,
        teacherId,
        studentId,
        scheduleId,
        date,
        status,
        participationScore,
        notes: req.body.notes || "",
        markedBy,
        source: req.body.source || "manual",
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    const populated = await populateAttendance(
      Attendance.findById(record._id)
    ).lean();

    return res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/attendance failed:", err);

    return res.status(500).json({
      message: "Unable to save attendance.",
      error: err.message,
    });
  }
});

/**
 * PATCH /api/attendance/:id
 */
router.patch("/:id", auth, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid attendance ID." });
    }

    const allowed = ["present", "late", "absent", "excused"];
    const update = {};

    if (req.body.status !== undefined) {
      if (!allowed.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid status." });
      }

      update.status = req.body.status;
    }

    if (req.body.participationScore !== undefined) {
      update.participationScore = Math.max(
        0,
        Math.min(100, Number(req.body.participationScore || 0))
      );
    }

    if (req.body.notes !== undefined) {
      update.notes = req.body.notes || "";
    }

    if (req.body.date !== undefined) {
      const date = normalizeDate(req.body.date);

      if (!date) {
        return res.status(400).json({ message: "Invalid date." });
      }

      update.date = date;
    }

    const scheduleId = cleanId(req.body.scheduleId);

    if (scheduleId) update.scheduleId = scheduleId;

    update.markedBy = getUserId(req);

    const updated = await Attendance.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Attendance not found." });
    }

    const populated = await populateAttendance(
      Attendance.findById(updated._id)
    ).lean();

    return res.json(populated);
  } catch (err) {
    console.error("PATCH /api/attendance/:id failed:", err);
    return res.status(500).json({
      message: "Unable to update attendance.",
      error: err.message,
    });
  }
});

/**
 * DELETE /api/attendance/:id
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid attendance ID." });
    }

    const deleted = await Attendance.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Attendance not found." });
    }

    return res.json({
      message: "Attendance deleted successfully.",
      deletedId: req.params.id,
    });
  } catch (err) {
    console.error("DELETE /api/attendance/:id failed:", err);
    return res.status(500).json({
      message: "Unable to delete attendance.",
      error: err.message,
    });
  }
});
