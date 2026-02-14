const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

/*
================================================
GET /api/jobs
Public – all ACTIVE jobs (for talents)
================================================
*/
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "active" })
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs" });
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
POST /api/jobs
Employer – create job (auto pending)
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

module.exports = router;
