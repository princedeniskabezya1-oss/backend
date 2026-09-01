const mongoose = require("mongoose");

const { Schema } = mongoose;

const WORK_TYPES = [
  "internship",
  "job",
  "recruitment",
  "training",
  "scholarship",
  "career_event",
  "mentorship",
  "research",
  "student_project",
  "industry_project",
  "other"
];

const WORK_ITEM_STATUSES = [
  "proposed",
  "agreed",
  "declined",
  "completed"
];

const MEETING_STATUSES = [
  "requested",
  "accepted",
  "declined",
  "cancelled",
  "scheduled"
];

const workItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: WORK_TYPES,
      default: "other"
    },
    title: {
      type: String,
      trim: true,
      maxlength: 220,
      required: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: ""
    },
    proposedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      enum: WORK_ITEM_STATUSES,
      default: "proposed"
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    respondedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const meetingRequestSchema = new Schema(
  {
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    preferredAt: {
      type: Date,
      required: true
    },
    durationMinutes: {
      type: Number,
      min: 15,
      max: 180,
      default: 30
    },
    purpose: {
      type: String,
      trim: true,
      maxlength: 1800,
      default: ""
    },
    status: {
      type: String,
      enum: MEETING_STATUSES,
      default: "requested"
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    respondedAt: {
      type: Date,
      default: null
    },
    responseNote: {
      type: String,
      trim: true,
      maxlength: 1200,
      default: ""
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      default: null
    }
  },
  {
    timestamps: true
  }
);

const partnershipWorkspaceSchema = new Schema(
  {
    partnershipId: {
      type: Schema.Types.ObjectId,
      ref: "SchoolCompanyPartnership",
      required: true,
      unique: true,
      index: true
    },
    agreementSummary: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: ""
    },
    capabilities: {
      internships: { type: Boolean, default: false },
      jobs: { type: Boolean, default: false },
      recruitment: { type: Boolean, default: false },
      training: { type: Boolean, default: false },
      careerEvents: { type: Boolean, default: false },
      scholarships: { type: Boolean, default: false },
      mentorship: { type: Boolean, default: false },
      research: { type: Boolean, default: false }
    },
    activities: {
      type: [String],
      default: []
    },
    targetPrograms: {
      type: [String],
      default: []
    },
    workItems: {
      type: [workItemSchema],
      default: []
    },
    meetingRequests: {
      type: [meetingRequestSchema],
      default: []
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

partnershipWorkspaceSchema.index({ partnershipId: 1, lastActivityAt: -1 });

module.exports =
  mongoose.models.PartnershipWorkspace ||
  mongoose.model("PartnershipWorkspace", partnershipWorkspaceSchema);

module.exports.WORK_TYPES = WORK_TYPES;
module.exports.WORK_ITEM_STATUSES = WORK_ITEM_STATUSES;
module.exports.MEETING_STATUSES = MEETING_STATUSES;
