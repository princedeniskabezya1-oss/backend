const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
  title: String,
  instructions: String,
  dueDate: Date,
  attachments: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "active" }
}, { timestamps: true });

module.exports = mongoose.model("Assignment", assignmentSchema);