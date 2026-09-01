const mongoose = require("mongoose");

const StoryViewerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const StorySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["text", "image", "video"],
      required: true
    },
    text: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: ""
    },
    mediaUrl: {
      type: String,
      trim: true,
      default: ""
    },
    mediaPublicId: {
      type: String,
      trim: true,
      default: ""
    },
    mediaMimeType: {
      type: String,
      trim: true,
      default: ""
    },
    background: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ""
    },
    audience: {
      type: String,
      enum: ["connections", "everyone"],
      default: "connections",
      index: true
    },
    viewers: {
      type: [StoryViewerSchema],
      default: []
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ author: 1, createdAt: -1 });
StorySchema.index({ audience: 1, expiresAt: 1, createdAt: -1 });

StorySchema.virtual("viewerCount").get(function viewerCount(){
  return Array.isArray(this.viewers) ? this.viewers.length : 0;
});

StorySchema.set("toJSON", { virtuals: true });
StorySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Story", StorySchema);
