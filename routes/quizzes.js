const express = require("express");
const router = express.Router();

const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");

function pick(obj, fields) {
  const out = {};
  fields.forEach((field) => {
    if (obj[field] !== undefined) out[field] = obj[field];
  });
  return out;
}

/* GET /api/quizzes?classId=&moduleId=&lessonId=&schoolId= */
router.get("/", async (req, res) => {
  try {
    const { classId, moduleId, lessonId, schoolId, status } = req.query;

    const query = {};
    if (classId) query.classId = classId;
    if (moduleId) query.moduleId = moduleId;
    if (lessonId) query.lessonId = lessonId;
    if (schoolId) query.schoolId = schoolId;
    if (status) query.status = status;

    const quizzes = await Quiz.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(quizzes);
  } catch (err) {
    console.error("GET quizzes error:", err);
    res.status(500).json({ message: "Failed to load quizzes" });
  }
});

/* POST /api/quizzes */
router.post("/", async (req, res) => {
  try {
    const { schoolId, classId, title } = req.body;

    if (!schoolId || !classId || !title) {
      return res.status(400).json({
        message: "schoolId, classId, and title are required",
      });
    }

    const quiz = await Quiz.create({
      schoolId,
      classId,
      moduleId: req.body.moduleId || null,
      lessonId: req.body.lessonId || null,
      title,
      instructions: req.body.instructions || "",
      questions: Array.isArray(req.body.questions) ? req.body.questions : [],
      passingScore: Number(req.body.passingScore || 70),
      timeLimitMinutes: Number(req.body.timeLimitMinutes || 0),
      attemptsAllowed: Number(req.body.attemptsAllowed || 1),
      status: req.body.status || "draft",
    });

    res.status(201).json(quiz);
  } catch (err) {
    console.error("POST quiz error:", err);
    res.status(500).json({ message: "Failed to create quiz" });
  }
});

/* PATCH /api/quizzes/:id */
router.patch("/:id", async (req, res) => {
  try {
    const updates = pick(req.body, [
      "moduleId",
      "lessonId",
      "title",
      "instructions",
      "questions",
      "passingScore",
      "timeLimitMinutes",
      "attemptsAllowed",
      "status",
    ]);

    const quiz = await Quiz.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    res.json(quiz);
  } catch (err) {
    console.error("PATCH quiz error:", err);
    res.status(500).json({ message: "Failed to update quiz" });
  }
});

/* DELETE /api/quizzes/:id */
router.delete("/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    res.json({ message: "Quiz deleted" });
  } catch (err) {
    console.error("DELETE quiz error:", err);
    res.status(500).json({ message: "Failed to delete quiz" });
  }
});

/* POST /api/quizzes/:id/submit */
router.post("/:id/submit", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const { studentId, answers } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    const submittedAnswers = Array.isArray(answers) ? answers : [];

    let totalPoints = 0;
    let score = 0;

    const gradedAnswers = quiz.questions.map((question) => {
      const submitted = submittedAnswers.find(
        (a) => String(a.questionId) === String(question._id)
      );

      const points = Number(question.points || 1);
      totalPoints += points;

      const submittedAnswer = String(submitted?.answer || "").trim();
      const correctAnswer = String(question.correctAnswer || "").trim();

      const isCorrect =
        question.type === "short_answer"
          ? submittedAnswer.toLowerCase() === correctAnswer.toLowerCase()
          : submittedAnswer === correctAnswer;

      if (isCorrect) score += points;

      return {
        questionId: question._id,
        answer: submittedAnswer,
        isCorrect,
        pointsEarned: isCorrect ? points : 0,
      };
    });

    const percentage = totalPoints
      ? Math.round((score / totalPoints) * 100)
      : 0;

    const submission = await QuizSubmission.create({
      schoolId: quiz.schoolId,
      classId: quiz.classId,
      quizId: quiz._id,
      studentId,
      answers: gradedAnswers,
      score,
      totalPoints,
      percentage,
      passed: percentage >= Number(quiz.passingScore || 70),
      submittedAt: new Date(),
    });

    res.status(201).json(submission);
  } catch (err) {
    console.error("POST quiz submit error:", err);
    res.status(500).json({ message: "Failed to submit quiz" });
  }
});

module.exports = router;
