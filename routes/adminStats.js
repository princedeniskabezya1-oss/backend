const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const User = require("../models/User");
const Application = require("../models/Application");
const adminOnly = require("../middleware/adminOnly");

/*
================================================
GET /api/admin/stats
Admin Dashboard Statistics
================================================
*/
router.get("/stats", adminOnly, async (req, res) => {
  try {

    // Count total jobs (ALL jobs)
    const totalJobs = await Job.countDocuments();

    // Count total users
    const totalUsers = await User.countDocuments();

    // Count total applications
    const totalApplications = await Application.countDocuments();

    // Count pending jobs
    const pendingJobs = await Job.countDocuments({ status: "pending" });

    // Calculate total revenue (if payments added later)
    // For now we simulate revenue from approved jobs
    const approvedJobs = await Job.countDocuments({ status: "active" });
    const revenue = approvedJobs * 49; // example $49 per approved job

    res.json({
      jobs: totalJobs,
      users: totalUsers,
      applications: totalApplications,
      pending: pendingJobs,
      revenue: revenue
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load admin stats" });
  }
});

module.exports = router;
