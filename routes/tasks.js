const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const Task = require("../models/Task");
const Notification = require("../models/Notification");

function getCompanyId(user) {
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const companyId = getCompanyId(user);

    if (user.role === "agent") {
      const tasks = await Task.find({ assigneeId: user._id })
        .populate("assigneeId", "name email profileImage")
        .sort({ createdAt: -1 });

      return res.json(tasks);
    }

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const query = { employerId: companyId };
    if (req.query.assigneeId) query.assigneeId = req.query.assigneeId;
    if (req.query.status) query.status = req.query.status;

    const tasks = await Task.find(query)
      .populate("assigneeId", "name email profileImage teamRole department")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("GET TASKS ERROR:", err);
    res.status(500).json({ message: "Failed to load tasks" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Only employer team can create tasks" });
    }

    const assignee = await User.findById(req.body.assigneeId);
    if (!assignee || String(assignee.companyId) !== String(companyId)) {
      return res.status(400).json({ message: "Invalid assignee selected" });
    }

    const task = await Task.create({
      employerId: companyId,
      assigneeId: req.body.assigneeId,
      createdBy: actor._id,
      title: req.body.title,
      description: req.body.description || "",
      priority: req.body.priority || "medium",
      category: req.body.category || "general",
      dueDate: req.body.dueDate || null,
      linkedScheduleId: req.body.linkedScheduleId || null
    });

    await Notification.create({
      user: assignee._id,
      type: "task",
      sender: actor._id,
      text: `A new task was assigned to you: ${task.title}`,
      link: "/agent.html?tab=tasks"
    });

    req.app.get("io").to(String(assignee._id)).emit("task_created", task);

    res.status(201).json(task);
  } catch (err) {
    console.error("CREATE TASK ERROR:", err);
    res.status(500).json({ message: "Failed to create task" });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const companyId = getCompanyId(actor);

    const canManage =
      (companyId && String(task.employerId) === String(companyId)) ||
      String(task.assigneeId) === String(actor._id);

    if (!canManage) {
      return res.status(403).json({ message: "Access denied" });
    }

    const allowed = [
      "title",
      "description",
      "priority",
      "category",
      "dueDate",
      "status",
      "linkedScheduleId"
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        task[field] = req.body[field];
      }
    });

    if (req.body.status === "done") {
      task.completedAt = new Date();
    }

    await task.save();
    req.app.get("io").to(String(task.assigneeId)).emit("task_updated", task);

    res.json(task);
  } catch (err) {
    console.error("UPDATE TASK ERROR:", err);
    res.status(500).json({ message: "Failed to update task" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const task = await Task.findById(req.params.id);
    if (!task || String(task.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Task not found" });
    }

    await Task.findByIdAndDelete(task._id);
    req.app.get("io").to(String(task.assigneeId)).emit("task_deleted", { _id: task._id });

    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

module.exports = router;