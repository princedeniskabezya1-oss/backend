const mongoose = require("mongoose");

const StorySettingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    muted: {
      type: Boolean,
      default: false,
      index: true
    },
    mutedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

StorySettingSchema.index(
  { user: 1, author: 1 },
  { unique: true }
);

module.exports = mongoose.model("StorySetting", StorySettingSchema);
