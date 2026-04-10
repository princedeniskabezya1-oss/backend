const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeAssignmentPayload(body = {}) {
  const payload = {};

  if (body.schoolId !== undefined) payload.schoolId = body.schoolId;
  if (body.classId !== undefined) payload.classId = body.classId;
  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.instructions !== undefined) payload.instructions = body.instructions;
  if (body.dueDate !== undefined) payload.dueDate = body.dueDate || null;
  if (body.attachments !== undefined) payload.attachments = Array.isArray(body.attachments) ? body.attachments.filter(Boolean) : [];
  if (body.createdBy !== undefined) payload.createdBy = body.createdBy;
  if (body.status !== undefined) payload.status = body.status;

  return payload;
}

exports.getAssignments = async (req, res) => {
  try {
    const { schoolId, classId, createdBy, status, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    if (schoolId) {
      if (!isValidObjectId(schoolId)) return res.status(400).json({ message: "Invalid schoolId" });
      filter.schoolId = schoolId;
    }

    if (classId) {
      if (!isValidObjectId(classId)) return res.status(400).json({ message: "Invalid classId" });
      filter.classId = classId;
    }

    if (createdBy) {
      if (!isValidObjectId(createdBy)) return res.status(400).json({ message: "Invalid createdBy" });
      filter.createdBy = createdBy;
    }

    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { instructions: { $regex: search, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      Assignment.find(filter)
        .populate("createdBy", "name email role profileImage")
        .populate("classId", "title subject")
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Assignment.countDocuments(filter)
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
    res.status(500).json({ message: "Failed to fetch assignments", error: error.message });
  }
};

exports.getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid assignment id" });
    }

    const assignment = await Assignment.findById(id)
      .populate("createdBy", "name email role profileImage")
      .populate("classId", "title subject");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch assignment", error: error.message });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    const payload = sanitizeAssignmentPayload(req.body);

    if (!payload.schoolId || !isValidObjectId(payload.schoolId)) {
      return res.status(400).json({ message: "Valid schoolId is required" });
    }

    if (!payload.classId || !isValidObjectId(payload.classId)) {
      return res.status(400).json({ message: "Valid classId is required" });
    }

    if (!payload.createdBy || !isValidObjectId(payload.createdBy)) {
      return res.status(400).json({ message: "Valid createdBy is required" });
    }

    if (!payload.title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const created = await Assignment.create(payload);
    const populated = await Assignment.findById(created._id)
      .populate("createdBy", "name email role profileImage")
      .populate("classId", "title subject");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Failed to create assignment", error: error.message });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid assignment id" });
    }

    const payload = sanitizeAssignmentPayload(req.body);

    const updated = await Assignment.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("createdBy", "name email role profileImage")
      .populate("classId", "title subject");

    if (!updated) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update assignment", error: error.message });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid assignment id" });
    }

    const deleted = await Assignment.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json({ message: "Assignment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete assignment", error: error.message });
  }
};