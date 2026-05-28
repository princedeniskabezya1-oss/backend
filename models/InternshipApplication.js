const mongoose = require("mongoose");

const InternshipApplicationSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Opportunity",
      required: true,
      index: true
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: [
        "pending",
        "review",
        "interview",
        "approved",
        "active",
        "completed",
        "rejected"
      ],
      default: "pending",
      index: true
    },

    notes: {
      type: String,
      trim: true,
      default: ""
    },

    message: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

InternshipApplicationSchema.index({
  opportunityId: 1,
  studentId: 1
});

module.exports = mongoose.model(
  "InternshipApplication",
  InternshipApplicationSchema
);
