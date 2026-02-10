const express = require("express");
const router = express.Router();
const Application = require("../models/Application");

/*
  POST /api/applications
  Applicant submits CV
*/
router.post("/", async (req, res) => {
  try {
    const application = new Application(req.body);
    const saved = await application.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: "Failed to submit application" });
  }
});

/*
  GET /api/applications/job/:jobId
  Company views applicants per job
*/
router.get("/job/:jobId", async (req, res) => {
  try {
    const apps = await Application.find({
      jobId: req.params.jobId
    }).sort({ createdAt: -1 });

    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: "Failed to load applicants" });
  }
});

/*
  GET /api/applications
  Admin – all applications
*/
router.get("/", async (req, res) => {
  try {
    const apps = await Application.find().populate("jobId");
    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: "Failed to load applications" });
  }
});

module.exports = router;
