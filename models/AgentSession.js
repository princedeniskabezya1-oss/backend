const mongoose = require("mongoose");

const AgentSessionSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule", default: null },
    taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WorkTask" }],

    loginTime: { type: Date, default: Date.now, index: true },
    logoutTime: { type: Date, default: null },
    status: { type: String, enum: ["online", "offline", "away"], default: "online", index: true },

    device: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

AgentSessionSchema.index({ companyId: 1, loginTime: -1 });
AgentSessionSchema.index({ agentId: 1, logoutTime: 1 });

module.exports = mongoose.model("AgentSession", AgentSessionSchema);
