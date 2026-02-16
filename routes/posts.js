const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const upload = require("../middleware/upload");
const auth = require("../middleware/auth");

/*
================================================
CREATE POST (PRO USERS ONLY)
Supports:
- Text
- Image
- Video
================================================
*/
router.post("/", auth, upload.single("media"), async (req, res) => {
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
      content: content || "",
      mediaUrl: req.file ? req.file.path : null,
      mediaType: req.file
        ? req.file.mimetype.startsWith("video")
          ? "video"
          : "image"
        : null
    });

    const savedPost = await newPost.save();

    res.status(201).json(savedPost);

  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to create post" });
  }
});


//*
==========================================
GET ALL POSTS
==========================================
*/
router.get("/", async (req, res) => {
  try {

    const posts = await Post.find()
      .populate("author", "name profileImage headline isPro")
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

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.includes(req.user.id);

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();

    res.json({
      likes: post.likes.length
    });

  } catch (err) {
    res.status(400).json({ message: "Failed to update like" });
  }
});


/*
================================================
ADD COMMENT (Simple version)
Stored inside Post for simplicity
================================================
*/
router.post("/:id/comment", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.comments = post.comments || [];

    post.comments.push({
      user: req.user.id,
      text: req.body.text,
      createdAt: new Date()
    });

    await post.save();

    res.json(post.comments);

  } catch (err) {
    res.status(400).json({ message: "Failed to add comment" });
  }
});


module.exports = router;
