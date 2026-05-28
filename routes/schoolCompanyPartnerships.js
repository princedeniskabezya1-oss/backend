const express = require("express");
const router = express.Router();

const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");

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
  return req.user?.role || req.role || req.body.role || "";
}

function canManagePartnership(req, partnership) {
  const userId = String(getUserId(req) || "");
  const role = String(getUserRole(req) || "").toLowerCase();

  if (role === "admin") return true;

  return (
    String(partnership.schoolId || "") === userId ||
    String(partnership.companyId || "") === userId
  );
}

/**
 * GET /api/school-company-partnerships
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const {
      schoolId,
      companyId,
      status,
      type
    } = req.query;

    const filter = {};

    if (schoolId) filter.schoolId = schoolId;
    if (companyId) filter.companyId = companyId;
    if (status) filter.status = status;
    if (type) filter.type = type;

    const partnerships = await SchoolCompanyPartnership.find(filter)
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      partnerships
    });
  } catch (err) {
    console.error("GET partnerships failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not load partnerships."
    });
  }
});

/**
 * POST /api/school-company-partnerships
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const role = String(getUserRole(req) || req.body.requestedBy || "school").toLowerCase();

    const {
      schoolId,
      companyId,
      companyName,
      type,
      partnershipType,
      message
    } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company is required."
      });
    }

    const finalSchoolId =
      schoolId ||
      (role === "school" ? userId : null);

    const finalCompanyId =
      companyId ||
      (role === "employer" || role === "company" ? userId : null);

    if (!finalSchoolId || !finalCompanyId) {
      return res.status(400).json({
        success: false,
        message: "School and company are required."
      });
    }

    const existing = await SchoolCompanyPartnership.findOne({
      schoolId: finalSchoolId,
      companyId: finalCompanyId,
      status: { $in: ["pending", "review", "approved", "active"] }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A partnership request already exists for this school and company."
      });
    }

    const partnership = await SchoolCompanyPartnership.create({
      schoolId: finalSchoolId,
      companyId: finalCompanyId,
      companyName: companyName || "",
      type: type || partnershipType || "internship_partnership",
      partnershipType: partnershipType || type || "internship_partnership",
      status: "pending",
      requestedBy: role === "employer" ? "company" : role,
      message: message || ""
    });

    const populated = await SchoolCompanyPartnership.findById(partnership._id)
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .lean();

    res.status(201).json({
      success: true,
      partnership: populated
    });
  } catch (err) {
    console.error("POST partnership failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not create partnership request."
    });
  }
});

/**
 * PATCH /api/school-company-partnerships/:id
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const partnership = await SchoolCompanyPartnership.findById(req.params.id);

    if (!partnership) {
      return res.status(404).json({
        success: false,
        message: "Partnership not found."
      });
    }

    if (!canManagePartnership(req, partnership)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this partnership."
      });
    }

    const allowed = [
      "status",
      "type",
      "partnershipType",
      "message",
      "companyName"
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        partnership[field] = req.body[field];
      }
    });

    await partnership.save();

    const populated = await SchoolCompanyPartnership.findById(partnership._id)
      .populate("schoolId", "name schoolName email avatar profilePicture location address")
      .populate("companyId", "name companyName email avatar profilePicture logo industry location address")
      .lean();

    res.json({
      success: true,
      partnership: populated
    });
  } catch (err) {
    console.error("PATCH partnership failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not update partnership."
    });
  }
});

/**
 * DELETE /api/school-company-partnerships/:id
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const partnership = await SchoolCompanyPartnership.findById(req.params.id);

    if (!partnership) {
      return res.status(404).json({
        success: false,
        message: "Partnership not found."
      });
    }

    if (!canManagePartnership(req, partnership)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this partnership."
      });
    }

    await partnership.deleteOne();

    res.json({
      success: true,
      message: "Partnership deleted."
    });
  } catch (err) {
    console.error("DELETE partnership failed:", err);
    res.status(500).json({
      success: false,
      message: "Could not delete partnership."
    });
  }
});

module.exports = router;
