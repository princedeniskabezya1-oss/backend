const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Post = require("../models/Post");
const User = require("../models/User");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

/* =====================================================
   CREATE POST
===================================================== */
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      mediaUrl = req.file.path;
      mediaType = req.file.mimetype.startsWith("video")
        ? "video"
        : "image";
    }

    const newPost = new Post({
      author: req.user.id,
      content: req.body.content || "",
      mediaUrl,
      mediaType
    });

    await newPost.save();

    const populatedPost = await Post.findById(newPost._id)
      .populate("author", "name profileImage headline isPro followers")
      .populate("comments.user", "name profileImage");

    res.status(201).json(populatedPost);

  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   GET FEED
===================================================== */
router.get("/", auth, async (req, res) => {
  try {

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    const followingIds = user.following.map(id =>
      new mongoose.Types.ObjectId(id)
    );

    const posts = await Post.find({
      author: { $in: [...followingIds, userObjectId] }
    })
      .populate("author", "name profileImage headline isPro followers")
      .populate("comments.user", "name profileImage")
      .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    console.error("FEED ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   LIKE / UNLIKE
===================================================== */
router.patch("/:id/like", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.some(
      id => id.toString() === req.user.id
    );

    if (alreadyLiked) {
      post.likes = post.likes.filter(
        id => id.toString() !== req.user.id
      );
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();

    res.json({ likes: post.likes.length });

  } catch (err) {
    console.error("LIKE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   ADD COMMENT
===================================================== */
router.post("/:id/comment", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.comments.push({
      user: req.user.id,
      text: req.body.text
    });

    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate("comments.user", "name profileImage");

    res.json(updatedPost.comments);

  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;