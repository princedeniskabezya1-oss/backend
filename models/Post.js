const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({

  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  content: {
    type: String,
    trim: true
  },

  mediaUrl: {
    type: String,
    default: null
  },

  mediaType: {
    type: String,
    enum: ["image", "video"],
    default: null
  },

  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]

}, { timestamps: true });

module.exports = mongoose.model("Post", PostSchema);
