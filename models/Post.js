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

    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true
    },

text: {
  type: String,
  default: "",
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
media: [
  {
    url: String,
    type: {
      type: String,
      enum: ["image", "video"]
    }
  }
],

repostOf: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Post",
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

    savesCount: {
      type: Number,
      default: 0
    },

    likesCount: {
      type: Number,
      default: 0
    },

    commentsCount: {
      type: Number,
      default: 0
    },

    engagementScore: {
      type: Number,
      default: 0
    },

    priorityScore: {
      type: Number,
      default: 0,
      index: true
    },

    isPromoted: {
      type: Boolean,
      default: false,
      index: true
    },

    promotedUntil: {
      type: Date,
      default: null,
      index: true
    },

    isHiddenByAdmin: {
      type: Boolean,
      default: false,
      index: true
    },

    moderationStatus: {
      type: String,
      enum: ["active", "reported", "under_review", "removed"],
      default: "active",
      index: true
    },

    reports: [ReportSchema]
  },
  { timestamps: true }
);

PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ groupId: 1, createdAt: -1 });
PostSchema.index({ createdAt: -1 });
PostSchema.index({ engagementScore: -1 });
PostSchema.index({ priorityScore: -1, createdAt: -1 });
PostSchema.index({ isPromoted: 1, promotedUntil: 1 });
PostSchema.index({ isHiddenByAdmin: 1 });
PostSchema.index({ moderationStatus: 1 });

module.exports = mongoose.model("Post", PostSchema);
