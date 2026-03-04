const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Post = require("../models/Post");
const User = require("../models/User");

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

const cloudinary = require("../config/cloudinary");

/* =====================================================
   CREATE POST
===================================================== */
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {

      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: "aift_media",
            resource_type: "auto"
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        ).end(req.file.buffer);
      });

      mediaUrl = uploadResult.secure_url;
      mediaType = uploadResult.resource_type === "video" ? "video" : "image";
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
.populate("comments.user", "name profileImage")
.populate("comments.replies.user", "name profileImage");
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

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.id);

    let followingIds = [];

    if (Array.isArray(user.following)) {
      followingIds = user.following
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
    }

let posts = [];

// 🔥 IF user follows people → normal feed
if (followingIds.length > 0) {

  posts = await Post.find({
    author: { $in: [...followingIds, userObjectId] }
  })
  .populate("author", "name profileImage headline")
  .populate("comments.user", "name profileImage")
  .populate("comments.replies.user", "name profileImage");

  posts.forEach(post => {

    const commentCount = post.comments.length;

    const replyCount = post.comments.reduce(
      (acc, c) => acc + (c.replies ? c.replies.length : 0),
      0
    );

    post.score =
      (post.likes.length * 3) +
      (commentCount * 5) +
      (replyCount * 2);

  });

  posts.sort((a, b) => b.score - a.score);

  posts = posts.slice(skip, skip + limit);

}

    // 🔥 IF user follows nobody → return trending posts
    if (followingIds.length === 0) {
      posts = await Post.find()
        .sort({ likes: -1, createdAt: -1 })
        .limit(5)
        .populate("author", "name profileImage headline");
    }

    res.json(posts);

  } catch (err) {
    console.error("FEED ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   LIKE / UNLIKE POST
===================================================== */
router.patch("/:id/like", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const userId = req.user.id;

    const alreadyLiked = post.likes.some(
      id => id.toString() === userId
    );

    if (alreadyLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();

    const io = req.app.get("io");

    io.emit("post_like", {
      postId: post._id,
      likes: post.likes.length
    });

    res.json({
      likes: post.likes.length,
      liked: !alreadyLiked
    });

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
  text: req.body.text,
  likes: [],
  replies: []
});

    await post.save();

    const updatedPost = await Post.findById(post._id)
  .populate("comments.user", "name profileImage");

const newComment = updatedPost.comments[updatedPost.comments.length - 1];

const io = req.app.get("io");

io.emit("new_comment", {
  postId: post._id,
  comment: newComment
});

res.json(newComment);
  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});
/* =========================================
   LIKE / UNLIKE COMMENT
========================================= */
router.patch("/:postId/comment/:commentId/like", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const userId = req.user.id;

    if (!comment.likes) {
      comment.likes = [];
    }

    const alreadyLiked = comment.likes.some(
      id => id.toString() === userId
    );

    if (alreadyLiked) {
      comment.likes.pull(userId);
    } else {
      comment.likes.push(userId);
    }

    // 🔥 IMPORTANT: tell mongoose nested field changed
    post.markModified("comments");

    await post.save();

    res.json({
      likes: comment.likes.length,
      liked: !alreadyLiked
    });

  } catch (err) {
    console.error("COMMENT LIKE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/* =====================================================
   GET SINGLE POST (FOR COMMENTS)
===================================================== */
router.get("/:id", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.id)
      .populate("author", "name profileImage headline")
.populate("comments.user", "name profileImage")
.populate("comments.replies.user", "name profileImage");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);

  } catch (err) {
    console.error("GET SINGLE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});
/* =========================================
   GET POSTS BY USER
========================================= */
router.get("/user/:id", auth, async (req, res) => {
  try {

    const posts = await Post.find({ author: req.params.id })
      .populate("author", "name profileImage headline")
      .sort({ createdAt: -1 });

    res.json(posts);

  } catch (err) {
    res.status(500).json({ message: "Failed to load user posts" });
  }
});
/* =========================================
   ADD REPLY TO COMMENT
========================================= */
router.post("/:postId/comment/:commentId/reply", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    comment.replies.push({
      user: req.user.id,
      text: req.body.text,
      likes: []
    });

    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate("comments.user", "name profileImage")
      .populate("comments.replies.user", "name profileImage");

    const updatedComment = updatedPost.comments.id(req.params.commentId);

    const io = req.app.get("io");

io.emit("new_reply", {
  postId: post._id,
  commentId: req.params.commentId,
  comment: updatedComment
});

res.json(updatedComment);

  } catch (err) {
    console.error("REPLY ERROR:", err);
    res.status(500).json({ message: "Reply failed" });
  }
});


/* =========================================
   LIKE / UNLIKE REPLY
========================================= */
router.patch("/:postId/comment/:commentId/reply/:replyId/like", auth, async (req, res) => {
  try {

    const post = await Post.findById(req.params.postId);
    const comment = post.comments.id(req.params.commentId);
    const reply = comment.replies.id(req.params.replyId);

    if (!reply.likes) reply.likes = [];

    const alreadyLiked = reply.likes.some(
      id => id.toString() === req.user.id
    );

    if (alreadyLiked) {
      reply.likes = reply.likes.filter(
        id => id.toString() !== req.user.id
      );
    } else {
      reply.likes.push(req.user.id);
    }

    await post.save();

    res.json({ likes: reply.likes.length });

  } catch (err) {
    console.error("REPLY LIKE ERROR:", err);
    res.status(500).json({ message: "Reply like failed" });
  }
});
module.exports = router;