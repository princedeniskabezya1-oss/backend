const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const Task = require("../models/Task");
const Notification = require("../models/Notification");

function getCompanyId(user) {
  if (!user) return null;
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

function safeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

async function safeCreateNotification(payload) {
  try {
    await Notification.create(payload);
  } catch (err) {
    console.error("TASK NOTIFICATION ERROR:", err);
  }
}

function safeEmit(req, room, event, payload) {
  try {
    const io = req.app.get("io");
    if (io && room) {
      io.to(String(room)).emit(event, payload);
    }
  } catch (err) {
    console.error(`TASK SOCKET EMIT ERROR [${event}]:`, err);
  }
}

router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

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
      .populate("assigneeId", "name email profileImage teamRole department role companyId")
      .sort({ createdAt: -1 });

    return res.json(tasks);
  } catch (err) {
    console.error("GET TASKS ERROR:", err);
    return res.status(500).json({ message: "Failed to load tasks" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

    const companyId = getCompanyId(actor);
    if (!companyId) {
      return res.status(403).json({ message: "Only employer team can create tasks" });
    }

    const {
      title,
      assigneeId,
      priority,
      category,
      dueDate,
      description,
      linkedScheduleId
    } = req.body || {};

    if (!safeString(title) || !safeString(assigneeId)) {
      return res.status(400).json({ message: "Task title and assignee are required" });
    }

    const assignee = await User.findById(assigneeId);
    if (!assignee) {
      return res.status(400).json({ message: "Invalid assignee selected" });
    }

    if (String(assignee.companyId) !== String(companyId)) {
      return res.status(400).json({ message: "Selected assignee does not belong to this employer" });
    }

    const task = await Task.create({
      employerId: companyId,
      assigneeId: assignee._id,
      createdBy: actor._id,
      title: safeString(title),
      description: safeString(description, ""),
      priority: safeString(priority, "medium"),
      category: safeString(category, "general"),
      dueDate: dueDate || null,
      linkedScheduleId: linkedScheduleId || null
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assigneeId", "name email profileImage teamRole department role companyId");

    await safeCreateNotification({
      user: assignee._id,
      type: "task",
      sender: actor._id,
      text: `A new task was assigned to you: ${task.title}`,
      link: "/agent.html?tab=tasks"
    });

    safeEmit(req, assignee._id, "task_created", populatedTask || task);
    safeEmit(req, companyId, "company_task_created", populatedTask || task);

    return res.status(201).json(populatedTask || task);
  } catch (err) {
    console.error("CREATE TASK ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to create task"
    });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

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

    if (req.body.assigneeId && String(req.body.assigneeId) !== String(task.assigneeId)) {
      if (!companyId || String(task.employerId) !== String(companyId)) {
        return res.status(403).json({ message: "Only employer team can reassign tasks" });
      }

      const newAssignee = await User.findById(req.body.assigneeId);
      if (!newAssignee || String(newAssignee.companyId) !== String(companyId)) {
        return res.status(400).json({ message: "Invalid assignee selected" });
      }

      task.assigneeId = newAssignee._id;
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
        task[field] = typeof req.body[field] === "string"
          ? req.body[field].trim()
          : req.body[field];
      }
    });

    if (req.body.status === "done") {
      task.completedAt = new Date();
    } else if (req.body.status && req.body.status !== "done") {
      task.completedAt = null;
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assigneeId", "name email profileImage teamRole department role companyId");

    safeEmit(req, task.assigneeId, "task_updated", populatedTask || task);
    if (task.employerId) {
      safeEmit(req, task.employerId, "company_task_updated", populatedTask || task);
    }

    return res.json(populatedTask || task);
  } catch (err) {
    console.error("UPDATE TASK ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to update task"
    });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

    const companyId = getCompanyId(actor);
    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const task = await Task.findById(req.params.id);
    if (!task || String(task.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Task not found" });
    }

    const deletedPayload = {
      _id: task._id,
      assigneeId: task.assigneeId,
      employerId: task.employerId
    };

    await Task.findByIdAndDelete(task._id);

    safeEmit(req, task.assigneeId, "task_deleted", deletedPayload);
    safeEmit(req, companyId, "company_task_deleted", deletedPayload);

    return res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to delete task"
    });
  }
});

module.exports = router;