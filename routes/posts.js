const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");

const USER_POPULATE =
  "name companyName profileImage headline role isVerified verified adminVerified badges following followers";

function getIo(req) {
  return req.app.get("io");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function calcEngagement(post) {
  const likes = safeArray(post.likes);
  const comments = safeArray(post.comments);

  const replyCount = comments.reduce(
    (acc, c) => acc + safeArray(c.replies).length,
    0
  );

  return (
    likes.length * 3 +
    comments.length * 5 +
    replyCount * 2 +
    Number(post.viewsCount || 0) +
    Number(post.sharesCount || 0) * 4
  );
}

async function populatePost(postId) {
  return Post.findById(postId)
    .populate("author", USER_POPULATE)
    .populate("likes", USER_POPULATE)
    .populate("comments.user", USER_POPULATE)
    .populate("comments.likes", USER_POPULATE)
    .populate("comments.replies.user", USER_POPULATE)
    .populate("comments.replies.likes", USER_POPULATE)
    .populate({
      path: "repostOf",
      populate: [
        {
          path: "author",
          select: USER_POPULATE
        },
        {
          path: "likes",
          select: USER_POPULATE
        },
        {
          path: "comments.user",
          select: USER_POPULATE
        },
        {
          path: "comments.replies.user",
          select: USER_POPULATE
        }
      ]
    });
}

async function getCurrentUser(req) {
  return User.findById(req.user.id).select("role name companyName following");
}

function isAdmin(user) {
  return user?.role === "admin";
}

function isOwner(userId, ownerId) {
  return String(userId) === String(ownerId);
}

async function safeSavePost(post) {
  post.text = post.text || " ";
  post.likes = safeArray(post.likes);
  post.comments = safeArray(post.comments);
  post.uniqueViewers = safeArray(post.uniqueViewers);
  post.reports = safeArray(post.reports);
  post.viewsCount = Number(post.viewsCount || 0);
  post.sharesCount = Number(post.sharesCount || 0);
  post.engagementScore = calcEngagement(post);
  return post.save({ validateModifiedOnly: true });
}

/* ==========================
   GET FEED
========================== */
router.get("/", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const followingIds = safeArray(currentUser?.following);

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
      .populate("comments.replies.likes", USER_POPULATE)
.populate({
  path: "repostOf",
  populate: [
    {
      path: "author",
      select: USER_POPULATE
    },
    {
      path: "likes",
      select: USER_POPULATE
    },
    {
      path: "comments.user",
      select: USER_POPULATE
    },
    {
      path: "comments.replies.user",
      select: USER_POPULATE
    }
  ]
});

    res.json(posts);
  } catch (err) {
    console.error("FEED ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   CREATE POST
========================== */
router.post("/", auth, upload.array("media", 10), async (req, res) => {
  try {
    const text = req.body.text?.trim();
    const files = req.files || [];
const hasMedia = files.length > 0;

    if (!text && !hasMedia) {
      return res.status(400).json({ message: "Post content or media is required" });
    }

let mediaUrl = null;
let mediaType = null;
const media = [];

for (const file of files) {
  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: "aift_posts", resource_type: "auto" },
        (error, result) => (error ? reject(error) : resolve(result))
      )
      .end(file.buffer);
  });

  const type = file.mimetype?.startsWith("video/") ? "video" : "image";

  media.push({
    url: uploadResult.secure_url,
    type
  });
}

if (media.length) {
  mediaUrl = media[0].url;
  mediaType = media[0].type;
}

    const post = await Post.create({
      media,
repostOf: null,
      author: req.user.id,
      text: text || "",
      mediaUrl,
      mediaType,
      likes: [],
      comments: [],
      uniqueViewers: [],
      sharesCount: 0,
      viewsCount: 0,
      engagementScore: 0
    
    });

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_created", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE POST ERROR:", err.message);
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
      totalViews: posts.reduce((sum, p) => sum + Number(p.viewsCount || 0), 0),
      totalLikes: posts.reduce((sum, p) => sum + safeArray(p.likes).length, 0),
      totalComments: posts.reduce((sum, p) => sum + safeArray(p.comments).length, 0),
      totalShares: posts.reduce((sum, p) => sum + Number(p.sharesCount || 0), 0)
    };

    res.json({
      summary,
      posts: posts.map(post => ({
        _id: post._id,
        text: post.text || "",
        createdAt: post.createdAt,
        viewsCount: post.viewsCount || 0,
        likesCount: safeArray(post.likes).length,
        commentsCount: safeArray(post.comments).length,
        sharesCount: post.sharesCount || 0,
        engagementScore: calcEngagement(post)
      }))
    });
  } catch (err) {
    console.error("ANALYTICS ERROR:", err.message);
    res.status(500).json({ message: "Failed to load post analytics" });
  }
});

/* ==========================
   FOLLOW / UNFOLLOW USER
   Frontend path: PATCH /api/posts/users/:userId/follow
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

    me.following = safeArray(me.following);
    target.followers = safeArray(target.followers);

    const alreadyFollowing = me.following.some(
      id => String(id) === String(target._id)
    );

    if (alreadyFollowing) {
      me.following.pull(target._id);
      target.followers.pull(me._id);
    } else {
      me.following.addToSet(target._id);
      target.followers.addToSet(me._id);

      await Notification.create({
        user: target._id,
        type: "follow",
        sender: me._id,
        text: `${me.companyName || me.name || "Someone"} started following you`,
        link: `/public-profile.html?id=${me._id}`
      });
    }

    await me.save({ validateModifiedOnly: true });
    await target.save({ validateModifiedOnly: true });

    getIo(req)?.emit("user_follow_updated", {
      followerId: me._id,
      targetId: target._id,
      following: !alreadyFollowing
    });

    res.json({
      following: !alreadyFollowing,
      targetId: target._id,
      followers: target.followers.length
    });
  } catch (err) {
    console.error("FOLLOW ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});
/* ==========================
   PUBLIC COMPANY POSTS
   GET /api/posts/company/:companyId/public
========================== */
router.get("/company/:companyId/public", async (req, res) => {
  try {
    const { companyId } = req.params;

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const skip = Math.max(Number(req.query.skip || 0), 0);

    const posts = await Post.find({
      author: companyId,
      isHiddenByAdmin: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", USER_POPULATE)
      .populate("likes", USER_POPULATE)
      .populate("comments.user", USER_POPULATE)
      .populate("comments.likes", USER_POPULATE)
      .populate("comments.replies.user", USER_POPULATE)
      .populate("comments.replies.likes", USER_POPULATE)
.populate({
  path: "repostOf",
  populate: [
    {
      path: "author",
      select: USER_POPULATE
    },
    {
      path: "likes",
      select: USER_POPULATE
    },
    {
      path: "comments.user",
      select: USER_POPULATE
    },
    {
      path: "comments.replies.user",
      select: USER_POPULATE
    }
  ]
});

    res.json(posts);
  } catch (err) {
    console.error("PUBLIC COMPANY POSTS ERROR:", err.message);
    res.status(500).json({ message: "Failed to load company posts" });
  }
});
/* ==========================
   GET SINGLE POST — BELOW SPECIAL GET ROUTES
========================== */
router.get("/:id", auth, async (req, res) => {
  try {
    const post = await populatePost(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (err) {
    console.error("GET SINGLE POST ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   EDIT POST — OWNER OR ADMIN ONLY
========================== */
router.patch("/:id", auth, upload.single("media"), async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!isOwner(req.user.id, post.author) && !isAdmin(currentUser)) {
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
            { folder: "aift_posts", resource_type: "auto" },
            (error, result) => (error ? reject(error) : resolve(result))
          )
          .end(req.file.buffer);
      });

      post.mediaUrl = uploadResult.secure_url;
      post.mediaType = req.file.mimetype?.startsWith("video/") ? "video" : "image";
    }

    await safeSavePost(post);

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_updated", populated);

    res.json(populated);
  } catch (err) {
    console.error("EDIT POST ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   DELETE POST — OWNER OR ADMIN ONLY
========================== */
router.delete("/:id", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!isOwner(req.user.id, post.author) && !isAdmin(currentUser)) {
      return res.status(403).json({ message: "You can only delete your own post" });
    }

    await Post.findByIdAndDelete(req.params.id);

    getIo(req)?.emit("post_deleted", { postId: req.params.id });

    res.json({ deleted: true, postId: req.params.id });
  } catch (err) {
    console.error("DELETE POST ERROR:", err.message);
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

    post.text = post.text || " ";
    post.uniqueViewers = safeArray(post.uniqueViewers);

    const alreadyViewed = post.uniqueViewers.some(
      id => String(id) === String(req.user.id)
    );

    if (!alreadyViewed) {
      post.uniqueViewers.addToSet(req.user.id);
      post.viewsCount = Number(post.viewsCount || 0) + 1;
    }

    await safeSavePost(post);

const payload = {
  postId: post._id,
  viewsCount: post.viewsCount || 0,
  uniqueViewers: post.uniqueViewers.length
};

getIo(req)?.emit("post_viewed", payload);

res.json(payload);
  } catch (err) {
    console.error("VIEW POST ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE POST — SAVED
========================== */
router.patch("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.text = post.text || " ";
    post.likes = safeArray(post.likes);

    const alreadyLiked = post.likes.some(
      id => String(id) === String(req.user.id)
    );

    if (alreadyLiked) {
      post.likes.pull(req.user.id);
    } else {
      post.likes.addToSet(req.user.id);
    }

    await safeSavePost(post);

    const populated = await populatePost(post._id);

    getIo(req)?.emit("post_like", {
      postId: post._id,
      likes: populated.likes || [],
      likesCount: populated.likes?.length || 0,
      likedBy: req.user.id,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: populated.likes?.length || 0,
      likes: populated.likes || []
    });
  } catch (err) {
    console.error("LIKE ERROR:", err.message);
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
    console.error("LOAD LIKES ERROR:", err.message);
    res.status(500).json({ message: "Failed to load likes" });
  }
});

/* ==========================
   ADD COMMENT — SAVED
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

    post.text = post.text || " ";
    post.comments = safeArray(post.comments);

    post.comments.push({
      user: req.user.id,
      text,
      likes: [],
      replies: []
    });

    await safeSavePost(post);

    const populated = await populatePost(post._id);
    const newComment = populated.comments[populated.comments.length - 1];

    getIo(req)?.emit("new_comment", {
      postId: post._id,
      comment: newComment
    });

    res.json(newComment);
  } catch (err) {
    console.error("ADD COMMENT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/comments", auth, async (req, res) => {
  req.url = `/${req.params.id}/comment`;
  return router.handle(req, res);
});

/* ==========================
   DELETE COMMENT
========================== */
router.delete("/:postId/comments/:commentId", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const canDelete =
      isOwner(req.user.id, post.author) ||
      isOwner(req.user.id, comment.user) ||
      isAdmin(currentUser);

    if (!canDelete) {
      return res.status(403).json({ message: "You cannot delete this comment" });
    }

    comment.deleteOne();

    await safeSavePost(post);

    getIo(req)?.emit("comment_deleted", {
      postId: post._id,
      commentId: req.params.commentId
    });

    res.json({ deleted: true, commentId: req.params.commentId });
  } catch (err) {
    console.error("DELETE COMMENT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE COMMENT
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

    comment.likes = safeArray(comment.likes);

    const alreadyLiked = comment.likes.some(
      id => String(id) === String(req.user.id)
    );

    if (alreadyLiked) {
      comment.likes.pull(req.user.id);
    } else {
      comment.likes.addToSet(req.user.id);
    }

    await safeSavePost(post);

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);

    getIo(req)?.emit("comment_like", {
      postId: post._id,
      commentId: comment._id,
      likes: updatedComment.likes || [],
      likesCount: updatedComment.likes?.length || 0,
      likedBy: req.user.id,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: updatedComment.likes?.length || 0,
      comment: updatedComment
    });
  } catch (err) {
    console.error("COMMENT LIKE ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   REPLY TO COMMENT
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

    comment.replies = safeArray(comment.replies);

    comment.replies.push({
      user: req.user.id,
      text,
      likes: []
    });

    await safeSavePost(post);

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
    console.error("REPLY ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   DELETE REPLY
========================== */
router.delete("/:postId/comments/:commentId/replies/:replyId", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const canDelete =
      isOwner(req.user.id, post.author) ||
      isOwner(req.user.id, reply.user) ||
      isAdmin(currentUser);

    if (!canDelete) {
      return res.status(403).json({ message: "You cannot delete this reply" });
    }

    reply.deleteOne();

    await safeSavePost(post);

    getIo(req)?.emit("reply_deleted", {
      postId: post._id,
      commentId: comment._id,
      replyId: req.params.replyId
    });

    res.json({ deleted: true, replyId: req.params.replyId });
  } catch (err) {
    console.error("DELETE REPLY ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   LIKE / UNLIKE REPLY
========================== */
router.patch("/:postId/comments/:commentId/replies/:replyId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    reply.likes = safeArray(reply.likes);

    const alreadyLiked = reply.likes.some(
      id => String(id) === String(req.user.id)
    );

    if (alreadyLiked) {
      reply.likes.pull(req.user.id);
    } else {
      reply.likes.addToSet(req.user.id);
    }

    await safeSavePost(post);

    const populated = await populatePost(post._id);
    const updatedComment = populated.comments.id(req.params.commentId);
    const updatedReply = updatedComment.replies.id(req.params.replyId);

    getIo(req)?.emit("reply_like", {
      postId: post._id,
      commentId: comment._id,
      replyId: reply._id,
      likes: updatedReply.likes || [],
      likesCount: updatedReply.likes?.length || 0,
      likedBy: req.user.id,
      liked: !alreadyLiked
    });

    res.json({
      liked: !alreadyLiked,
      likesCount: updatedReply.likes?.length || 0,
      reply: updatedReply
    });
  } catch (err) {
    console.error("REPLY LIKE ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   SHARE TRACKING
========================== */
router.post("/:id/share", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    post.text = post.text || " ";
    post.sharesCount = Number(post.sharesCount || 0) + 1;

    await safeSavePost(post);

    getIo(req)?.emit("post_shared", {
      postId: post._id,
      sharesCount: post.sharesCount
    });

    res.json({
      shared: true,
      sharesCount: post.sharesCount
    });
  } catch (err) {
    console.error("SHARE ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==========================
   SEND POST TO FOLLOWED USERS
   Body: { userIds: [] }
========================== */
router.post("/:id/send", auth, async (req, res) => {
  try {
    const sender = await getCurrentUser(req);
    const post = await Post.findById(req.params.id);

    if (!post || post.isHiddenByAdmin) {
      return res.status(404).json({ message: "Post not found" });
    }

    const requestedUserIds = safeArray(req.body.userIds).map(String);
    const followingIds = safeArray(sender.following).map(String);

    const allowedTargets = requestedUserIds.filter(id => followingIds.includes(id));

    if (!allowedTargets.length) {
      return res.status(400).json({ message: "Select at least one followed user" });
    }

    const notifications = allowedTargets.map(userId => ({
  user: userId,
  type: "message",
  sender: sender._id,
  text: `${sender.companyName || sender.name || "Someone"} shared a post with you`,
  link: `/feed.html?post=${post._id}`
}));

    await Notification.insertMany(notifications);

    post.text = post.text || " ";
    post.sharesCount = Number(post.sharesCount || 0) + allowedTargets.length;

    await safeSavePost(post);

    getIo(req)?.emit("post_shared", {
      postId: post._id,
      sharesCount: post.sharesCount
    });

   allowedTargets.forEach(userId => {
  getIo(req)?.emit("notification_created", {
    user: userId,
    type: "message",
    postId: post._id
  });
});

    res.json({
      sent: true,
      sentTo: allowedTargets.length,
      sharesCount: post.sharesCount
    });
  } catch (err) {
    console.error("SEND POST ERROR:", err.message);
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

    original.text = original.text || " ";

    const caption = req.body.text?.trim();

const repost = await Post.create({
  author: req.user.id,
  text: caption || " ",
  repostOf: original._id,
  mediaUrl: null,
  mediaType: null,
  media: [],
      likes: [],
      comments: [],
      uniqueViewers: [],
      sharesCount: 0,
      viewsCount: 0,
      engagementScore: 0
    });

    original.sharesCount = Number(original.sharesCount || 0) + 1;
    await safeSavePost(original);

    const populated = await populatePost(repost._id);

    getIo(req)?.emit("post_created", populated);
    getIo(req)?.emit("post_shared", {
      postId: original._id,
      sharesCount: original.sharesCount
    });

    res.status(201).json(populated);
  } catch (err) {
    console.error("REPOST ERROR:", err.message);
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

    post.reports = safeArray(post.reports);

    const alreadyReported = post.reports.some(
      report => String(report.user) === String(req.user.id)
    );

    if (!alreadyReported) {
      post.reports.push({
        user: req.user.id,
        reason: req.body.reason || "Reported from feed"
      });
    }

    await safeSavePost(post);

    getIo(req)?.emit("post_reported", {
      postId: post._id
    });

    res.json({
      reported: true,
      reportsCount: post.reports.length
    });
  } catch (err) {
    console.error("REPORT POST ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
