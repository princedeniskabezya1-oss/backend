const express = require("express");
const mongoose = require("mongoose");
const CallLog = require("../models/CallLog");
const authMiddleware = require("../middleware/auth");
const router = express.Router();

function isValidId(id){ return mongoose.Types.ObjectId.isValid(id); }
const populate = query => query
  .populate("caller","name profileImage role companyName schoolName")
  .populate("receiver","name profileImage role companyName schoolName")
  .populate("participants","name profileImage role companyName schoolName")
  .populate("meetingId","title meetingCode status")
  .populate("conversationId","title type");
function permitted(call,userId){ return call?.participants?.some(id => String(id?._id||id) === String(userId)); }
function emitCall(req,event,call){ call.participants.forEach(id=>req.app.get("io")?.to(String(id?._id||id)).emit(event,call)); }

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const { type, status, conversationId, limit = 100 } = req.query;
    const query = { participants:req.user.id, hiddenFor:{ $ne:req.user.id } };
    if(type) query.callType=type;
    if(status) query.status=status;
    if(isValidId(conversationId)) query.conversationId=conversationId;
    const calls=await populate(CallLog.find(query)).sort({createdAt:-1}).limit(Math.min(Number(limit)||100,200));
    res.json(calls);
  }catch(error){ console.error("GET CALL LOGS ERROR:",error);res.status(500).json({message:"Unable to load call logs"}); }
});

router.post("/", authMiddleware, async (req,res)=>{
  try{
    const {receiver,participants=[],conversationId,meetingId,callType="audio",callId}=req.body;
    if(!isValidId(receiver)) return res.status(400).json({message:"A valid receiver is required"});
    const uniqueParticipants=[...new Set([req.user.id,receiver,...participants].filter(isValidId).map(String))];
    const stableCallId=String(callId||`call-${req.user.id}-${Date.now()}`);
    let call=await CallLog.findOne({callId:stableCallId});
    if(!call) call=await CallLog.create({callId:stableCallId,caller:req.user.id,receiver,participants:uniqueParticipants,conversationId:isValidId(conversationId)?conversationId:undefined,meetingId:isValidId(meetingId)?meetingId:undefined,callType,status:"ringing",startedAt:new Date(),seenBy:[req.user.id],metadata:{ipAddress:req.ip,userAgent:req.headers["user-agent"]}});
    call=await populate(CallLog.findById(call._id));
    emitCall(req,"callLogCreated",call);
    res.status(201).json(call);
  }catch(error){ console.error("CREATE CALL LOG ERROR:",error);res.status(500).json({message:"Unable to create call log"}); }
});

async function findCall(req){
  const key=String(req.params.key||"");
  return isValidId(key) ? CallLog.findById(key) : CallLog.findOne({callId:key});
}

router.patch("/seen", authMiddleware, async (req,res)=>{
  try{
    const query={participants:req.user.id,hiddenFor:{$ne:req.user.id}};
    if(isValidId(req.body.conversationId)) query.conversationId=req.body.conversationId;
    await CallLog.updateMany(query,{$addToSet:{seenBy:req.user.id}});
    res.json({success:true});
  }catch(error){res.status(500).json({message:"Unable to mark calls as seen"});}
});

router.patch("/:key/answer", authMiddleware, async (req,res)=>{
  try{
    let call=await findCall(req);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    if(call.status==="ringing"){call.status="answered";call.answeredAt=new Date();}call.seenBy.addToSet(req.user.id);await call.save();call=await populate(CallLog.findById(call._id));emitCall(req,"callLogUpdated",call);res.json(call);
  }catch(error){console.error("ANSWER CALL ERROR:",error);res.status(500).json({message:"Unable to answer call"});}
});

router.patch("/:key/end", authMiddleware, async (req,res)=>{
  try{
    let call=await findCall(req);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    if(call.endedAt)return res.json(await populate(CallLog.findById(call._id)));
    const requested=String(req.body.status||"ended"),allowed=["ended","missed","declined","cancelled","failed"];
    call.status=allowed.includes(requested)?requested:"ended";call.endedAt=new Date();call.endedBy=req.user.id;
    if(call.status==="declined")call.declinedBy.addToSet(req.user.id);
    if(["missed","cancelled"].includes(call.status)&&call.receiver)call.missedBy.addToSet(call.receiver);
    await call.save();call=await populate(CallLog.findById(call._id));emitCall(req,"callLogUpdated",call);res.json(call);
  }catch(error){console.error("END CALL ERROR:",error);res.status(500).json({message:"Unable to end call"});}
});

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{
    const call=await CallLog.findById(req.params.id);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    call.hiddenFor.addToSet(req.user.id);await call.save();if(call.participants.every(id=>call.hiddenFor.some(hidden=>String(hidden)===String(id))))await call.deleteOne();
    res.json({success:true});
  }catch(error){console.error("DELETE CALL LOG ERROR:",error);res.status(500).json({message:"Unable to delete call log"});}
});

module.exports=router;
