const express = require("express");
const mongoose = require("mongoose");

const CallLog = require("../models/CallLog");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function isValidId(id){
  return mongoose.Types.ObjectId.isValid(id);
}

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const { type, status, limit = 50 } = req.query;

    const query = {
      participants:req.user.id
    };

    if(type) query.callType = type;
    if(status) query.status = status;

    const calls = await CallLog.find(query)
      .populate("caller","name profileImage role companyName schoolName")
      .populate("receiver","name profileImage role companyName schoolName")
      .populate("participants","name profileImage role companyName schoolName")
      .populate("meetingId","title meetingCode status")
      .populate("conversationId","title type")
      .sort({ createdAt:-1 })
      .limit(Math.min(Number(limit) || 50,150));

    res.json(calls);

  }catch(error){
    console.error("GET CALL LOGS ERROR:",error);
    res.status(500).json({ message:"Unable to load call logs" });
  }
});

router.post("/", authMiddleware, async (req,res)=>{
  try{
    const {
      receiver,
      participants = [],
      conversationId,
      meetingId,
      callType = "audio",
      direction = "outgoing",
      status = "ringing"
    } = req.body;

    const cleanParticipants = [
      req.user.id,
      receiver,
      ...participants
    ].filter(Boolean).filter(isValidId);

    const uniqueParticipants =
      [...new Set(cleanParticipants.map(String))];

    const call = await CallLog.create({
      caller:req.user.id,
      receiver:isValidId(receiver) ? receiver : undefined,
      participants:uniqueParticipants,
      conversationId:isValidId(conversationId) ? conversationId : undefined,
      meetingId:isValidId(meetingId) ? meetingId : undefined,
      callType,
      direction,
      status,
      startedAt:new Date(),
      metadata:{
        ipAddress:req.ip,
        userAgent:req.headers["user-agent"]
      }
    });

    req.app.get("io")?.to(String(receiver)).emit("callLogCreated",call);

    res.status(201).json(call);

  }catch(error){
    console.error("CREATE CALL LOG ERROR:",error);
    res.status(500).json({ message:"Unable to create call log" });
  }
});

router.patch("/:id/answer", authMiddleware, async (req,res)=>{
  try{
    const call = await CallLog.findById(req.params.id);

    if(!call){
      return res.status(404).json({ message:"Call not found" });
    }

    if(!call.participants.some(id => String(id) === String(req.user.id))){
      return res.status(403).json({ message:"Not allowed" });
    }

    call.status = "answered";
    call.answeredAt = new Date();

    await call.save();

    res.json(call);

  }catch(error){
    console.error("ANSWER CALL ERROR:",error);
    res.status(500).json({ message:"Unable to answer call" });
  }
});

router.patch("/:id/end", authMiddleware, async (req,res)=>{
  try{
    const call = await CallLog.findById(req.params.id);

    if(!call){
      return res.status(404).json({ message:"Call not found" });
    }

    if(!call.participants.some(id => String(id) === String(req.user.id))){
      return res.status(403).json({ message:"Not allowed" });
    }

    call.status = req.body.status || "ended";
    call.endedAt = new Date();
    call.endedBy = req.user.id;

    if(call.startedAt){
      call.durationSeconds = Math.max(
        0,
        Math.floor((call.endedAt - call.startedAt) / 1000)
      );
    }

    if(call.status === "declined"){
      call.declinedBy.addToSet(req.user.id);
    }

    if(call.status === "missed"){
      call.missedBy.addToSet(req.user.id);
    }

    await call.save();

    call.participants.forEach(userId=>{
      req.app.get("io")?.to(String(userId)).emit("callLogUpdated",call);
    });

    res.json(call);

  }catch(error){
    console.error("END CALL ERROR:",error);
    res.status(500).json({ message:"Unable to end call" });
  }
});

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{
    const call = await CallLog.findById(req.params.id);

    if(!call){
      return res.status(404).json({ message:"Call not found" });
    }

    if(!call.participants.some(id => String(id) === String(req.user.id))){
      return res.status(403).json({ message:"Not allowed" });
    }

    await call.deleteOne();

    res.json({ success:true });

  }catch(error){
    console.error("DELETE CALL LOG ERROR:",error);
    res.status(500).json({ message:"Unable to delete call log" });
  }
});

module.exports = router;
