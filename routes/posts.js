const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Post = require("../models/Post");
const User = require("../models/User");

function calcEngagement(post) {
  const commentCount = post.comments?.length || 0;
  const replyCount = post.comments?.reduce(
    (acc, c) => acc + (c.replies ? c.replies.length : 0),
    0
  ) || 0;

  return (
    ((post.likes?.length || 0) * 3) +
    (commentCount * 5) +
    (replyCount * 2) +
    (post.viewsCount || 0) +
    ((post.sharesCount || 0) * 4)
  );
}

async function populatePost(postId) {
  return Post.findById(postId)
    .populate("author", "name companyName profileImage headline role")
    .populate("likes", "name companyName profileImage headline role")
    .populate("comments.user", "name companyName profileImage headline role")
    .populate("comments.likes", "name profileImage")
    .populate("comments.replies.user", "name companyName profileImage headline role")
    .populate("comments.replies.likes", "name profileImage");
}

/* ==========================
   GET FEED
========================== */
router.get("/", auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const followingIds = Array.isArray(currentUser?.following) ? currentUser.following : [];

    const skip = Number(req.query.skip || 0);
    const limit = Number(req.query.limit || 20);

    let query = {};

    if (followingIds.length > 0) {
      query = {
        author: { $in: [...followingIds, currentUser._id] }
      };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "name companyName profileImage headline role")
      .populate("likes", "name companyName profileImage headline role")
      .populate("comments.user", "name companyName profileImage headline role")
      .populate("comments.likes", "name profileImage")
      .populate("comments.replies.user", "name companyName profileImage headline role")
      .populate("comments.replies.likes", "name profileImage");

    res.json(posts);
  } catch (err) {
    console.error("FEED ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   CREATE POST
========================== */
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

    const populated = await populatePost(post._id);

    req.app.get("io")?.emit("post_created", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   VIEW POST
========================== */
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

/* ==========================
   LIKE / UNLIKE POST
========================== */
router.patch("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const userId = String(req.user.id);
    const alreadyLiked = post.likes.some(id => String(id) === userId);

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.push(req.user.id);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);

    req.app.get("io")?.emit("post_like", {
      postId: post._id,
      likes: populated.likes,
      likesCount: populated.likes.length,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: populated.likes.length,
      likes: populated.likes
    });
  } catch (err) {
    console.error("LIKE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   GET PEOPLE WHO LIKED POST
========================== */
router.get("/:id/likes", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("likes", "name companyName profileImage headline role");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post.likes || []);
  } catch (err) {
    res.status(500).json({ message: "Failed to load likes" });
  }
});

/* ==========================
   ADD COMMENT
========================== */
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    post.comments.push({
      user: req.user.id,
      text,
      likes: [],
      replies: []
    });

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);
    const newComment = populated.comments[populated.comments.length - 1];

    req.app.get("io")?.emit("new_comment", {
      postId: post._id,
      comment: newComment
    });

    res.json(newComment);
  } catch (err) {
    console.error("ADD COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* same route alias for cleaner frontend */
router.post("/:id/comments", auth, async (req, res, next) => {
  req.url = `/${req.params.id}/comment`;
  next();
});

/* ==========================
   LIKE / UNLIKE COMMENT
========================== */
router.patch("/:postId/comments/:commentId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const userId = String(req.user.id);
    const alreadyLiked = comment.likes.some(id => String(id) === userId);

    if (alreadyLiked) {
      comment.likes.pull(req.user.id);
    } else {
      comment.likes.push(req.user.id);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);

    req.app.get("io")?.emit("comment_like", {
      postId: post._id,
      commentId: comment._id,
      likesCount: updatedComment.likes.length,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: updatedComment.likes.length,
      comment: updatedComment
    });
  } catch (err) {
    console.error("COMMENT LIKE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   REPLY TO COMMENT
========================== */
router.post("/:postId/comments/:commentId/reply", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    comment.replies.push({
      user: req.user.id,
      text,
      likes: []
    });

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);
    const newReply = updatedComment.replies[updatedComment.replies.length - 1];

    req.app.get("io")?.emit("new_reply", {
      postId: post._id,
      commentId: comment._id,
      reply: newReply
    });

    res.json(newReply);
  } catch (err) {
    console.error("REPLY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE REPLY
========================== */
router.patch("/:postId/comments/:commentId/replies/:replyId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const reply = comment.replies.id(req.params.replyId);

    if (!reply) {
      return res.status(404).json({ message: "Reply not found" });
    }

    const userId = String(req.user.id);
    const alreadyLiked = reply.likes.some(id => String(id) === userId);

    if (alreadyLiked) {
      reply.likes.pull(req.user.id);
    } else {
      reply.likes.push(req.user.id);
    }

    await post.save();

    res.json({
      liked: !alreadyLiked,
      likesCount: reply.likes.length
    });
  } catch (err) {
    console.error("REPLY LIKE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   REPOST / SHARE TRACKING
========================== */
router.post("/:id/share", auth, async (req, res) => {
  try {
    const original = await Post.findById(req.params.id);

    if (!original) {
      return res.status(404).json({ message: "Post not found" });
    }

    original.sharesCount += 1;
    original.engagementScore = calcEngagement(original);
    await original.save();

    req.app.get("io")?.emit("post_shared", {
      postId: original._id,
      sharesCount: original.sharesCount
    });

    res.json({
      shared: true,
      sharesCount: original.sharesCount
    });
  } catch (err) {
    console.error("SHARE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/repost", auth, async (req, res) => {
  try {
    const original = await Post.findById(req.params.id)
      .populate("author", "name companyName profileImage headline role");

    if (!original) {
      return res.status(404).json({ message: "Post not found" });
    }

    const caption = req.body.text?.trim();

    const repost = await Post.create({
      author: req.user.id,
      text: caption
        ? `${caption}\n\n↳ Reposted from ${original.author?.name || "AIFT user"}:\n${original.text}`
        : `↳ Reposted from ${original.author?.name || "AIFT user"}:\n${original.text}`,
      mediaUrl: original.mediaUrl,
      mediaType: original.mediaType
    });

    original.sharesCount += 1;
    original.engagementScore = calcEngagement(original);
    await original.save();

    const populated = await populatePost(repost._id);

    req.app.get("io")?.emit("post_created", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("REPOST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   ANALYTICS
========================== */
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
router.patch("/users/:userId/follow", auth, async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.userId)) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const me = await User.findById(req.user.id);
    const target = await User.findById(req.params.userId);

    if (!me || !target) {
      return res.status(404).json({ message: "User not found" });
    }

    me.following = Array.isArray(me.following) ? me.following : [];

    const alreadyFollowing = me.following.some(
      id => String(id) === String(target._id)
    );

    if (alreadyFollowing) {
      me.following.pull(target._id);
    } else {
      me.following.push(target._id);
    }

    await me.save();

    req.app.get("io")?.emit("user_follow_updated", {
      followerId: me._id,
      targetId: target._id,
      following: !alreadyFollowing
    });

    res.json({
      following: !alreadyFollowing,
      targetId: target._id
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;