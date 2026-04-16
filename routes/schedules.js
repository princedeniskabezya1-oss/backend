const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const Schedule = require("../models/Schedule");
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
      const items = await Schedule.find({ agentId: user._id })
        .populate("agentId", "name email profileImage")
        .sort({ startDate: 1, startTime: 1 });

      return res.json(items);
    }

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const query = { employerId: companyId };
    if (req.query.agentId) query.agentId = req.query.agentId;

    const items = await Schedule.find(query)
      .populate("agentId", "name email profileImage teamRole department")
      .sort({ startDate: 1, startTime: 1 });

    res.json(items);
  } catch (err) {
    console.error("GET SCHEDULES ERROR:", err);
    res.status(500).json({ message: "Failed to load schedules" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Only employer team can create schedules" });
    }

    const agent = await User.findById(req.body.agentId);
    if (!agent || String(agent.companyId) !== String(companyId)) {
      return res.status(400).json({ message: "Invalid agent selected" });
    }

    const schedule = await Schedule.create({
      employerId: companyId,
      agentId: req.body.agentId,
      createdBy: actor._id,
      title: req.body.title,
      shiftType: req.body.shiftType || "custom",
      locationType: req.body.locationType || "onsite",
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      recurrence: req.body.recurrence || "once",
      timezone: req.body.timezone || "Asia/Manila",
      notes: req.body.notes || ""
    });

    await Notification.create({
      user: agent._id,
      type: "schedule",
      sender: actor._id,
      text: `A new schedule was assigned to you: ${schedule.title}`,
      link: "/agent.html?tab=schedule"
    });

    req.app.get("io").to(String(agent._id)).emit("schedule_created", schedule);

    res.status(201).json(schedule);
  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "Failed to create schedule" });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || String(schedule.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Schedule not found" });
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
        schedule[field] = req.body[field];
      }
    });

    await schedule.save();
    req.app.get("io").to(String(schedule.agentId)).emit("schedule_updated", schedule);

    res.json(schedule);
  } catch (err) {
    console.error("UPDATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "Failed to update schedule" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || String(schedule.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    await Schedule.findByIdAndDelete(schedule._id);
    req.app.get("io").to(String(schedule.agentId)).emit("schedule_deleted", { _id: schedule._id });

    res.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    console.error("DELETE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "Failed to delete schedule" });
  }
});

module.exports = router;