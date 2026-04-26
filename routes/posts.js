const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Post = require("../models/Post");
const User = require("../models/User");

const USER_POPULATE =
  "name companyName profileImage headline role isVerified verified adminVerified badges following";

function getIo(req) {
  return req.app.get("io");
}

function isOwnerOrAdmin(req, post) {
  return String(post.author) === String(req.user.id) || req.user.role === "admin";
}

function calcEngagement(post) {
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];

  const commentCount = comments.length;

  const replyCount = comments.reduce(
    (acc, c) => acc + (Array.isArray(c.replies) ? c.replies.length : 0),
    0
  );

  return (
    (likes.length * 3) +
    (commentCount * 5) +
    (replyCount * 2) +
    (Number(post.viewsCount || 0)) +
    (Number(post.sharesCount || 0) * 4)
  );
}

async function populatePost(postId) {
  return Post.findById(postId)
    .populate("author", USER_POPULATE)
    .populate("likes", USER_POPULATE)
    .populate("comments.user", USER_POPULATE)
    .populate("comments.likes", USER_POPULATE)
    .populate("comments.replies.user", USER_POPULATE)
    .populate("comments.replies.likes", USER_POPULATE);
}

/* ==========================
   GET FEED
========================== */
router.get("/", auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const followingIds = Array.isArray(currentUser?.following) ? currentUser.following : [];

    const skip = Math.max(Number(req.query.skip || 0), 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    const query = { isHiddenByAdmin: { $ne: true } };

    if (followingIds.length > 0) {
      query.author = { $in: [...followingIds, currentUser._id] };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", USER_POPULATE)
      .populate("likes", USER_POPULATE)
      .populate("comments.user", USER_POPULATE)
      .populate("comments.likes", USER_POPULATE)
      .populate("comments.replies.user", USER_POPULATE)
      .populate("comments.replies.likes", USER_POPULATE);

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
    const text = req.body.text?.trim();
    const hasMedia = Boolean(req.file);

    if (!text && !hasMedia) {
      return res.status(400).json({ message: "Post content or media is required" });
    }

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "aift_posts",
              resource_type: "auto"
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          )
          .end(req.file.buffer);
      });

      mediaUrl = uploadResult.secure_url;
      mediaType = req.file.mimetype?.startsWith("video/") ? "video" : "image";
    }

    const post = await Post.create({
      author: req.user.id,
      text: text || " ",
      mediaUrl,
      mediaType
    });

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_created", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   ANALYTICS — MUST STAY ABOVE /:id
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
    console.error("ANALYTICS ERROR:", err);
    res.status(500).json({ message: "Failed to load post analytics" });
  }
});

/* ==========================
   FOLLOW / UNFOLLOW USER
========================== */
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

    getIo(req)?.emit("user_follow_updated", {
      followerId: me._id,
      targetId: target._id,
      following: !alreadyFollowing
    });

    res.json({
      following: !alreadyFollowing,
      targetId: target._id
    });
  } catch (err) {
    console.error("FOLLOW ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   GET SINGLE POST — BELOW SPECIAL ROUTES
========================== */
router.get("/:id", auth, async (req, res) => {
  try {
    const post = await populatePost(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (err) {
    console.error("GET SINGLE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   EDIT POST — OWNER OR ADMIN ONLY
========================== */
router.patch("/:id", auth, upload.single("media"), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!isOwnerOrAdmin(req, post)) {
      return res.status(403).json({ message: "You can only edit your own post" });
    }

    const text = req.body.text?.trim();

    if (text !== undefined && text !== "") {
      post.text = text;
    }

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "aift_posts",
              resource_type: "auto"
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          )
          .end(req.file.buffer);
      });

      post.mediaUrl = uploadResult.secure_url;
      post.mediaType = req.file.mimetype?.startsWith("video/") ? "video" : "image";
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_updated", populated);

    res.json(populated);
  } catch (err) {
    console.error("EDIT POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   DELETE POST — OWNER OR ADMIN ONLY
========================== */
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!isOwnerOrAdmin(req, post)) {
      return res.status(403).json({ message: "You can only delete your own post" });
    }

    await Post.findByIdAndDelete(req.params.id);

    getIo(req)?.emit("post_deleted", {
      postId: req.params.id
    });

    res.json({
      deleted: true,
      postId: req.params.id
    });
  } catch (err) {
    console.error("DELETE POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   VIEW POST
========================== */
router.patch("/:id/view", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.uniqueViewers = Array.isArray(post.uniqueViewers) ? post.uniqueViewers : [];

const alreadyViewed = post.uniqueViewers.some(
  id => String(id) === String(req.user.id)
);

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
    console.error("VIEW POST ERROR:", err);
    res.status(500).json({ message: "Failed to track post view" });
  }
});

/* ==========================
   LIKE / UNLIKE POST — SAVED IN MONGODB
========================== */
router.patch("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

   post.likes = Array.isArray(post.likes) ? post.likes : [];

const alreadyLiked = post.likes.some(
  id => String(id) === String(req.user.id)
);

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.push(req.user.id);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_like", {
      postId: post._id,
      likes: populated.likes,
      likesCount: populated.likes.length,
      likedBy: req.user.id,
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
    const post = await Post.findById(req.params.id).populate("likes", USER_POPULATE);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post.likes || []);
  } catch (err) {
    console.error("LOAD LIKES ERROR:", err);
    res.status(500).json({ message: "Failed to load likes" });
  }
});

/* ==========================
   ADD COMMENT — SAVED IN MONGODB
========================== */
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
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

    getIo(req)?.emit("new_comment", {
      postId: post._id,
      comment: newComment
    });

    res.json(newComment);
  } catch (err) {
    console.error("ADD COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/comments", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
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

    getIo(req)?.emit("new_comment", {
      postId: post._id,
      comment: newComment
    });

    res.json(newComment);
  } catch (err) {
    console.error("ADD COMMENT ALIAS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   DELETE COMMENT — POST OWNER, COMMENT OWNER, OR ADMIN
========================== */
router.delete("/:postId/comments/:commentId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const canDelete =
      String(post.author) === String(req.user.id) ||
      String(comment.user) === String(req.user.id) ||
      req.user.role === "admin";

    if (!canDelete) {
      return res.status(403).json({ message: "You cannot delete this comment" });
    }

    comment.deleteOne();

    post.engagementScore = calcEngagement(post);
    await post.save();

    getIo(req)?.emit("comment_deleted", {
      postId: post._id,
      commentId: req.params.commentId
    });

    res.json({
      deleted: true,
      commentId: req.params.commentId
    });
  } catch (err) {
    console.error("DELETE COMMENT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE COMMENT — SAVED IN MONGODB
========================== */
router.patch("/:postId/comments/:commentId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const alreadyLiked = comment.likes.some(
      id => String(id) === String(req.user.id)
    );

    if (alreadyLiked) {
      comment.likes.pull(req.user.id);
    } else {
      comment.likes.push(req.user.id);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);

    getIo(req)?.emit("comment_like", {
      postId: post._id,
      commentId: comment._id,
      likes: updatedComment.likes,
      likesCount: updatedComment.likes.length,
      likedBy: req.user.id,
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
   REPLY TO COMMENT — SAVED IN MONGODB
========================== */
router.post("/:postId/comments/:commentId/reply", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
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

    getIo(req)?.emit("new_reply", {
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
   DELETE REPLY — POST OWNER, REPLY OWNER, OR ADMIN
========================== */
router.delete("/:postId/comments/:commentId/replies/:replyId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
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

    const canDelete =
      String(post.author) === String(req.user.id) ||
      String(reply.user) === String(req.user.id) ||
      req.user.role === "admin";

    if (!canDelete) {
      return res.status(403).json({ message: "You cannot delete this reply" });
    }

    reply.deleteOne();

    post.engagementScore = calcEngagement(post);
    await post.save();

    getIo(req)?.emit("reply_deleted", {
      postId: post._id,
      commentId: comment._id,
      replyId: req.params.replyId
    });

    res.json({
      deleted: true,
      replyId: req.params.replyId
    });
  } catch (err) {
    console.error("DELETE REPLY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE REPLY — SAVED IN MONGODB
========================== */
router.patch("/:postId/comments/:commentId/replies/:replyId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
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

    const alreadyLiked = reply.likes.some(
      id => String(id) === String(req.user.id)
    );

    if (alreadyLiked) {
      reply.likes.pull(req.user.id);
    } else {
      reply.likes.push(req.user.id);
    }

    post.engagementScore = calcEngagement(post);
    await post.save();

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);
    const updatedReply = updatedComment.replies.id(req.params.replyId);

    getIo(req)?.emit("reply_like", {
      postId: post._id,
      commentId: comment._id,
      replyId: reply._id,
      likes: updatedReply.likes,
      likesCount: updatedReply.likes.length,
      likedBy: req.user.id,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: updatedReply.likes.length,
      reply: updatedReply
    });
  } catch (err) {
    console.error("REPLY LIKE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   SHARE TRACKING
========================== */
router.post("/:id/share", auth, async (req, res) => {
  try {
    const original = await Post.findById(req.params.id);

    if (!original || original.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    original.sharesCount += 1;
    original.engagementScore = calcEngagement(original);
    await original.save();

    getIo(req)?.emit("post_shared", {
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

/* ==========================
   REPOST
========================== */
router.post("/:id/repost", auth, async (req, res) => {
  try {
    const original = await Post.findById(req.params.id).populate("author", USER_POPULATE);

    if (!original || original.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const caption = req.body.text?.trim();
    const originalAuthor = original.author?.companyName || original.author?.name || "AIFT user";

    const repost = await Post.create({
      author: req.user.id,
      text: caption
        ? `${caption}\n\n↳ Reposted from ${originalAuthor}:\n${original.text}`
        : `↳ Reposted from ${originalAuthor}:\n${original.text}`,
      mediaUrl: original.mediaUrl,
      mediaType: original.mediaType
    });

    original.sharesCount += 1;
    original.engagementScore = calcEngagement(original);
    await original.save();

    const populated = await populatePost(repost._id);

    getIo(req)?.emit("post_created", populated);
    getIo(req)?.emit("post_shared", {
      postId: original._id,
      sharesCount: original.sharesCount
    });

    res.status(201).json(populated);
  } catch (err) {
    console.error("REPOST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   REPORT POST
========================== */
router.post("/:id/report", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.reports = Array.isArray(post.reports) ? post.reports : [];

    const alreadyReported = post.reports.some(
      report => String(report.user) === String(req.user.id)
    );

    if (!alreadyReported) {
      post.reports.push({
        user: req.user.id,
        reason: req.body.reason || "Reported from feed"
      });

      await post.save();
    }

    getIo(req)?.emit("post_reported", {
      postId: post._id
    });

    res.json({
      reported: true,
      reportsCount: post.reports.length
    });
  } catch (err) {
    console.error("REPORT POST ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;