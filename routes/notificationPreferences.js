const express = require("express");

const NotificationPreference = require("../models/NotificationPreference");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const DEFAULT_PREFS = {
  messages:{
    push:true,
    email:true,
    sound:true,
    desktop:true
  },
  calls:{
    push:true,
    emailMissed:true,
    sound:true
  },
  meetings:{
    reminders:true,
    reminderMinutesBefore:10,
    email:true,
    push:true
  },
  jobs:{
    applications:true,
    interviews:true,
    offers:true,
    recommendations:true
  },
  school:{
    classUpdates:true,
    assignments:true,
    attendance:true,
    announcements:true
  },
  notificationFeed:{
    mutedTypes:[],
    typeWeights:{}
  },
  quietHours:{
    enabled:false,
    start:"22:00",
    end:"07:00",
    timezone:"Asia/Manila"
  }
};

router.get("/me", authMiddleware, async (req,res)=>{
  try{
    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $setOnInsert:{
          user:req.user.id,
          ...DEFAULT_PREFS
        }
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(prefs);

  }catch(error){
    console.error("GET NOTIFICATION PREFS ERROR:",error);
    res.status(500).json({ message:"Unable to load notification preferences" });
  }
});

router.patch("/me", authMiddleware, async (req,res)=>{
  try{
    const allowed = [
      "messages",
      "calls",
      "meetings",
      "jobs",
      "school",
      "notificationFeed",
      "quietHours",
      "mutedConversations",
      "blockedUsers"
    ];

    const update = {};

    allowed.forEach(key=>{
      if(req.body[key] !== undefined){
        update[key] = req.body[key];
      }
    });

    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $set:{
          user:req.user.id,
          ...update
        }
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(prefs);

  }catch(error){
    console.error("UPDATE NOTIFICATION PREFS ERROR:",error);
    res.status(500).json({ message:"Unable to update notification preferences" });
  }
});

router.patch("/mute-conversation/:conversationId", authMiddleware, async (req,res)=>{
  try{
    const { mutedUntil } = req.body;

    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $pull:{
          mutedConversations:{
            conversationId:req.params.conversationId
          }
        }
      },
      { new:true, upsert:true }
    );

    prefs.mutedConversations.push({
      conversationId:req.params.conversationId,
      mutedUntil:mutedUntil || null
    });

    await prefs.save();

    res.json(prefs);

  }catch(error){
    console.error("MUTE CONVERSATION PREF ERROR:",error);
    res.status(500).json({ message:"Unable to mute conversation" });
  }
});

router.patch("/unmute-conversation/:conversationId", authMiddleware, async (req,res)=>{
  try{
    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $pull:{
          mutedConversations:{
            conversationId:req.params.conversationId
          }
        }
      },
      { new:true }
    );

    res.json(prefs);

  }catch(error){
    console.error("UNMUTE CONVERSATION PREF ERROR:",error);
    res.status(500).json({ message:"Unable to unmute conversation" });
  }
});

router.patch("/block-user/:userId", authMiddleware, async (req,res)=>{
  try{
    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $addToSet:{
          blockedUsers:req.params.userId
        }
      },
      {
        upsert:true,
        new:true
      }
    );

    res.json(prefs);

  }catch(error){
    console.error("BLOCK USER PREF ERROR:",error);
    res.status(500).json({ message:"Unable to block user" });
  }
});

router.patch("/unblock-user/:userId", authMiddleware, async (req,res)=>{
  try{
    const prefs = await NotificationPreference.findOneAndUpdate(
      { user:req.user.id },
      {
        $pull:{
          blockedUsers:req.params.userId
        }
      },
      { new:true }
    );

    res.json(prefs);

  }catch(error){
    console.error("UNBLOCK USER PREF ERROR:",error);
    res.status(500).json({ message:"Unable to unblock user" });
  }
});

module.exports = router;
