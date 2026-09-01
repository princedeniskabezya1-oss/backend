const mongoose = require("mongoose");

const { Schema } = mongoose;

const historySchema = new Schema(
  {
    status: {
      type: String,
      enum: ["new", "in_progress", "waiting", "resolved", "dismissed"],
      required: true
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1600,
      default: ""
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    at: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const adminWorkTicketSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 320
    },
    category: {
      type: String,
      enum: ["review", "document", "meeting", "evaluation", "decision", "negotiation", "partnership", "other"],
      default: "other",
      index: true
    },
    sourceType: {
      type: String,
      enum: ["review_case", "deal_room", "partnership_workspace", "system"],
      default: "system",
      index: true
    },
    sourceId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    reviewCaseId: {
      type: Schema.Types.ObjectId,
      ref: "ReviewCase",
      default: null,
      index: true
    },
    dealRoomId: {
      type: Schema.Types.ObjectId,
      ref: "DealRoom",
      default: null,
      index: true
    },
    partnershipId: {
      type: Schema.Types.ObjectId,
      ref: "SchoolCompanyPartnership",
      default: null,
      index: true
    },
    title: {
      type: String,
      trim: true,
      maxlength: 260,
      required: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2600,
      default: ""
    },
    nextAction: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true
    },
    status: {
      type: String,
      enum: ["new", "in_progress", "waiting", "resolved", "dismissed"],
      default: "new",
      index: true
    },
    waitingOn: {
      type: String,
      enum: ["", "aift", "user", "counterparty", "meeting_time"],
      default: ""
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    openedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    openedAt: {
      type: Date,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    dueAt: {
      type: Date,
      default: null,
      index: true
    },
    reminderAt: {
      type: Date,
      default: null,
      index: true
    },
    lastUserActivityAt: {
      type: Date,
      default: null
    },
    lastAdminActivityAt: {
      type: Date,
      default: null
    },
    lastSourceActivityAt: {
      type: Date,
      default: Date.now
    },
    targetUrl: {
      type: String,
      trim: true,
      maxlength: 1600,
      default: ""
    },
    generated: {
      type: Boolean,
      default: true,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    history: {
      type: [historySchema],
      default: []
    }
  },
  { timestamps: true }
);

adminWorkTicketSchema.index({ status: 1, priority: 1, updatedAt: -1 });
adminWorkTicketSchema.index({ category: 1, status: 1, updatedAt: -1 });
adminWorkTicketSchema.index({ reminderAt: 1, status: 1 });

module.exports =
  mongoose.models.AdminWorkTicket ||
  mongoose.model("AdminWorkTicket", adminWorkTicketSchema);
