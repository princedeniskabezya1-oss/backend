const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const User = require("../models/User");
const Job = require("../models/Job");
const JobInvite = require("../models/JobInvite");
const Notification = require("../models/Notification");

function getCompanyId(user) {
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role === "talent" || req.user.role === "agent") {
      const invites = await JobInvite.find({ candidateId: req.user.id })
        .populate("jobId")
        .populate("employerId", "name companyName profileImage")
        .sort({ createdAt: -1 });

      return res.json(invites);
    }

    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const invites = await JobInvite.find({ employerId: companyId })
      .populate("jobId", "title company")
      .populate("candidateId", "name email profileImage headline skills")
      .sort({ createdAt: -1 });

    res.json(invites);
  } catch (err) {
    console.error("GET INVITES ERROR:", err);
    res.status(500).json({ message: "Failed to load invites" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Only employer team can send invites" });
    }

    const { jobId, candidateId, message = "" } = req.body;

    const job = await Job.findById(jobId);
    if (!job || String(job.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Job not found" });
    }

    const candidate = await User.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    const invite = await JobInvite.findOneAndUpdate(
      { employerId: companyId, jobId, candidateId },
      {
        employerId: companyId,
        jobId,
        candidateId,
        invitedBy: actor._id,
        message,
        status: "sent"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    job.inviteCount = (job.inviteCount || 0) + 1;
    await job.save();

    await Notification.create({
      user: candidate._id,
      type: "job_invite",
      sender: actor._id,
      text: `${actor.name} invited you to apply for ${job.title}`,
      link: `/job-details.html?id=${job._id}`,
      entityType: "job",
      entityId: job._id,
      metadata: { jobId: String(job._id), inviteId: String(invite._id) }
    });

    req.app.get("io").to(String(candidate._id)).emit("job_invite_created", invite);

    res.status(201).json(invite);
  } catch (err) {
    console.error("SEND JOB INVITE ERROR:", err);
    res.status(500).json({ message: "Failed to send invite" });
  }
});

router.patch("/:id/view", auth, async (req, res) => {
  try {
    const invite = await JobInvite.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ message: "Invite not found" });
    }

    if (String(invite.candidateId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    invite.status = "viewed";
    invite.viewedAt = new Date();
    await invite.save();

    res.json(invite);
  } catch (err) {
    console.error("VIEW INVITE ERROR:", err);
    res.status(500).json({ message: "Failed to update invite" });
  }
});

module.exports = router;
