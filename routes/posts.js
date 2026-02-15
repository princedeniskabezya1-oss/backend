const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

/*
================================================
CREATE POST (PRO ONLY)
================================================
*/
router.post(
  "/",
  auth,
  upload.single("media"),
  async (req, res) => {
    try {

      // 🔐 PRO LOCK
      if (!req.user.isPro) {
        return res.status(403).json({
          message: "Only Pro users can create posts"
        });
      }

      const { content } = req.body;

      const newPost = new Post({
        author: req.user.id,
        content,
        mediaUrl: req.file ? req.file.path : null,
        mediaType: req.file
          ? req.file.mimetype.startsWith("video")
            ? "video"
            : "image"
          : null
      });

      const saved = await newPost.save();
      res.status(201).json(saved);

    } catch (err) {
      res.status(400).json({ message: "Failed to create post" });
    }
  }
);

/*
================================================
GET ALL POSTS
================================================
*/
router.get("/", async (req, res) => {
  try {

    const posts = await Post.find()
      .populate("author", "name profileImage")
      .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    res.status(500).json({ message: "Failed to load posts" });
  }
});

/*
================================================
LIKE / UNLIKE POST
================================================
*/
router.patch("/:id/like", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const alreadyLiked = post.likes.includes(req.user.id);

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();

    res.json({ totalLikes: post.likes.length });

  } catch (err) {
    res.status(400).json({ message: "Failed to like post" });
  }
});

/*
================================================
ADD COMMENT
================================================
*/
router.post("/:id/comment", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const newComment = new Comment({
      postId: req.params.id,
      userId: req.user.id,
      text: req.body.text
    });

    const saved = await newComment.save();

    res.status(201).json(saved);

  } catch (err) {
    res.status(400).json({ message: "Failed to add comment" });
  }
});

/*
================================================
GET COMMENTS FOR POST
================================================
*/
router.get("/:id/comments", async (req, res) => {
  try {

    const comments = await Comment.find({
      postId: req.params.id
    }).populate("userId", "name profileImage")
      .sort({ createdAt: -1 });

    res.json(comments);

  } catch (err) {
    res.status(500).json({ message: "Failed to load comments" });
  }
});

module.exports = router;
