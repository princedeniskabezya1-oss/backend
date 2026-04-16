const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Post = require("../models/Post");
const User = require("../models/User");

function calcEngagement(post) {
  const commentCount = post.comments.length;
  const replyCount = post.comments.reduce((acc, c) => acc + (c.replies ? c.replies.length : 0), 0);
  return (post.likes.length * 3) + (commentCount * 5) + (replyCount * 2) + (post.viewsCount || 0);
}

router.get("/", auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const followingIds = Array.isArray(currentUser.following) ? currentUser.following : [];
    const userObjectId = currentUser._id;
    const skip = Number(req.query.skip || 0);
    const limit = Number(req.query.limit || 20);

    let posts = [];

    if (followingIds.length > 0) {
      posts = await Post.find({
        author: { $in: [...followingIds, userObjectId] }
      })
        .populate("author", "name companyName profileImage headline")
        .populate("comments.user", "name profileImage")
        .populate("comments.replies.user", "name profileImage");

      posts.forEach(post => {
        post.engagementScore = calcEngagement(post);
      });

      posts.sort((a, b) => b.engagementScore - a.engagementScore);
      posts = posts.slice(skip, skip + limit);
    } else {
      posts = await Post.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("author", "name companyName profileImage headline");
    }

    res.json(posts);
  } catch (err) {
    console.error("FEED ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.body.text || !req.body.text.trim()) {
      return res.status(400).json({ message: "Post content is required" });
    }

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: "aift_posts",
            resource_type: "auto"
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        ).end(req.file.buffer);
      });

      mediaUrl = uploadResult.secure_url;
      mediaType = req.file.mimetype?.startsWith("video/") ? "video" : "image";
    }

    const post = await Post.create({
      author: req.user.id,
      text: req.body.text.trim(),
      mediaUrl,
      mediaType
    });

    const populated = await Post.findById(post._id).populate("author", "name companyName profileImage headline");
    req.app.get("io").emit("post_created", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

router.patch("/:id/view", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const viewerId = String(req.user.id);
    const alreadyViewed = post.uniqueViewers.some(id => String(id) === viewerId);

    if (!alreadyViewed) {
      post.uniqueViewers.push(req.user.id);
      post.viewsCount += 1;
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    res.json({
      viewsCount: post.viewsCount,
      uniqueViewers: post.uniqueViewers.length
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to track post view" });
  }
});

router.get("/analytics/mine", auth, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.user.id }).sort({ createdAt: -1 });

    const summary = {
      totalPosts: posts.length,
      totalViews: posts.reduce((sum, p) => sum + (p.viewsCount || 0), 0),
      totalLikes: posts.reduce((sum, p) => sum + p.likes.length, 0),
      totalComments: posts.reduce((sum, p) => sum + p.comments.length, 0),
      totalShares: posts.reduce((sum, p) => sum + (p.sharesCount || 0), 0)
    };

    res.json({
      summary,
      posts: posts.map(post => ({
        _id: post._id,
        text: post.text,
        createdAt: post.createdAt,
        viewsCount: post.viewsCount || 0,
        likesCount: post.likes.length,
        commentsCount: post.comments.length,
        sharesCount: post.sharesCount || 0,
        engagementScore: calcEngagement(post)
      }))
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load post analytics" });
  }
});

router.patch("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const userId = String(req.user.id);
    const alreadyLiked = post.likes.some(id => String(id) === userId);

    if (alreadyLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    req.app.get("io").emit("post_like", {
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

router.post("/:id/comment", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!req.body.text || !req.body.text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    post.comments.push({
      user: req.user.id,
      text: req.body.text.trim(),
      likes: [],
      replies: []
    });

    post.engagementScore = calcEngagement(post);
    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate("comments.user", "name profileImage")
      .populate("comments.replies.user", "name profileImage");

    const newComment = updatedPost.comments[updatedPost.comments.length - 1];
    const totalComments = updatedPost.comments.reduce(
      (total, c) => total + 1 + (c.replies?.length || 0),
      0
    );

    req.app.get("io").emit("new_comment", {
      postId: post._id,
      comment: newComment,
      totalComments
    });

    res.json(newComment);
  } catch (err) {
    console.error("ADD COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;