"use strict";

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const analyticsContext = require(
  "../middleware/analyticsContext"
);

const cloudinary = require("../config/cloudinary");

const Post = require("../models/Post");
const User = require("../models/User");
const Group = require("../models/Group");
const Notification = require("../models/Notification");

const AnalyticsEvent = require(
  "../models/AnalyticsEvent"
);

const {
  incrementDailyAnalytics
} = require(
  "../services/analyticsAggregationService"
);

const USER_POPULATE =
  "name companyName profileImage headline role isVerified verified adminVerified badges following followers";

function getIo(req) {
  return req.app.get("io");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}
/* ============================================
   SCHOOL POST ANALYTICS
============================================ */

/* ============================================
   SCHOOL POST ANALYTICS
============================================ */

function analyticsExpiryDate(
  occurredAt = new Date()
) {
  const expiresAt = new Date(
    occurredAt
  );

  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + 180
  );

  return expiresAt;
}

function analyticsDateKey(
  value = new Date()
) {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function postAnalyticsDedupeKey({
  schoolId,
  postId,
  actorId,
  sessionId,
  ipHash,
  eventType,
  occurredAt
}) {
  if (
    eventType !== "post_unique_view"
  ) {
    return null;
  }

  let visitorIdentity = null;

  if (actorId) {
    visitorIdentity =
      `actor:${String(actorId)}`;
  } else if (sessionId) {
    visitorIdentity =
      `session:${String(sessionId)}`;
  } else if (ipHash) {
    visitorIdentity =
      `visitor:${String(ipHash)}`;
  }

  if (!visitorIdentity) {
    return null;
  }

  const rawKey = [
    eventType,
    String(schoolId),
    String(postId),
    visitorIdentity,
    analyticsDateKey(occurredAt)
  ].join(":");

  return require("crypto")
    .createHash("sha256")
    .update(rawKey)
    .digest("hex");
}

async function resolveSchoolPostOwner(
  post,
  mongoSession = null
) {
  if (!post?.author) {
    return null;
  }

  let query = User.findById(
    post.author
  ).select(
    "_id role status"
  );

  if (mongoSession) {
    query = query.session(
      mongoSession
    );
  }

  const author = await query.lean();

  if (
    !author ||
    author.role !== "school" ||
    author.status === "suspended"
  ) {
    return null;
  }

  return author;
}

async function recordPostAnalytics({
  req,
  post,
  eventType,
  metadata = {},
  amount = 1,
  occurredAt = new Date(),
  mongoSession = null
}) {
  if (!post) {
    return {
      recorded: false,
      skipped: true,
      reason: "post_unavailable"
    };
  }

  const school =
    await resolveSchoolPostOwner(
      post,
      mongoSession
    );

  if (!school) {
    return {
      recorded: false,
      skipped: true,
      reason: "not_school_post"
    };
  }

  const context =
    req.analyticsContext || {};

  const actorId =
    req.user?._id ||
    req.user?.id ||
    null;

  /*
    Do not count the school viewing or interacting with its
    own post as public audience activity.
  */
  if (
    actorId &&
    String(actorId) ===
      String(school._id) &&
    [
      "post_impression",
      "post_view",
      "post_unique_view",
      "post_like",
      "post_unlike",
      "post_comment",
      "post_reply",
      "post_share",
      "post_save",
      "post_unsave"
    ].includes(eventType)
  ) {
    return {
      recorded: false,
      skipped: true,
      reason: "self_activity"
    };
  }

  const sessionId =
    context.sessionId ||
    null;

  const ipHash =
    context.ipHash ||
    null;

  const source =
    context.source ||
    "feed";

  const deviceType =
    context.deviceType ||
    "unknown";

  const dedupeKey =
    postAnalyticsDedupeKey({
      schoolId:
        school._id,

      postId:
        post._id,

      actorId,
      sessionId,
      ipHash,
      eventType,
      occurredAt
    });

  if (
    eventType ===
      "post_unique_view" &&
    !dedupeKey
  ) {
    return {
      recorded: false,
      skipped: true,
      reason:
        "visitor_identity_unavailable"
    };
  }

  const eventPayload = {
    schoolId:
      school._id,

    actorId:
      actorId || null,

    sessionId,

    ipHash,

    eventType,

    entityType:
      "post",

    entityId:
      post._id,

    source,

    metadata:
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
        ? metadata
        : {},

    dedupeKey,

    userAgent:
      context.userAgent ||
      req.headers["user-agent"] ||
      null,

    referrer:
      context.referrer ||
      null,

    requestPath:
      context.requestPath ||
      req.originalUrl ||
      null,

    deviceType,

    occurredAt,

    expiresAt:
      analyticsExpiryDate(
        occurredAt
      )
  };

  const createOptions = {};

  if (mongoSession) {
    createOptions.session =
      mongoSession;
  }

  try {
    const createdEvents =
      await AnalyticsEvent.create(
        [eventPayload],
        createOptions
      );

await incrementDailyAnalytics({
  schoolId:
    school._id,

  eventType,

  amount:
    Math.max(
      1,
      Math.floor(
        Number(amount) || 1
      )
    ),

  occurredAt,

  source,

  deviceType,

  metadata:
    eventPayload.metadata,

  mongoSession
});

    return {
      recorded: true,
      skipped: false,
      duplicate: false,
      event:
        createdEvents[0]
    };
  } catch (error) {
    /*
      Unique post views use a database-enforced dedupe key.

      A duplicate key means this viewer was already counted
      for this post during the current UTC day.
    */
    if (
      error?.code === 11000 &&
      eventType ===
        "post_unique_view"
    ) {
      return {
        recorded: false,
        skipped: true,
        duplicate: true,
        reason:
          "duplicate_unique_view"
      };
    }

    throw error;
  }
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
   SMART FEED
   GET /api/posts/feed?skip=0&limit=20
========================== */
router.get("/feed", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const followingIds = safeArray(currentUser?.following).map(String);

    const skip = Math.max(Number(req.query.skip || 0), 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    const now = new Date();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const posts = await Post.find({
      isHiddenByAdmin: { $ne: true },
      groupId: null,
      createdAt: { $gte: sevenDaysAgo }
    })
      .populate("author", USER_POPULATE)
      .populate("likes", USER_POPULATE)
      .populate("comments.user", USER_POPULATE)
      .populate("comments.replies.user", USER_POPULATE)
      .populate({
        path: "repostOf",
        populate: { path: "author", select: USER_POPULATE }
      })
      .lean();

    const scored = posts.map(post => {
      const likesCount = safeArray(post.likes).length;
      const commentsCount = safeArray(post.comments).length;
      const sharesCount = Number(post.sharesCount || 0);
      const viewsCount = Number(post.viewsCount || 0);
      const media = safeArray(post.media);
      const hasVideo = media.some(m => m.type === "video") || post.mediaType === "video";

      const ageHours = Math.max((Date.now() - new Date(post.createdAt).getTime()) / 36e5, 1);
      const recencyScore = Math.max(80 - ageHours, 0);

      const followsScore = followingIds.includes(String(post.author?._id)) ? 35 : 0;
      const engagementScore = likesCount * 3 + commentsCount * 6 + sharesCount * 8 + viewsCount * 0.3;
      const mediaScore = media.length ? 8 : 0;
      const videoScore = hasVideo ? 12 : 0;
      const verifiedScore = post.author?.isVerified || post.author?.verified || post.author?.adminVerified ? 10 : 0;
      const promotedScore =
        post.isPromoted && post.promotedUntil && new Date(post.promotedUntil) > now ? 100 : 0;

      const priorityScore =
        Number(post.priorityScore || 0) +
        promotedScore +
        recencyScore +
        followsScore +
        engagementScore +
        mediaScore +
        videoScore +
        verifiedScore;

      return { ...post, priorityScore };
    });

    scored.sort((a, b) => b.priorityScore - a.priorityScore);

    res.json({
      posts: scored.slice(skip, skip + limit),
      skip,
      limit,
      hasMore: scored.length > skip + limit
    });
  } catch (err) {
    console.error("SMART FEED ERROR:", err.message);
    res.status(500).json({ message: "Failed to load smart feed" });
  }
});

/* ==========================
   GET FEED
========================== */
router.get("/", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    const followingIds = safeArray(currentUser?.following);

    const skip = Math.max(Number(req.query.skip || 0), 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

   const query = {
  isHiddenByAdmin: { $ne: true }
};

const groupId = req.query.groupId;
const authorId = req.query.author;

if (groupId) {
  query.groupId = groupId;
}

if (authorId) {
  query.author = authorId;
}

if (!groupId && !authorId && followingIds.length > 0) {
  query.author = {
    $in: [...followingIds, currentUser._id]
  };
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
  author: req.user.id,

  groupId: req.body.groupId || null,

  text: text || "",

  media,
  mediaUrl,
  mediaType,

  repostOf: null,

  likes: [],
  comments: [],

  uniqueViewers: [],

  sharesCount: 0,
  viewsCount: 0,

  engagementScore: 0
});

    const populated = await populatePost(post._id);
    if (post.groupId) {
  await Group.findByIdAndUpdate(post.groupId, {
    $inc: { postsCount: 1 }
  });
}

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
   PUBLIC GUEST FEED
   GET /api/posts/public?limit=10
========================== */
router.get("/public", async (req, res) => {
  try {
    const skip = Math.max(Number(req.query.skip || 0), 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 30);

    const posts = await Post.find({
      isHiddenByAdmin: { $ne: true },
      groupId: null
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", USER_POPULATE)
      .populate({
        path: "repostOf",
        populate: {
          path: "author",
          select: USER_POPULATE
        }
      });

    res.json(posts);
  } catch (err) {
    console.error("PUBLIC GUEST FEED ERROR:", err.message);
    res.status(500).json({ message: "Failed to load public feed" });
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

if (post.groupId) {
  await Group.findByIdAndUpdate(post.groupId, {
    $inc: { postsCount: -1 }
  });
}

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

router.patch(
  "/:id/view",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid post ID."
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const post =
        await Post.findById(
          req.params.id
        ).session(mongoSession);

      if (
        !post ||
        post.isHiddenByAdmin
      ) {
        await mongoSession
          .abortTransaction();

        return res.status(404).json({
          message:
            "Post not found."
        });
      }

      post.text =
        post.text ||
        " ";

      post.likes =
        safeArray(
          post.likes
        );

      post.comments =
        safeArray(
          post.comments
        );

      post.uniqueViewers =
        safeArray(
          post.uniqueViewers
        );

      post.reports =
        safeArray(
          post.reports
        );

      const viewerId =
        req.user._id ||
        req.user.id;

      const isAuthor =
        String(viewerId) ===
        String(post.author);

      const alreadyViewed =
        post.uniqueViewers.some(
          id =>
            String(id) ===
            String(viewerId)
        );

      /*
        Preserve your existing all-time post counter.

        It counts each logged-in viewer once for the lifetime
        of the post. The school analytics system separately
        stores daily post views and unique daily views.
      */
      if (
        !alreadyViewed &&
        !isAuthor
      ) {
        post.uniqueViewers.addToSet(
          viewerId
        );

        post.viewsCount =
          Number(
            post.viewsCount || 0
          ) + 1;
      }

      post.viewsCount =
        Number(
          post.viewsCount || 0
        );

      post.sharesCount =
        Number(
          post.sharesCount || 0
        );

      post.engagementScore =
        calcEngagement(post);

      await post.save({
        session:
          mongoSession,

        validateModifiedOnly:
          true
      });

      const occurredAt =
        new Date();

      /*
        Record a normal view for each meaningful call to this
        endpoint, except when the author views their own post.
      */
      if (!isAuthor) {
        await recordPostAnalytics({
          req,
          post,

          eventType:
            "post_view",

          occurredAt,

          metadata: {
            firstLifetimeView:
              !alreadyViewed,

            viewerRole:
              req.user.role ||
              "unknown"
          },

          mongoSession
        });

        /*
          Record at most one unique view per viewer, school
          post, and UTC day.

          The database dedupe key protects against duplicate
          browser calls and retries.
        */
        await recordPostAnalytics({
          req,
          post,

          eventType:
            "post_unique_view",

          occurredAt,

          metadata: {
            firstLifetimeView:
              !alreadyViewed,

            viewerRole:
              req.user.role ||
              "unknown"
          },

          mongoSession
        });
      }

      await mongoSession
        .commitTransaction();

      const payload = {
        postId:
          post._id,

        viewsCount:
          post.viewsCount || 0,

        uniqueViewers:
          post.uniqueViewers.length,

        viewed:
          !isAuthor,

        firstLifetimeView:
          !alreadyViewed &&
          !isAuthor
      };

      getIo(req)?.emit(
        "post_viewed",
        payload
      );

      return res.json(payload);
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "VIEW POST ERROR:",
        error
      );

      return res.status(500).json({
        message:
          "Failed to record post view."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ==========================
   LIKE / UNLIKE POST — SAVED
========================== */

router.patch(
  "/:id/like",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      /*
        Validate the post ID before querying MongoDB.
      */
      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message: "Invalid post ID."
        });
      }

      const actorId =
        req.user._id ||
        req.user.id;

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      /*
        Load the post inside the same transaction used for the
        like relationship and analytics event.
      */
      const post =
        await Post.findById(
          req.params.id
        ).session(mongoSession);

      if (
        !post ||
        post.isHiddenByAdmin
      ) {
        await mongoSession.abortTransaction();

        return res.status(404).json({
          message: "Post not found."
        });
      }

      post.text =
        post.text ||
        " ";

      post.likes =
        safeArray(post.likes);

      post.comments =
        safeArray(post.comments);

      post.uniqueViewers =
        safeArray(post.uniqueViewers);

      post.reports =
        safeArray(post.reports);

      post.viewsCount =
        Number(post.viewsCount || 0);

      post.sharesCount =
        Number(post.sharesCount || 0);

      post.savesCount =
        Number(post.savesCount || 0);

      /*
        Determine the real relationship state before changing
        anything. The analytics event is based on this result.
      */
      const alreadyLiked =
        post.likes.some(
          id =>
            String(id) ===
            String(actorId)
        );

      const liked =
        !alreadyLiked;

      if (alreadyLiked) {
        post.likes.pull(actorId);
      } else {
        post.likes.addToSet(actorId);
      }

      /*
        Keep the model's stored summary counters synchronized
        with the real relationship arrays.
      */
      post.likesCount =
        post.likes.length;

      post.commentsCount =
        post.comments.length;

      post.engagementScore =
        calcEngagement(post);

      await post.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      const occurredAt =
        new Date();

      /*
        Authoritative analytics is recorded only after the
        like relationship has actually changed.

        recordPostAnalytics automatically:

        - checks whether the author is a school
        - skips the school's own interaction with its post
        - records source and device information
        - writes the raw event
        - updates the daily aggregate
      */
      await recordPostAnalytics({
        req,
        post,

        eventType:
          liked
            ? "post_like"
            : "post_unlike",

        occurredAt,

        metadata: {
          actorRole:
            req.user.role ||
            "unknown",

          resultingLikesCount:
            post.likes.length
        },

        mongoSession
      });

      await mongoSession.commitTransaction();

      /*
        Populate only after the transaction commits. This keeps
        the transaction smaller while preserving your existing
        frontend response structure.
      */
      const populated =
        await populatePost(post._id);

      if (!populated) {
        return res.status(404).json({
          message:
            "Post was updated but could not be reloaded."
        });
      }

      const likes =
        safeArray(populated.likes);

      const payload = {
        postId:
          populated._id,

        likes,

        likesCount:
          likes.length,

        likedBy:
          actorId,

        liked
      };

      getIo(req)?.emit(
        "post_like",
        payload
      );

      return res.json({
        liked,
        likesCount:
          likes.length,

        likes
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "LIKE ERROR:",
        {
          message:
            error.message,

          postId:
            req.params.id,

          userId:
            req.user?._id ||
            req.user?.id ||
            null
        }
      );

      return res.status(500).json({
        message:
          "Failed to update post like."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

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

router.post(
  "/:id/comment",
  auth,
  analyticsContext,
  async (req, res) => {

    let mongoSession = null;

    try {

      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message: "Invalid post ID."
        });
      }

      const text =
        String(req.body.text || "")
          .trim();

      if (!text) {
        return res.status(400).json({
          message: "Comment text is required"
        });
      }

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const post =
        await Post.findById(
          req.params.id
        ).session(mongoSession);

      if (
        !post ||
        post.isHiddenByAdmin
      ) {
        await mongoSession.abortTransaction();

        return res.status(404).json({
          message: "Post not found"
        });
      }

      post.text =
        post.text || " ";

      post.comments =
        safeArray(post.comments);

      post.likes =
        safeArray(post.likes);

      post.uniqueViewers =
        safeArray(post.uniqueViewers);

      post.comments.push({

        user:
          req.user._id ||
          req.user.id,

        text,

        likes: [],

        replies: []

      });

      post.commentsCount =
        post.comments.length;

      post.likesCount =
        post.likes.length;

      post.engagementScore =
        calcEngagement(post);

      await post.save({

        session: mongoSession,

        validateModifiedOnly: true

      });

      const occurredAt =
        new Date();

      /*
        Records analytics only when:

        • author is a school
        • commenter is not the school itself
      */

      await recordPostAnalytics({

        req,

        post,

        eventType:
          "post_comment",

        occurredAt,

        metadata:{

          actorRole:
            req.user.role ||
            "unknown",

          commentLength:
            text.length

        },

        mongoSession

      });

      await mongoSession.commitTransaction();

      const populated =
        await populatePost(post._id);

      if(!populated){

        return res.status(404).json({

          message:
            "Post could not be reloaded."

        });

      }

      const newComment =
        populated.comments[
          populated.comments.length - 1
        ];

      getIo(req)?.emit(
        "new_comment",
        {

          postId:
            populated._id,

          comment:
            newComment

        }
      );

      return res.json(
        newComment
      );

    }
    catch(error){

      if(
        mongoSession?.inTransaction()
      ){

        await mongoSession
          .abortTransaction()
          .catch(()=>{});

      }

      console.error(
        "ADD COMMENT ERROR:",
        error
      );

      return res.status(500).json({

        message:
          "Failed to add comment."

      });

    }
    finally{

      if(mongoSession){

        await mongoSession
          .endSession()
          .catch(()=>{});

      }

    }

  }
);

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
/* ==========================
   SHARE TRACKING
========================== */

router.post(
  "/:id/share",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      /*
        Validate the post ID before querying MongoDB.
      */
      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message: "Invalid post ID."
        });
      }

      const actorId =
        req.user._id ||
        req.user.id;

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      /*
        Load the post inside the same transaction used for the
        share counter and analytics event.
      */
      const post =
        await Post.findById(
          req.params.id
        ).session(mongoSession);

      if (
        !post ||
        post.isHiddenByAdmin
      ) {
        await mongoSession.abortTransaction();

        return res.status(404).json({
          message: "Post not found."
        });
      }

      post.text =
        post.text ||
        " ";

      post.likes =
        safeArray(post.likes);

      post.comments =
        safeArray(post.comments);

      post.uniqueViewers =
        safeArray(post.uniqueViewers);

      post.reports =
        safeArray(post.reports);

      post.viewsCount =
        Number(post.viewsCount || 0);

      post.sharesCount =
        Number(post.sharesCount || 0) + 1;

      post.savesCount =
        Number(post.savesCount || 0);

      post.likesCount =
        post.likes.length;

      post.commentsCount =
        post.comments.length;

      post.engagementScore =
        calcEngagement(post);

      await post.save({
        session: mongoSession,
        validateModifiedOnly: true
      });

      const occurredAt =
        new Date();

      /*
        Record the authoritative share event.

        recordPostAnalytics automatically:

        - records only school-owned post analytics
        - skips analytics when the school shares its own post
        - records traffic source and device type
        - writes the raw AnalyticsEvent
        - increments AnalyticsDaily.postShares
      */
      await recordPostAnalytics({
        req,
        post,

        eventType:
          "post_share",

        occurredAt,

        metadata: {
          actorRole:
            req.user.role ||
            "unknown",

          shareMethod:
            String(
              req.body?.shareMethod ||
              "external"
            )
              .trim()
              .toLowerCase()
              .slice(0, 50),

          resultingSharesCount:
            post.sharesCount
        },

        mongoSession
      });

      await mongoSession.commitTransaction();

      const payload = {
        postId:
          post._id,

        shared:
          true,

        sharedBy:
          actorId,

        sharesCount:
          post.sharesCount
      };

      getIo(req)?.emit(
        "post_shared",
        payload
      );

      return res.json({
        shared: true,
        sharesCount:
          post.sharesCount
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SHARE ERROR:",
        {
          message:
            error.message,

          postId:
            req.params.id,

          userId:
            req.user?._id ||
            req.user?.id ||
            null
        }
      );

      return res.status(500).json({
        message:
          "Failed to share post."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ==========================
   SEND POST TO FOLLOWED USERS
   Body: { userIds: [] }
========================== */

router.post(
  "/:id/send",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid post ID."
        });
      }

      const senderId =
        req.user._id ||
        req.user.id;

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      const [
        sender,
        post
      ] = await Promise.all([
        User.findById(senderId)
          .select(
            "_id name companyName role following"
          )
          .session(mongoSession),

        Post.findById(req.params.id)
          .session(mongoSession)
      ]);

      if (!sender) {
        await mongoSession.abortTransaction();

        return res.status(401).json({
          message:
            "Sender account was not found."
        });
      }

      if (
        !post ||
        post.isHiddenByAdmin
      ) {
        await mongoSession.abortTransaction();

        return res.status(404).json({
          message:
            "Post not found."
        });
      }

      /*
        Normalize and deduplicate the submitted recipient IDs.

        Invalid MongoDB IDs are discarded before any database
        write occurs.
      */
      const requestedUserIds = [
        ...new Set(
          safeArray(req.body.userIds)
            .map(value =>
              String(value || "").trim()
            )
            .filter(value =>
              mongoose.Types.ObjectId.isValid(
                value
              )
            )
        )
      ];

      const followingIdSet =
        new Set(
          safeArray(sender.following)
            .map(value =>
              String(value)
            )
        );

      const allowedTargetIds =
        requestedUserIds.filter(userId => {
          return (
            userId !== String(sender._id) &&
            followingIdSet.has(userId)
          );
        });

      if (!allowedTargetIds.length) {
        await mongoSession.abortTransaction();

        return res.status(400).json({
          message:
            "Select at least one user you follow."
        });
      }

      /*
        Confirm recipients still exist and are available.

        This prevents notifications from being created for
        deleted or suspended accounts.
      */
      const validTargets =
        await User.find({
          _id: {
            $in:
              allowedTargetIds
          },

          status: {
            $ne:
              "suspended"
          }
        })
          .select("_id")
          .session(mongoSession)
          .lean();

      const validTargetIds =
        validTargets.map(target =>
          String(target._id)
        );

      if (!validTargetIds.length) {
        await mongoSession.abortTransaction();

        return res.status(400).json({
          message:
            "None of the selected recipients are currently available."
        });
      }

      const senderName =
        sender.companyName ||
        sender.name ||
        "Someone";

      const notifications =
        validTargetIds.map(userId => ({
          user:
            userId,

          type:
            "message",

          sender:
            sender._id,

          text:
            `${senderName} shared a post with you`,

          link:
            `/feed.html?post=${post._id}`
        }));

      await Notification.insertMany(
        notifications,
        {
          session:
            mongoSession,

          ordered:
            true
        }
      );

      post.text =
        post.text ||
        " ";

      post.likes =
        safeArray(post.likes);

      post.comments =
        safeArray(post.comments);

      post.uniqueViewers =
        safeArray(post.uniqueViewers);

      post.reports =
        safeArray(post.reports);

      post.viewsCount =
        Number(
          post.viewsCount || 0
        );

      post.sharesCount =
        Number(
          post.sharesCount || 0
        ) +
        validTargetIds.length;

      post.savesCount =
        Number(
          post.savesCount || 0
        );

      post.likesCount =
        post.likes.length;

      post.commentsCount =
        post.comments.length;

      post.engagementScore =
        calcEngagement(post);

      await post.save({
        session:
          mongoSession,

        validateModifiedOnly:
          true
      });

      const occurredAt =
        new Date();

      /*
        One raw analytics event represents this direct-send
        action.

        The daily postShares counter increases by the number
        of valid recipients.
      */
      await recordPostAnalytics({
        req,
        post,

        eventType:
          "post_share",

        amount:
          validTargetIds.length,

        occurredAt,

        metadata: {
          actorRole:
            sender.role ||
            "unknown",

          shareMethod:
            "direct_message",

          recipientCount:
            validTargetIds.length,

          resultingSharesCount:
            post.sharesCount
        },

        mongoSession
      });

      await mongoSession.commitTransaction();

      const io =
        getIo(req);

      const sharePayload = {
        postId:
          post._id,

        sharesCount:
          post.sharesCount,

        sharedBy:
          sender._id,

        shareMethod:
          "direct_message",

        sentTo:
          validTargetIds.length
      };

      io?.emit(
        "post_shared",
        sharePayload
      );

      validTargetIds.forEach(userId => {
        io?.to(String(userId)).emit(
          "notification_created",
          {
            user:
              userId,

            type:
              "message",

            postId:
              post._id
          }
        );
      });

      return res.json({
        sent:
          true,

        sentTo:
          validTargetIds.length,

        sharesCount:
          post.sharesCount
      });
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "SEND POST ERROR:",
        {
          message:
            error.message,

          postId:
            req.params.id,

          senderId:
            req.user?._id ||
            req.user?.id ||
            null
        }
      );

      return res.status(500).json({
        message:
          "Failed to send post."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

/* ==========================
   REPOST
========================== */

router.post(
  "/:id/repost",
  auth,
  analyticsContext,
  async (req, res) => {
    let mongoSession = null;

    try {
      /*
        Validate the original post ID before opening the
        transaction or querying MongoDB.
      */
      if (
        !mongoose.Types.ObjectId.isValid(
          String(req.params.id || "")
        )
      ) {
        return res.status(400).json({
          message: "Invalid post ID."
        });
      }

      const actorId =
        req.user._id ||
        req.user.id;

      const caption =
        String(req.body.text || "")
          .trim()
          .slice(0, 5000);

      mongoSession =
        await mongoose.startSession();

      mongoSession.startTransaction();

      /*
        Do not populate the original post inside the
        transaction.

        Its raw author ObjectId is required by the analytics
        helper and makes ownership checks more predictable.
      */
      const original =
        await Post.findById(
          req.params.id
        ).session(mongoSession);

      if (
        !original ||
        original.isHiddenByAdmin
      ) {
        await mongoSession.abortTransaction();

        return res.status(404).json({
          message: "Post not found."
        });
      }

      original.text =
        original.text ||
        " ";

      original.likes =
        safeArray(original.likes);

      original.comments =
        safeArray(original.comments);

      original.uniqueViewers =
        safeArray(
          original.uniqueViewers
        );

      original.reports =
        safeArray(original.reports);

      original.viewsCount =
        Number(
          original.viewsCount || 0
        );

      original.sharesCount =
        Number(
          original.sharesCount || 0
        ) + 1;

      original.savesCount =
        Number(
          original.savesCount || 0
        );

      original.likesCount =
        original.likes.length;

      original.commentsCount =
        original.comments.length;

      original.engagementScore =
        calcEngagement(original);

      /*
        Create the repost inside the same transaction as the
        original post's share increment and analytics records.
      */
      const createdReposts =
        await Post.create(
          [
            {
              author:
                actorId,

              groupId:
                null,

              text:
                caption ||
                " ",

              repostOf:
                original._id,

              mediaUrl:
                null,

              mediaType:
                null,

              media:
                [],

              likes:
                [],

              comments:
                [],

              uniqueViewers:
                [],

              sharesCount:
                0,

              savesCount:
                0,

              likesCount:
                0,

              commentsCount:
                0,

              viewsCount:
                0,

              engagementScore:
                0,

              priorityScore:
                0,

              isPromoted:
                false,

              promotedUntil:
                null,

              isHiddenByAdmin:
                false,

              moderationStatus:
                "active",

              reports:
                []
            }
          ],
          {
            session:
              mongoSession
          }
        );

      const repost =
        createdReposts[0];

      await original.save({
        session:
          mongoSession,

        validateModifiedOnly:
          true
      });

      const occurredAt =
        new Date();

      /*
        Record the repost as a share of the original post.

        For school-owned original posts, this increments:

        AnalyticsDaily.postShares
      */
      await recordPostAnalytics({
        req,

        post:
          original,

        eventType:
          "post_share",

        occurredAt,

        metadata: {
          actorRole:
            req.user.role ||
            "unknown",

          shareMethod:
            "repost",

          repostId:
            String(repost._id),

          resultingSharesCount:
            original.sharesCount
        },

        mongoSession
      });

      /*
        When the account creating the repost is itself a school,
        record that the school published a new post.

        recordPostAnalytics checks the repost author role before
        writing school analytics.
      */
      await recordPostAnalytics({
        req,

        post:
          repost,

        eventType:
          "post_created",

        occurredAt,

        metadata: {
          actorRole:
            req.user.role ||
            "unknown",

          contentType:
            "repost",

          originalPostId:
            String(original._id),

          hasCaption:
            Boolean(caption)
        },

        mongoSession
      });

      await mongoSession.commitTransaction();

      /*
        Populate only after committing so the transaction stays
        focused on database writes.
      */
      const populated =
        await populatePost(
          repost._id
        );

      if (!populated) {
        return res.status(404).json({
          message:
            "Repost was created but could not be reloaded."
        });
      }

      const io =
        getIo(req);

      io?.emit(
        "post_created",
        populated
      );

      io?.emit(
        "post_shared",
        {
          postId:
            original._id,

          sharesCount:
            original.sharesCount,

          sharedBy:
            actorId,

          shareMethod:
            "repost",

          repostId:
            repost._id
        }
      );

      return res
        .status(201)
        .json(populated);
    } catch (error) {
      if (
        mongoSession?.inTransaction()
      ) {
        await mongoSession
          .abortTransaction()
          .catch(() => {});
      }

      console.error(
        "REPOST ERROR:",
        {
          message:
            error.message,

          originalPostId:
            req.params.id,

          userId:
            req.user?._id ||
            req.user?.id ||
            null
        }
      );

      return res.status(500).json({
        message:
          "Failed to repost."
      });
    } finally {
      if (mongoSession) {
        await mongoSession
          .endSession()
          .catch(() => {});
      }
    }
  }
);

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
