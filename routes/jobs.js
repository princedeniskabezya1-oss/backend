const express = require("express");
const router = express.Router();
const Job = require("../models/Job");

/* =========================
   GET /api/jobs
========================= */
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

/* =========================
   POST /api/jobs
========================= */
router.post("/", async (req, res) => {
  try {
    const { title, company, location, description, type } = req.body;

    // ✅ validation
    if (!title || !company || !location || !description) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const job = new Job({
      title,
      company,
      location,
      description,
      type: type || "Full-time",
      status: "active",
    });

    const savedJob = await job.save();

    console.log("✅ Job saved to MongoDB:", savedJob);

    res.status(201).json(savedJob);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating job" });
  }
});

module.exports = router;
