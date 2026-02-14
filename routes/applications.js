const express = require("express");
const router = express.Router();
const Application = require("../models/Application");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

/*
================================================
POST /api/applications
Talent submits application (JWT required)
================================================
*/
router.post("/", auth, async (req, res) => {
  try {

    if (req.user.role !== "talent") {
      return res.status(403).json({
        message: "Only job seekers can apply"
      });
    }

    const { jobId, coverLetter } = req.body;

    // Prevent duplicate application
    const existing = await Application.findOne({
      jobId,
      applicantId: req.user.id
    });

    if (existing) {
      return res.status(400).json({
        message: "You already applied to this job"
      });
    }

    const application = new Application({
      jobId,
      applicantId: req.user.id,
      name: req.user.name,
      email: req.user.email,
      coverLetter
    });

    const saved = await application.save();
    res.status(201).json(saved);

  } catch (err) {
    res.status(400).json({ message: "Failed to submit application" });
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

    const apps = await Application.find({
      jobId: req.params.jobId
    }).sort({ createdAt: -1 });

    res.json(apps);

  } catch (err) {
    res.status(500).json({ message: "Failed to load applicants" });
  }
});

/*
================================================
GET /api/applications
Admin – all applications
================================================
*/
router.get("/", adminOnly, async (req, res) => {
  try {
    const apps = await Application.find()
      .populate("jobId")
      .populate("applicantId");

    res.json(apps);

  } catch (err) {
    res.status(500).json({ message: "Failed to load applications" });
  }
});

module.exports = router;
