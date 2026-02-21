const express = require("express");
const router = express.Router();

const Message = require("../models/Message");
const auth = require("../middleware/auth");

/* SEND MESSAGE */
router.post("/", auth, async (req, res) => {
  try {
    const { receiverId, text } = req.body;

    if (!receiverId || !text) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const message = await Message.create({
      sender: req.user.id,
      receiver: receiverId,
      text
    });

    res.status(201).json(message);

  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* GET CONVERSATION */
router.get("/:userId", auth, async (req, res) => {
  try {

    const messages = await Message.find({
      $or: [
        { sender: req.user.id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user.id }
      ]
    })
    .populate("sender", "name profileImage")
    .populate("receiver", "name profileImage")
    .sort({ createdAt: 1 });

    res.json(messages);

  } catch (err) {
    console.error("GET CONVO ERROR:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

/* GET INBOX */
router.get("/", auth, async (req, res) => {
  try {

    const messages = await Message.find({
      $or: [
        { sender: req.user.id },
        { receiver: req.user.id }
      ]
    })
    .sort({ createdAt: -1 })
    .populate("sender", "name profileImage")
    .populate("receiver", "name profileImage");

    const conversations = [];

    messages.forEach(msg => {
      const otherUser =
        msg.sender._id.toString() === req.user.id
          ? msg.receiver
          : msg.sender;

      if (!conversations.find(c => c._id.toString() === otherUser._id.toString())) {
        conversations.push(otherUser);
      }
    });

    res.json(conversations);

  } catch (err) {
    console.error("INBOX ERROR:", err);
    res.status(500).json({ message: "Failed to load inbox" });
  }
});

module.exports = router;