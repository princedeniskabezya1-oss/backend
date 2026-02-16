const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({

  /*
  ==========================================
  AUTHOR
  ==========================================
  */
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  /*
  ==========================================
  CONTENT
  ==========================================
  */
  content: {
    type: String,
    trim: true,
    default: ""
  },

  /*
  ==========================================
  MEDIA (IMAGE OR VIDEO)
  ==========================================
  */
  mediaUrl: {
    type: String,
    default: null
  },

  mediaType: {
    type: String,
    enum: ["image", "video", null],
    default: null
  },

  /*
  ==========================================
  ENGAGEMENT
  ==========================================
  */
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    text: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]

}, { timestamps: true });

module.exports = mongoose.model("Post", PostSchema);
