const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Class = require("../models/Class");
const User = require("../models/User");

function canManageSchool(user, schoolId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && String(user._id) === String(schoolId)) return true;
  if (user.role === "teacher" && String(user.schoolId || user.linkedSchoolId) === String(schoolId)) return true;
  return false;
}
function uploadClassCover(file) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "aift_classes",
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    ).end(file.buffer);
  });
}

/* ============================================
   GET CLASSES
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

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
      query.$or = [
        { studentIds: user._id },
        { schoolId: user.schoolId || user.linkedSchoolId }
      ];
    } else if (req.query.schoolId) {
      query.schoolId = req.query.schoolId;
    }

    if (req.query.teacherId) query.teacherId = req.query.teacherId;
    if (req.query.status) query.status = req.query.status;

    const classes = await Class.find(query)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course")
      .sort({ createdAt: -1 });

    res.json(classes);
  } catch (err) {
    console.error("GET /api/classes error:", err);
    res.status(500).json({ message: "Failed to load classes" });
  }
});

/* ============================================
   GET CLASS BY ID
============================================ */
router.get("/:id", auth, async (req, res) => {
  try {
    const item = await Class.findById(req.params.id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    if (!item) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json(item);
  } catch (err) {
    console.error("GET /api/classes/:id error:", err);
    res.status(500).json({ message: "Failed to load class" });
  }
});

/* ============================================
   CREATE CLASS
============================================ */
router.post("/", auth, upload.single("coverImage"), async (req, res) => {
  try {
    const {
      coverImage,
      schoolId,
      title,
      subject,
      teacherId,
      studentIds,
      classCode,
      code,
      meetingLink,
      schedule,
      description,
      materials
    } = req.body;

    const finalSchoolId =
      req.user.role === "school"
        ? req.user._id
        : schoolId || req.user.schoolId || req.user.linkedSchoolId;

    if (!finalSchoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    if (!canManageSchool(req.user, finalSchoolId)) {
      return res.status(403).json({ message: "Not allowed to create class" });
    }

    if (!title) {
      return res.status(400).json({ message: "Class title is required" });
    }

    if (teacherId) {
      const teacher = await User.findById(teacherId);

      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (
        !["teacher", "instructor", "faculty"].includes(String(teacher.role).toLowerCase()) &&
        String(teacher.role).toLowerCase() !== "school"
      ) {
        return res.status(400).json({ message: "Selected user is not a teacher" });
      }

      if (
        String(teacher.schoolId || teacher.linkedSchoolId || teacher.companyId || finalSchoolId) !==
        String(finalSchoolId)
      ) {
        return res.status(403).json({ message: "Teacher is not linked to this school" });
      }
    }
    let uploadedCover = null;

if (req.file) {
  uploadedCover = await uploadClassCover(req.file);
}

    const item = await Class.create({
      schoolId: finalSchoolId,
      title,
      subject: subject || null,
      teacherId: teacherId || null,
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      classCode: classCode || code || null,
      meetingLink: meetingLink || null,
      schedule: schedule || null,
      description: description || null,
      coverImage: uploadedCover || coverImage || null,
      materials: Array.isArray(materials) ? materials : []
    });

    if (teacherId) {
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedClasses: item._id }
      });
    }

    const populated = await Class.findById(item._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    const io = req.app.get("io");
    if (io) {
      io.to(String(finalSchoolId)).emit("class:new", populated);

      if (teacherId) {
        io.to(String(teacherId)).emit("class:new", populated);
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/classes error:", err);
    res.status(500).json({ message: "Failed to create class" });
  }
});

/* ============================================
   UPDATE CLASS
============================================ */
router.patch("/:id", auth, upload.single("coverImage"), async (req, res) => {
  try {
    const item = await Class.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (!canManageSchool(req.user, item.schoolId)) {
      return res.status(403).json({ message: "Not allowed to update class" });
    }

    const oldTeacherId = item.teacherId ? String(item.teacherId) : null;

    const fields = [
      "title",
      "subject",
      "teacherId",
      "meetingLink",
      "schedule",
      "description",
      "status"
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        item[field] = req.body[field] || null;
      }
    });

    if (req.body.classCode !== undefined || req.body.code !== undefined) {
      item.classCode = req.body.classCode || req.body.code || null;
    }

    if (Array.isArray(req.body.studentIds)) {
      item.studentIds = req.body.studentIds;
    }

if (Array.isArray(req.body.materials)) {
  item.materials = req.body.materials;
}

if (req.file) {
  item.coverImage = await uploadClassCover(req.file);
}

if (req.body.coverImage !== undefined && !req.file) {
  item.coverImage = req.body.coverImage || null;
}

await item.save();

    const newTeacherId = item.teacherId ? String(item.teacherId) : null;

    if (oldTeacherId && oldTeacherId !== newTeacherId) {
      await User.findByIdAndUpdate(oldTeacherId, {
        $pull: { assignedClasses: item._id }
      });
    }

    if (newTeacherId) {
      await User.findByIdAndUpdate(newTeacherId, {
        $addToSet: { assignedClasses: item._id }
      });
    }

    const populated = await Class.findById(item._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    res.json(populated);
  } catch (err) {
    console.error("PATCH /api/classes/:id error:", err);
    res.status(500).json({ message: "Failed to update class" });
  }
});

/* ============================================
   DELETE / ARCHIVE CLASS
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await Class.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (!canManageSchool(req.user, item.schoolId)) {
      return res.status(403).json({ message: "Not allowed to delete class" });
    }

    item.status = "archived";
    await item.save();

    if (item.teacherId) {
      await User.findByIdAndUpdate(item.teacherId, {
        $pull: { assignedClasses: item._id }
      });
    }

    res.json({ message: "Class archived" });
  } catch (err) {
    console.error("DELETE /api/classes/:id error:", err);
    res.status(500).json({ message: "Failed to archive class" });
  }
});

module.exports = router;
