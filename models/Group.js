const mongoose = require("mongoose");

const GroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200
    },

    category: {
      type: String,
      enum: ["employer", "school", "agent", "talent", "student"],
      required: true,
      index: true
    },

    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public"
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
        postsCount: {
      type: Number,
      default: 0
    },

    membersCount: {
      type: Number,
      default: 0
    },

    followersCount: {
      type: Number,
      default: 0
    },

    coverImage: {
      type: String,
      default: ""
    },

    logo: {
      type: String,
      default: ""
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

GroupSchema.index({ name: "text", description: "text" });
GroupSchema.index({ category: 1, createdAt: -1 });
GroupSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Group", GroupSchema);
