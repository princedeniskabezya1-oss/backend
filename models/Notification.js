const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: [
      "message",
      "message_reaction",
      "missed_call",
      "group_invite",
      "group_update",
      "follow",
      "like",
      "comment",
      "comment_reply",
      "post_share",
      "post_mention",
      "story_mention",
      "story_like",
      "story_reply",
      "application",
      "application_status",
      "application_follow_up",
      "job_invite",
      "job_update",
      "interview",
      "offer",
      "assignment",
      "assignment_updated",
      "submission",
      "submission_reviewed",
      "attendance",
      "class_update",
      "announcement",
      "meeting",
      "task",
      "team_update",
      "family_link_request",
      "family_link_accepted",
      "family_link_declined",
      "family_link_revoked",
      "student_identity",
      "review_case",
      "venture",
      "scholarship",
      "opportunity"
    ],
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  text: {
    type: String
  },
  link: {
    type: String
  },
  title: { type: String, trim: true, maxlength: 180 },
  image: { type: String, trim: true },
  entityType: { type: String, trim: true, maxlength: 80 },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  priority: {
    type: String,
    enum: ["low", "normal", "high"],
    default: "normal"
  },
  groupKey: { type: String, trim: true, maxlength: 220 },
  actionState: {
    type: String,
    enum: ["pending", "accepted", "declined", "completed"],
    default: undefined
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  seen: { type: Boolean, default: false },
  seenAt: Date,
  dismissed: { type: Boolean, default: false },
  dismissedAt: Date,
  expiresAt: Date
}, { timestamps: true });

notificationSchema.index({ user:1, read:1, createdAt:-1 });
notificationSchema.index({ user:1, type:1, createdAt:-1 });
notificationSchema.index({ user:1, dismissed:1, createdAt:-1 });
notificationSchema.index({ user:1, groupKey:1, createdAt:-1 });
notificationSchema.index({ expiresAt:1 }, { expireAfterSeconds:0, sparse:true });
notificationSchema.index({ user:1, type:1, "metadata.storyId":1, sender:1, createdAt:-1 });

module.exports = mongoose.model("Notification", notificationSchema);
