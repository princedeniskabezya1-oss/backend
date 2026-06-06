const express = require("express");
const mongoose = require("mongoose");

const Conversation = require("../models/Conversation");
const ConversationSetting = require("../models/ConversationSetting");
const Message = require("../models/Message");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function isValidId(id){
  return mongoose.Types.ObjectId.isValid(id);
}

function getIo(req){
  return req.app.get("io") || req.io;
}

function getUserName(user = {}){
  return user.companyName || user.schoolName || user.name || "AIFT User";
}

function getUserImage(user = {}){
  return user.profileImage || user.logo || user.avatar || "";
}

function isParticipant(conversation,userId){
  return conversation.participants.some(p =>
    String(p.user) === String(userId) &&
    p.isActive !== false &&
    p.blocked !== true
  );
}

function getParticipant(conversation,userId){
  return conversation.participants.find(p =>
    String(p.user) === String(userId)
  );
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
      { user:userA, role:"member" },
      { user:userB, role:"member" }
    ],
    participantIds:[userA,userB],
    metadata:{
      source:"manual"
    }
  });

  return conversation;
}

/* =========================
   GET MY CONVERSATIONS
   GET /api/conversations
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const userId = req.user.id;

    const {
      search = "",
      type = "",
      archived = "",
      pinned = "",
      unread = "",
      limit = 50
    } = req.query;

    const query = {
      participantIds:userId,
      isActive:true
    };

    if(type){
      query.type = type;
    }

    let conversations = await Conversation.find(query)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession")
      .populate("lastMessage.sender","name companyName schoolName role profileImage logo")
      .sort({ updatedAt:-1 })
      .limit(Math.min(Number(limit) || 50,150))
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

    conversations = conversations.map(conv=>{
      const me =
        conv.participants.find(p => String(p.user?._id) === String(userId));

      const other =
        conv.participants.find(p => String(p.user?._id) !== String(userId)) ||
        conv.participants[0];

      const otherUser = other?.user || {};

      const setting =
        settingsMap.get(String(conv._id)) ||
        settingsMap.get(String(otherUser._id)) ||
        {};

      return {
        ...conv,
        user:otherUser,
        displayName:conv.type === "direct"
          ? getUserName(otherUser)
          : conv.title || "Group conversation",
        displayImage:conv.type === "direct"
          ? getUserImage(otherUser)
          : conv.photo || "",
        unreadCount:me?.unreadCount || 0,
        pinned:setting.pinned || me?.pinned || false,
        muted:setting.muted || me?.muted || false,
        archived:setting.archived || me?.archived || false,
        blocked:setting.blocked || me?.blocked || false,
        favorite:setting.favorite || false,
        customName:setting.customName || ""
      };
    });

    if(search){
      const q = String(search).toLowerCase();

      conversations = conversations.filter(conv =>
        [
          conv.displayName,
          conv.title,
          conv.description,
          conv.lastMessage?.text
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if(archived !== ""){
      conversations = conversations.filter(conv =>
        Boolean(conv.archived) === (archived === "true")
      );
    }

    if(pinned !== ""){
      conversations = conversations.filter(conv =>
        Boolean(conv.pinned) === (pinned === "true")
      );
    }

    if(unread === "true"){
      conversations = conversations.filter(conv =>
        Number(conv.unreadCount || 0) > 0
      );
    }

    conversations.sort((a,b)=>{
      if(a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    res.json(conversations);

  }catch(error){
    console.error("GET CONVERSATIONS ERROR:",error);
    res.status(500).json({ message:"Unable to load conversations" });
  }
});

/* =========================
   CREATE DIRECT CONVERSATION
   POST /api/conversations/direct
========================= */

router.post("/direct", authMiddleware, async (req,res)=>{
  try{
    const { userId } = req.body;

    if(!isValidId(userId)){
      return res.status(400).json({ message:"Valid userId is required" });
    }

    if(String(userId) === String(req.user.id)){
      return res.status(400).json({ message:"You cannot message yourself" });
    }

    const userExists = await User.exists({ _id:userId });

    if(!userExists){
      return res.status(404).json({ message:"User not found" });
    }

    const conversation =
      await findOrCreateDirectConversation(req.user.id,userId,req.user.id);

    const populated = await Conversation.findById(conversation._id)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession")
      .populate("lastMessage.sender","name companyName schoolName role profileImage logo");

    res.status(201).json(populated);

  }catch(error){
    console.error("CREATE DIRECT CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Unable to create conversation" });
  }
});

/* =========================
   CREATE GROUP / TEAM / CLASS CONVERSATION
   POST /api/conversations
========================= */

router.post("/", authMiddleware, async (req,res)=>{
  try{
    const {
      type = "group",
      title,
      description = "",
      photo = "",
      participants = [],
      schoolId,
      companyId,
      classId,
      jobId,
      applicationId
    } = req.body;

    if(!title || !String(title).trim()){
      return res.status(400).json({ message:"Conversation title is required" });
    }

    const allowedTypes = ["group","team","class","support","meeting"];

    if(!allowedTypes.includes(type)){
      return res.status(400).json({ message:"Invalid conversation type" });
    }

    const cleanParticipants = [
      req.user.id,
      ...(
        Array.isArray(participants)
          ? participants.filter(isValidId)
          : []
      )
    ];

    const uniqueParticipants =
      [...new Set(cleanParticipants.map(String))];

    const conversation = await Conversation.create({
      type,
      title:String(title).trim(),
      description,
      photo,
      createdBy:req.user.id,
      schoolId:isValidId(schoolId) ? schoolId : undefined,
      companyId:isValidId(companyId) ? companyId : undefined,
      classId:isValidId(classId) ? classId : undefined,
      jobId:isValidId(jobId) ? jobId : undefined,
      applicationId:isValidId(applicationId) ? applicationId : undefined,
      participants:uniqueParticipants.map(id => ({
        user:id,
        role:String(id) === String(req.user.id) ? "owner" : "member"
      })),
      metadata:{
        source:"manual"
      }
    });

    const populated = await Conversation.findById(conversation._id)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession");

    uniqueParticipants.forEach(userId=>{
      getIo(req)?.to(String(userId)).emit("conversationCreated",{
        conversation:populated
      });
    });

    res.status(201).json(populated);

  }catch(error){
    console.error("CREATE CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Unable to create conversation" });
  }
});

/* =========================
   GET ONE CONVERSATION
   GET /api/conversations/:id
========================= */

router.get("/:id", authMiddleware, async (req,res)=>{
  try{
    if(!isValidId(req.params.id)){
      return res.status(400).json({ message:"Invalid conversation ID" });
    }

    const conversation = await Conversation.findById(req.params.id)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession")
      .populate("lastMessage.sender","name companyName schoolName role profileImage logo");

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    if(!isParticipant(conversation,req.user.id)){
      return res.status(403).json({ message:"You do not have access to this conversation" });
    }

    await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:conversation._id
      },
      {
        user:req.user.id,
        conversationId:conversation._id,
        lastOpenedAt:new Date()
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(conversation);

  }catch(error){
    console.error("GET CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Unable to load conversation" });
  }
});

/* =========================
   GET CONVERSATION MESSAGES
   GET /api/conversations/:id/messages
========================= */

router.get("/:id/messages", authMiddleware, async (req,res)=>{
  try{
    const {
      before,
      limit = 40,
      search = ""
    } = req.query;

    if(!isValidId(req.params.id)){
      return res.status(400).json({ message:"Invalid conversation ID" });
    }

    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    if(!isParticipant(conversation,req.user.id)){
      return res.status(403).json({ message:"You do not have access to this conversation" });
    }

    const query = {
      conversationId:conversation._id,
      deletedFor:{ $ne:req.user.id }
    };

    if(before){
      query.createdAt = {
        $lt:new Date(before)
      };
    }

    if(search){
      query.$text = {
        $search:search
      };
    }

    const messages = await Message.find(query)
      .populate("sender","name companyName schoolName role profileImage logo")
      .populate("receiver","name companyName schoolName role profileImage logo")
      .populate({
        path:"replyTo",
        select:"text sender messageType",
        populate:{
          path:"sender",
          select:"name companyName schoolName role profileImage"
        }
      })
      .sort({ createdAt:-1 })
      .limit(Math.min(Number(limit) || 40,100))
      .lean();

    const normalized = messages.reverse().map(message=>{
      if(message.deletedForEveryone){
        return {
          ...message,
          text:"This message was deleted",
          fileUrl:"",
          fileType:"",
          fileName:"",
          fileSize:0,
          attachments:[]
        };
      }

      return message;
    });

    res.json(normalized);

  }catch(error){
    console.error("GET CONVERSATION MESSAGES ERROR:",error);
    res.status(500).json({ message:"Unable to load messages" });
  }
});

/* =========================
   MARK READ
   PATCH /api/conversations/:id/read
========================= */

router.patch("/:id/read", authMiddleware, async (req,res)=>{
  try{
    if(!isValidId(req.params.id)){
      return res.status(400).json({ message:"Invalid conversation ID" });
    }

    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    if(!isParticipant(conversation,req.user.id)){
      return res.status(403).json({ message:"You do not have access to this conversation" });
    }

    conversation.markRead(req.user.id);
    await conversation.save();

    await Message.updateMany(
      {
        conversationId:conversation._id,
        receiver:req.user.id,
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
            user:req.user.id,
            readAt:new Date()
          }
        }
      }
    );

    getIo(req)?.to(String(req.user.id)).emit("conversationRead",{
      conversationId:conversation._id
    });

    res.json({ success:true });

  }catch(error){
    console.error("MARK CONVERSATION READ ERROR:",error);
    res.status(500).json({ message:"Unable to mark conversation as read" });
  }
});

/* =========================
   ADD PARTICIPANTS
========================= */

router.post("/:id/participants", authMiddleware, async (req,res)=>{
  try{
    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    const me = getParticipant(conversation,req.user.id);

    if(!me || !["owner","admin"].includes(me.role)){
      return res.status(403).json({ message:"Only owner or admin can add participants" });
    }

    const users = Array.isArray(req.body.users)
      ? req.body.users.filter(isValidId)
      : [];

    users.forEach(userId=>{
      conversation.addParticipant(userId,"member");
    });

    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession");

    users.forEach(userId=>{
      getIo(req)?.to(String(userId)).emit("conversationAdded",{
        conversation:populated
      });
    });

    getIo(req)?.to(String(conversation._id)).emit("conversationUpdated",{
      conversation:populated
    });

    res.json(populated);

  }catch(error){
    console.error("ADD PARTICIPANTS ERROR:",error);
    res.status(500).json({ message:"Unable to add participants" });
  }
});

/* =========================
   REMOVE PARTICIPANT
========================= */

router.delete("/:id/participants/:userId", authMiddleware, async (req,res)=>{
  try{
    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    const me = getParticipant(conversation,req.user.id);

    if(!me || !["owner","admin"].includes(me.role)){
      return res.status(403).json({ message:"Only owner or admin can remove participants" });
    }

    conversation.removeParticipant(req.params.userId);
    await conversation.save();

    getIo(req)?.to(String(req.params.userId)).emit("conversationRemoved",{
      conversationId:conversation._id
    });

    res.json({ success:true });

  }catch(error){
    console.error("REMOVE PARTICIPANT ERROR:",error);
    res.status(500).json({ message:"Unable to remove participant" });
  }
});

/* =========================
   UPDATE CONVERSATION
========================= */

router.patch("/:id", authMiddleware, async (req,res)=>{
  try{
    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    const me = getParticipant(conversation,req.user.id);

    if(!me || !["owner","admin"].includes(me.role)){
      return res.status(403).json({ message:"Only owner or admin can edit this conversation" });
    }

    [
      "title",
      "description",
      "photo",
      "allowMembersToSend",
      "allowFiles",
      "allowLinks",
      "allowReactions",
      "isLocked",
      "lockedReason"
    ].forEach(key=>{
      if(req.body[key] !== undefined){
        conversation[key] = req.body[key];
      }
    });

    if(req.body.meetingSettings){
      conversation.meetingSettings = {
        ...conversation.meetingSettings.toObject?.() || conversation.meetingSettings,
        ...req.body.meetingSettings
      };
    }

    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate("participants.user","name companyName schoolName role profileImage logo headline profession");

    conversation.participantIds.forEach(userId=>{
      getIo(req)?.to(String(userId)).emit("conversationUpdated",{
        conversation:populated
      });
    });

    res.json(populated);

  }catch(error){
    console.error("UPDATE CONVERSATION ERROR:",error);
    res.status(500).json({ message:"Unable to update conversation" });
  }
});

/* =========================
   MY SETTINGS
========================= */

router.patch("/:id/settings", authMiddleware, async (req,res)=>{
  try{
    const conversation = await Conversation.findById(req.params.id);

    if(!conversation){
      return res.status(404).json({ message:"Conversation not found" });
    }

    if(!isParticipant(conversation,req.user.id)){
      return res.status(403).json({ message:"You do not have access to this conversation" });
    }

    const allowed = [
      "pinned",
      "muted",
      "mutedUntil",
      "archived",
      "favorite",
      "customName",
      "customColor",
      "notificationLevel"
    ];

    const update = {
      user:req.user.id,
      conversationId:conversation._id
    };

    allowed.forEach(key=>{
      if(req.body[key] !== undefined){
        update[key] = req.body[key];
      }
    });

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:conversation._id
      },
      update,
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    console.error("UPDATE CONVERSATION SETTINGS ERROR:",error);
    res.status(500).json({ message:"Unable to update settings" });
  }
});

/* =========================
   QUICK SETTINGS
========================= */

router.patch("/:id/pin", authMiddleware, async (req,res)=>{
  try{
    const current = await ConversationSetting.findOne({
      user:req.user.id,
      conversationId:req.params.id
    });

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:req.params.id
      },
      {
        user:req.user.id,
        conversationId:req.params.id,
        pinned:!(current?.pinned)
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    res.status(500).json({ message:"Unable to pin conversation" });
  }
});

router.patch("/:id/mute", authMiddleware, async (req,res)=>{
  try{
    const current = await ConversationSetting.findOne({
      user:req.user.id,
      conversationId:req.params.id
    });

    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:req.params.id
      },
      {
        user:req.user.id,
        conversationId:req.params.id,
        muted:!(current?.muted),
        mutedUntil:req.body.mutedUntil || null
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    res.status(500).json({ message:"Unable to mute conversation" });
  }
});

router.patch("/:id/archive", authMiddleware, async (req,res)=>{
  try{
    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:req.params.id
      },
      {
        user:req.user.id,
        conversationId:req.params.id,
        archived:true
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    res.status(500).json({ message:"Unable to archive conversation" });
  }
});

router.patch("/:id/unarchive", authMiddleware, async (req,res)=>{
  try{
    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:req.params.id
      },
      {
        user:req.user.id,
        conversationId:req.params.id,
        archived:false
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    res.status(500).json({ message:"Unable to unarchive conversation" });
  }
});

router.patch("/:id/block", authMiddleware, async (req,res)=>{
  try{
    const setting = await ConversationSetting.findOneAndUpdate(
      {
        user:req.user.id,
        conversationId:req.params.id
      },
      {
        user:req.user.id,
        conversationId:req.params.id,
        blocked:true
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(setting);

  }catch(error){
    res.status(500).json({ message:"Unable to block conversation" });
  }
});

module.exports = router;
