const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Schedule = require("../models/Schedule");
const Class = require("../models/Class");

function canManageSchool(user, schoolId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && String(user._id) === String(schoolId)) return true;
  if (user.role === "teacher" && String(user.schoolId) === String(schoolId)) return true;
  return false;
}

/* ============================================
   GET SCHEDULES
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
      query.schoolId = user.schoolId || user.linkedSchoolId;
    } else {
      query.schoolId = schoolId;
    }

    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.teacherId) query.teacherId = req.query.teacherId;

    const schedules = await Schedule.find(query)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject")
      .sort({ date: 1, time: 1, createdAt: -1 });

    res.json(schedules);
  } catch (err) {
    console.error("GET /api/schedules error:", err);
    res.status(500).json({ message: "Failed to load schedules" });
  }
});

/* ============================================
   CREATE SCHEDULE
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const {
      schoolId,
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

    const finalSchoolId =
      req.user.role === "school"
        ? req.user._id
        : schoolId || req.user.schoolId || req.user.linkedSchoolId;

    if (!finalSchoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    if (!canManageSchool(req.user, finalSchoolId)) {
      return res.status(403).json({ message: "Not allowed to create this schedule" });
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

    const schedule = await Schedule.create({
      schoolId: finalSchoolId,
      classId: classId || null,
      teacherId: teacherId || classDoc?.teacherId || null,
      title: title || classDoc?.title || "Class Schedule",
      date: date || null,
      time: time || startTime || null,
      startTime: startTime || time || null,
      endTime: endTime || null,
      meetingLink: meetingLink || classDoc?.meetingLink || null,
      notes: notes || null
    });

    const populated = await Schedule.findById(schedule._id)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject");

    const io = req.app.get("io");
    if (io) {
      io.to(String(finalSchoolId)).emit("schedule:new", populated);
      if (populated.teacherId?._id) {
        io.to(String(populated.teacherId._id)).emit("schedule:new", populated);
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/schedules error:", err);
    res.status(500).json({ message: "Failed to create schedule" });
  }
});

/* ============================================
   UPDATE SCHEDULE
============================================ */
router.patch("/:id", auth, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    if (!canManageSchool(req.user, schedule.schoolId)) {
      return res.status(403).json({ message: "Not allowed to update this schedule" });
    }

    const fields = [
      "classId",
      "teacherId",
      "title",
      "date",
      "time",
      "startTime",
      "endTime",
      "meetingLink",
      "notes",
      "status"
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        schedule[field] = req.body[field] || null;
      }
    });

    await schedule.save();

    const populated = await Schedule.findById(schedule._id)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject");

    res.json(populated);
  } catch (err) {
    console.error("PATCH /api/schedules/:id error:", err);
    res.status(500).json({ message: "Failed to update schedule" });
  }
});

/* ============================================
   DELETE SCHEDULE
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    if (!canManageSchool(req.user, schedule.schoolId)) {
      return res.status(403).json({ message: "Not allowed to delete this schedule" });
    }

    await schedule.deleteOne();

    res.json({ message: "Schedule deleted" });
  } catch (err) {
    console.error("DELETE /api/schedules/:id error:", err);
    res.status(500).json({ message: "Failed to delete schedule" });
  }
});

module.exports = router;
