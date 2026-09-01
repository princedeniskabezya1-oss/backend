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

/*
  Preserve an Admin's explicit Waiting decision until the linked
  workflow actually produces newer source activity.

  The queue synchronizer may still describe the source as "new",
  but that should not undo a manual Waiting state on every refresh.
  Once lastSourceActivityAt advances, the synchronizer is allowed to
  move the ticket back to New so AIFT sees the fresh user activity.
*/
adminWorkTicketSchema.pre("save", async function preserveManualWaiting(next){
  try{
    if(this.isNew || this.status !== "new" || !this.isModified("status")){
      return next();
    }

    const previous = await this.constructor
      .findById(this._id)
      .select("status waitingOn lastAdminActivityAt lastSourceActivityAt history")
      .lean();

    if(!previous || previous.status !== "waiting"){
      return next();
    }

    const previousAdminAt = previous.lastAdminActivityAt ? new Date(previous.lastAdminActivityAt) : null;
    const previousSourceAt = previous.lastSourceActivityAt ? new Date(previous.lastSourceActivityAt) : null;
    const currentSourceAt = this.lastSourceActivityAt ? new Date(this.lastSourceActivityAt) : null;

    const adminExplicitlyWaited = Boolean(
      previousAdminAt &&
      previousSourceAt &&
      previousAdminAt.getTime() >= previousSourceAt.getTime()
    );

    const sourceAdvanced = Boolean(
      currentSourceAt &&
      previousSourceAt &&
      currentSourceAt.getTime() > previousSourceAt.getTime()
    );

    if(adminExplicitlyWaited && !sourceAdvanced){
      this.status = "waiting";
      this.waitingOn = previous.waitingOn || "user";

      const last = this.history?.[this.history.length - 1];
      if(
        last?.status === "new" &&
        last?.note === "This item now requires AIFT action."
      ){
        this.history.pop();
      }
    }

    next();
  }catch(error){
    next(error);
  }
});

adminWorkTicketSchema.index({ status: 1, priority: 1, updatedAt: -1 });
adminWorkTicketSchema.index({ category: 1, status: 1, updatedAt: -1 });
adminWorkTicketSchema.index({ reminderAt: 1, status: 1 });

module.exports =
  mongoose.models.AdminWorkTicket ||
  mongoose.model("AdminWorkTicket", adminWorkTicketSchema);
