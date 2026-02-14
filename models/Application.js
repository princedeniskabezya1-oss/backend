const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: String,
    email: String,
    coverLetter: String,
    cvUrl: String,
    status: {
      type: String,
      enum: ["new", "shortlisted", "rejected"],
      default: "new"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);
