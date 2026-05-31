const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Group = require("../models/Group");
const Post = require("../models/Post");
const User = require("../models/User");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");

const USER_SELECT =
  "name companyName schoolName profileImage avatar headline profession role location aiftVerified";

const VALID_CATEGORIES = [
  "employer",
  "school",
  "agent",
  "talent",
  "student"
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

function fileToDataUri(file) {
  const base64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
}

async function uploadToCloudinary(file, folder = "aift/groups") {
  const dataUri = fileToDataUri(file);

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: file.mimetype.startsWith("video/") ? "video" : "image"
  });

  return {
    url: result.secure_url,
    type: file.mimetype.startsWith("video/") ? "video" : "image"
  };
}

function canManageGroup(group, user) {
  return (
    String(group.owner) === String(user._id) ||
    user.role === "admin"
  );
}

function normalizeCategory(category = "") {
  const clean = String(category || "").toLowerCase().trim();

  if (clean === "recruiter" || clean === "recruiters") return "agent";
  if (clean === "professional" || clean === "professionals") return "talent";
  if (clean === "employers") return "employer";
  if (clean === "schools") return "school";
  if (clean === "students") return "student";

  return clean;
}

function isValidCategory(category) {
  return VALID_CATEGORIES.includes(normalizeCategory(category));
}

function isMember(group, userId) {
  return (group.members || []).some(id => {
    return String(id?._id || id) === String(userId);
  });
}

function buildGroupPayload(group, userId = null) {
  const plain = group.toObject ? group.toObject() : group;

  return {
    ...plain,
    membersCount: Number(plain.membersCount ?? plain.members?.length ?? 0),
followersCount: Number(plain.followersCount ?? plain.followers?.length ?? 0),
postsCount: Number(plain.postsCount ?? 0),
    isJoined: userId ? isMember(plain, userId) : false
  };
}

/* GET /api/groups */
router.get("/", auth, async (req, res) => {
  try {
    const query = {
      isActive: true
    };

    const category = normalizeCategory(req.query.category);

    if (category && category !== "all") {
      if (!isValidCategory(category)) {
        return res.status(400).json({
          message: "Invalid group category"
        });
      }

      query.category = category;
    }

    if (req.query.search) {
      query.$text = {
        $search: String(req.query.search).trim()
      };
    }

    const groups = await Group.find(query)
      .populate("owner", USER_SELECT)
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      groups: groups.map(group => buildGroupPayload(group, req.user._id))
    });
  } catch (err) {
    console.error("GET /api/groups error:", err);
    res.status(500).json({
      message: "Failed to load groups"
    });
  }
});

/* GET /api/groups/my */
router.get("/my", auth, async (req, res) => {
  try {
    const groups = await Group.find({
      isActive: true,
      members: req.user._id
    })
      .populate("owner", USER_SELECT)
      .sort({ updatedAt: -1 });

    res.json({
      groups: groups.map(group => buildGroupPayload(group, req.user._id))
    });
  } catch (err) {
    console.error("GET /api/groups/my error:", err);
    res.status(500).json({
      message: "Failed to load my groups"
    });
  }
});

/* GET /api/groups/suggested */
router.get("/suggested", auth, async (req, res) => {
  try {
    const userRole = normalizeCategory(req.user.role);

    const query = {
      isActive: true,
      members: { $ne: req.user._id }
    };

    if (isValidCategory(userRole)) {
      query.category = userRole;
    }

    const groups = await Group.find(query)
      .populate("owner", USER_SELECT)
      .sort({ createdAt: -1 })
      .limit(12);

    res.json({
      groups: groups.map(group => buildGroupPayload(group, req.user._id))
    });
  } catch (err) {
    console.error("GET /api/groups/suggested error:", err);
    res.status(500).json({
      message: "Failed to load suggested groups"
    });
  }
});

/* GET /api/groups/:id */
router.get("/:id", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    })
      .populate("owner", USER_SELECT)
      .populate("members", USER_SELECT)
      .populate("followers", USER_SELECT);

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    res.json({
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("GET /api/groups/:id error:", err);
    res.status(500).json({
      message: "Failed to load group"
    });
  }
});

/* POST /api/groups */
router.post("/", auth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const category = normalizeCategory(req.body.category);
    const visibility = req.body.visibility || "public";

    if (!name) {
      return res.status(400).json({
        message: "Group name is required"
      });
    }

    if (!description) {
      return res.status(400).json({
        message: "Group description is required"
      });
    }

    if (!isValidCategory(category)) {
      return res.status(400).json({
        message: "Invalid group category"
      });
    }

    if (!["public", "private"].includes(visibility)) {
      return res.status(400).json({
        message: "Invalid visibility"
      });
    }

    const group = await Group.create({
      name,
      description,
      category,
      visibility,
      owner: req.user._id,
      members: [req.user._id],
followers: [],
membersCount: 1,
followersCount: 0,
postsCount: 0,
      coverImage: req.body.coverImage || "",
      logo: req.body.logo || ""
    });

    await group.populate("owner", USER_SELECT);

    res.status(201).json({
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("POST /api/groups error:", err);
    res.status(500).json({
      message: "Failed to create group"
    });
  }
});

/* PATCH /api/groups/:id */
router.patch("/:id", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const isOwner = String(group.owner) === String(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: "Only the group owner or admin can edit this group"
      });
    }

    if (req.body.name !== undefined) {
      group.name = String(req.body.name || "").trim();
    }

    if (req.body.description !== undefined) {
      group.description = String(req.body.description || "").trim();
    }

    if (req.body.category !== undefined) {
      const category = normalizeCategory(req.body.category);

      if (!isValidCategory(category)) {
        return res.status(400).json({
          message: "Invalid group category"
        });
      }

      group.category = category;
    }

    if (req.body.visibility !== undefined) {
      if (!["public", "private"].includes(req.body.visibility)) {
        return res.status(400).json({
          message: "Invalid visibility"
        });
      }

      group.visibility = req.body.visibility;
    }

    if (req.body.coverImage !== undefined) {
      group.coverImage = req.body.coverImage || "";
    }

    if (req.body.logo !== undefined) {
      group.logo = req.body.logo || "";
    }

    await group.save();
    await group.populate("owner", USER_SELECT);

    res.json({
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("PATCH /api/groups/:id error:", err);
    res.status(500).json({
      message: "Failed to update group"
    });
  }
});

/* POST /api/groups/:id/join */
router.post("/:id/join", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

if (!group.members.some(id => String(id) === String(req.user._id))) {
  group.members.push(req.user._id);
}

group.membersCount = group.members.length;

await group.save();

    res.json({
      joined: true,
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("POST /api/groups/:id/join error:", err);
    res.status(500).json({
      message: "Failed to join group"
    });
  }
});

/* POST /api/groups/:id/leave */
router.post("/:id/leave", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    if (String(group.owner) === String(req.user._id)) {
      return res.status(400).json({
        message: "Group owner cannot leave their own group"
      });
    }

group.members = group.members.filter(id => {
  return String(id) !== String(req.user._id);
});

group.membersCount = group.members.length;

await group.save();

    res.json({
      joined: false,
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("POST /api/groups/:id/leave error:", err);
    res.status(500).json({
      message: "Failed to leave group"
    });
  }
});

/* POST /api/groups/:id/follow */
router.post("/:id/follow", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const alreadyFollowing = group.followers.some(id => {
      return String(id) === String(req.user._id);
    });

    if (alreadyFollowing) {
      group.followers = group.followers.filter(id => {
        return String(id) !== String(req.user._id);
      });
    } else {
      group.followers.push(req.user._id);
    }

    group.followersCount = group.followers.length;

await group.save();

    res.json({
      following: !alreadyFollowing,
      group: buildGroupPayload(group, req.user._id)
    });
  } catch (err) {
    console.error("POST /api/groups/:id/follow error:", err);
    res.status(500).json({
      message: "Failed to follow group"
    });
  }
});

/* DELETE /api/groups/:id */
router.delete("/:id", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const isOwner = String(group.owner) === String(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        message: "Only the group owner or admin can delete this group"
      });
    }

    group.isActive = false;
    await group.save();

    res.json({
      deleted: true,
      groupId: group._id
    });
  } catch (err) {
    console.error("DELETE /api/groups/:id error:", err);
    res.status(500).json({
      message: "Failed to delete group"
    });
  }
});
/* ==========================================
   GET GROUP POSTS
   GET /api/groups/:id/posts
========================================== */
router.get("/:id/posts", auth, async (req, res) => {
  try {

    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const posts = await Post.find({
      groupId: req.params.id,
      isHiddenByAdmin: false
    })
      .populate(
        "author",
        "name profileImage role headline companyName schoolName aiftVerified"
      )
      .populate({
        path: "repostOf",
        populate: {
          path: "author",
          select:
            "name profileImage role headline companyName schoolName aiftVerified"
        }
      })
      .sort({ createdAt: -1 });

    res.json({
      posts
    });

  } catch (err) {

    console.error("GET GROUP POSTS ERROR:", err);

    res.status(500).json({
      message: "Failed to load group posts"
    });
  }
});
/* ==========================================
   CREATE GROUP POST WITH MEDIA
   POST /api/groups/:id/posts
========================================== */
router.post(
  "/:id/posts",
  auth,
  upload.array("media", 10),
  async (req, res) => {
    try {
      const group = await Group.findOne({
        _id: req.params.id,
        isActive: true
      });

      if (!group) {
        return res.status(404).json({
          message: "Group not found"
        });
      }

      const isGroupMember = group.members.some(member => {
        return String(member) === String(req.user._id);
      });

      if (!isGroupMember) {
        return res.status(403).json({
          message: "Join this group before posting"
        });
      }

      const text = String(req.body.text || "").trim();
      const files = Array.isArray(req.files) ? req.files : [];

      if (!text && !files.length) {
        return res.status(400).json({
          message: "Please write something or add a photo/video"
        });
      }

      const media = [];

      for (const file of files) {
        const uploaded = await uploadToCloudinary(file, "aift/group-posts");
        media.push(uploaded);
      }

      const post = await Post.create({
        author: req.user._id,
        groupId: group._id,
        text,
        media
      });

      await post.populate(
        "author",
        "name profileImage avatar role headline companyName schoolName aiftVerified"
      );

      group.postsCount = Number(group.postsCount || 0) + 1;
      await group.save();

      res.status(201).json({
        post,
        postsCount: group.postsCount
      });

    } catch (err) {
      console.error("CREATE GROUP POST ERROR:", err);

      res.status(500).json({
        message: "Failed to create group post"
      });
    }
  }
);
/* ==========================================
   GET GROUP MEMBERS
   GET /api/groups/:id/members
========================================== */
router.get("/:id/members", auth, async (req, res) => {
  try {

    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    })
    .populate(
      "members",
      USER_SELECT
    );

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    res.json({
      members: group.members || []
    });

  } catch (err) {

    console.error(
      "GET GROUP MEMBERS ERROR:",
      err
    );

    res.status(500).json({
      message: "Failed to load group members"
    });
  }
});
/* ==========================================
   GET GROUP STATS
   GET /api/groups/:id/stats
========================================== */
router.get("/:id/stats", auth, async (req, res) => {
  try {

    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    res.json({
      membersCount: group.membersCount || 0,
      followersCount: group.followersCount || 0,
      postsCount: group.postsCount || 0,
      createdAt: group.createdAt
    });

  } catch (err) {

    console.error(
      "GET GROUP STATS ERROR:",
      err
    );

    res.status(500).json({
      message: "Failed to load group statistics"
    });
  }
});

/* ==========================================
   INVITE USERS TO GROUP
   POST /api/groups/:id/invite
========================================== */
router.post("/:id/invite", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const isGroupMember = group.members.some(member => {
      return String(member) === String(req.user._id);
    });

    if (!isGroupMember && !canManageGroup(group, req.user)) {
      return res.status(403).json({
        message: "Join this group before inviting people"
      });
    }

    const users = Array.isArray(req.body.users)
      ? req.body.users.map(id => String(id).trim()).filter(Boolean)
      : [];

    if (!users.length) {
      return res.status(400).json({
        message: "Please select at least one user to invite"
      });
    }

    const memberIds = new Set(group.members.map(member => String(member)));

    const invitedUsers = users.filter(userId => {
      return userId !== String(req.user._id) && !memberIds.has(userId);
    });

    if (!invitedUsers.length) {
      return res.status(400).json({
        message: "Selected users are already members"
      });
    }

    res.json({
      invited: true,
      groupId: group._id,
      invitedUsers,
      count: invitedUsers.length,
      message: `${invitedUsers.length} invitation(s) sent`
    });

  } catch (err) {
    console.error("POST GROUP INVITE ERROR:", err);

    res.status(500).json({
      message: "Failed to invite users"
    });
  }
});

/* ==========================================
   UPLOAD GROUP COVER / LOGO
   POST /api/groups/:id/upload
========================================== */
router.post(
  "/:id/upload",
  auth,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "logo", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const group = await Group.findOne({
        _id: req.params.id,
        isActive: true
      });

      if (!group) {
        return res.status(404).json({
          message: "Group not found"
        });
      }

      if (!canManageGroup(group, req.user)) {
        return res.status(403).json({
          message: "Only the group owner or admin can update group images"
        });
      }

      const files = req.files || {};
      const updates = {};

      if (files.coverImage?.[0]) {
        const uploadedCover = await uploadToCloudinary(
          files.coverImage[0],
          "aift/group-covers"
        );

        updates.coverImage = uploadedCover.url;
        group.coverImage = uploadedCover.url;
      }

      if (files.logo?.[0]) {
        const uploadedLogo = await uploadToCloudinary(
          files.logo[0],
          "aift/group-logos"
        );

        updates.logo = uploadedLogo.url;
        group.logo = uploadedLogo.url;
      }

      await group.save();
      await group.populate("owner", USER_SELECT);

      res.json({
        uploaded: true,
        updates,
        group: buildGroupPayload(group, req.user._id)
      });

    } catch (err) {
      console.error("UPLOAD GROUP IMAGE ERROR:", err);

      res.status(500).json({
        message: "Failed to upload group image"
      });
    }
  }
);
/* ==========================================
   SEARCH USERS TO INVITE
   GET /api/groups/:id/invite-candidates?search=
========================================== */
router.get("/:id/invite-candidates", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    const search = String(req.query.search || "").trim();

    if (search.length < 2) {
      return res.json({
        users: []
      });
    }

    const memberIds = group.members.map(member => String(member));

    const users = await User.find({
      _id: {
        $nin: [...memberIds, String(req.user._id)]
      },
      $or: [
        { name: new RegExp(search, "i") },
        { companyName: new RegExp(search, "i") },
        { schoolName: new RegExp(search, "i") },
        { headline: new RegExp(search, "i") },
        { profession: new RegExp(search, "i") },
        { role: new RegExp(search, "i") },
        { location: new RegExp(search, "i") }
      ]
    })
      .select(USER_SELECT)
      .limit(20);

    res.json({
      users
    });

  } catch (err) {
    console.error("GET INVITE CANDIDATES ERROR:", err);

    res.status(500).json({
      message: "Failed to load users"
    });
  }
});

/* ==========================================
   REMOVE GROUP MEMBER
   DELETE /api/groups/:id/members/:userId
========================================== */
router.delete("/:id/members/:userId", auth, async (req, res) => {
  try {
    const group = await Group.findOne({
      _id: req.params.id,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found"
      });
    }

    if (!canManageGroup(group, req.user)) {
      return res.status(403).json({
        message: "Only the group owner or admin can remove members"
      });
    }

    if (String(group.owner) === String(req.params.userId)) {
      return res.status(400).json({
        message: "The group owner cannot be removed"
      });
    }

    group.members = group.members.filter(member => {
      return String(member) !== String(req.params.userId);
    });

    group.membersCount = group.members.length;
    await group.save();

    res.json({
      removed: true,
      userId: req.params.userId,
      membersCount: group.membersCount
    });

  } catch (err) {
    console.error("REMOVE GROUP MEMBER ERROR:", err);

    res.status(500).json({
      message: "Failed to remove member"
    });
  }
});

module.exports = router;
