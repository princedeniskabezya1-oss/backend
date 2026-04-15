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

    const { receiverId, text, replyTo } = req.body;
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
  fileType = req.file.mimetype;
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
  fileType,
  replyTo: replyTo || null
});

// 🔥 VERY IMPORTANT (populate everything)
const fullMessage = await Message.findById(message._id)
  .populate("sender", "name profileImage")
  .populate("receiver", "name profileImage")
  .populate({
    path: "replyTo",
    populate: { path: "sender", select: "name" }
  });

const io = req.app.get("io");

// SEND TO BOTH USERS (LIKE WHATSAPP)
io.to(receiver._id.toString()).emit("newMessage", fullMessage);
io.to(sender._id.toString()).emit("newMessage", fullMessage);

// CREATE NOTIFICATION FOR RECEIVER
await require("../models/Notification").create({
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

/* ADD REACTION */
router.post("/react", auth, async (req, res) => {
  try {

    const { messageId, emoji } = req.body;

    const message = await Message.findById(messageId)
  .populate("sender")
  .populate("receiver");

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // REMOVE OLD REACTION FROM SAME USER
    message.reactions = message.reactions.filter(
      r => r.user.toString() !== req.user.id
    );

    // ADD NEW REACTION
    message.reactions.push({
      user: req.user.id,
      emoji
    });

    await message.save();

    // 🔥 REAL-TIME UPDATE
    const io = req.app.get("io");

    const updated = await Message.findById(messageId)
  .populate("sender", "name profileImage")
  .populate("receiver", "name profileImage")
  .populate({
    path: "replyTo",
    populate: { path: "sender", select: "name profileImage" }
  });

// 🔥 FIX: use _id
io.to(message.receiver._id.toString()).emit("reactionUpdate", updated);
io.to(message.sender._id.toString()).emit("reactionUpdate", updated);

    res.json(updated);

  } catch (err) {
    console.error("REACTION ERROR:", err);
    res.status(500).json({ message: "Failed to react" });
  }
});

module.exports = router;