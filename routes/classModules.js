const express = require("express");
const router = express.Router();

const ClassModule = require("../models/ClassModule");

function pick(obj, fields) {
  const out = {};
  fields.forEach((field) => {
    if (obj[field] !== undefined) out[field] = obj[field];
  });
  return out;
}

/* GET /api/class-modules?classId=&schoolId= */
router.get("/", async (req, res) => {
  try {
    const { classId, schoolId, status } = req.query;

    const query = {};
    if (classId) query.classId = classId;
    if (schoolId) query.schoolId = schoolId;
    if (status) query.status = status;

    const modules = await ClassModule.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json(modules);
  } catch (err) {
    console.error("GET class modules error:", err);
    res.status(500).json({ message: "Failed to load class modules" });
  }
});

/* POST /api/class-modules */
router.post("/", async (req, res) => {
  try {
    const { schoolId, classId, title } = req.body;

    if (!schoolId || !classId || !title) {
      return res.status(400).json({
        message: "schoolId, classId, and title are required",
      });
    }

    const module = await ClassModule.create({
      schoolId,
      classId,
      title,
      description: req.body.description || "",
      order: Number(req.body.order || 0),
      status: req.body.status || "draft",
      isLocked: !!req.body.isLocked,
    });

    res.status(201).json(module);
  } catch (err) {
    console.error("POST class module error:", err);
    res.status(500).json({ message: "Failed to create class module" });
  }
});

/* PATCH /api/class-modules/:id */
router.patch("/:id", async (req, res) => {
  try {
    const updates = pick(req.body, [
      "title",
      "description",
      "order",
      "status",
      "isLocked",
    ]);

    const module = await ClassModule.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!module) {
      return res.status(404).json({ message: "Class module not found" });
    }

    res.json(module);
  } catch (err) {
    console.error("PATCH class module error:", err);
    res.status(500).json({ message: "Failed to update class module" });
  }
});

/* DELETE /api/class-modules/:id */
router.delete("/:id", async (req, res) => {
  try {
    const module = await ClassModule.findByIdAndDelete(req.params.id);

    if (!module) {
      return res.status(404).json({ message: "Class module not found" });
    }

    res.json({ message: "Class module deleted" });
  } catch (err) {
    console.error("DELETE class module error:", err);
    res.status(500).json({ message: "Failed to delete class module" });
  }
});

module.exports = router;
