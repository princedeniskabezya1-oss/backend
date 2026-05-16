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
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

name: String,
email: String,
coverLetter: String,

applicationType: {
  type: String,
  enum: ["job", "internship"],
  default: "job"
},

cvUrl: {
  type: String,
  default: ""
},

cvSource: {
  type: String,
  enum: ["profile", "uploaded", "none"],
  default: "none"
},

studentInfo: {
  schoolName: { type: String, default: "" },
  course: { type: String, default: "" },
  yearLevel: { type: String, default: "" },
  internshipHours: { type: String, default: "" },
  internshipStartDate: { type: String, default: "" }
},

followUp: {
  message: { type: String, default: "" },
  sentAt: { type: Date, default: null }
},

    status: {
      type: String,
      enum: ["new", "shortlisted", "interview", "offer", "hired", "rejected"],
      default: "new"
    },

    source: {
      type: String,
      enum: ["direct", "invite"],
      default: "direct"
    },

    notes: {
      type: String,
      default: ""
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    viewedByEmployerAt: {
      type: Date,
      default: null
    },

    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null
        }
      }
    ]
  },
  { timestamps: true }
);

ApplicationSchema.index({ applicantId: 1, createdAt: -1 });
ApplicationSchema.index({ employerId: 1, createdAt: -1 });
ApplicationSchema.index({ jobId: 1, status: 1 });
ApplicationSchema.index({ applicationType: 1, createdAt: -1 });

module.exports = mongoose.model("Application", ApplicationSchema);
