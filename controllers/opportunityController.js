const mongoose = require("mongoose");
const SchoolOpportunity = require("../models/SchoolOpportunity");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeOpportunityPayload(body = {}) {
  const payload = {};

  if (body.schoolId !== undefined) payload.schoolId = body.schoolId;
  if (body.employerId !== undefined) payload.employerId = body.employerId || null;
  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.description !== undefined) payload.description = body.description;
  if (body.type !== undefined) payload.type = body.type;
  if (body.deadline !== undefined) payload.deadline = body.deadline || null;
  if (body.status !== undefined) payload.status = body.status;

  return payload;
}

exports.getOpportunities = async (req, res) => {
  try {
    const { schoolId, employerId, type, status, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    if (schoolId) {
      if (!isValidObjectId(schoolId)) return res.status(400).json({ message: "Invalid schoolId" });
      filter.schoolId = schoolId;
    }

    if (employerId) {
      if (!isValidObjectId(employerId)) return res.status(400).json({ message: "Invalid employerId" });
      filter.employerId = employerId;
    }

    if (type) filter.type = type;
    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      SchoolOpportunity.find(filter)
        .populate("schoolId", "name schoolName profileImage schoolLogo")
        .populate("employerId", "name companyName profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SchoolOpportunity.countDocuments(filter)
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch opportunities", error: error.message });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid opportunity id" });
    }

    const item = await SchoolOpportunity.findById(id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("employerId", "name companyName profileImage");

    if (!item) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch opportunity", error: error.message });
  }
};

exports.createOpportunity = async (req, res) => {
  try {
    const payload = sanitizeOpportunityPayload(req.body);

    if (!payload.schoolId || !isValidObjectId(payload.schoolId)) {
      return res.status(400).json({ message: "Valid schoolId is required" });
    }

    if (!payload.title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const created = await SchoolOpportunity.create(payload);
    const populated = await SchoolOpportunity.findById(created._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("employerId", "name companyName profileImage");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Failed to create opportunity", error: error.message });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid opportunity id" });
    }

    const payload = sanitizeOpportunityPayload(req.body);

    const updated = await SchoolOpportunity.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("employerId", "name companyName profileImage");

    if (!updated) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update opportunity", error: error.message });
  }
};

exports.deleteOpportunity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid opportunity id" });
    }

    const deleted = await SchoolOpportunity.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    res.json({ message: "Opportunity deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete opportunity", error: error.message });
  }
};