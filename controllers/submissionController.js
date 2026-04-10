const mongoose = require("mongoose");
const Submission = require("../models/Submission");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeSubmissionPayload(body = {}) {
  const payload = {};

  if (body.assignmentId !== undefined) payload.assignmentId = body.assignmentId;
  if (body.studentId !== undefined) payload.studentId = body.studentId;
  if (body.schoolId !== undefined) payload.schoolId = body.schoolId;
  if (body.files !== undefined) payload.files = Array.isArray(body.files) ? body.files.filter(Boolean) : [];
  if (body.comments !== undefined) payload.comments = body.comments;
  if (body.grade !== undefined) payload.grade = body.grade;
  if (body.feedback !== undefined) payload.feedback = body.feedback;
  if (body.status !== undefined) payload.status = body.status;

  return payload;
}

exports.getSubmissions = async (req, res) => {
  try {
    const { assignmentId, schoolId, studentId, status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    if (assignmentId) {
      if (!isValidObjectId(assignmentId)) return res.status(400).json({ message: "Invalid assignmentId" });
      filter.assignmentId = assignmentId;
    }

    if (schoolId) {
      if (!isValidObjectId(schoolId)) return res.status(400).json({ message: "Invalid schoolId" });
      filter.schoolId = schoolId;
    }

    if (studentId) {
      if (!isValidObjectId(studentId)) return res.status(400).json({ message: "Invalid studentId" });
      filter.studentId = studentId;
    }

    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      Submission.find(filter)
        .populate("assignmentId", "title dueDate classId")
        .populate("studentId", "name email role profileImage course yearLevel section")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Submission.countDocuments(filter)
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
    res.status(500).json({ message: "Failed to fetch submissions", error: error.message });
  }
};

exports.getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const submission = await Submission.findById(id)
      .populate("assignmentId", "title dueDate classId")
      .populate("studentId", "name email role profileImage course yearLevel section");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.json(submission);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch submission", error: error.message });
  }
};

exports.createSubmission = async (req, res) => {
  try {
    const payload = sanitizeSubmissionPayload(req.body);

    if (!payload.assignmentId || !isValidObjectId(payload.assignmentId)) {
      return res.status(400).json({ message: "Valid assignmentId is required" });
    }

    if (!payload.studentId || !isValidObjectId(payload.studentId)) {
      return res.status(400).json({ message: "Valid studentId is required" });
    }

    if (!payload.schoolId || !isValidObjectId(payload.schoolId)) {
      return res.status(400).json({ message: "Valid schoolId is required" });
    }

    const existing = await Submission.findOne({
      assignmentId: payload.assignmentId,
      studentId: payload.studentId
    });

    if (existing) {
      return res.status(409).json({ message: "Submission already exists for this assignment and student" });
    }

    const created = await Submission.create(payload);
    const populated = await Submission.findById(created._id)
      .populate("assignmentId", "title dueDate classId")
      .populate("studentId", "name email role profileImage course yearLevel section");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: "Failed to create submission", error: error.message });
  }
};

exports.updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const payload = sanitizeSubmissionPayload(req.body);

    const updated = await Submission.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    })
      .populate("assignmentId", "title dueDate classId")
      .populate("studentId", "name email role profileImage course yearLevel section");

    if (!updated) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update submission", error: error.message });
  }
};

exports.deleteSubmission = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const deleted = await Submission.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.json({ message: "Submission deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete submission", error: error.message });
  }
};