const express = require("express");
const router = express.Router();

const ClassLesson = require("../models/ClassLesson");

function pick(obj, fields) {
  const out = {};
  fields.forEach((field) => {
    if (obj[field] !== undefined) out[field] = obj[field];
  });
  return out;
}

/* GET /api/class-lessons?classId=&moduleId=&schoolId= */
router.get("/", async (req, res) => {
  try {
    const { classId, moduleId, schoolId, status } = req.query;

    const query = {};
    if (classId) query.classId = classId;
    if (moduleId) query.moduleId = moduleId;
    if (schoolId) query.schoolId = schoolId;
    if (status) query.status = status;

    const lessons = await ClassLesson.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json(lessons);
  } catch (err) {
    console.error("GET class lessons error:", err);
    res.status(500).json({ message: "Failed to load class lessons" });
  }
});

/* POST /api/class-lessons */
router.post("/", async (req, res) => {
  try {
    const { schoolId, classId, title } = req.body;

    if (!schoolId || !classId || !title) {
      return res.status(400).json({
        message: "schoolId, classId, and title are required",
      });
    }

    const lesson = await ClassLesson.create({
      schoolId,
      classId,
      moduleId: req.body.moduleId || null,
      title,
      summary: req.body.summary || "",
      content: req.body.content || "",
      videoUrl: req.body.videoUrl || "",
      coverUrl: req.body.coverUrl || "",
      resources: Array.isArray(req.body.resources) ? req.body.resources : [],
      order: Number(req.body.order || 0),
      durationMinutes: Number(req.body.durationMinutes || 0),
      status: req.body.status || "draft",
      previewEnabled: !!req.body.previewEnabled,
    });

    res.status(201).json(lesson);
  } catch (err) {
    console.error("POST class lesson error:", err);
    res.status(500).json({ message: "Failed to create class lesson" });
  }
});

/* PATCH /api/class-lessons/:id */
router.patch("/:id", async (req, res) => {
  try {
    const updates = pick(req.body, [
      "moduleId",
      "title",
      "summary",
      "content",
      "videoUrl",
      "coverUrl",
      "resources",
      "order",
      "durationMinutes",
      "status",
      "previewEnabled",
    ]);

    const lesson = await ClassLesson.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!lesson) {
      return res.status(404).json({ message: "Class lesson not found" });
    }

    res.json(lesson);
  } catch (err) {
    console.error("PATCH class lesson error:", err);
    res.status(500).json({ message: "Failed to update class lesson" });
  }
});

/* DELETE /api/class-lessons/:id */
router.delete("/:id", async (req, res) => {
  try {
    const lesson = await ClassLesson.findByIdAndDelete(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: "Class lesson not found" });
    }

    res.json({ message: "Class lesson deleted" });
  } catch (err) {
    console.error("DELETE class lesson error:", err);
    res.status(500).json({ message: "Failed to delete class lesson" });
  }
});

module.exports = router;
