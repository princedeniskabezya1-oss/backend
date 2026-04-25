const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Schedule = require("../models/Schedule");
const AgentSession = require("../models/AgentSession");

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

async function findCurrentSchedule(agentId, companyId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  return Schedule.findOne({
    companyId,
    agentId,
    $or: [
      { startDate: today },
      { date: today },
      { scheduleDate: today }
    ]
  }).sort({ startTime: 1 });
}

/**
 * Agent clocks in. Creates one open session only.
 */
router.post("/clock-in", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user || user.role !== "agent") {
      return res.status(403).json({ msg: "Only agents can clock in." });
    }

    const companyId = getCompanyId(user);
    if (!companyId) return res.status(400).json({ msg: "Agent has no companyId." });

    const existing = await AgentSession.findOne({
      agentId: user._id,
      companyId,
      logoutTime: null
    });

    if (existing) return res.json(existing);

    const schedule = req.body.scheduleId
      ? await Schedule.findById(req.body.scheduleId)
      : await findCurrentSchedule(user._id, companyId);

    const session = await AgentSession.create({
      agentId: user._id,
      companyId,
      scheduleId: schedule?._id || null,
      loginTime: new Date(),
      status: "online",
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      device: req.body.device || ""
    });

    const populated = await AgentSession.findById(session._id)
      .populate("agentId", "name email profileImage role")
      .populate("scheduleId", "title startDate endDate startTime endTime shiftType");

    req.app.get("io")?.to(String(companyId)).emit("agent:clock-in", populated);
    req.app.get("io")?.to(String(user._id)).emit("agent:clock-in", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/agent-sessions/clock-in failed:", err);
    res.status(500).json({ msg: "Failed to clock in." });
  }
});

/**
 * Agent clocks out. Closes latest open session.
 */
router.post("/clock-out", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user || user.role !== "agent") {
      return res.status(403).json({ msg: "Only agents can clock out." });
    }

    const companyId = getCompanyId(user);

    const session = await AgentSession.findOne({
      agentId: user._id,
      companyId,
      logoutTime: null
    }).sort({ loginTime: -1 });

    if (!session) return res.status(404).json({ msg: "No active session found." });

    session.logoutTime = new Date();
    session.status = "offline";
    await session.save();

    const populated = await AgentSession.findById(session._id)
      .populate("agentId", "name email profileImage role")
      .populate("scheduleId", "title startDate endDate startTime endTime shiftType");

    req.app.get("io")?.to(String(companyId)).emit("agent:clock-out", populated);
    req.app.get("io")?.to(String(user._id)).emit("agent:clock-out", populated);

    res.json(populated);
  } catch (err) {
    console.error("POST /api/agent-sessions/clock-out failed:", err);
    res.status(500).json({ msg: "Failed to clock out." });
  }
});

/**
 * Agent sees own records.
 */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user || user.role !== "agent") {
      return res.status(403).json({ msg: "Only agents can view this page." });
    }

    const records = await AgentSession.find({ agentId: user._id })
      .populate("agentId", "name email profileImage role")
      .populate("scheduleId", "title startDate endDate startTime endTime shiftType")
      .sort({ loginTime: -1 })
      .limit(Number(req.query.limit || 100));

    res.json(records);
  } catch (err) {
    console.error("GET /api/agent-sessions/me failed:", err);
    res.status(500).json({ msg: "Failed to load agent sessions." });
  }
});

/**
 * Employer sees company agent activity.
 */
router.get("/company", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user || user.role !== "employer") {
      return res.status(403).json({ msg: "Only employers can view company sessions." });
    }

    const records = await AgentSession.find({ companyId: user._id })
      .populate("agentId", "name email profileImage role")
      .populate("scheduleId", "title startDate endDate startTime endTime shiftType")
      .sort({ loginTime: -1 })
      .limit(Number(req.query.limit || 200));

    res.json(records);
  } catch (err) {
    console.error("GET /api/agent-sessions/company failed:", err);
    res.status(500).json({ msg: "Failed to load company sessions." });
  }
});

router.get("/analytics/company", auth, async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user || user.role !== "employer") {
      return res.status(403).json({ msg: "Only employers can view company session analytics." });
    }

    const since = new Date();
    since.setDate(since.getDate() - Number(req.query.days || 7));

    const records = await AgentSession.find({
      companyId: user._id,
      loginTime: { $gte: since }
    }).lean();

    const byDay = {};
    let onlineNow = 0;
    let totalMinutes = 0;

    for (const r of records) {
      const key = new Date(r.loginTime).toISOString().slice(0, 10);
      byDay[key] = byDay[key] || { sessions: 0, minutes: 0 };
      byDay[key].sessions += 1;

      if (!r.logoutTime) onlineNow += 1;

      const end = r.logoutTime ? new Date(r.logoutTime).getTime() : Date.now();
      const start = new Date(r.loginTime).getTime();
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      byDay[key].minutes += minutes;
      totalMinutes += minutes;
    }

    res.json({
      totalSessions: records.length,
      onlineNow,
      totalMinutes,
      byDay
    });
  } catch (err) {
    console.error("GET /api/agent-sessions/analytics/company failed:", err);
    res.status(500).json({ msg: "Failed to load session analytics." });
  }
});

module.exports = router;
