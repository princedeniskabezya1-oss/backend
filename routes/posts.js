const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

/*
=========================================
CREATE POST (PRO ONLY)
=========================================
*/
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {

    if (!req.user.isPro) {
      return res.status(403).json({ message: "Upgrade to Pro to post media" });
    }

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

    res.status(201).json(newPost);

  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Post failed" });
  }
});


/*
=========================================
GET FOLLOW-BASED FEED
=========================================
*/
router.get("/", auth, async (req, res) => {
  try {

    const user = await require("../models/User").findById(req.user.id);

    const posts = await Post.find({
      author: { $in: [...user.following, req.user.id] }
    })
    .populate("author", "name profileImage headline isPro followers")
    .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    res.status(500).json({ message: "Failed to load feed" });
  }
});


/*
=========================================
LIKE / UNLIKE
=========================================
*/
router.patch("/:id/like", auth, async (req, res) => {

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
});


/*
=========================================
ADD COMMENT
=========================================
*/
router.post("/:id/comment", auth, async (req, res) => {

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
});

module.exports = router;
