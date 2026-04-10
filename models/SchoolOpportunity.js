const mongoose = require("mongoose");

const opportunitySchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  description: String,
  type: String, // internship, talk, project
  deadline: Date,
  status: { type: String, default: "open" }
}, { timestamps: true });

module.exports = mongoose.model("SchoolOpportunity", opportunitySchema);