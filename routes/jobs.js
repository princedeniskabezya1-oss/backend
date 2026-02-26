const User = require("../models/User");
const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

/*
================================================
GET /api/jobs
Public – all ACTIVE jobs
================================================
*/
router.get("/", async (req, res) => {
  try {

    const jobs = await Job.find({ status: "active" })
      .populate("employerId", "isPro")
      .sort({ createdAt: -1 });

    // Boost pro employers
    jobs.sort((a,b)=>{
      return (b.employerId.isPro === true) - (a.employerId.isPro === true);
    });

    res.json(jobs);

  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

/*
================================================
GET /api/jobs/pending
Admin – view pending jobs
================================================
*/
router.get("/pending", adminOnly, async (req, res) => {
  try {
    const jobs = await Job.find({ status: "pending" })
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pending jobs" });
  }
});

/*
================================================
GET /api/jobs/admin/all
Admin – view ALL jobs
================================================
*/
router.get("/admin/all", adminOnly, async (req, res) => {
  try {
    const jobs = await Job.find()
      .populate("employerId", "name email")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch all jobs" });
  }
});

/*
================================================
GET /api/jobs/my
Employer – only their jobs
================================================
*/
router.get("/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "employer") {
      return res.status(403).json({ message: "Access denied" });
    }

    const jobs = await Job.find({ employerId: req.user.id })
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch employer jobs" });
  }
});

/*
================================================
POST /api/jobs
Employer – create job
================================================
*/
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "employer") {
      return res.status(403).json({
        message: "Only employers can post jobs"
      });
    }

    const job = new Job({
      title: req.body.title,
      company: req.body.company,
      location: req.body.location,
      type: req.body.type,
      description: req.body.description,
      salary: req.body.salary,
      employerId: req.user.id,
      status: "pending"
    });

    const savedJob = await job.save();
    res.status(201).json(savedJob);

  } catch (err) {
    res.status(400).json({ message: "Failed to create job" });
  }
});

/*
================================================
PATCH /api/jobs/:id/status
Admin – approve / reject / suspend
================================================
*/
router.patch("/:id/status", adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "suspended", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(job);

  } catch (err) {
    res.status(400).json({ message: "Failed to update job status" });
  }
});

/*
================================================
DELETE /api/jobs/:id
Admin – delete job
================================================
*/
router.delete("/:id", adminOnly, async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(400).json({ message: "Failed to delete job" });
  }
});
const Application = require("../models/Application");

/*
=========================================
EMPLOYER DASHBOARD STATS
=========================================
*/
router.get("/employer/stats", auth, async (req, res) => {

  const jobs = await require("../models/Job").find({
    employerId: req.user.id
  });

  const jobIds = jobs.map(j => j._id);

  const applications = await Application.find({
    jobId: { $in: jobIds }
  });

  res.json({
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => j.status === "active").length,
    totalApplications: applications.length
  });
});

/*
================================================
PATCH /api/jobs/:id/save
Talent – Save / Unsave job
================================================
*/
router.patch("/:id/save", auth, async (req, res) => {
  try {

    if (req.user.role !== "talent") {
      return res.status(403).json({ message: "Only talents can save jobs" });
    }

    const user = await User.findById(req.user.id);

    const alreadySaved = user.savedJobs.includes(req.params.id);

    if (alreadySaved) {
      user.savedJobs.pull(req.params.id);
    } else {
      user.savedJobs.push(req.params.id);
    }

    await user.save();

    res.json({
      saved: !alreadySaved,
      totalSaved: user.savedJobs.length
    });

  } catch (err) {
    res.status(500).json({ message: "Failed to save job" });
  }
});

module.exports = router;
