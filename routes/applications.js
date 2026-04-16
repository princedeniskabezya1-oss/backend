const express = require("express");
const router = express.Router();

const Application = require("../models/Application");
const Job = require("../models/Job");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

function getCompanyId(user) {
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

async function syncJobAnalytics(jobId) {
  const job = await Job.findById(jobId);
  if (!job) return null;

  const applications = await Application.find({ jobId });

  job.shortlistCount = applications.filter(a => a.status === "shortlisted").length;
  job.interviewCount = applications.filter(a => a.status === "interview").length;
  job.offerCount = applications.filter(a => a.status === "offer").length;
  job.hiredCount = applications.filter(a => a.status === "hired").length;

  await job.save();
  return job;
}

router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "talent" && req.user.role !== "agent") {
      return res.status(403).json({ message: "Only job seekers can apply" });
    }

    const { jobId, coverLetter } = req.body;
    const job = await Job.findById(jobId);

    if (!job || job.status !== "active") {
      return res.status(404).json({ message: "Job not found or unavailable" });
    }

    const existing = await Application.findOne({
      jobId,
      applicantId: req.user._id
    });

    if (existing) {
      return res.status(400).json({ message: "You already applied to this job" });
    }

    const application = await Application.create({
      jobId,
      employerId: job.employerId,
      applicantId: req.user._id,
      name: req.user.name,
      email: req.user.email,
      coverLetter,
      cvUrl: req.user.cvUrl || null,
      statusHistory: [
        {
          status: "new",
          changedBy: req.user._id
        }
      ]
    });

    await Notification.create({
      user: job.employerId,
      type: "application",
      sender: req.user._id,
      text: `${req.user.name} applied for ${job.title}`,
      link: `/employer.html?tab=pipeline`
    });

    req.app.get("io").to(String(job.employerId)).emit("application_created", application);

    res.status(201).json(application);
  } catch (err) {
    console.error("APPLICATION CREATE ERROR:", err);
    res.status(400).json({ message: "Failed to submit application" });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const apps = await Application.find()
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl skills");
      return res.json(apps);
    }

    if (req.user.role === "employer") {
      const apps = await Application.find({ employerId: req.user._id })
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl skills education experience expectedSalary");
      return res.json(apps);
    }

    if (req.user.companyId) {
      const apps = await Application.find({ employerId: req.user.companyId })
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl skills education experience expectedSalary");
      return res.json(apps);
    }

    if (req.user.role === "talent" || req.user.role === "agent") {
      const apps = await Application.find({ applicantId: req.user._id })
        .populate("jobId")
        .populate("employerId", "name companyName profileImage");
      return res.json(apps);
    }

    res.json([]);
  } catch (err) {
    console.error("APPLICATION LIST ERROR:", err);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

router.patch("/:id/status", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);
    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const application = await Application.findById(req.params.id)
      .populate("jobId", "title employerId");

    if (!application || String(application.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Application not found" });
    }

    const allowed = ["new", "shortlisted", "interview", "offer", "hired", "rejected"];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    application.status = req.body.status;
    if (req.body.notes !== undefined) {
      application.notes = req.body.notes;
    }

    application.viewedByEmployerAt = application.viewedByEmployerAt || new Date();
    application.statusHistory.push({
      status: req.body.status,
      changedAt: new Date(),
      changedBy: actor._id
    });

    await application.save();
    await syncJobAnalytics(application.jobId._id);

    await Notification.create({
      user: application.applicantId,
      type: "application_status",
      sender: actor._id,
      text: `Your application for ${application.jobId.title} is now ${req.body.status}`,
      link: "/talent.html?tab=applications"
    });

    req.app.get("io").to(String(application.applicantId)).emit("application_status_updated", {
      applicationId: application._id,
      status: application.status
    });

    res.json(application);
  } catch (err) {
    console.error("APPLICATION STATUS ERROR:", err);
    res.status(500).json({ message: "Failed to update application status" });
  }
});

module.exports = router;