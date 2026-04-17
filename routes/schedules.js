const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const Schedule = require("../models/Schedule");
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
    console.error("SCHEDULE NOTIFICATION ERROR:", err);
  }
}

function safeEmit(req, room, event, payload) {
  try {
    const io = req.app.get("io");
    if (io && room) {
      io.to(String(room)).emit(event, payload);
    }
  } catch (err) {
    console.error(`SCHEDULE SOCKET EMIT ERROR [${event}]:`, err);
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
      const items = await Schedule.find({ agentId: user._id })
        .populate("agentId", "name email profileImage")
        .sort({ startDate: 1, startTime: 1, createdAt: -1 });

      return res.json(items);
    }

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const query = { employerId: companyId };
    if (req.query.agentId) query.agentId = req.query.agentId;

    const items = await Schedule.find(query)
      .populate("agentId", "name email profileImage teamRole department role companyId")
      .sort({ startDate: 1, startTime: 1, createdAt: -1 });

    return res.json(items);
  } catch (err) {
    console.error("GET SCHEDULES ERROR:", err);
    return res.status(500).json({ message: "Failed to load schedules" });
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
      return res.status(403).json({ message: "Only employer team can create schedules" });
    }

    const {
      title,
      agentId,
      shiftType,
      locationType,
      startDate,
      endDate,
      startTime,
      endTime,
      recurrence,
      timezone,
      notes
    } = req.body || {};

    if (!safeString(title) || !safeString(agentId) || !safeString(startDate) || !safeString(endDate) || !safeString(startTime) || !safeString(endTime)) {
      return res.status(400).json({
        message: "Title, agent, start date, end date, start time, and end time are required"
      });
    }

    const agent = await User.findById(agentId);
    if (!agent) {
      return res.status(400).json({ message: "Invalid agent selected" });
    }

    if (String(agent.companyId) !== String(companyId)) {
      return res.status(400).json({ message: "Selected agent does not belong to this employer" });
    }

    const schedule = await Schedule.create({
      employerId: companyId,
      agentId: agent._id,
      createdBy: actor._id,
      title: safeString(title),
      shiftType: safeString(shiftType, "custom"),
      locationType: safeString(locationType, "onsite"),
      startDate,
      endDate,
      startTime: safeString(startTime),
      endTime: safeString(endTime),
      recurrence: safeString(recurrence, "once"),
      timezone: safeString(timezone, "Asia/Manila"),
      notes: safeString(notes, "")
    });

    const populatedSchedule = await Schedule.findById(schedule._id)
      .populate("agentId", "name email profileImage teamRole department role companyId");

    await safeCreateNotification({
      user: agent._id,
      type: "schedule",
      sender: actor._id,
      text: `A new schedule was assigned to you: ${schedule.title}`,
      link: "/agent.html?tab=schedule"
    });

    safeEmit(req, agent._id, "schedule_created", populatedSchedule || schedule);
    safeEmit(req, companyId, "company_schedule_created", populatedSchedule || schedule);

    return res.status(201).json(populatedSchedule || schedule);
  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to create schedule"
    });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

    const companyId = getCompanyId(actor);
    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || String(schedule.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    if (req.body.agentId && String(req.body.agentId) !== String(schedule.agentId)) {
      const newAgent = await User.findById(req.body.agentId);
      if (!newAgent || String(newAgent.companyId) !== String(companyId)) {
        return res.status(400).json({ message: "Invalid agent selected" });
      }
      schedule.agentId = newAgent._id;
    }

    const allowed = [
      "title",
      "shiftType",
      "locationType",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "recurrence",
      "timezone",
      "notes",
      "status"
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        schedule[field] = typeof req.body[field] === "string"
          ? req.body[field].trim()
          : req.body[field];
      }
    });

    await schedule.save();

    const populatedSchedule = await Schedule.findById(schedule._id)
      .populate("agentId", "name email profileImage teamRole department role companyId");

    safeEmit(req, schedule.agentId, "schedule_updated", populatedSchedule || schedule);
    safeEmit(req, companyId, "company_schedule_updated", populatedSchedule || schedule);

    return res.json(populatedSchedule || schedule);
  } catch (err) {
    console.error("UPDATE SCHEDULE ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to update schedule"
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

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || String(schedule.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    const deletedPayload = {
      _id: schedule._id,
      agentId: schedule.agentId,
      employerId: schedule.employerId
    };

    await Schedule.findByIdAndDelete(schedule._id);

    safeEmit(req, schedule.agentId, "schedule_deleted", deletedPayload);
    safeEmit(req, companyId, "company_schedule_deleted", deletedPayload);

    return res.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("DELETE SCHEDULE ERROR:", err);
    return res.status(500).json({
      message: err?.message || "Failed to delete schedule"
    });
  }
});

module.exports = router;