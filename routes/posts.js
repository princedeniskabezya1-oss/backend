const express = require("express");
const router = express.Router();

const Post = require("../models/Post");
const User = require("../models/User");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

/* =====================================================
   CREATE POST (NO PRO RESTRICTION)
===================================================== */
router.post(
  "/",
  auth,
  upload.single("media"),
  async (req, res) => {
    try {

      const newPost = new Post({
        author: req.user.id,
        content: req.body.content || "",
        mediaUrl: req.file ? req.file.path : null,
        mediaType: req.file
          ? req.file.mimetype.startsWith("video") 
            ? "video"
            : "image"
          : null
      });

      await newPost.save();

      const populatedPost = await newPost.populate(
        "author",
        "name profileImage headline isPro followers"
      );

      res.status(201).json(populatedPost);

    } catch (err) {
      console.error("CREATE POST ERROR:", err);
      res.status(400).json({ message: "Post failed" });
    }
  }
);

/* =====================================================
   GET FEED
===================================================== */
router.get("/", auth, async (req, res) => {
  try {

    const user = await User.findById(req.user.id);

const posts = await Post.find({
  author: { $in: [...user.following, req.user.id] }
})
  .populate("author", "name profileImage headline isPro followers")
  .populate("comments.user", "name profileImage")
  .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    console.error("FEED ERROR:", err);
    res.status(500).json({ message: "Failed to load feed" });
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

    const alreadyLiked = post.likes.includes(req.user.id);

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.push(req.user.id);
    }

    await post.save();

    res.json({ likes: post.likes.length });

  } catch (err) {
    console.error("LIKE ERROR:", err);
    res.status(400).json({ message: "Like failed" });
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

    res.json(post.comments);

  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(400).json({ message: "Comment failed" });
  }
});

module.exports = router;
