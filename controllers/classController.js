const mongoose = require("mongoose");
const ClassModel = require("../models/Class");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeClassPayload(body = {}) {
  const payload = {};

  if (body.schoolId !== undefined) payload.schoolId = body.schoolId;
  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.subject !== undefined) payload.subject = body.subject;
  if (body.teacherId !== undefined) payload.teacherId = body.teacherId || null;
  if (body.studentIds !== undefined) {
    payload.studentIds = Array.isArray(body.studentIds)
      ? [...new Set(body.studentIds.map(String))]
      : [];
  }
  if (body.classCode !== undefined) payload.classCode = body.classCode;
  if (body.meetingLink !== undefined) payload.meetingLink = body.meetingLink;
  if (body.schedule !== undefined) payload.schedule = body.schedule;
  if (body.description !== undefined) payload.description = body.description;
  if (body.materials !== undefined) {
    payload.materials = Array.isArray(body.materials)
      ? body.materials.filter(Boolean)
      : [];
  }
  if (body.status !== undefined) payload.status = body.status;

  return payload;
}

const getClasses = async (req, res) => {
  try {
    const { schoolId, teacherId, status, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    if (schoolId) {
      if (!isValidObjectId(schoolId)) {
        return res.status(400).json({ message: "Invalid schoolId" });
      }
      filter.schoolId = schoolId;
    }

    if (teacherId) {
      if (!isValidObjectId(teacherId)) {
        return res.status(400).json({ message: "Invalid teacherId" });
      }
      filter.teacherId = teacherId;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { classCode: { $regex: search, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      ClassModel.find(filter)
        .populate("teacherId", "name email role profileImage")
        .populate("studentIds", "name email role profileImage course yearLevel section")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ClassModel.countDocuments(filter)
    ]);

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch classes",
      error: error.message
    });
  }
};

const getClassById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid class id" });
    }

    const item = await ClassModel.findById(id)
      .populate("teacherId", "name email role profileImage")
      .populate("studentIds", "name email role profileImage course yearLevel section");

    if (!item) {
      return res.status(404).json({ message: "Class not found" });
    }

    return res.json(item);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch class",
      error: error.message
    });
  }
};

const createClass = async (req, res) => {
  try {
    const payload = sanitizeClassPayload(req.body);

    if (!payload.schoolId || !isValidObjectId(payload.schoolId)) {
      return res.status(400).json({ message: "Valid schoolId is required" });
    }

    if (!payload.title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const created = await ClassModel.create(payload);

    const populated = await ClassModel.findById(created._id)
      .populate("teacherId", "name email role profileImage")
      .populate("studentIds", "name email role profileImage course yearLevel section");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create class",
      error: error.message
    });
  }
};

const updateClass = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid class id" });
    }

    const payload = sanitizeClassPayload(req.body);

    const updated = await ClassModel.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("teacherId", "name email role profileImage")
      .populate("studentIds", "name email role profileImage course yearLevel section");

    if (!updated) {
      return res.status(404).json({ message: "Class not found" });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update class",
      error: error.message
    });
  }
};

const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid class id" });
    }

    const deleted = await ClassModel.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Class not found" });
    }

    return res.json({ message: "Class deleted successfully" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete class",
      error: error.message
    });
  }
};

module.exports = {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass
};