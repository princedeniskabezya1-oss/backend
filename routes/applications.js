const express = require("express");
const router = express.Router();
const Application = require("../models/Application");
const Job = require("../models/Job");
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "talent") {
      return res.status(403).json({
        message: "Only job seekers can apply"
      });
    }

    const { jobId, coverLetter } = req.body;

    const existing = await Application.findOne({
      jobId,
      applicantId: req.user._id
    });

    if (existing) {
      return res.status(400).json({
        message: "You already applied to this job"
      });
    }

    const application = new Application({
      jobId,
      applicantId: req.user._id,
      name: req.user.name,
      email: req.user.email,
      coverLetter,
      cvUrl: req.user.cvUrl || null
    });

    const saved = await application.save();
    res.status(201).json(saved);

  } catch (err) {
    console.error("APPLICATION CREATE ERROR:", err);
    res.status(400).json({ message: "Failed to submit application" });
  }
});

/*
================================================
GET /api/applications
Employer: own applications only
Talent: own applications only
Admin: all
================================================
*/
router.get("/", auth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const apps = await Application.find()
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl");
      return res.json(apps);
    }

    if (req.user.role === "employer") {
      const jobs = await Job.find({ employerId: req.user._id }).select("_id");
      const jobIds = jobs.map(job => job._id);

      const apps = await Application.find({
        jobId: { $in: jobIds }
      })
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl skills");

      return res.json(apps);
    }

    if (req.user.role === "talent") {
      const apps = await Application.find({
        applicantId: req.user._id
      })
        .populate("jobId")
        .populate("applicantId", "name email profileImage headline role cvUrl");

      return res.json(apps);
    }

    return res.status(403).json({ message: "Access denied" });

  } catch (err) {
    console.error("APPLICATION GET ERROR:", err);
    res.status(500).json({ message: "Failed to load applications" });
  }
});

/*
================================================
GET /api/applications/job/:jobId
Employer views applicants per job
================================================
*/
router.get("/job/:jobId", auth, async (req, res) => {
  try {
    if (req.user.role !== "employer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (String(job.employerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed to view applicants for this job" });
    }

    const apps = await Application.find({
      jobId: req.params.jobId
    })
      .populate("applicantId", "name email profileImage headline role cvUrl skills")
      .sort({ createdAt: -1 });

    res.json(apps);

  } catch (err) {
    console.error("JOB APPLICATIONS ERROR:", err);
    res.status(500).json({ message: "Failed to load applicants" });
  }
});

/*
================================================
PATCH /api/applications/:id
Employer updates applicant status
================================================
*/
router.patch("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "employer") {
      return res.status(403).json({ message: "Only employers can update applications" });
    }

    const allowedStatuses = ["new", "shortlisted", "interview", "offer", "hired", "rejected"];
    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid application status" });
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const job = await Job.findById(application.jobId);

    if (!job) {
      return res.status(404).json({ message: "Related job not found" });
    }

    if (String(job.employerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed to update this application" });
    }

    application.status = status;
    await application.save();

    const updated = await Application.findById(application._id)
      .populate("jobId")
      .populate("applicantId", "name email profileImage headline role cvUrl skills");

    res.json(updated);

  } catch (err) {
    console.error("APPLICATION STATUS UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update application" });
  }
});

module.exports = router;