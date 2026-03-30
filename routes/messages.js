const express = require("express");
const router = express.Router();

const Message = require("../models/Message");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

/* SEND MESSAGE */
/* SEND MESSAGE WITH MONETIZATION LOGIC */
router.post("/", auth, upload.single("file"), async (req, res) => {
  try {

    const { receiverId, text } = req.body;
let fileUrl = null;
let fileType = null;

if(req.file){

  const result = await new Promise((resolve, reject)=>{
    cloudinary.uploader.upload_stream(
      { resource_type: "auto" },
      (error, result)=>{
        if(error) reject(error);
        else resolve(result);
      }
    ).end(req.file.buffer);
  });

  fileUrl = result.secure_url;
  fileType = result.resource_type;
}

    if (!receiverId || (!text && !req.file)) {
  return res.status(400).json({ message: "Message or file required" });
}

    if (receiverId === req.user.id) {
      return res.status(400).json({ message: "Cannot message yourself" });
    }

    const sender = await require("../models/User").findById(req.user.id);
    const receiver = await require("../models/User").findById(receiverId);

    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    /* ==============================
       RESET DAILY COUNTER IF NEW DAY
    ============================== */

    const today = new Date().toDateString();

    if (!sender.lastMessageReset || sender.lastMessageReset.toDateString() !== today) {
      sender.dailyNewConversations = 0;
      sender.lastMessageReset = new Date();
    }

    /* ==============================
       CHECK IF CONVERSATION EXISTS
    ============================== */

    const existingConversation = await Message.findOne({
      $or: [
        { sender: sender._id, receiver: receiver._id },
        { sender: receiver._id, receiver: sender._id }
      ]
    });

    const isNewConversation = !existingConversation;

    /* ==============================
       MUTUAL FOLLOW CHECK
    ============================== */

    const isMutualFollow =
      sender.following.includes(receiver._id) &&
      receiver.following.includes(sender._id);

    /* ==============================
       EMPLOYER -> TALENT RULE
    ============================== */

    const employerCanMessage =
      sender.role === "employer";

    /* ==============================
       PRO USER BYPASS
    ============================== */

    const isProUser = sender.isPro === true;

    /* ==============================
       ENFORCE LIMITS
    ============================== */

    if (isNewConversation && !isMutualFollow && !employerCanMessage && !isProUser) {

      if (sender.dailyNewConversations >= 3) {
        return res.status(403).json({
          message: "Daily new conversation limit reached. Upgrade to Pro."
        });
      }

      sender.dailyNewConversations += 1;
    }

    await sender.save();

    /* ==============================
       CREATE MESSAGE
    ============================== */

    const message = await Message.create({
  sender: sender._id,
  receiver: receiver._id,
  text,
  fileUrl,
  fileType
});
// CREATE NOTIFICATION FOR RECEIVER
await require("../models/Notification").create({
  user: receiver._id,
  type: "message",
  sender: sender._id,
  text: text,
  link: `/messages.html?user=${sender._id}`
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

    const seenUsers = new Set();
    const conversations = [];

    for (let msg of messages) {

      const otherUser =
        msg.sender._id.toString() === req.user.id
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

    await Message.updateMany(
      {
        sender: req.params.userId,
        receiver: req.user.id,
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
/* GET UNREAD MESSAGE COUNT */
router.get("/unread/count", auth, async (req, res) => {
  try {

    const count = await Message.countDocuments({
      receiver: req.user.id,
      seen: false
    });

    res.json({ count });

  } catch (err) {
    res.status(500).json({ message: "Failed to count unread" });
  }
});

module.exports = router;