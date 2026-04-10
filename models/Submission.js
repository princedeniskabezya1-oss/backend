const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment" },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  files: [String],
  comments: String,
  grade: String,
  feedback: String,
  status: { type: String, default: "submitted" }
}, { timestamps: true });

module.exports = mongoose.model("Submission", submissionSchema);