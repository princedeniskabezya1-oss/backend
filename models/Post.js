const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  content: {
    type: String
  },

  image: {
    type: String
  },

  video: {
    type: String
  },

  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  isProContent: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("Post", postSchema);
