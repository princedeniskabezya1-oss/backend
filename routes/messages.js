const express = require("express");
const router = express.Router();

const Message = require("../models/Message");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");
const Notification = require("../models/Notification");

/* SEND MESSAGE */
router.post("/", auth, upload.single("file"), async (req, res) => {
  try {
    const { receiverId, text, replyTo } = req.body;
    let fileUrl = null;
    let fileType = null;

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: "auto" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      fileUrl = result.secure_url;
      fileType = req.file.mimetype;
    }

    if (!receiverId || (!text && !req.file)) {
      return res.status(400).json({ message: "Message or file required" });
    }

    const currentUserId = req.user.id || req.user._id;

    if (String(receiverId) === String(currentUserId)) {
      return res.status(400).json({ message: "Cannot message yourself" });
    }

    const sender = await User.findById(currentUserId);
    const receiver = await User.findById(receiverId);

    if (!sender) {
      return res.status(404).json({ message: "Sender not found" });
    }

    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = new Date().toDateString();

    if (!sender.lastMessageReset || sender.lastMessageReset.toDateString() !== today) {
      sender.dailyNewConversations = 0;
      sender.lastMessageReset = new Date();
    }

    const existingConversation = await Message.findOne({
      $or: [
        { sender: sender._id, receiver: receiver._id },
        { sender: receiver._id, receiver: sender._id }
      ]
    });

    const isNewConversation = !existingConversation;

    const isMutualFollow =
      sender.following.includes(receiver._id) &&
      receiver.following.includes(sender._id);

    const employerCanMessage = sender.role === "employer";
    const isProUser = sender.isPro === true;

    if (isNewConversation && !isMutualFollow && !employerCanMessage && !isProUser) {
      if (sender.dailyNewConversations >= 3) {
        return res.status(403).json({
          message: "Daily new conversation limit reached. Upgrade to Pro."
        });
      }

      sender.dailyNewConversations += 1;
    }

    await sender.save();

    const message = await Message.create({
      sender: sender._id,
      receiver: receiver._id,
      text,
      fileUrl,
      fileType,
      replyTo: replyTo || null
    });

    const fullMessage = await Message.findById(message._id)
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage")
      .populate({
        path: "replyTo",
        populate: { path: "sender", select: "name" }
      });

    const io = req.app.get("io");

    io.to(receiver._id.toString()).emit("newMessage", fullMessage);
    io.to(sender._id.toString()).emit("newMessage", fullMessage);

    await Notification.create({
      user: receiver._id,
      type: "message",
      sender: sender._id,
      text: text,
      link: `/messages.html?user=${sender._id}`
    });

    res.status(201).json(fullMessage);
  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* GET UNREAD MESSAGE COUNT */
/* IMPORTANT: keep these BEFORE /:userId */
async function getUnreadMessageCount(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    if (!userId) {
      return res.status(401).json({ message: "User not found in token" });
    }

    const count = await Message.countDocuments({
      receiver: userId,
      seen: false
    });

    res.json({ count });
  } catch (err) {
    console.error("UNREAD MESSAGE COUNT ERROR:", err);
    res.status(500).json({ message: "Failed to count unread" });
  }
}

router.get("/unread/count", auth, getUnreadMessageCount);
router.get("/unread-count", auth, getUnreadMessageCount);

/* GET INBOX */
router.get("/", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId },
        { receiver: currentUserId }
      ]
    })
      .sort({ createdAt: -1 })
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage");

    const seenUsers = new Set();
    const conversations = [];

    for (const msg of messages) {
      const otherUser =
        String(msg.sender._id) === String(currentUserId)
          ? msg.receiver
          : msg.sender;

      if (!seenUsers.has(otherUser._id.toString())) {
        seenUsers.add(otherUser._id.toString());

        conversations.push({
          user: otherUser,
          lastMessage: msg.text,
          lastMessageDate: msg.createdAt
        });
      }
    }

    res.json(conversations);
  } catch (err) {
    console.error("INBOX ERROR:", err);
    res.status(500).json({ message: "Failed to load inbox" });
  }
});

/* MARK CONVERSATION AS SEEN */
router.patch("/seen/:userId", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;

    await Message.updateMany(
      {
        sender: req.params.userId,
        receiver: currentUserId,
        seen: false
      },
      { seen: true }
    );

    res.json({ message: "Conversation marked as seen" });
  } catch (err) {
    console.error("SEEN ERROR:", err);
    res.status(500).json({ message: "Failed to update seen status" });
  }
});

/* GET CONVERSATION */
/* IMPORTANT: keep this AFTER /unread/count and /unread-count */
router.get("/:userId", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: req.params.userId },
        { sender: req.params.userId, receiver: currentUserId }
      ]
    })
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage")
      .populate({
        path: "replyTo",
        populate: { path: "sender", select: "name" }
      })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("GET CONVO ERROR:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

/* ADD REACTION */
router.post("/react", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    const { messageId, emoji } = req.body;

    const message = await Message.findById(messageId)
      .populate("sender")
      .populate("receiver");

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.reactions = message.reactions.filter(
      r => String(r.user) !== String(currentUserId)
    );

    message.reactions.push({
      user: currentUserId,
      emoji
    });

    await message.save();

    const io = req.app.get("io");

    const updated = await Message.findById(messageId)
      .populate("sender", "name profileImage")
      .populate("receiver", "name profileImage")
      .populate({
        path: "replyTo",
        populate: { path: "sender", select: "name profileImage" }
      });

    io.to(message.receiver._id.toString()).emit("reactionUpdate", updated);
    io.to(message.sender._id.toString()).emit("reactionUpdate", updated);

    res.json(updated);
  } catch (err) {
    console.error("REACTION ERROR:", err);
    res.status(500).json({ message: "Failed to react" });
  }
});

module.exports = router;