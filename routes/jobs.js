const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const Application = require("../models/Application");
const User = require("../models/User");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

function getCompanyId(user) {
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

/* ============================================
   PUBLIC ACTIVE JOBS
============================================ */
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "active" })
      .populate("employerId", "isPro name companyName profileImage bannerImage headline industry location aiftVerified")
      .sort({ createdAt: -1 });

    jobs.sort((a, b) => {
      return (b.employerId?.isPro === true) - (a.employerId?.isPro === true);
    });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

/* ============================================
   EMPLOYER / TEAM OWN JOBS
============================================ */
router.get("/my", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const jobs = await Job.find({ employerId: companyId }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch employer jobs" });
  }
});

/* ============================================
   EMPLOYER STATS
============================================ */
router.get("/employer/stats", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const jobs = await Job.find({ employerId: companyId });
    const jobIds = jobs.map(j => j._id);

    const applications = await Application.find({ jobId: { $in: jobIds } });

    const totals = {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.status === "active").length,
      totalApplications: applications.length,
      totalViews: jobs.reduce((sum, j) => sum + (j.viewsCount || 0), 0),
      totalSaves: jobs.reduce((sum, j) => sum + (j.saveCount || 0), 0),
      totalInvites: jobs.reduce((sum, j) => sum + (j.inviteCount || 0), 0),
      totalShortlisted: applications.filter(a => a.status === "shortlisted").length,
      totalInterviews: applications.filter(a => a.status === "interview").length,
      totalOffers: applications.filter(a => a.status === "offer").length,
      totalHires: applications.filter(a => a.status === "hired").length
    };

    res.json(totals);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch employer stats" });
  }
});

/* ============================================
   CREATE JOB
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Only employer team can post jobs" });
    }

    const owner = await User.findById(companyId);

    const job = await Job.create({
      title: req.body.title,
      company: req.body.company || owner?.companyName || owner?.name || "Company",
      location: req.body.location,
      type: req.body.type || "Full-time",
      description: req.body.description,
      salary: req.body.salary || "",
      skills: Array.isArray(req.body.skills) ? req.body.skills : [],
      experienceLevel: req.body.experienceLevel || "junior",
      employerId: companyId,
      status: "active"
    });

    res.status(201).json(job);
  } catch (err) {
    console.error("CREATE JOB ERROR:", err);
    res.status(400).json({ message: "Failed to create job" });
  }
});

/* ============================================
   JOB DETAIL VIEW TRACKING
============================================ */
router.patch("/:id/view", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const viewerId = String(req.user.id);
    const alreadyViewed = job.uniqueViewers.some(id => String(id) === viewerId);

    if (!alreadyViewed) {
      job.uniqueViewers.push(req.user.id);
      job.viewsCount += 1;
    }

    job.lastViewedAt = new Date();
    await job.save();

    res.json({
      viewsCount: job.viewsCount,
      uniqueViewers: job.uniqueViewers.length
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to track job view" });
  }
});

/* ============================================
   APPLY CLICK TRACKING
============================================ */
router.patch("/:id/click-apply", auth, async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { $inc: { clickApplyCount: 1 } },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({
      clickApplyCount: job.clickApplyCount
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to track apply click" });
  }
});

/* ============================================
   SAVE / UNSAVE
============================================ */
router.patch("/:id/save", auth, async (req, res) => {
  try {
    if (req.user.role !== "talent" && req.user.role !== "agent") {
      return res.status(403).json({ message: "Only talents or agents can save jobs" });
    }

    const user = await User.findById(req.user.id);
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const alreadySaved = user.savedJobs.some(id => String(id) === String(req.params.id));

    if (alreadySaved) {
      user.savedJobs.pull(req.params.id);
      job.saveCount = Math.max(0, (job.saveCount || 0) - 1);
    } else {
      user.savedJobs.push(req.params.id);
      job.saveCount += 1;
    }

    await user.save();
    await job.save();

    res.json({
      saved: !alreadySaved,
      totalSaved: user.savedJobs.length,
      saveCount: job.saveCount
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to save job" });
  }
});

/* ============================================
   UPDATE JOB
============================================ */
router.patch("/:id", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (String(job.employerId) !== String(companyId)) {
      return res.status(403).json({ message: "Not allowed to update this job" });
    }

    const allowedUpdates = [
      "title", "company", "location", "type", "description",
      "salary", "skills", "experienceLevel", "status"
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        job[field] = req.body[field];
      }
    });

    await job.save();
    res.json(job);
  } catch (err) {
    console.error("EMPLOYER JOB UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update job" });
  }
});

/* ============================================
   JOB ANALYTICS
============================================ */
router.get("/:id/analytics", auth, async (req, res) => {
  try {
    const actor = await User.findById(req.user.id);
    const companyId = getCompanyId(actor);

    if (!companyId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const job = await Job.findById(req.params.id);
    if (!job || String(job.employerId) !== String(companyId)) {
      return res.status(404).json({ message: "Job not found" });
    }

    const applications = await Application.find({ jobId: job._id });

    res.json({
      jobId: job._id,
      title: job.title,
      status: job.status,
      viewsCount: job.viewsCount || 0,
      uniqueViewers: job.uniqueViewers?.length || 0,
      saveCount: job.saveCount || 0,
      inviteCount: job.inviteCount || 0,
      clickApplyCount: job.clickApplyCount || 0,
      totalApplications: applications.length,
      shortlisted: applications.filter(a => a.status === "shortlisted").length,
      interviews: applications.filter(a => a.status === "interview").length,
      offers: applications.filter(a => a.status === "offer").length,
      hires: applications.filter(a => a.status === "hired").length,
      rejected: applications.filter(a => a.status === "rejected").length
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load job analytics" });
  }
});

/* ============================================
   ADMIN
============================================ */
router.get("/pending", adminOnly, async (req, res) => {
  try {
    const jobs = await Job.find({ status: "pending" }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pending jobs" });
  }
});

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

router.patch("/:id/status", adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "suspended", "rejected", "closed"].includes(status)) {
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

router.delete("/:id", adminOnly, async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(400).json({ message: "Failed to delete job" });
  }
});

module.exports = router;
