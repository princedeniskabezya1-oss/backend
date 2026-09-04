const mongoose = require("mongoose");

const { Schema } = mongoose;

const callLogSchema = new Schema({
  callId: { type: String, unique: true, sparse: true, index: true },
  caller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  receiver: { type: Schema.Types.ObjectId, ref: "User", index: true },
  participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
  meetingId: { type: Schema.Types.ObjectId, ref: "Meeting", index: true },
  callType: { type: String, enum: ["audio", "video", "conference", "meeting"], default: "audio", index: true },
  direction: { type: String, enum: ["incoming", "outgoing"], default: "outgoing" },
  status: { type: String, enum: ["ringing", "answered", "missed", "declined", "cancelled", "failed", "ended"], default: "ringing", index: true },
  startedAt: Date,
  answeredAt: Date,
  endedAt: Date,
  durationSeconds: { type: Number, default: 0 },
  missedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  declinedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  seenBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  hiddenFor: [{ type: Schema.Types.ObjectId, ref: "User" }],
  endedBy: { type: Schema.Types.ObjectId, ref: "User" },
  recordingUrl: String,
  quality: { networkType: String, averageBitrate: Number, packetLoss: Number, jitter: Number, latency: Number },
  metadata: { ipAddress: String, userAgent: String, device: String, platform: String }
}, { timestamps: true });

callLogSchema.pre("save", function(next){
  if(this.answeredAt && this.endedAt){
    this.durationSeconds = Math.max(0, Math.floor((this.endedAt - this.answeredAt) / 1000));
  }
  if(!this.participants?.length) this.participants = [this.caller, this.receiver].filter(Boolean);
  next();
});

callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ receiver: 1, createdAt: -1 });
callLogSchema.index({ participants: 1, createdAt: -1 });
callLogSchema.index({ conversationId: 1, createdAt: -1 });
callLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CallLog", callLogSchema);
