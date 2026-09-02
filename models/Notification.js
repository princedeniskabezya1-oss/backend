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
      "follow",
      "like",
      "comment",
      "story_mention",
      "story_like",
      "story_reply",
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
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

notificationSchema.index({ user:1, read:1, createdAt:-1 });
notificationSchema.index({ user:1, type:1, createdAt:-1 });
notificationSchema.index({ user:1, type:1, "metadata.storyId":1, sender:1, createdAt:-1 });

module.exports = mongoose.model("Notification", notificationSchema);
