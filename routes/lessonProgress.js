const express = require("express");
const router = express.Router();

const LessonProgress = require("../models/LessonProgress");

/* GET /api/lesson-progress?classId=&studentId=&lessonId= */
router.get("/", async (req, res) => {
  try {
    const { schoolId, classId, studentId, lessonId } = req.query;

    const query = {};
    if (schoolId) query.schoolId = schoolId;
    if (classId) query.classId = classId;
    if (studentId) query.studentId = studentId;
    if (lessonId) query.lessonId = lessonId;

    const progress = await LessonProgress.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    res.json(progress);
  } catch (err) {
    console.error("GET lesson progress error:", err);
    res.status(500).json({ message: "Failed to load lesson progress" });
  }
});

/* PATCH /api/lesson-progress */
router.patch("/", async (req, res) => {
  try {
    const { schoolId, classId, lessonId, studentId } = req.body;

    if (!schoolId || !classId || !lessonId || !studentId) {
      return res.status(400).json({
        message: "schoolId, classId, lessonId, and studentId are required",
      });
    }

    const status = req.body.status || "in_progress";
    const progressPercent = Number(req.body.progressPercent || 0);

    const update = {
      schoolId,
      classId,
      lessonId,
      studentId,
      status,
      progressPercent,
      lastOpenedAt: new Date(),
    };

    if (status === "completed" || progressPercent >= 100) {
      update.status = "completed";
      update.progressPercent = 100;
      update.completedAt = new Date();
    }

    const progress = await LessonProgress.findOneAndUpdate(
      { studentId, lessonId },
      update,
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json(progress);
  } catch (err) {
    console.error("PATCH lesson progress error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "Lesson progress already exists for this student",
      });
    }

    res.status(500).json({ message: "Failed to update lesson progress" });
  }
});

module.exports = router;
