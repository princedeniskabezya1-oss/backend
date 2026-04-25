const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const WorkTask = require("../models/WorkTask");
const User = require("../models/User");

function getCompanyId(user) {
  if (!user) return null;
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

async function getAuthedUser(req) {
  const id = req.user?.id || req.user?._id;
  return User.findById(id);
}

function normalizeStatus(status) {
  const allowed = ["todo", "in_progress", "blocked", "done", "cancelled"];
  return allowed.includes(status) ? status : "todo";
}

function normalizePriority(priority) {
  const allowed = ["low", "medium", "high", "urgent"];
  return allowed.includes(priority) ? priority : "medium";
}

/**
 * Employer: all company tasks
 * Agent: only assigned tasks
 */
router.get("/", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    const companyId = getCompanyId(user);

    if (!companyId) return res.status(403).json({ msg: "No company access." });

    const query = { companyId };

    if (user.role === "agent") {
      query.assigneeId = user._id;
    }

    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.category = req.query.category;
    if (req.query.workflow) query.workflow = req.query.workflow;
    if (req.query.assigneeId && user.role === "employer") query.assigneeId = req.query.assigneeId;

    const tasks = await WorkTask.find(query)
      .populate("assigneeId", "name email role profileImage")
      .populate("createdBy", "name email role")
      .populate("candidateId", "name email profileImage headline")
      .populate("jobId", "title company location")
      .populate("scheduleId", "title startDate endDate startTime endTime shiftType")
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(Number(req.query.limit || 300));

    res.json(tasks);
  } catch (err) {
    console.error("GET /api/tasks failed:", err);
    res.status(500).json({ msg: "Failed to load tasks." });
  }
});

/**
 * Employer creates task.
 */
router.post("/", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    const companyId = getCompanyId(user);

    if (!companyId || user.role !== "employer") {
      return res.status(403).json({ msg: "Only employers can create tasks." });
    }

    const payload = {
      title: req.body.title,
      description: req.body.description || "",
      companyId,
      createdBy: user._id,
      assigneeId: req.body.assigneeId || req.body.agentId,
      jobId: req.body.jobId || null,
      applicationId: req.body.applicationId || null,
      candidateId: req.body.candidateId || null,
      scheduleId: req.body.scheduleId || null,
      category: req.body.category || "custom",
      workflow: req.body.workflow || "hiring",
      priority: normalizePriority(req.body.priority),
      status: normalizeStatus(req.body.status),
      dueDate: req.body.dueDate || null,
      checklist: Array.isArray(req.body.checklist) ? req.body.checklist : [],
      tags: Array.isArray(req.body.tags) ? req.body.tags : []
    };

    if (!payload.title || !payload.assigneeId) {
      return res.status(400).json({ msg: "Task title and assignee are required." });
    }

    const task = await WorkTask.create(payload);

    req.app.get("io")?.to(String(companyId)).emit("task:created", task);
    req.app.get("io")?.to(String(payload.assigneeId)).emit("task:assigned", task);

    res.status(201).json(task);
  } catch (err) {
    console.error("POST /api/tasks failed:", err);
    res.status(500).json({ msg: "Failed to create task." });
  }
});

/**
 * Employer or assigned agent updates task.
 */
router.patch("/:id", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    const companyId = getCompanyId(user);

    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found." });

    const isEmployerOwner = String(task.companyId) === String(companyId) && user.role === "employer";
    const isAssignee = String(task.assigneeId) === String(user._id);

    if (!isEmployerOwner && !isAssignee) {
      return res.status(403).json({ msg: "No task access." });
    }

    const allowed = [
      "title",
      "description",
      "priority",
      "status",
      "dueDate",
      "category",
      "workflow",
      "outcome",
      "score",
      "scheduleId",
      "candidateId",
      "applicationId",
      "jobId",
      "tags"
    ];

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) task[key] = req.body[key];
    });

    if (req.body.status === "in_progress" && !task.startedAt) task.startedAt = new Date();
    if (req.body.status === "done" && !task.completedAt) task.completedAt = new Date();

    if (Array.isArray(req.body.checklist)) task.checklist = req.body.checklist;

    if (req.body.note) {
      task.notes.push({ body: req.body.note, authorId: user._id });
    }

    await task.save();

    req.app.get("io")?.to(String(task.companyId)).emit("task:updated", task);
    req.app.get("io")?.to(String(task.assigneeId)).emit("task:updated", task);

    res.json(task);
  } catch (err) {
    console.error("PATCH /api/tasks/:id failed:", err);
    res.status(500).json({ msg: "Failed to update task." });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    const companyId = getCompanyId(user);

    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: "Task not found." });

    if (String(task.companyId) !== String(companyId) || user.role !== "employer") {
      return res.status(403).json({ msg: "Only the employer can delete this task." });
    }

    await task.deleteOne();

    req.app.get("io")?.to(String(companyId)).emit("task:deleted", { id: req.params.id });

    res.json({ msg: "Task deleted." });
  } catch (err) {
    console.error("DELETE /api/tasks/:id failed:", err);
    res.status(500).json({ msg: "Failed to delete task." });
  }
});

router.get("/analytics/summary", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    const companyId = getCompanyId(user);
    if (!companyId) return res.status(403).json({ msg: "No company access." });

    const baseQuery = user.role === "agent" ? { companyId, assigneeId: user._id } : { companyId };

    const tasks = await WorkTask.find(baseQuery).lean();

    const byStatus = {};
    const byCategory = {};
    const byWorkflow = {};
    const byAgent = {};

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byCategory[task.category] = (byCategory[task.category] || 0) + 1;
      byWorkflow[task.workflow] = (byWorkflow[task.workflow] || 0) + 1;
      const agent = String(task.assigneeId);
      byAgent[agent] = byAgent[agent] || { total: 0, done: 0, in_progress: 0, blocked: 0 };
      byAgent[agent].total += 1;
      if (task.status === "done") byAgent[agent].done += 1;
      if (task.status === "in_progress") byAgent[agent].in_progress += 1;
      if (task.status === "blocked") byAgent[agent].blocked += 1;
    }

    const total = tasks.length;
    const done = byStatus.done || 0;

    res.json({
      total,
      done,
      completionRate: total ? Math.round((done / total) * 100) : 0,
      byStatus,
      byCategory,
      byWorkflow,
      byAgent
    });
  } catch (err) {
    console.error("GET /api/tasks/analytics/summary failed:", err);
    res.status(500).json({ msg: "Failed to load task analytics." });
  }
});

module.exports = router;
