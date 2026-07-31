const express = require("express");
const router = express.Router();

const QuestionBank = require("../models/QuestionBank");

function pick(obj, fields) {
  const out = {};
  fields.forEach((field) => {
    if (obj[field] !== undefined) out[field] = obj[field];
  });
  return out;
}

/* GET /api/question-bank */
router.get("/", async (req, res) => {
  try {
    const {
      schoolId,
      category,
      difficulty,
      type,
      search,
      archived,
    } = req.query;

    const query = {};

    if (schoolId) query.schoolId = schoolId;
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (type) query.type = type;

    if (archived !== undefined) {
      query.archived = archived === "true";
    }

    if (search) {
      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          question: {
            $regex: search,
            $options: "i",
          },
        },
        {
          tags: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const questions = await QuestionBank.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    res.json(questions);
  } catch (err) {
    console.error("GET question bank error:", err);
    res.status(500).json({
      message: "Failed to load question bank",
    });
  }
});

/* GET /api/question-bank/:id */
router.get("/:id", async (req, res) => {
  try {
    const question = await QuestionBank.findById(
      req.params.id
    ).lean();

    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    res.json(question);
  } catch (err) {
    console.error("GET question error:", err);
    res.status(500).json({
      message: "Failed to load question",
    });
  }
});

/* POST /api/question-bank */
router.post("/", async (req, res) => {
  try {
    const {
      schoolId,
      createdBy,
      title,
      question,
    } = req.body;

    if (
      !schoolId ||
      !createdBy ||
      !title ||
      !question
    ) {
      return res.status(400).json({
        message:
          "schoolId, createdBy, title and question are required",
      });
    }

    const item = await QuestionBank.create({
      schoolId,
      createdBy,
      title,
      question,

      type:
        req.body.type ||
        "multiple_choice",

      options:
        Array.isArray(req.body.options)
          ? req.body.options
          : [],

      explanation:
        req.body.explanation || "",

      points:
        Number(req.body.points || 1),

      difficulty:
        req.body.difficulty || "medium",

      bloom:
        req.body.bloom || "remember",

      category:
        req.body.category || "General",

      tags:
        Array.isArray(req.body.tags)
          ? req.body.tags
          : [],

      attachments:
        Array.isArray(req.body.attachments)
          ? req.body.attachments
          : [],

      aiGenerated:
        Boolean(req.body.aiGenerated),
    });

    res.status(201).json(item);
  } catch (err) {
    console.error("POST question error:", err);
    res.status(500).json({
      message: "Failed to create question",
    });
  }
});

/* PATCH /api/question-bank/:id */
router.patch("/:id", async (req, res) => {
  try {

    const updates = pick(req.body,[
      "title",
      "question",
      "type",
      "options",
      "explanation",
      "points",
      "difficulty",
      "bloom",
      "category",
      "tags",
      "attachments",
      "archived"
    ]);

    updates.updatedAt = new Date();

    const question =
      await QuestionBank.findByIdAndUpdate(
        req.params.id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    res.json(question);

  } catch (err) {

    console.error(
      "PATCH question error:",
      err
    );

    res.status(500).json({
      message:
        "Failed to update question",
    });

  }
});

/* DELETE /api/question-bank/:id */
router.delete("/:id", async (req, res) => {
  try {

    const question =
      await QuestionBank.findByIdAndDelete(
        req.params.id
      );

    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    res.json({
      message: "Question deleted",
    });

  } catch (err) {

    console.error(
      "DELETE question error:",
      err
    );

    res.status(500).json({
      message:
        "Failed to delete question",
    });

  }
});

module.exports = router;
