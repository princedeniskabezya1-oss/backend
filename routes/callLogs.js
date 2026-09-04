const express = require("express");
const mongoose = require("mongoose");
const CallLog = require("../models/CallLog");
const Conversation = require("../models/Conversation");
const authMiddleware = require("../middleware/auth");
const { createManyNotifications } = require("../services/notificationService");
const router = express.Router();

function isValidId(id){ return mongoose.Types.ObjectId.isValid(id); }
const populate = query => query
  .populate("caller","name profileImage role companyName schoolName")
  .populate("receiver","name profileImage role companyName schoolName")
  .populate("participants","name profileImage role companyName schoolName")
  .populate("participantResults.user","name profileImage role companyName schoolName")
  .populate("meetingId","title meetingCode status")
  .populate("conversationId","title type photo");
function idOf(value){ return String(value?._id||value||""); }
function permitted(call,userId){ return call?.participants?.some(id => idOf(id) === String(userId)); }
function emitCall(req,event,call){ call.participants.forEach(id=>req.app.get("io")?.to(idOf(id)).emit(event,call)); }
function resultFor(call,userId){ return call.participantResults?.find(item=>idOf(item.user)===String(userId)); }

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const { type, status, conversationId, limit = 100 } = req.query;
    const base={participants:req.user.id,hiddenFor:{$ne:req.user.id}};
    let query={...base};
    if(isValidId(conversationId)){
      const conversation=await Conversation.findById(conversationId).select("type participantIds").lean();
      if(conversation?.type==="direct"){
        const pair=(conversation.participantIds||[]).map(String);
        query={...base,$or:[
          {conversationId},
          ...(pair.length===2?[{caller:{$in:pair},participants:{$all:pair}}]:[])
        ]};
      }else query.conversationId=conversationId;
    }
    if(type) query.callType=type;
    if(status) query.status=status;
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
    if(!call) call=await CallLog.create({
      callId:stableCallId,caller:req.user.id,receiver,participants:uniqueParticipants,
      participantResults:uniqueParticipants.map(user=>({user,status:String(user)===String(req.user.id)?"joined":"ringing",answeredAt:String(user)===String(req.user.id)?new Date():undefined})),
      conversationId:isValidId(conversationId)?conversationId:undefined,
      meetingId:isValidId(meetingId)?meetingId:undefined,callType,status:"ringing",
      startedAt:new Date(),seenBy:[req.user.id],metadata:{ipAddress:req.ip,userAgent:req.headers["user-agent"]}
    });
    call=await populate(CallLog.findById(call._id));emitCall(req,"callLogCreated",call);res.status(201).json(call);
  }catch(error){ console.error("CREATE CALL LOG ERROR:",error);res.status(500).json({message:"Unable to create call log"}); }
});

async function findCall(req){const key=String(req.params.key||"");return isValidId(key)?CallLog.findById(key):CallLog.findOne({callId:key});}

router.patch("/seen",authMiddleware,async(req,res)=>{
  try{const query={participants:req.user.id,hiddenFor:{$ne:req.user.id}};if(isValidId(req.body.conversationId))query.conversationId=req.body.conversationId;await CallLog.updateMany(query,{$addToSet:{seenBy:req.user.id}});res.json({success:true});}
  catch(error){res.status(500).json({message:"Unable to mark calls as seen"});}
});

router.patch("/:key/answer",authMiddleware,async(req,res)=>{
  try{
    let call=await findCall(req);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    const now=new Date(),result=resultFor(call,req.user.id);
    if(result){result.status="joined";result.answeredAt=result.answeredAt||now;result.leftAt=undefined;}
    if(call.status==="ringing"){call.status="answered";call.answeredAt=call.answeredAt||now;}
    call.seenBy.addToSet(req.user.id);await call.save();call=await populate(CallLog.findById(call._id));emitCall(req,"callLogUpdated",call);res.json(call);
  }catch(error){console.error("ANSWER CALL ERROR:",error);res.status(500).json({message:"Unable to answer call"});}
});

router.patch("/:key/participant",authMiddleware,async(req,res)=>{
  try{
    let call=await findCall(req);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    const requested=String(req.body.status||"left"),allowed=["joined","missed","declined","left"];if(!allowed.includes(requested))return res.status(400).json({message:"Invalid participant status"});
    const now=new Date(),result=resultFor(call,req.user.id);
    if(result){result.status=requested;if(requested==="joined")result.answeredAt=result.answeredAt||now;else result.leftAt=now;}
    if(requested==="declined")call.declinedBy.addToSet(req.user.id);
    if(requested==="missed")call.missedBy.addToSet(req.user.id);
    call.seenBy.addToSet(req.user.id);await call.save();call=await populate(CallLog.findById(call._id));emitCall(req,"callLogUpdated",call);res.json(call);
  }catch(error){console.error("PARTICIPANT CALL ERROR:",error);res.status(500).json({message:"Unable to update call participation"});}
});

router.patch("/:key/end",authMiddleware,async(req,res)=>{
  try{
    let call=await findCall(req);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});
    if(call.endedAt)return res.json(await populate(CallLog.findById(call._id)));
    const requested=String(req.body.status||"ended"),allowed=["ended","missed","declined","cancelled","failed"],now=new Date();
    call.status=allowed.includes(requested)?requested:"ended";call.endedAt=now;call.endedBy=req.user.id;
    const newlyMissed=[];
    for(const result of call.participantResults||[]){
      if(idOf(result.user)===idOf(call.caller)){if(result.status==="joined"){result.status="left";result.leftAt=now;}continue;}
      if(result.status==="ringing"){result.status="missed";result.leftAt=now;call.missedBy.addToSet(result.user);newlyMissed.push(idOf(result.user));}
      else if(result.status==="joined"){result.status="left";result.leftAt=now;}
    }
    await call.save();call=await populate(CallLog.findById(call._id));emitCall(req,"callLogUpdated",call);
    const callerName=call.caller?.companyName||call.caller?.schoolName||call.caller?.name||"Someone";
    await createManyNotifications(newlyMissed.map(user=>({user,sender:idOf(call.caller),type:"missed_call",priority:"high",text:`Missed ${call.callType==="video"?"video":"audio"} call from ${callerName}`,link:`/messages.html?conversation=${idOf(call.conversationId)}`,entityType:"call",entityId:call._id,groupKey:`missed-call:${call.callId}:${user}`,metadata:{callId:call.callId,conversationId:idOf(call.conversationId),callType:call.callType}})),{io:req.app.get("io"),upsert:true});
    res.json(call);
  }catch(error){console.error("END CALL ERROR:",error);res.status(500).json({message:"Unable to end call"});}
});

router.delete("/:id",authMiddleware,async(req,res)=>{
  try{const call=await CallLog.findById(req.params.id);if(!call)return res.status(404).json({message:"Call not found"});if(!permitted(call,req.user.id))return res.status(403).json({message:"Not allowed"});call.hiddenFor.addToSet(req.user.id);await call.save();if(call.participants.every(id=>call.hiddenFor.some(hidden=>idOf(hidden)===idOf(id))))await call.deleteOne();res.json({success:true});}
  catch(error){console.error("DELETE CALL LOG ERROR:",error);res.status(500).json({message:"Unable to delete call log"});}
});
module.exports=router;
