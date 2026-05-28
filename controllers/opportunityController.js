const mongoose = require("mongoose");
const SchoolOpportunity = require("../models/SchoolOpportunity");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function parsePagination(query = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function getAuthUserId(req) {
  return req.user?._id || req.user?.id || req.userId || null;
}

function getAuthRole(req) {
  return String(req.user?.role || req.role || "").toLowerCase();
}

function sanitizeOpportunityPayload(body = {}) {
  const payload = {};

  if (body.schoolId !== undefined) {
    payload.schoolId = body.schoolId || null;
  }

  if (body.employerId !== undefined) {
    payload.employerId = body.employerId || null;
  }

  if (body.companyId !== undefined) {
    payload.employerId = body.companyId || null;
  }

  if (body.title !== undefined) {
    payload.title = String(body.title || "").trim();
  }

  if (body.description !== undefined) {
    payload.description = String(body.description || "").trim();
  }

  if (body.type !== undefined) {
    payload.type = body.type;
  }

  if (body.deadline !== undefined) {
    payload.deadline = body.deadline || null;
  }

  if (body.status !== undefined) {
    payload.status = body.status;
  }

  return payload;
}

function validateObjectIdField(value, label) {
  if (value && !isValidObjectId(value)) {
    return `${label} is invalid`;
  }

  return null;
}

exports.getOpportunities = async (req, res) => {
  try {
    const {
      schoolId,
      employerId,
      companyId,
      type,
      status,
      search
    } = req.query;

    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    if (schoolId) {
      const error = validateObjectIdField(schoolId, "schoolId");
      if (error) return res.status(400).json({ message: error });
      filter.schoolId = schoolId;
    }

    const finalEmployerId = employerId || companyId;

    if (finalEmployerId) {
      const error = validateObjectIdField(finalEmployerId, "employerId");
      if (error) return res.status(400).json({ message: error });
      filter.employerId = finalEmployerId;
    }

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      SchoolOpportunity.find(filter)
        .populate("schoolId", "name schoolName profileImage schoolLogo avatar profilePicture email")
        .populate("employerId", "name companyName profileImage avatar profilePicture logo email industry")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      SchoolOpportunity.countDocuments(filter)
    ]);

    res.json({
      success: true,
      items,
      opportunities: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Failed to fetch opportunities:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch opportunities",
      error: error.message
    });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid opportunity id"
      });
    }

    const item = await SchoolOpportunity.findById(id)
      .populate("schoolId", "name schoolName profileImage schoolLogo avatar profilePicture email")
      .populate("employerId", "name companyName profileImage avatar profilePicture logo email industry")
      .lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Opportunity not found"
      });
    }

    res.json({
      success: true,
      item,
      opportunity: item
    });
  } catch (error) {
    console.error("Failed to fetch opportunity:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch opportunity",
      error: error.message
    });
  }
};

exports.createOpportunity = async (req, res) => {
  try {
    const payload = sanitizeOpportunityPayload(req.body);

    const role = getAuthRole(req);
    const userId = getAuthUserId(req);

    if (!payload.schoolId && role === "school") {
      payload.schoolId = userId;
    }

    if (!payload.employerId && ["employer", "company"].includes(role)) {
      payload.employerId = userId;
    }

    const schoolError = validateObjectIdField(payload.schoolId, "schoolId");
    if (schoolError) {
      return res.status(400).json({
        success: false,
        message: schoolError
      });
    }

    const employerError = validateObjectIdField(payload.employerId, "employerId");
    if (employerError) {
      return res.status(400).json({
        success: false,
        message: employerError
      });
    }

    if (!payload.title) {
      return res.status(400).json({
        success: false,
        message: "Title is required"
      });
    }

    if (!payload.schoolId && !payload.employerId) {
      return res.status(400).json({
        success: false,
        message: "School or company is required"
      });
    }

    const created = await SchoolOpportunity.create(payload);

    const populated = await SchoolOpportunity.findById(created._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo avatar profilePicture email")
      .populate("employerId", "name companyName profileImage avatar profilePicture logo email industry")
      .lean();

    res.status(201).json({
      success: true,
      item: populated,
      opportunity: populated
    });
  } catch (error) {
    console.error("Failed to create opportunity:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create opportunity",
      error: error.message
    });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid opportunity id"
      });
    }

    const payload = sanitizeOpportunityPayload(req.body);

    const schoolError = validateObjectIdField(payload.schoolId, "schoolId");
    if (schoolError) {
      return res.status(400).json({
        success: false,
        message: schoolError
      });
    }

    const employerError = validateObjectIdField(payload.employerId, "employerId");
    if (employerError) {
      return res.status(400).json({
        success: false,
        message: employerError
      });
    }

    const updated = await SchoolOpportunity.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("schoolId", "name schoolName profileImage schoolLogo avatar profilePicture email")
      .populate("employerId", "name companyName profileImage avatar profilePicture logo email industry")
      .lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Opportunity not found"
      });
    }

    res.json({
      success: true,
      item: updated,
      opportunity: updated
    });
  } catch (error) {
    console.error("Failed to update opportunity:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update opportunity",
      error: error.message
    });
  }
};

exports.deleteOpportunity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid opportunity id"
      });
    }

    const deleted = await SchoolOpportunity.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Opportunity not found"
      });
    }

    res.json({
      success: true,
      message: "Opportunity deleted successfully"
    });
  } catch (error) {
    console.error("Failed to delete opportunity:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete opportunity",
      error: error.message
    });
  }
};
