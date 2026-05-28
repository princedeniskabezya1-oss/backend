const express = require("express");
const router = express.Router();

const InternshipApplication = require("../models/InternshipApplication");
const Opportunity = require("../models/Opportunity");

let auth = null;

try {
  auth = require("../middleware/auth");
} catch (err) {
  auth = null;
}

const requireAuth = auth || ((req, res, next) => next());

function getUserId(req) {
  return req.user?._id || req.user?.id || req.userId || req.body.userId || null;
}

function getUserRole(req) {
  return String(req.user?.role || req.role || req.body.role || "").toLowerCase();
}

function canManageApplication(req, application) {
  const userId = String(getUserId(req) || "");
  const role = getUserRole(req);

  if (role === "admin") return true;

  return (
    String(application.schoolId || "") === userId ||
    String(application.companyId || "") === userId
  );
}

/**
 * GET /api/internship-applications
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const {
      opportunityId,
      schoolId,
      companyId,
      studentId,
      status
    } = req.query;

    const filter = {};

    if (opportunityId) filter.opportunityId = opportunityId;
    if (schoolId) filter.schoolId = schoolId;
    if (companyId) filter.companyId = companyId;
    if (studentId) filter.studentId = studentId;
    if (status) filter.status = status;

    const applications = await InternshipApplication.find(filter)
      .populate("studentId", "name fullName email avatar profilePicture role jobTitle")
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .populate("opportunityId", "title type status companyName companyId workSetup location deadline description")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      applications
    });
  } catch (err) {
    console.error("GET internship applications failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not load internship applications."
    });
  }
});

/**
 * POST /api/internship-applications
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const role = getUserRole(req);

    const {
      opportunityId,
      studentId,
      companyId,
      schoolId,
      status,
      notes,
      message
    } = req.body;

    if (!opportunityId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "Opportunity and student are required."
      });
    }

    const opportunity = await Opportunity.findById(opportunityId).lean();

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        message: "Opportunity not found."
      });
    }

    const finalCompanyId =
      companyId ||
      opportunity.companyId ||
      opportunity.company ||
      null;

    const finalSchoolId =
      schoolId ||
      (role === "school" ? userId : null) ||
      opportunity.schoolId ||
      null;

    const existing = await InternshipApplication.findOne({
      opportunityId,
      studentId,
      status: { $in: ["pending", "review", "interview", "approved", "active"] }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "This student already has an active application for this opportunity."
      });
    }

    const application = await InternshipApplication.create({
      opportunityId,
      studentId,
      schoolId: finalSchoolId,
      companyId: finalCompanyId,
      status: status || "pending",
      notes: notes || "",
      message: message || ""
    });

    const populated = await InternshipApplication.findById(application._id)
      .populate("studentId", "name fullName email avatar profilePicture role jobTitle")
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .populate("opportunityId", "title type status companyName companyId workSetup location deadline description")
      .lean();

    res.status(201).json({
      success: true,
      application: populated
    });
  } catch (err) {
    console.error("POST internship application failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not submit internship application."
    });
  }
});

/**
 * PATCH /api/internship-applications/:id
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const application = await InternshipApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    if (!canManageApplication(req, application)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this application."
      });
    }

    const allowed = [
      "status",
      "notes",
      "message"
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        application[field] = req.body[field];
      }
    });

    await application.save();

    const populated = await InternshipApplication.findById(application._id)
      .populate("studentId", "name fullName email avatar profilePicture role jobTitle")
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .populate("opportunityId", "title type status companyName companyId workSetup location deadline description")
      .lean();

    res.json({
      success: true,
      application: populated
    });
  } catch (err) {
    console.error("PATCH internship application failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not update internship application."
    });
  }
});

/**
 * DELETE /api/internship-applications/:id
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const application = await InternshipApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found."
      });
    }

    if (!canManageApplication(req, application)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this application."
      });
    }

    await application.deleteOne();

    res.json({
      success: true,
      message: "Application deleted."
    });
  } catch (err) {
    console.error("DELETE internship application failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not delete internship application."
    });
  }
});

module.exports = router;
