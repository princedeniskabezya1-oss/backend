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

module.exports = router;