const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

/* GET ALL NOTIFICATIONS */
router.get("/", auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .populate("sender", "name profileImage")
      .sort({ createdAt: -1 });

    res.json(notifications);

  } catch (err) {
    res.status(500).json({ message: "Failed to load notifications" });
  }
});

/* GET UNREAD COUNT */
router.get("/unread", auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      read: false
    });

    res.json({ count });

  } catch (err) {
    res.status(500).json({ message: "Failed to count notifications" });
  }
});

/* MARK AS READ */
router.patch("/:id/read", auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ message: "Marked as read" });

  } catch (err) {
    res.status(500).json({ message: "Failed to update notification" });
  }
});

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Notification = require("../models/Notification");

async function getUnreadNotificationCount(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    if (!userId) {
      return res.status(401).json({ message: "User not found in token" });
    }

    const count = await Notification.countDocuments({
      $or: [
        { user: userId, read: false },
        { userId: userId, read: false }
      ]
    });

    res.json({ count });

  } catch (err) {
    console.error("UNREAD NOTIFICATION COUNT ERROR:", err);
    res.status(500).json({ message: "Failed to load unread notification count" });
  }
}

router.get("/unread", auth, getUnreadNotificationCount);
router.get("/unread-count", auth, getUnreadNotificationCount);

module.exports = router;