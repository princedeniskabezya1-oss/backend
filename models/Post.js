const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    reason: {
      type: String,
      default: "Reported from feed",
      trim: true
    }
  },
  { timestamps: true }
);

const ReplySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  { timestamps: true }
);

const CommentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    replies: [ReplySchema]
  },
  { timestamps: true }
);

const PostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    text: {
      type: String,
      required: true,
      trim: true
    },

    mediaUrl: {
      type: String,
      default: null
    },

    mediaType: {
      type: String,
      enum: ["image", "video", null],
      default: null
    },

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    comments: [CommentSchema],

    viewsCount: {
      type: Number,
      default: 0
    },

    uniqueViewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    sharesCount: {
      type: Number,
      default: 0
    },

    engagementScore: {
      type: Number,
      default: 0
    },

    reports: [ReportSchema],

    isHiddenByAdmin: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ createdAt: -1 });
PostSchema.index({ engagementScore: -1 });
PostSchema.index({ isHiddenByAdmin: 1 });

module.exports = mongoose.model("Post", PostSchema);