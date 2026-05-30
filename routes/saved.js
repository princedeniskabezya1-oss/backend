const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const SavedItem = require("../models/SavedItem");
const Post = require("../models/Post");
const Job = require("../models/Job");

const VALID_TYPES = ["post", "job"];

const USER_POPULATE =
  "name companyName schoolName profileImage headline role profession location aiftVerified";

function normalizeType(type) {
  return String(type || "").toLowerCase().trim();
}

function isValidType(type) {
  return VALID_TYPES.includes(normalizeType(type));
}

async function loadTargetItem(itemType, itemId) {
  if (itemType === "post") {
    const post = await Post.findById(itemId)
      .populate("author", USER_POPULATE)
      .populate({
        path: "repostOf",
        populate: {
          path: "author",
          select: USER_POPULATE
        }
      })
      .lean();

    if (!post || post.isHiddenByAdmin) return null;

    return post;
  }

  if (itemType === "job") {
    const job = await Job.findById(itemId)
      .populate("employerId", USER_POPULATE)
      .lean();

    if (!job || job.status !== "active") return null;

    return job;
  }

  return null;
}

function buildPayload(saved, item) {
  return {
    _id: saved._id,
    saveId: saved._id,
    itemType: saved.itemType,
    type: saved.itemType,
    itemId: saved.itemId,
    savedAt: saved.createdAt,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    item
  };
}

/* GET /api/saved */
router.get("/", auth, async (req, res) => {
  try {
    const query = {
      userId: req.user._id
    };

    const itemType = normalizeType(req.query.type);

    if (itemType && itemType !== "all") {
      if (!isValidType(itemType)) {
        return res.status(400).json({ message: "Invalid saved item type" });
      }

      query.itemType = itemType;
    }

    const savedItems = await SavedItem.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const results = [];

    for (const saved of savedItems) {
      const item = await loadTargetItem(saved.itemType, saved.itemId);

      if (item) {
        results.push(buildPayload(saved, item));
      }
    }

    res.json({
      saved: results,
      total: results.length
    });
  } catch (err) {
    console.error("GET /api/saved error:", err);
    res.status(500).json({ message: "Failed to load saved items" });
  }
});

/* GET /api/saved/check/:itemType/:itemId */
router.get("/check/:itemType/:itemId", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.params.itemType);

    if (!isValidType(itemType)) {
      return res.status(400).json({ message: "Invalid saved item type" });
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
    res.status(500).json({ message: "Failed to check saved item" });
  }
});

/* GET /api/saved/stats */
router.get("/stats", auth, async (req, res) => {
  try {
    const rows = await SavedItem.aggregate([
      { $match: { userId: req.user._id } },
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
      job: 0
    };

    rows.forEach(row => {
      stats[row._id] = row.count;
      stats.all += row.count;
    });

    res.json(stats);
  } catch (err) {
    console.error("GET /api/saved/stats error:", err);
    res.status(500).json({ message: "Failed to load saved stats" });
  }
});

/* POST /api/saved */
router.post("/", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.body.itemType || req.body.type);
    const itemId = req.body.itemId || req.body.id;

    if (!isValidType(itemType)) {
      return res.status(400).json({ message: "Invalid saved item type" });
    }

    if (!itemId) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    const item = await loadTargetItem(itemType, itemId);

    if (!item) {
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
        item: buildPayload(existing, item)
      });
    }

    const saved = await SavedItem.create({
      userId: req.user._id,
      itemType,
      itemId
    });

    if (itemType === "job") {
      await Job.findByIdAndUpdate(itemId, {
        $inc: { saveCount: 1 }
      });
    }

    res.status(201).json({
      saved: true,
      alreadySaved: false,
      saveId: saved._id,
      item: buildPayload(saved, item)
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({
        saved: true,
        alreadySaved: true
      });
    }

    console.error("POST /api/saved error:", err);
    res.status(500).json({ message: "Failed to save item" });
  }
});

/* IMPORTANT: keep this ABOVE router.delete("/:id") */
router.delete("/by-item/:itemType/:itemId", auth, async (req, res) => {
  try {
    const itemType = normalizeType(req.params.itemType);

    if (!isValidType(itemType)) {
      return res.status(400).json({ message: "Invalid saved item type" });
    }

    const saved = await SavedItem.findOneAndDelete({
      userId: req.user._id,
      itemType,
      itemId: req.params.itemId
    });

    if (!saved) {
      return res.status(404).json({ message: "Saved item not found" });
    }

    if (itemType === "job") {
      await Job.findByIdAndUpdate(req.params.itemId, {
        $inc: { saveCount: -1 }
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
    res.status(500).json({ message: "Failed to remove saved item" });
  }
});

/* DELETE /api/saved/:id */
router.delete("/:id", auth, async (req, res) => {
  try {
    const saved = await SavedItem.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!saved) {
      return res.status(404).json({ message: "Saved item not found" });
    }

    if (saved.itemType === "job") {
      await Job.findByIdAndUpdate(saved.itemId, {
        $inc: { saveCount: -1 }
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
    res.status(500).json({ message: "Failed to remove saved item" });
  }
});

module.exports = router;
