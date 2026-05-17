const express = require("express");
const router = express.Router();

const Application = require("../models/Application");
const Job = require("../models/Job");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

function getCompanyId(user) {
  if (user.role === "employer") return user._id;
  if (user.companyId) return user.companyId;
  return null;
}

function getUserId(req) {
  return req.user?.id || req.user?._id;
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

/* CREATE APPLICATION */
router.post("/", auth, upload.single("cv"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const applicant = await User.findById(userId);

    if (!applicant) {
      return res.status(401).json({ message: "Please login again" });
    }

    if (!["talent", "agent", "school"].includes(applicant.role)) {
      return res.status(403).json({ message: "Only job seekers and students can apply" });
    }

    const {
      jobId,
      coverLetter,
      applicationType,
      useProfileCV,
      schoolName,
      course,
      yearLevel,
      internshipHours,
      internshipStartDate
    } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (String(job.status || "").toLowerCase() !== "active") {
      return res.status(400).json({ message: "This job is not accepting applications right now" });
    }

    const existing = await Application.findOne({
      jobId,
      applicantId: applicant._id
    });

    if (existing) {
      return res.status(400).json({ message: "You already applied to this job" });
    }

    let finalCvUrl = "";
    let cvSource = "none";

    if (useProfileCV === "true" && applicant.cvUrl) {
      finalCvUrl = applicant.cvUrl;
      cvSource = "profile";
    }

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: "aift_application_cvs",
            resource_type: "raw",
            type: "upload",
            access_mode: "public",
            use_filename: true,
            unique_filename: true
          },
          (error, output) => error ? reject(error) : resolve(output)
        ).end(req.file.buffer);
      });

      finalCvUrl = result.secure_url;
      cvSource = "uploaded";
    }

    const application = await Application.create({
      jobId,
      employerId: job.employerId,
      applicantId: applicant._id,
      name: applicant.name,
      email: applicant.email,
      coverLetter: coverLetter || "",
      applicationType: applicationType === "internship" ? "internship" : "job",
      cvUrl: finalCvUrl,
      cvSource,
      studentInfo: {
        schoolName: schoolName || applicant.schoolName || "",
        course: course || applicant.course || "",
        yearLevel: yearLevel || applicant.yearLevel || "",
        internshipHours: internshipHours || "",
        internshipStartDate: internshipStartDate || ""
      },
      statusHistory: [
        {
          status: "new",
          changedBy: applicant._id
        }
      ]
    });

    await Notification.create({
      user: job.employerId,
      type: "application",
      sender: applicant._id,
      text: `${applicant.name} applied for ${job.title}`,
      link: `/employer.html?tab=pipeline`
    });

    const io = req.app.get("io");
    if (io) {
      io.to(String(job.employerId)).emit("application_created", application);
    }

    res.status(201).json(application);
  } catch (err) {
    console.error("APPLICATION CREATE ERROR:", err);
    res.status(400).json({ message: err.message || "Failed to submit application" });
  }
});

/* LIST APPLICATIONS */
router.get("/", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const actor = await User.findById(userId);

    if (!actor) {
      return res.status(401).json({ message: "Please login again" });
    }

    if (actor.role === "admin") {
      const apps = await Application.find()
        .populate("jobId")
        .populate("employerId", "name companyName profileImage")
        .populate("applicantId", "name email profileImage headline role cvUrl skills")
        .sort({ createdAt: -1 });

      return res.json(apps);
    }

    if (actor.role === "employer") {
      const apps = await Application.find({ employerId: actor._id })
        .populate("jobId")
        .populate("employerId", "name companyName profileImage")
        .populate("applicantId", "name email profileImage headline role cvUrl skills education experience expectedSalary")
        .sort({ createdAt: -1 });

      return res.json(apps);
    }

    if (actor.companyId) {
      const apps = await Application.find({ employerId: actor.companyId })
        .populate("jobId")
        .populate("employerId", "name companyName profileImage")
        .populate("applicantId", "name email profileImage headline role cvUrl skills education experience expectedSalary")
        .sort({ createdAt: -1 });

      return res.json(apps);
    }

    if (["talent", "agent", "school"].includes(actor.role)) {
      const apps = await Application.find({ applicantId: actor._id })
        .populate("jobId")
        .populate("employerId", "name companyName profileImage")
        .sort({ createdAt: -1 });

      return res.json(apps);
    }

    res.json([]);
  } catch (err) {
    console.error("APPLICATION LIST ERROR:", err);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

/* UPDATE APPLICATION STATUS */
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const actor = await User.findById(userId);
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
      link: "/my-applications.html"
    });

    const io = req.app.get("io");
    if (io) {
      io.to(String(application.applicantId)).emit("application_status_updated", {
        applicationId: application._id,
        status: application.status
      });
    }

    res.json(application);
  } catch (err) {
    console.error("APPLICATION STATUS ERROR:", err);
    res.status(500).json({ message: "Failed to update application status" });
  }
});

/* FOLLOW UP AFTER 24 HOURS */
router.patch("/:id/follow-up", auth, async (req, res) => {
  try {
    const userId = getUserId(req);

    const application = await Application.findById(req.params.id)
      .populate("jobId", "title employerId");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (String(application.applicantId) !== String(userId)) {
      return res.status(403).json({ message: "You can only follow up on your own application" });
    }

    if (application.followUp?.sentAt) {
      return res.status(400).json({ message: "You already sent a follow-up for this application" });
    }

    const createdAt = new Date(application.createdAt).getTime();
    const hoursPassed = (Date.now() - createdAt) / (1000 * 60 * 60);

    if (hoursPassed < 24) {
      return res.status(400).json({
        message: "You can send a follow-up 24 hours after applying"
      });
    }

    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({ message: "Follow-up message is required" });
    }

    application.followUp = {
      message,
      sentAt: new Date()
    };

    application.statusHistory.push({
      status: application.status,
      changedAt: new Date(),
      changedBy: userId
    });

    await application.save();

    const sender = await User.findById(userId).select("name");

    await Notification.create({
      user: application.employerId,
      type: "application_follow_up",
      sender: userId,
      text: `${sender?.name || "An applicant"} followed up on their application for ${application.jobId?.title || "your job"}`,
      link: `/employer.html?tab=pipeline`
    });

    const io = req.app.get("io");
    if (io) {
      io.to(String(application.employerId)).emit("application_follow_up", {
        applicationId: application._id,
        message
      });
    }

    res.json(application);
  } catch (err) {
    console.error("FOLLOW UP ERROR:", err);
    res.status(500).json({ message: "Failed to send follow-up" });
  }
});

module.exports = router;
