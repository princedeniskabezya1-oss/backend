const express = require("express");

const ChatBotConversation =
require("../models/ChatBotConversation");

const authMiddleware =
require("../middleware/auth");

const router = express.Router();

/* =========================
   GET MY BOT CHATS
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{

    const chats =
      await ChatBotConversation.find({
        user:req.user.id
      })
      .sort({
        updatedAt:-1
      });

    res.json(chats);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load bot chats"
    });
  }
});

/* =========================
   CREATE CHAT
========================= */

router.post("/", authMiddleware, async (req,res)=>{
  try{

    const chat =
      await ChatBotConversation.create({
        user:req.user.id,
        botType:req.body.botType ||
          "support",
        title:req.body.title ||
          "New Chat",
        messages:[]
      });

    res.status(201).json(chat);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to create bot chat"
    });
  }
});

/* =========================
   GET ONE CHAT
========================= */

router.get("/:id", authMiddleware, async (req,res)=>{
  try{

    const chat =
      await ChatBotConversation.findById(
        req.params.id
      );

    if(!chat){
      return res.status(404).json({
        message:"Chat not found"
      });
    }

    if(
      String(chat.user) !==
      String(req.user.id)
    ){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    res.json(chat);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load chat"
    });
  }
});

/* =========================
   ADD MESSAGE
========================= */

router.post("/:id/messages",
authMiddleware,
async (req,res)=>{
  try{

    const chat =
      await ChatBotConversation.findById(
        req.params.id
      );

    if(!chat){
      return res.status(404).json({
        message:"Chat not found"
      });
    }

    if(
      String(chat.user) !==
      String(req.user.id)
    ){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    chat.addMessage(
      "user",
      req.body.content || ""
    );

    await chat.save();

    res.json(chat);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to add message"
    });
  }
});

/* =========================
   CLOSE CHAT
========================= */

router.patch("/:id/close",
authMiddleware,
async (req,res)=>{
  try{

    const chat =
      await ChatBotConversation.findById(
        req.params.id
      );

    if(!chat){
      return res.status(404).json({
        message:"Chat not found"
      });
    }

    if(
      String(chat.user) !==
      String(req.user.id)
    ){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    chat.status = "closed";

    await chat.save();

    res.json(chat);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to close chat"
    });
  }
});

module.exports = router;
