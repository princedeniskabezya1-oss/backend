const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const TaskTemplate = require("../models/TaskTemplate");
const User = require("../models/User");

router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    const companyId = user.role === "employer" ? user._id : user.companyId;

    const query = {
      $or: [
        { isSystem: true },
        { companyId }
      ]
    };

    if (req.query.workflow) query.workflow = req.query.workflow;
    if (req.query.category) query.category = req.query.category;

    const templates = await TaskTemplate.find(query).sort({ workflow: 1, category: 1, name: 1 });
    res.json(templates);
  } catch (err) {
    console.error("GET /api/task-templates failed:", err);
    res.status(500).json({ msg: "Failed to load task templates." });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id);
    if (!user || user.role !== "employer") {
      return res.status(403).json({ msg: "Only employers can create templates." });
    }

    const template = await TaskTemplate.create({
      name: req.body.name,
      category: req.body.category || "custom",
      workflow: req.body.workflow || "custom",
      description: req.body.description || "",
      defaultPriority: req.body.defaultPriority || "medium",
      checklist: Array.isArray(req.body.checklist) ? req.body.checklist : [],
      isSystem: false,
      companyId: user._id
    });

    res.status(201).json(template);
  } catch (err) {
    console.error("POST /api/task-templates failed:", err);
    res.status(500).json({ msg: "Failed to create task template." });
  }
});

module.exports = router;
