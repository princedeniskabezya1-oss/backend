const express = require("express");
const router = express.Router();
const Job = require("../models/Job");

/*
  GET /api/jobs
  Public – all active jobs (job seekers)
*/
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "active" }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

/*
  GET /api/jobs/company/:company
  Company – only their jobs
*/
router.get("/company/:company", async (req, res) => {
  try {
    const jobs = await Job.find({
      company: req.params.company
    }).sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch company jobs" });
  }
});

/*
  POST /api/jobs
  Company posts job
*/
router.post("/", async (req, res) => {
  try {
    const job = new Job(req.body);
    const savedJob = await job.save();
    res.status(201).json(savedJob);
  } catch (err) {
    res.status(400).json({ message: "Failed to create job" });
  }
});

/*
  PATCH /api/jobs/:id/status
  Admin – approve / suspend
*/
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

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
