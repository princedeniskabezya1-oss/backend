const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const SchoolUpdate = require("../models/SchoolUpdate");
const Class = require("../models/Class");

function id(value) {
  return String(value?._id || value || "");
}
function uploadUpdateMedia(file) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "aift_school_updates",
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);

        let mediaType = "file";

        if (result.resource_type === "image") mediaType = "image";
        if (result.resource_type === "video") mediaType = "video";

        resolve({
          mediaUrl: result.secure_url,
          mediaType
        });
      }
    ).end(file.buffer);
  });
}

function getUserSchoolId(user) {
  return (
    user.schoolId ||
    user.linkedSchoolId ||
    user.companyId ||
    user._id
  );
}

function canManageSchoolUpdate(user, schoolId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "school" && id(user._id) === id(schoolId)) return true;
  if (user.role === "teacher" && id(getUserSchoolId(user)) === id(schoolId)) return true;
  return false;
}

function canViewUpdate(user, update) {
  if (!user || !update) return false;

  if (user.role === "admin") return true;

  const userId = id(user._id);
  const schoolId = id(getUserSchoolId(user));

  if (id(update.schoolId) !== schoolId && user.role !== "school") {
    return false;
  }

  if (user.role === "school" && id(user._id) === id(update.schoolId)) {
    return true;
  }

  if (user.role === "teacher") {
    if (["all", "teachers"].includes(update.audience)) return true;
    if (update.teacherIds?.some(t => id(t) === userId)) return true;
  }

  if (["student", "talent"].includes(user.role)) {
    if (["all", "students"].includes(update.audience)) return true;
    if (update.studentIds?.some(s => id(s) === userId)) return true;
  }

  return false;
}

/* ============================================
   GET SCHOOL UPDATES
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

    const schoolId =
      req.query.schoolId ||
      getUserSchoolId(user);

    const query = {
      schoolId,
      status: "active"
    };

    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.type) query.type = req.query.type;

    const updates = await SchoolUpdate.find(query)
      .populate("authorId", "name profileImage role")
      .populate("classId", "title subject classCode")
      .populate("studentIds", "name email profileImage course")
      .populate("teacherIds", "name email profileImage subject")
      .sort({ pinned: -1, createdAt: -1 });

    const filtered = updates.filter(update => canViewUpdate(user, update));

    res.json(filtered);
  } catch (err) {
    console.error("GET /api/school-updates error:", err);
    res.status(500).json({ message: "Failed to load school updates" });
  }
});

/* ============================================
   CREATE SCHOOL UPDATE
============================================ */
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      audience,
      studentIds,
      teacherIds,
      type,
      title,
      message,
      resourceUrl,
      dueDate,
      pinned
    } = req.body;

    const finalSchoolId =
      req.user.role === "school"
        ? req.user._id
        : schoolId || getUserSchoolId(req.user);

    if (!finalSchoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    if (!canManageSchoolUpdate(req.user, finalSchoolId)) {
      return res.status(403).json({ message: "Not allowed to create school update" });
    }

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    if (classId) {
      const classDoc = await Class.findById(classId);
      if (!classDoc) return res.status(404).json({ message: "Class not found" });

      if (id(classDoc.schoolId) !== id(finalSchoolId)) {
        return res.status(403).json({ message: "Class does not belong to this school" });
      }
    }
    let uploadedMedia = null;

if (req.file) {
  uploadedMedia = await uploadUpdateMedia(req.file);
}

    const update = await SchoolUpdate.create({
      schoolId: finalSchoolId,
      authorId: req.user._id,
      classId: classId || null,
      mediaUrl: uploadedMedia?.mediaUrl || req.body.mediaUrl || null,
mediaType: uploadedMedia?.mediaType || req.body.mediaType || null,
      audience: audience || "all",
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      teacherIds: Array.isArray(teacherIds) ? teacherIds : [],
      type: type || "announcement",
      title,
      message,
      resourceUrl: resourceUrl || null,
      dueDate: dueDate || null,
      pinned: !!pinned
    });

    const populated = await SchoolUpdate.findById(update._id)
      .populate("authorId", "name profileImage role")
      .populate("classId", "title subject classCode")
      .populate("studentIds", "name email profileImage course")
      .populate("teacherIds", "name email profileImage subject");

    const io = req.app.get("io");
    if (io) {
      io.to(id(finalSchoolId)).emit("school-update:new", populated);

      if (classId) {
        io.to(id(classId)).emit("school-update:new", populated);
      }

      (studentIds || []).forEach(studentId => {
        io.to(id(studentId)).emit("school-update:new", populated);
      });

      (teacherIds || []).forEach(teacherId => {
        io.to(id(teacherId)).emit("school-update:new", populated);
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/school-updates error:", err);
    res.status(500).json({ message: err.message || "Failed to create school update" });
  }
});

/* ============================================
   UPDATE SCHOOL UPDATE
============================================ */
router.patch("/:id", auth, upload.single("media"), async (req, res) => {
  try {
    const update = await SchoolUpdate.findById(req.params.id);

    if (!update) {
      return res.status(404).json({ message: "School update not found" });
    }

    if (!canManageSchoolUpdate(req.user, update.schoolId)) {
      return res.status(403).json({ message: "Not allowed to update school update" });
    }

    const fields = [
      "classId",
      "audience",
      "type",
      "title",
      "message",
      "resourceUrl",
      "dueDate",
      "pinned",
      "status"
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field] || null;
      }
    });

    if (Array.isArray(req.body.studentIds)) {
      update.studentIds = req.body.studentIds;
    }

if (Array.isArray(req.body.teacherIds)) {
  update.teacherIds = req.body.teacherIds;
}

if (req.file) {
  const uploadedMedia = await uploadUpdateMedia(req.file);
  update.mediaUrl = uploadedMedia.mediaUrl;
  update.mediaType = uploadedMedia.mediaType;
}

if (req.body.mediaUrl !== undefined && !req.file) {
  update.mediaUrl = req.body.mediaUrl || null;
  update.mediaType = req.body.mediaType || null;
}

await update.save();

    const populated = await SchoolUpdate.findById(update._id)
      .populate("authorId", "name profileImage role")
      .populate("classId", "title subject classCode")
      .populate("studentIds", "name email profileImage course")
      .populate("teacherIds", "name email profileImage subject");

    res.json(populated);
  } catch (err) {
    console.error("PATCH /api/school-updates/:id error:", err);
    res.status(500).json({ message: "Failed to update school update" });
  }
});

/* ============================================
   DELETE / ARCHIVE SCHOOL UPDATE
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const update = await SchoolUpdate.findById(req.params.id);

    if (!update) {
      return res.status(404).json({ message: "School update not found" });
    }

    if (!canManageSchoolUpdate(req.user, update.schoolId)) {
      return res.status(403).json({ message: "Not allowed to remove school update" });
    }

    update.status = "archived";
    await update.save();

    res.json({ message: "School update archived" });
  } catch (err) {
    console.error("DELETE /api/school-updates/:id error:", err);
    res.status(500).json({ message: "Failed to archive school update" });
  }
});

/* ============================================
   MARK AS SEEN
============================================ */
router.patch("/:id/seen", auth, async (req, res) => {
  try {
    const update = await SchoolUpdate.findById(req.params.id);

    if (!update) {
      return res.status(404).json({ message: "School update not found" });
    }

    if (!canViewUpdate(req.user, update)) {
      return res.status(403).json({ message: "Not allowed to view this update" });
    }

    const alreadySeen = update.seenBy.some(item =>
      id(item.userId) === id(req.user._id)
    );

    if (!alreadySeen) {
      update.seenBy.push({
        userId: req.user._id,
        seenAt: new Date()
      });

      await update.save();
    }

    res.json({ message: "Marked as seen" });
  } catch (err) {
    console.error("PATCH /api/school-updates/:id/seen error:", err);
    res.status(500).json({ message: "Failed to mark update as seen" });
  }
});

module.exports = router;
