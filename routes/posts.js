const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const auth = require("../middleware/auth");

/*
==========================================
CREATE POST
==========================================
*/
router.post("/", auth, async (req, res) => {
  try {

    if (req.user.role !== "employer") {
      return res.status(403).json({ message: "Only employers can post" });
    }

    // PRO check for media
    if (!req.user.isPro && (req.body.image || req.body.video)) {
      return res.status(403).json({
        message: "Upgrade to PRO to post media"
      });
    }

    const post = new Post({
      employerId: req.user.id,
      content: req.body.content,
      image: req.body.image,
      video: req.body.video,
      isProContent: req.user.isPro
    });

    const saved = await post.save();
    res.status(201).json(saved);

  } catch (err) {
    res.status(400).json({ message: "Failed to create post" });
  }
});

/*
==========================================
GET ALL POSTS
==========================================
*/
router.get("/", async (req, res) => {
  try {

    const posts = await Post.find()
      .populate("employerId", "name profilePicture")
      .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    res.status(500).json({ message: "Failed to load posts" });
  }
});

/*
==========================================
LIKE POST
==========================================
*/
router.post("/:id/like", auth, async (req, res) => {

  const post = await Post.findById(req.params.id);

  if (!post.likes.includes(req.user.id)) {
    post.likes.push(req.user.id);
  } else {
    post.likes = post.likes.filter(
      id => id.toString() !== req.user.id
    );
  }

  await post.save();
  res.json(post);
});

/*
==========================================
COMMENT
==========================================
*/
router.post("/:id/comment", auth, async (req, res) => {

  const comment = new Comment({
    postId: req.params.id,
    userId: req.user.id,
    text: req.body.text
  });

  const saved = await comment.save();
  res.status(201).json(saved);
});

module.exports = router;
