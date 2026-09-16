const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true, maxlength: 80, index: true },
  severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium", index: true },
  outcome: { type: String, trim: true, maxlength: 80, default: "blocked" },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  ipFingerprint: { type: String, trim: true, maxlength: 128, default: null, index: true },
  maskedIp: { type: String, trim: true, maxlength: 80, default: null },
  userAgent: { type: String, trim: true, maxlength: 500, default: null },
  method: { type: String, trim: true, maxlength: 12, default: null },
  path: { type: String, trim: true, maxlength: 300, default: null },
  requestId: { type: String, trim: true, maxlength: 100, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true, versionKey: false });

securityEventSchema.index({ createdAt: -1, severity: 1 });

module.exports = mongoose.model("SecurityEvent", securityEventSchema);
