const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const ConversationSetting = require("../models/ConversationSetting");
const CallLog = require("../models/CallLog");
const Story = require("../models/Story");

const authMiddleware = require("../middleware/auth");
const cloudinary = require("../config/cloudinary");
const { enforceContactSafety, hasMessagingRestriction } = require("../utils/contactSafety");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

function isValidId(id){
  return mongoose.Types.ObjectId.isValid(id);
}

function getIo(req){
  return req.app.get("io") || req.io;
}

function normalizeFileType(mime = ""){
  if(mime.startsWith("image")) return "image";
  if(mime.startsWith("video")) return "video";
  if(mime.startsWith("audio")) return "audio";
  if(mime.includes("pdf")) return "document";
  if(mime.includes("document")) return "document";
  return "file";
}

async function uploadToCloudinary(file){
  if(!file) return null;

  const type = normalizeFileType(file.mimetype);

  const resourceType =
    type === "video" || type === "audio"
      ? "video"
      : type === "image"
        ? "image"
        : "raw";

  return new Promise((resolve,reject)=>{
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:"aift/messages",
        resource_type:resourceType
      },
      (error,result)=>{
        if(error) return reject(error);

        resolve({
          url:result.secure_url,
          secureUrl:result.secure_url,
          publicId:result.public_id,
          type,
          mimeType:file.mimetype,
          originalName:file.originalname,
          size:file.size,
          width:result.width,
          height:result.height,
          duration:result.duration
        });
      }
    );

    stream.end(file.buffer);
  });
}

async function findOrCreateDirectConversation(userA,userB,createdBy){
  let conversation = await Conversation.findOne({
    type:"direct",
    participantIds:{
      $all:[userA,userB]
    }
  });

  if(conversation) return conversation;

  conversation = await Conversation.create({
    type:"direct",
    createdBy,
    participants:[
      {
        user:userA,
        role:"member"
      },
      {
        user:userB,
        role:"member"
      }
    ],
    participantIds:[userA,userB],
    metadata:{
      source:"manual"
    }
  });

  return conversation;
}

async function canAccessConversation(conversation,userId){
  return conversation?.participants?.some(p =>
    String(p.user) === String(userId) &&
    p.isActive !== false &&
    p.blocked !== true
  );
}

function visibleMessageQuery(userId){
  return {
    deletedForEveryone:{
      $ne:true
    },
    deletedFor:{
      $ne:userId
    }
  };
}

function sanitizeDeletedMessage(message){
  if(message.deletedForEveryone){
    message.text = "This message was deleted";
    message.fileUrl = "";
    message.fileType = "";
    message.attachments = [];
  }

  return message;
}

/* =========================
   GET CONVERSATIONS
   Keeps frontend compatibility:
   GET /api/messages
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;

    let conversations = await Conversation.find({
      participantIds:userId,
      isActive:true
    })
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession")
      .populate("lastMessage.sender","name companyName schoolName role profileImage")
      .sort({ updatedAt:-1 })
      .lean();

    const settings = await ConversationSetting.find({
      user:userId
    }).lean();

    const settingsMap = new Map(
      settings.map(item => [
        String(item.conversationId || item.otherUser),
        item
      ])
    );

    const response = conversations.map(conv=>{
      const otherParticipant =
        conv.participants.find(p => String(p.user?._id) !== String(userId)) ||
        conv.participants[0];

      const otherUser =
        otherParticipant?.user || {};

      const participant =
        conv.participants.find(p => String(p.user?._id) === String(userId));

      const setting =
        settingsMap.get(String(conv._id)) ||
        settingsMap.get(String(otherUser._id)) ||
        {};

      return {
        _id:conv._id,
        conversationId:conv._id,
        type:conv.type,
        title:conv.title,
        user:otherUser,
        lastMessage:conv.lastMessage?.text || "",
        lastMessageType:conv.lastMessage?.messageType || "text",
        lastMessageDate:conv.lastMessage?.createdAt || conv.updatedAt,
        unreadCount:participant?.unreadCount || 0,
        unread:participant?.unreadCount || 0,
        pinned:setting.pinned || participant?.pinned || false,
        muted:setting.muted || participant?.muted || false,
        archived:setting.archived || participant?.archived || false
      };
    });

    res.json(response);

  }catch(error){
    console.error("GET CONVERSATIONS ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   GET THREAD WITH USER
   GET /api/messages/:userId
========================= */

router.get("/:userId", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const otherUserId = req.params.userId;

    if(!isValidId(otherUserId)){
      return res.status(400).json({ message:"Invalid user ID" });
    }

    const conversation =
      await findOrCreateDirectConversation(userId,otherUserId,userId);

    const messages = await Message.find({
      conversationId:conversation._id,
      deletedFor:{
        $ne:userId
      }
    })
      .populate("sender","name companyName schoolName role profileImage")
      .populate("receiver","name companyName schoolName role profileImage")
      .populate("reactions.user","name profileImage")
      .populate({
        path:"replyTo",
        select:"text sender",
        populate:{
          path:"sender",
          select:"name companyName schoolName role"
        }
      })
      .sort({ createdAt:1 })
      .lean();

    const storyIds = [
      ...new Set(
        messages
          .filter(message => message?.metadata?.source === "story_reply")
          .map(message => message?.metadata?.storyReply?.storyId)
          .filter(isValidId)
          .map(String)
      )
    ];

    const availableStories = storyIds.length
      ? await Story.find({
          _id: { $in: storyIds },
          deletedAt: null,
          expiresAt: { $gt: new Date() }
        }).select("_id").lean()
      : [];

    const availableStoryIds = new Set(
      availableStories.map(story => String(story._id))
    );

    res.json(
      messages.map(message=>{
        if(
          message?.metadata?.source === "story_reply" &&
          message?.metadata?.storyReply?.storyId
        ){
          message.metadata.storyReply.available = availableStoryIds.has(
            String(message.metadata.storyReply.storyId)
          );
        }
        if(message.deletedForEveryone){
          return {
            ...message,
            text:"This message was deleted",
            fileUrl:"",
            fileType:"",
            attachments:[]
          };
        }

        return message;
      })
    );

  }catch(error){
    console.error("GET THREAD ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   SEND MESSAGE
   POST /api/messages
========================= */

router.post("/", authMiddleware, upload.fields([{name:"file",maxCount:1},{name:"files",maxCount:10}]), async (req,res)=>{
  try{
    const senderId = req.user.id;
const {
  receiverId,
  text = "",
  replyTo,
  clientMessageId,
  fileUrl = "",
  fileType = "",
  fileName = ""
} = req.body;

    if(!receiverId || !isValidId(receiverId)){
      return res.status(400).json({ message:"Valid receiverId is required" });
    }

const uploadedFiles=[...(req.files?.file||[]),...(req.files?.files||[])];
if(!text.trim() && !uploadedFiles.length && !fileUrl){
  return res.status(400).json({ message:"Message text, file, GIF, or sticker is required" });
}

    if(await hasMessagingRestriction(senderId)){
      return res.status(403).json({ code:"AIFT_MESSAGING_RESTRICTED", message:"Messaging is restricted pending AIFT review." });
    }

    const safety = await enforceContactSafety({ user:req.user, text, receiverId });
    if(!safety.allowed){
      return res.status(safety.statusCode).json({ code:"AIFT_CONTACT_SHARING_BLOCKED", message:safety.message, warningNumber:safety.warningNumber, action:safety.action });
    }

    const conversation =
      await findOrCreateDirectConversation(senderId,receiverId,senderId);

let attachments = uploadedFiles.length
  ? await Promise.all(uploadedFiles.map(uploadToCloudinary))
  : [];
let attachment = attachments[0] || null;

if(!attachment && fileUrl){
  const type =
    fileType.includes("gif")
      ? "image"
      : fileType.includes("image")
        ? "image"
        : fileType.includes("video")
          ? "video"
          : fileType.includes("audio")
            ? "audio"
            : "file";

  attachment = {
    url:fileUrl,
    secureUrl:fileUrl,
    publicId:"",
    type,
    mimeType:fileType || "image/webp",
    originalName:fileName || "Chat asset",
    size:0
  };
  attachments = [attachment];
}

    const message = await Message.create({
      conversationId:conversation._id,
      sender:senderId,
      receiver:receiverId,
      participants:[senderId,receiverId],
      text:text.trim(),
fileUrl:attachment?.url || "",
fileType:attachment?.mimeType || "",
fileName:attachment?.originalName || "",
fileSize:attachment?.size || 0,
attachments,
messageType:attachment ? attachment.type : "text",
      replyTo:isValidId(replyTo) ? replyTo : null,
      metadata:{
        clientMessageId,
        ipAddress:req.ip,
        userAgent:req.headers["user-agent"]
      }
    });

    const io = getIo(req);
    const receiverRoom = io?.sockets?.adapter?.rooms?.get(String(receiverId));

    if(receiverRoom?.size){
      message.markDeliveredTo(receiverId);
      await message.save();
    }

    conversation.setLastMessage(message);
    conversation.incrementUnreadForOthers(senderId);
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate("sender","name companyName schoolName role profileImage")
      .populate("receiver","name companyName schoolName role profileImage")
      .populate("reactions.user","name profileImage")
      .populate({
        path:"replyTo",
        select:"text sender",
        populate:{
          path:"sender",
          select:"name companyName schoolName role"
        }
      });

    io?.to(String(receiverId)).emit("newMessage", populated);
    io?.to(String(senderId)).emit("newMessage", populated);

    if(message.status === "delivered"){
      io?.to(String(senderId)).emit("messageDelivered", {
        messageId:message._id,
        by:receiverId,
        deliveredAt:message.deliveredAt
      });
    }

    res.status(201).json(populated);

  }catch(error){
    console.error("SEND MESSAGE ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   MARK DELIVERED
   PATCH /api/messages/:id/delivered
========================= */

router.patch("/:id/delivered", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const messageId = req.params.id;

    if(!isValidId(messageId)){
      return res.status(400).json({ message:"Invalid message ID" });
    }

    const message = await Message.findById(messageId);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(String(message.receiver) !== String(userId)){
      return res.status(403).json({ message:"Only the receiver can confirm delivery" });
    }

    if(message.deletedForEveryone){
      return res.status(400).json({ message:"Deleted message cannot be marked delivered" });
    }

    if(message.status !== "seen"){
      message.markDeliveredTo(userId);
      await message.save();
    }

    getIo(req)?.to(String(message.sender)).emit("messageDelivered", {
      messageId:message._id,
      by:userId,
      deliveredAt:message.deliveredAt || new Date()
    });

    res.json({
      success:true,
      messageId:message._id,
      status:message.status,
      deliveredAt:message.deliveredAt,
      deliveredTo:message.deliveredTo
    });

  }catch(error){
    console.error("MARK DELIVERED ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   MARK SEEN
   PATCH /api/messages/seen/:userId
========================= */

router.patch("/seen/:userId", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const otherUserId = req.params.userId;

    if(!isValidId(otherUserId)){
      return res.status(400).json({ message:"Invalid user ID" });
    }

    const conversation = await Conversation.findOne({
      type:"direct",
      participantIds:{
        $all:[userId,otherUserId]
      }
    });

    if(conversation){
      conversation.markRead(userId);
      await conversation.save();
    }

    await Message.updateMany(
      {
        sender:otherUserId,
        receiver:userId,
        seen:false
      },
      {
        $set:{
          seen:true,
          seenAt:new Date(),
          status:"seen"
        },
        $addToSet:{
          readBy:{
            user:userId,
            readAt:new Date()
          }
        }
      }
    );

    getIo(req)?.to(String(otherUserId)).emit("messagesSeen", {
      by:userId
    });

    res.json({
      success:true
    });

  }catch(error){
    console.error("MARK SEEN ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   REACT
   POST /api/messages/react
========================= */

router.post("/react", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const { messageId, emoji, reaction } = req.body;

    if(!isValidId(messageId)){
      return res.status(400).json({ message:"Invalid message ID" });
    }

    const message = await Message.findById(messageId);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(!message.isParticipant(userId)){
      return res.status(403).json({ message:"Not allowed" });
    }

    const value =
      String(reaction || emoji || "").trim().slice(0,40);

    if(!value){
      return res.status(400).json({ message:"Reaction is required" });
    }

    message.reactions =
      message.reactions.filter(item => String(item.user) !== String(userId));

    message.reactions.push({
      user:userId,
      reaction:value,
      createdAt:new Date()
    });

    await message.save();

    const updated = await Message.findById(message._id)
      .populate("sender","name profileImage")
      .populate("receiver","name profileImage")
      .populate("reactions.user","name profileImage");

    const io = getIo(req);
    io?.to(String(message.sender)).emit("reactionUpdate", updated);
    io?.to(String(message.receiver)).emit("reactionUpdate", updated);

    res.json(updated);

  }catch(error){
    console.error("REACT MESSAGE ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   REMOVE REACTION
   DELETE /api/messages/react/:messageId
========================= */
router.delete("/react/:messageId", authMiddleware, async (req,res)=>{
  try{
    const userId=req.user.id,{messageId}=req.params;
    if(!isValidId(messageId))return res.status(400).json({message:"Invalid message ID"});
    const message=await Message.findById(messageId);
    if(!message)return res.status(404).json({message:"Message not found"});
    if(!message.isParticipant(userId))return res.status(403).json({message:"Not allowed"});
    message.reactions=message.reactions.filter(item=>String(item.user)!==String(userId));
    await message.save();
    const updated=await Message.findById(message._id).populate("sender","name profileImage").populate("receiver","name profileImage")
      .populate("reactions.user","name profileImage");
    const io=getIo(req);io?.to(String(message.sender)).emit("reactionUpdate",updated);io?.to(String(message.receiver)).emit("reactionUpdate",updated);
    res.json(updated);
  }catch(error){console.error("REMOVE MESSAGE REACTION ERROR:",error);res.status(500).json({message:"Server error"});}
});

/* =========================
   EDIT MESSAGE
========================= */

router.patch("/:id/edit", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const { text } = req.body;

    const message = await Message.findById(req.params.id);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(String(message.sender) !== String(userId)){
      return res.status(403).json({ message:"Only sender can edit this message" });
    }

    if(message.deletedForEveryone){
      return res.status(400).json({ message:"Deleted message cannot be edited" });
    }

    if(await hasMessagingRestriction(userId)){
      return res.status(403).json({ code:"AIFT_MESSAGING_RESTRICTED", message:"Messaging is restricted pending AIFT review." });
    }

    const safety = await enforceContactSafety({ user:req.user, text, conversationId:message.conversationId, receiverId:message.receiver });
    if(!safety.allowed){
      return res.status(safety.statusCode).json({ code:"AIFT_CONTACT_SHARING_BLOCKED", message:safety.message, warningNumber:safety.warningNumber, action:safety.action });
    }

    message.editText(String(text || "").trim());
    await message.save();

    getIo(req)?.to(String(message.receiver)).emit("messageEdited", message);
    getIo(req)?.to(String(message.sender)).emit("messageEdited", message);

    res.json(message);

  }catch(error){
    console.error("EDIT MESSAGE ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   DELETE FOR ME
========================= */

router.patch("/:id/delete-for-me", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const message = await Message.findById(req.params.id);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(!message.isParticipant(userId)){
      return res.status(403).json({ message:"Not allowed" });
    }

    message.softDeleteFor(userId);
    await message.save();

    res.json({
      success:true,
      message:"Message deleted for you"
    });

  }catch(error){
    console.error("DELETE FOR ME ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   DELETE FOR EVERYONE
========================= */

router.patch("/:id/delete-for-everyone", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const message = await Message.findById(req.params.id);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(String(message.sender) !== String(userId)){
      return res.status(403).json({
        message:"Only sender can delete this message for everyone"
      });
    }

    message.softDeleteForEveryone();
    await message.save();

    const io = getIo(req);
    io?.to(String(message.receiver)).emit("messageDeleted", {
      messageId:message._id
    });
    io?.to(String(message.sender)).emit("messageDeleted", {
      messageId:message._id
    });

    res.json({
      success:true,
      message:"Message deleted for everyone"
    });

  }catch(error){
    console.error("DELETE FOR EVERYONE ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   STAR MESSAGE
========================= */

router.patch("/:id/star", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const message = await Message.findById(req.params.id);

    if(!message){
      return res.status(404).json({ message:"Message not found" });
    }

    if(!message.isParticipant(userId)){
      return res.status(403).json({ message:"Not allowed" });
    }

    const starred = message.toggleStar(userId);
    await message.save();

    res.json({
      success:true,
      starred
    });

  }catch(error){
    console.error("STAR MESSAGE ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   CONVERSATION SETTINGS
========================= */

router.patch("/conversations/:conversationId/pin", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const conversationId = req.params.conversationId;

    if(!isValidId(conversationId)){
      return res.status(400).json({ message:"Invalid conversation ID" });
    }

    const conversation = await Conversation.findById(conversationId);

    if(!conversation || !conversation.hasParticipant(userId)){
      return res.status(403).json({ message:"Not allowed" });
    }

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:userId,
        conversationId
      },
      [
        {
          $set:{
            pinned:{
              $not:"$pinned"
            },
            user:new mongoose.Types.ObjectId(userId),
            conversationId:new mongoose.Types.ObjectId(conversationId)
          }
        }
      ],
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    console.error("PIN CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

router.patch("/conversations/:conversationId/mute", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const { mutedUntil } = req.body;

    if(!isValidId(conversationId)){
      return res.status(400).json({ message:"Invalid conversation ID" });
    }

    const conversation = await Conversation.findById(conversationId);

    if(!conversation || !conversation.hasParticipant(userId)){
      return res.status(403).json({ message:"Not allowed" });
    }

    const current = await ConversationSetting.findOne({
      user:userId,
      conversationId
    });

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:userId,
        conversationId
      },
      {
        user:userId,
        conversationId,
        muted:!(current?.muted),
        mutedUntil:mutedUntil || null
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    console.error("MUTE CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

router.patch("/conversations/:conversationId/archive", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const conversationId = req.params.conversationId;

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:userId,
        conversationId
      },
      {
        user:userId,
        conversationId,
        archived:true
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    console.error("ARCHIVE CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

router.patch("/conversations/:conversationId/block", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;
    const conversationId = req.params.conversationId;

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:userId,
        conversationId
      },
      {
        user:userId,
        conversationId,
        blocked:true
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    console.error("BLOCK CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

/* =========================
   CALL LOGS
========================= */

router.post("/calls", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;

    const {
      receiver,
      conversationId,
      meetingId,
      callType = "audio",
      status = "ringing"
    } = req.body;

    const call = await CallLog.create({
      caller:userId,
      receiver,
      participants:[userId,receiver].filter(Boolean),
      conversationId,
      meetingId,
      callType,
      status,
      startedAt:new Date(),
      metadata:{
        ipAddress:req.ip,
        userAgent:req.headers["user-agent"]
      }
    });

    res.status(201).json(call);

  }catch(error){
    console.error("CREATE CALL LOG ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

router.patch("/calls/:id/end", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;

    const call = await CallLog.findById(req.params.id);

    if(!call){
      return res.status(404).json({ message:"Call not found" });
    }

    if(!call.participants.some(id => String(id) === String(userId))){
      return res.status(403).json({ message:"Not allowed" });
    }

    call.status = "ended";
    call.endedAt = new Date();
    call.endedBy = userId;

    await call.save();

    res.json(call);

  }catch(error){
    console.error("END CALL LOG ERROR:",error);
    res.status(500).json({ message:"Server error" });
  }
});

module.exports = router;
