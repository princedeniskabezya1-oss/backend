const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Group = require("../models/Group");
const Post = require("../models/Post");

const USER_SELECT =
  "name companyName schoolName profileImage avatar headline profession role location aiftVerified";

const VALID_CATEGORIES = [
  "employer",
  "school",
  "agent",
  "talent",
  "student"
];

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
   CREATE GROUP POST
   POST /api/groups/:id/posts
========================================== */
router.post("/:id/posts", auth, async (req, res) => {
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

    const isMember =
      group.members.some(
        member =>
          String(member) === String(req.user._id)
      );

    if (!isMember) {
      return res.status(403).json({
        message: "Join this group before posting"
      });
    }

    const post = await Post.create({
      author: req.user._id,
      groupId: group._id,
      text: req.body.text || "",
      media: req.body.media || []
    });

await post.populate(
  "author",
  "name profileImage role headline companyName schoolName aiftVerified"
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
});
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

module.exports = router;
