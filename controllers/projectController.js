const mongoose = require("mongoose");
const Project = require("../models/Project");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeProjectPayload(body = {}) {
  const payload = {};

  if (body.schoolId !== undefined) payload.schoolId = body.schoolId;
  if (body.classId !== undefined) payload.classId = body.classId || null;
  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.description !== undefined) payload.description = body.description;
  if (body.teacherId !== undefined) payload.teacherId = body.teacherId || null;
  if (body.teamMembers !== undefined) payload.teamMembers = Array.isArray(body.teamMembers) ? [...new Set(body.teamMembers.map(String))] : [];
  if (body.status !== undefined) payload.status = body.status;
  if (body.deadline !== undefined) payload.deadline = body.deadline || null;
  if (body.attachments !== undefined) payload.attachments = Array.isArray(body.attachments) ? body.attachments.filter(Boolean) : [];
  if (body.feedback !== undefined) payload.feedback = body.feedback;
  if (body.featured !== undefined) payload.featured = Boolean(body.featured);

  return payload;
}

exports.getProjects = async (req, res) => {
  try {
    const { schoolId, classId, teacherId, status, featured, search } = req.query;
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

    if (teacherId) {
      if (!isValidObjectId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });
      filter.teacherId = teacherId;
    }

    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured === "true";

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      Project.find(filter)
        .populate("teacherId", "name email role profileImage")
        .populate("teamMembers", "name email role profileImage course yearLevel section")
        .populate("classId", "title subject")
        .sort({ featured: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(filter)
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
    res.status(500).json({ message: "Failed to fetch projects", error: error.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const project = await Project.findById(id)
      .populate("teacherId", "name email role profileImage")
      .populate("teamMembers", "name email role profileImage course yearLevel section")
      .populate("classId", "title subject");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch project", error: error.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const payload = sanitizeProjectPayload(req.body);

    if (!payload.schoolId || !isValidObjectId(payload.schoolId)) {
      return res.status(400).json({ message: "Valid schoolId is required" });
    }

    if (!payload.title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const created = await Project.create(payload);
    const populated = await Project.findById(created._id)
      .populate("teacherId", "name email role profileImage")
      .populate("teamMembers", "name email role profileImage course yearLevel section")
      .populate("classId", "title subject");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Failed to create project", error: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const payload = sanitizeProjectPayload(req.body);

    const updated = await Project.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("teacherId", "name email role profileImage")
      .populate("teamMembers", "name email role profileImage course yearLevel section")
      .populate("classId", "title subject");

    if (!updated) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update project", error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const deleted = await Project.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete project", error: error.message });
  }
};