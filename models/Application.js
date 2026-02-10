const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },
    name: String,
    email: String,
    cvUrl: String,
    status: {
      type: String,
      default: "new"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);
