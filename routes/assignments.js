const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Assignment = require("../models/Assignment");
const Class = require("../models/Class");
const { createManyNotifications } = require("../services/notificationService");

function canManageSchool(user, schoolId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && String(user._id) === String(schoolId)) return true;
  if (user.role === "teacher" && String(user.schoolId) === String(schoolId)) return true;
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

    const finalSchoolId =
      req.user.role === "school"
        ? req.user._id
        : schoolId || req.user.schoolId || req.user.linkedSchoolId;

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
      teacherId: teacherId || classDoc?.teacherId || (req.user.role === "teacher" ? req.user._id : null),
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

    const recipients=[...(classDoc?.studentIds||[]),populated.teacherId?._id].map(String).filter((id,index,array)=>id&&id!==String(req.user._id)&&array.indexOf(id)===index);
    await createManyNotifications(recipients.map(user=>({user,sender:req.user._id,type:"assignment",priority:"high",text:`New assignment: ${assignment.title}`,link:`/student.html?section=assignments`,entityType:"assignment",entityId:assignment._id,metadata:{assignmentId:String(assignment._id),classId:String(assignment.classId||""),dueDate:assignment.dueDate||null}})),{io});

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

    if (!canManageSchool(req.user, assignment.schoolId)) {
      return res.status(403).json({ message: "Not allowed to update assignment" });
    }

    const fields = [
      "classId",
      "teacherId",
      "title",
      "instructions",
      "description",
      "dueDate",
      "attachmentUrl",
      "status"
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        assignment[field] = req.body[field] || null;
      }
    });

    await assignment.save();

    const populated = await Assignment.findById(assignment._id)
      .populate("classId", "title subject classCode")
      .populate("teacherId", "name email profileImage subject");

    res.json(populated);
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
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (!canManageSchool(req.user, assignment.schoolId)) {
      return res.status(403).json({ message: "Not allowed to delete assignment" });
    }

    await assignment.deleteOne();

    res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error("DELETE /api/assignments/:id error:", err);
    res.status(500).json({ message: "Failed to delete assignment" });
  }
});

module.exports = router;
