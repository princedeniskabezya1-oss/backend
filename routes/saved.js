const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const SavedItem = require("../models/SavedItem");
const Post = require("../models/Post");
const Job = require("../models/Job");
const User = require("../models/User");
const Class = require("../models/Class");

const VALID_TYPES = [
  "post",
  "job",
  "profile",
  "class",
  "school",
  "opportunity",
  "group",
  "event"
];

const USER_POPULATE =
  "name companyName schoolName profileImage schoolLogo headline role profession location aiftVerified";

function isValidType(type) {
  return VALID_TYPES.includes(String(type || "").toLowerCase());
}

function normalizeType(type) {
  const clean = String(type || "").toLowerCase();

  if (clean === "user") return "profile";
  if (clean === "course") return "class";

  return clean;
}

function getModelByType(type) {
  if (type === "post") return Post;
  if (type === "job") return Job;
  if (type === "profile") return User;
  if (type === "school") return User;
  if (type === "class") return Class;

  return null;
}

function getPopulateByType(type) {
  if (type === "post") {
    return [
      {
        path: "author",
        select: USER_POPULATE
      },
      {
        path: "repostOf",
        populate: {
          path: "author",
          select: USER_POPULATE
        }
      }
    ];
  }

  if (type === "job") {
    return [
      {
        path: "employerId",
        select: USER_POPULATE
      }
    ];
  }

  if (type === "class") {
    return [
      {
        path: "schoolId",
        select: USER_POPULATE
      },
      {
        path: "teacherId",
        select: USER_POPULATE
      }
    ];
  }

  return [];
}

async function loadTargetItem(type, itemId) {
  const Model = getModelByType(type);

  if (!Model) {
    return null;
  }

  let query = Model.findById(itemId);

  const populateList = getPopulateByType(type);

  populateList.forEach(populateRule => {
    query = query.populate(populateRule);
  });

  const item = await query.lean();

  if (!item) {
    return null;
  }

  if (type === "post" && item.isHiddenByAdmin === true) {
    return null;
  }

  if (type === "job" && item.status && !["active", "pending"].includes(item.status)) {
    return null;
  }

  if (type === "school" && item.role !== "school") {
    return null;
  }

  return item;
}

function getItemPayload(saved, item) {
  return {
    _id: saved._id,
    saveId: saved._id,
    type: saved.itemType,
    itemType: saved.itemType,
    itemId: saved.itemId,
    savedAt: saved.createdAt,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    note: saved.note || "",
    item
  };
}

/* ============================================
   GET ALL SAVED ITEMS
   GET /api/saved?type=job&search=abc
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const query = {
      userId: req.user._id
    };

    const type = normalizeType(req.query.type);

    if (type && type !== "all") {
      if (!isValidType(type)) {
        return res.status(400).json({
          message: "Invalid saved item type"
        });
      }

      query.itemType = type;
    }

    const saved = await SavedItem.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const results = [];

    for (const entry of saved) {
      const item = await loadTargetItem(entry.itemType, entry.itemId);

      if (!item) {
        continue;
      }

      results.push(getItemPayload(entry, item));
    }

    res.json({
      saved: results,
      total: results.length
    });
  } catch (err) {
    console.error("GET /api/saved error:", err);
    res.status(500).json({
      message: "Failed to load saved items"
    });
  }
});

/* ============================================
   CHECK IF ITEM IS SAVED
   GET /api/saved/check/:itemType/:itemId
============================================ */
router.get("/check/:itemType/:itemId", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.params.itemType);

    if (!isValidType(itemType)) {
      return res.status(400).json({
        message: "Invalid saved item type"
      });
    }

    const saved = await SavedItem.findOne({
      userId: req.user._id,
      itemType,
      itemId: req.params.itemId
    }).lean();

    res.json({
      saved: Boolean(saved),
      saveId: saved?._id || null
    });
  } catch (err) {
    console.error("GET /api/saved/check error:", err);
    res.status(500).json({
      message: "Failed to check saved item"
    });
  }
});

/* ============================================
   SAVED STATS
   GET /api/saved/stats
============================================ */
router.get("/stats", auth, async (req, res) => {
  try {
    const rows = await SavedItem.aggregate([
      {
        $match: {
          userId: req.user._id
        }
      },
      {
        $group: {
          _id: "$itemType",
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      all: 0,
      post: 0,
      job: 0,
      profile: 0,
      class: 0,
      school: 0,
      opportunity: 0,
      group: 0,
      event: 0
    };

    rows.forEach(row => {
      stats[row._id] = row.count;
      stats.all += row.count;
    });

    res.json(stats);
  } catch (err) {
    console.error("GET /api/saved/stats error:", err);
    res.status(500).json({
      message: "Failed to load saved stats"
    });
  }
});

/* ============================================
   SAVE ITEM
   POST /api/saved
   Body: { itemType, itemId, note }
============================================ */
router.post("/", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.body.itemType || req.body.type);
    const itemId = req.body.itemId || req.body.id;
    const note = req.body.note || "";

    if (!isValidType(itemType)) {
      return res.status(400).json({
        message: "Invalid saved item type"
      });
    }

    if (!itemId) {
      return res.status(400).json({
        message: "Item ID is required"
      });
    }

    const target = await loadTargetItem(itemType, itemId);

    if (!target) {
      return res.status(404).json({
        message: "Item not found or cannot be saved"
      });
    }

    const existing = await SavedItem.findOne({
      userId: req.user._id,
      itemType,
      itemId
    });

    if (existing) {
      return res.json({
        saved: true,
        alreadySaved: true,
        saveId: existing._id,
        item: getItemPayload(existing, target)
      });
    }

    const saved = await SavedItem.create({
      userId: req.user._id,
      itemType,
      itemId,
      note
    });

    if (itemType === "job") {
      await Job.findByIdAndUpdate(itemId, {
        $inc: { saveCount: 1 }
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.to(String(req.user._id)).emit("saved:item:created", {
        itemType,
        itemId,
        saveId: saved._id
      });
    }

    res.status(201).json({
      saved: true,
      alreadySaved: false,
      saveId: saved._id,
      item: getItemPayload(saved, target)
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({
        saved: true,
        alreadySaved: true
      });
    }

    console.error("POST /api/saved error:", err);
    res.status(500).json({
      message: "Failed to save item"
    });
  }
});

/* ============================================
   DELETE SAVED ITEM BY SAVE ID
   DELETE /api/saved/:id
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const saved = await SavedItem.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!saved) {
      return res.status(404).json({
        message: "Saved item not found"
      });
    }

    if (saved.itemType === "job") {
      await Job.findByIdAndUpdate(saved.itemId, {
        $inc: { saveCount: -1 }
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.to(String(req.user._id)).emit("saved:item:removed", {
        itemType: saved.itemType,
        itemId: saved.itemId,
        saveId: saved._id
      });
    }

    res.json({
      removed: true,
      saveId: saved._id,
      itemType: saved.itemType,
      itemId: saved.itemId
    });
  } catch (err) {
    console.error("DELETE /api/saved/:id error:", err);
    res.status(500).json({
      message: "Failed to remove saved item"
    });
  }
});

/* ============================================
   DELETE SAVED ITEM BY TYPE + ITEM ID
   DELETE /api/saved/by-item/:itemType/:itemId
============================================ */
router.delete("/by-item/:itemType/:itemId", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.params.itemType);

    if (!isValidType(itemType)) {
      return res.status(400).json({
        message: "Invalid saved item type"
      });
    }

    const saved = await SavedItem.findOneAndDelete({
      userId: req.user._id,
      itemType,
      itemId: req.params.itemId
    });

    if (!saved) {
      return res.status(404).json({
        message: "Saved item not found"
      });
    }

    if (itemType === "job") {
      await Job.findByIdAndUpdate(req.params.itemId, {
        $inc: { saveCount: -1 }
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.to(String(req.user._id)).emit("saved:item:removed", {
        itemType,
        itemId: req.params.itemId,
        saveId: saved._id
      });
    }

    res.json({
      removed: true,
      saveId: saved._id,
      itemType,
      itemId: req.params.itemId
    });
  } catch (err) {
    console.error("DELETE /api/saved/by-item error:", err);
    res.status(500).json({
      message: "Failed to remove saved item"
    });
  }
});

module.exports = router;
