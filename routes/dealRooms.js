const express=require("express");
const mongoose=require("mongoose");
const {Readable}=require("stream");
const auth=require("../middleware/auth");
const upload=require("../middleware/upload");
const cloudinary=require("../config/cloudinary");
const DealRoom=require("../models/DealRoom");
const ReviewCase=require("../models/ReviewCase");
const Venture=require("../models/Venture");
const VentureInterest=require("../models/VentureInterest");
const Notification=require("../models/Notification");
const {enforceContactSafety,getMessagingRestriction}=require("../utils/contactSafety");

const router=express.Router();
const DEFAULT_DILIGENCE=[
  ["business_model","Business model and market"],
  ["traction","Traction and operating evidence"],
  ["financials","Financial information"],
  ["team","Founder and team review"],
  ["legal","Legal and ownership documents"],
  ["investment_terms","Investment terms and use of funds"]
];
const MAX_DEAL_ROOM_FILES=10;

function uid(user){return user?._id||user?.id;}
function same(a,b){return String(a?._id||a||"")===String(b?._id||b||"");}
function valid(value){return mongoose.Types.ObjectId.isValid(String(value||""));}
function clean(value,max=1000){return String(value??"").trim().slice(0,max);}
function isAdmin(user){return String(user?.role||"").toLowerCase()==="admin";}
function canAccess(user,room){const id=uid(user);return isAdmin(user)||same(id,room.investorId)||same(id,room.ownerId);}
function safeUserSelect(){return "name role profileImage companyName schoolName headline aiftVerified";}
function populateRoom(query){return query.populate("ventureId","title slug tagline description ventureType stage industry fundingGoal fundingRaised currency seekingInvestment investmentRangeMin investmentRangeMax fundingStage coverUrl logoUrl documents").populate("investorId",safeUserSelect()).populate("ownerId",safeUserSelect()).populate("openedBy","name role profileImage").populate("messages.senderId",safeUserSelect()).populate("meetings.proposedBy",safeUserSelect()).populate("meetings.respondedBy",safeUserSelect()).populate("meetings.completedBy",safeUserSelect()).populate("sharedDocuments.sharedBy",safeUserSelect()).populate("dueDiligence.updatedBy",safeUserSelect()).populate("decisions.userId",safeUserSelect());}
function seedDiligence(room){if(!Array.isArray(room.dueDiligence)||!room.dueDiligence.length)room.dueDiligence=DEFAULT_DILIGENCE.map(([key,label])=>({key,label,status:"pending"}));}
function validMeetingUrl(value){const text=clean(value,1600);if(!text)return "";try{const parsed=new URL(text);return ["https:","http:"].includes(parsed.protocol)?parsed.toString():"";}catch{return "";}}
function syncWorkflow(room){
  if(room.status==="completed"){room.workflowStage="completed";return;}
  if(room.status==="closed"){room.workflowStage="closed";return;}
  const meetings=Array.isArray(room.meetings)?room.meetings:[];
  if(meetings.some(item=>item.status==="completed")){room.workflowStage="decision";return;}
  if(meetings.some(item=>item.status==="accepted")){room.workflowStage="meeting";return;}
  room.workflowStage="due_diligence";
}
async function notify(user,sender,text,roomId){return Notification.create({user,type:"review_case",sender,text,link:`/deal-room.html?id=${roomId}`}).catch(()=>{});}
function uploadFiles(req,res,next){upload.array("files",MAX_DEAL_ROOM_FILES)(req,res,error=>{if(!error)return next();if(error.code==="LIMIT_FILE_SIZE")return res.status(413).json({message:"Each Deal Room file must be 100 MB or smaller."});if(error.code==="LIMIT_FILE_COUNT")return res.status(400).json({message:`Upload up to ${MAX_DEAL_ROOM_FILES} files at once.`});return res.status(400).json({message:error.message||"The selected files could not be uploaded."});});}
function cloudinaryResourceType(mime){const type=String(mime||"").toLowerCase();if(type.startsWith("image/"))return "image";if(type.startsWith("video/")||type.startsWith("audio/"))return "video";return "raw";}
function attachmentKind(mime){const type=String(mime||"").toLowerCase();if(type.startsWith("image/"))return "image";if(type.startsWith("video/"))return "video";if(type.startsWith("audio/"))return "audio";if(type==="application/pdf")return "pdf";if(type.includes("word"))return "document";if(type.includes("presentation")||type.includes("powerpoint"))return "presentation";if(type.includes("spreadsheet")||type.includes("excel")||type==="text/csv")return "spreadsheet";return "file";}
function uploadBuffer(file,roomId,userId){return new Promise((resolve,reject)=>{const resourceType=cloudinaryResourceType(file.mimetype);const stream=cloudinary.uploader.upload_stream({folder:`aift/deal-rooms/${roomId}/${userId}`,resource_type:resourceType,overwrite:false,unique_filename:true,use_filename:false},(error,result)=>error?reject(error):resolve({result,resourceType}));Readable.from(file.buffer).pipe(stream);});}

router.post("/from-review/:reviewCaseId",auth,async(req,res)=>{
  try{
    if(!isAdmin(req.user))return res.status(403).json({message:"Admin access required"});
    const review=await ReviewCase.findById(req.params.reviewCaseId);
    if(!review)return res.status(404).json({message:"Review case not found"});
    if(review.type!=="investment_interest")return res.status(400).json({message:"Only approved investment introductions can open a Deal Room"});
    if(review.status!=="matched")return res.status(409).json({message:`Deal Room can only open after both parties are matched. Current status: ${String(review.status).replaceAll("_"," ")}`});
    if(!valid(review.resourceId))return res.status(400).json({message:"Review case is not linked to a valid investment interest"});
    const interest=await VentureInterest.findById(review.resourceId);
    if(!interest||interest.type!=="investment"||interest.status!=="accepted")return res.status(409).json({message:"The Venture owner must accept the approved investor introduction before a Deal Room can open"});
    const venture=await Venture.findById(interest.ventureId);
    if(!venture)return res.status(404).json({message:"Venture not found"});
    let room=await DealRoom.findOne({reviewCaseId:review._id});
    if(!room){room=await DealRoom.create({reviewCaseId:review._id,ventureId:venture._id,ventureInterestId:interest._id,investorId:interest.userId,ownerId:venture.ownerId,openedBy:uid(req.user),status:"negotiation",workflowStage:"due_diligence",dueDiligence:DEFAULT_DILIGENCE.map(([key,label])=>({key,label,status:"pending"})),history:[{status:"negotiation",note:"AIFT opened a controlled Deal Room after both parties were matched.",actorId:uid(req.user)}]});}
    else{seedDiligence(room);syncWorkflow(room);await room.save();}
    review.status="negotiation";review.history.push({status:"negotiation",note:"AIFT Deal Room opened for controlled due diligence and negotiation.",actorId:uid(req.user)});review.reviewedAt=new Date();await review.save();
    await Promise.all([interest.userId,venture.ownerId].map(user=>notify(user,uid(req.user),`AIFT opened a Deal Room for ${venture.title}. Continue inside the controlled workspace.`,room._id)));
    room=await populateRoom(DealRoom.findById(room._id));return res.status(201).json({message:"AIFT Deal Room opened",room,reviewStatus:review.status});
  }catch(error){console.error("OPEN DEAL ROOM ERROR:",error);return res.status(500).json({message:"Could not open AIFT Deal Room"});}
});

router.get("/mine",auth,async(req,res)=>{try{const id=uid(req.user);const query=isAdmin(req.user)?{}:{$or:[{investorId:id},{ownerId:id}]};const rooms=await populateRoom(DealRoom.find(query).sort({updatedAt:-1}).limit(100));return res.json({rooms});}catch(error){return res.status(500).json({message:"Could not load Deal Rooms"});}});
router.get("/:id",auth,async(req,res)=>{try{if(!valid(req.params.id))return res.status(400).json({message:"Invalid Deal Room ID"});const raw=await DealRoom.findById(req.params.id);if(!raw)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,raw))return res.status(403).json({message:"You do not have access to this Deal Room"});seedDiligence(raw);syncWorkflow(raw);await raw.save();return res.json({room:await populateRoom(DealRoom.findById(raw._id))});}catch(error){return res.status(500).json({message:"Could not load Deal Room"});}});

router.post("/:id/messages",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(room.status!=="negotiation")return res.status(409).json({message:"This Deal Room is no longer open"});const text=clean(req.body?.text,4000);if(!text)return res.status(400).json({message:"Message is required"});const restriction=await getMessagingRestriction(uid(req.user));if(restriction?.restricted)return res.status(403).json({message:restriction.pendingReview?"Messaging is restricted pending AIFT review.":"Messaging is temporarily restricted by AIFT safety controls."});const receiverId=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;const safety=await enforceContactSafety({user:req.user,text,conversationId:room._id,receiverId});if(!safety.allowed)return res.status(safety.statusCode||422).json({message:safety.message,warningNumber:safety.warningNumber,action:safety.action});room.messages.push({senderId:uid(req.user),text});room.history.push({status:"message",note:"A Deal Room message was posted.",actorId:uid(req.user)});await room.save();await Notification.create({user:receiverId,type:"message",sender:uid(req.user),text:"You have a new message in an AIFT Deal Room.",link:`/deal-room.html?id=${room._id}`}).catch(()=>{});return res.status(201).json({room:await populateRoom(DealRoom.findById(room._id))});}catch(error){console.error("DEAL ROOM MESSAGE ERROR:",error);return res.status(500).json({message:"Could not send Deal Room message"});}
});

router.patch("/:id/due-diligence/:itemId",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(room.status!=="negotiation")return res.status(409).json({message:"Due diligence is closed for this Deal Room"});seedDiligence(room);const item=room.dueDiligence.id(req.params.itemId);if(!item)return res.status(404).json({message:"Due diligence item not found"});const status=clean(req.body?.status,30);if(!["pending","in_review","satisfied","needs_attention"].includes(status))return res.status(400).json({message:"Invalid due diligence status"});item.status=status;item.note=clean(req.body?.note,1500);item.updatedBy=uid(req.user);item.updatedAt=new Date();room.history.push({status:"diligence_updated",note:`${item.label}: ${status.replaceAll("_"," ")}.`,actorId:uid(req.user)});syncWorkflow(room);await room.save();const other=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;await notify(other,uid(req.user),"A due diligence item was updated in your AIFT Deal Room.",room._id);return res.json({room:await populateRoom(DealRoom.findById(room._id))});}catch(error){return res.status(500).json({message:"Could not update due diligence"});}
});

router.post("/:id/files",auth,uploadFiles,async(req,res)=>{
  try{
    const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(room.status!=="negotiation")return res.status(409).json({message:"File uploads are closed for this Deal Room"});
    const files=Array.isArray(req.files)?req.files:[];if(!files.length)return res.status(400).json({message:"Select at least one file to upload"});
    const uploaded=[];
    for(const file of files){const {result,resourceType}=await uploadBuffer(file,room._id,uid(req.user));const entry={name:clean(req.body?.label,180)||clean(file.originalname,180)||"Deal Room file",originalName:clean(file.originalname,220),type:attachmentKind(file.mimetype),mimeType:clean(file.mimetype,160),resourceType,bytes:Number(result.bytes||file.size||0),url:result.secure_url,sharedBy:uid(req.user)};room.sharedDocuments.push(entry);uploaded.push(entry);}
    room.history.push({status:"files_uploaded",note:`Uploaded ${uploaded.length} Deal Room file${uploaded.length===1?"":"s"}.`,actorId:uid(req.user)});await room.save();const other=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;await notify(other,uid(req.user),`${uploaded.length} new file${uploaded.length===1?" was":"s were"} uploaded to your AIFT Deal Room.`,room._id);return res.status(201).json({message:"Files uploaded",room:await populateRoom(DealRoom.findById(room._id))});
  }catch(error){console.error("DEAL ROOM FILE UPLOAD ERROR:",error);return res.status(500).json({message:"Could not upload Deal Room files"});}
});

router.post("/:id/share-venture-document",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(!same(uid(req.user),room.ownerId)&&!isAdmin(req.user))return res.status(403).json({message:"Only the Venture owner or AIFT Admin can share Venture documents"});const venture=await Venture.findById(room.ventureId);if(!venture)return res.status(404).json({message:"Venture not found"});const documentId=String(req.body?.ventureDocumentId||"");const document=(venture.documents||[]).id?.(documentId)||(venture.documents||[]).find(item=>String(item._id)===documentId);if(!document||!document.url)return res.status(404).json({message:"Venture document not found"});if((room.sharedDocuments||[]).some(item=>String(item.ventureDocumentId)===documentId))return res.status(409).json({message:"This document is already shared in the Deal Room"});room.sharedDocuments.push({ventureDocumentId:document._id,name:document.name||"Venture document",originalName:document.name||"",type:document.type||"other",url:document.url,sharedBy:uid(req.user)});room.history.push({status:"document_shared",note:`Shared Venture document: ${document.name||"Document"}.`,actorId:uid(req.user)});await room.save();return res.status(201).json({room:await populateRoom(DealRoom.findById(room._id))});}catch(error){return res.status(500).json({message:"Could not share Venture document"});}
});

router.post("/:id/meetings",auth,async(req,res)=>{
  try{
    const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(room.status!=="negotiation")return res.status(409).json({message:"Meeting proposals are only available while this Deal Room is open"});
    const startAt=new Date(req.body?.startAt);if(Number.isNaN(startAt.getTime())||startAt<=new Date())return res.status(400).json({message:"Choose a future meeting time"});const duration=Math.min(240,Math.max(15,Number(req.body?.durationMinutes)||30));const rawUrl=clean(req.body?.joinUrl,1600);const joinUrl=validMeetingUrl(rawUrl);if(rawUrl&&!joinUrl)return res.status(400).json({message:"Meeting link must be a valid http or https URL"});
    room.meetings.push({title:clean(req.body?.title,180)||"AIFT Deal Room Meeting",startAt,durationMinutes:duration,proposedBy:uid(req.user),joinUrl,note:clean(req.body?.note,1000)});room.history.push({status:"meeting_proposed",note:`Meeting proposed for ${startAt.toISOString()}.`,actorId:uid(req.user)});syncWorkflow(room);await room.save();const other=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;await notify(other,uid(req.user),"A meeting was proposed in your AIFT Deal Room.",room._id);return res.status(201).json({room:await populateRoom(DealRoom.findById(room._id))});
  }catch(error){return res.status(500).json({message:"Could not propose Deal Room meeting"});}
});

router.patch("/:id/meetings/:meetingId",auth,async(req,res)=>{
  try{
    const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});const meeting=room.meetings.id(req.params.meetingId);if(!meeting)return res.status(404).json({message:"Meeting proposal not found"});const status=clean(req.body?.status,30);if(!["accepted","declined","cancelled","completed"].includes(status))return res.status(400).json({message:"Invalid meeting response"});
    if(status==="completed"){if(meeting.status!=="accepted")return res.status(409).json({message:"Only an accepted meeting can be marked complete"});meeting.status="completed";meeting.completedBy=uid(req.user);meeting.completedAt=new Date();room.history.push({status:"meeting_completed",note:"Deal Room meeting marked complete. Post-meeting decisions are now available.",actorId:uid(req.user)});}
    else{if(same(meeting.proposedBy,uid(req.user))&&!isAdmin(req.user)&&status!=="cancelled")return res.status(403).json({message:"The other Deal Room participant must respond to this meeting proposal"});meeting.status=status;meeting.respondedBy=uid(req.user);meeting.respondedAt=new Date();room.history.push({status:`meeting_${status}`,note:`Meeting proposal ${status}.`,actorId:uid(req.user)});}
    syncWorkflow(room);await room.save();const other=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;await notify(other,uid(req.user),status==="accepted"?"Your AIFT Deal Room meeting was accepted. The join link is now available when provided.":status==="completed"?"Your AIFT Deal Room meeting was marked complete. Post-meeting decisions are now open.":`Your Deal Room meeting was ${status}.`,room._id);return res.json({room:await populateRoom(DealRoom.findById(room._id))});
  }catch(error){return res.status(500).json({message:"Could not update meeting proposal"});}
});

router.patch("/:id/meetings/:meetingId/link",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});const meeting=room.meetings.id(req.params.meetingId);if(!meeting)return res.status(404).json({message:"Meeting not found"});if(!["proposed","accepted"].includes(meeting.status))return res.status(409).json({message:"The meeting link can no longer be changed"});const joinUrl=validMeetingUrl(req.body?.joinUrl);if(!joinUrl)return res.status(400).json({message:"Enter a valid http or https meeting link"});meeting.joinUrl=joinUrl;room.history.push({status:"meeting_link_updated",note:"A secure meeting link was added to the accepted Deal Room meeting.",actorId:uid(req.user)});await room.save();const other=same(uid(req.user),room.investorId)?room.ownerId:room.investorId;await notify(other,uid(req.user),"A meeting link is now available in your AIFT Deal Room.",room._id);return res.json({room:await populateRoom(DealRoom.findById(room._id))});}catch(error){return res.status(500).json({message:"Could not save meeting link"});}
});

router.post("/:id/decision",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room)||isAdmin(req.user))return res.status(403).json({message:"Only the matched investor or Venture owner can submit this decision"});if(room.status!=="negotiation")return res.status(409).json({message:"This Deal Room is no longer accepting decisions"});if(!(room.meetings||[]).some(item=>item.status==="completed"))return res.status(409).json({message:"Complete the Deal Room meeting before submitting a post-meeting decision"});const decision=clean(req.body?.decision,30);if(!["continue","hold","withdraw"].includes(decision))return res.status(400).json({message:"Invalid Deal Room decision"});const partyRole=same(uid(req.user),room.investorId)?"investor":"owner";room.decisions=(room.decisions||[]).filter(item=>!same(item.userId,uid(req.user)));room.decisions.push({userId:uid(req.user),role:partyRole,decision,note:clean(req.body?.note,1500),decidedAt:new Date()});room.workflowStage="decision";room.history.push({status:"decision_submitted",note:`${partyRole} decision: ${decision}.`,actorId:uid(req.user)});await room.save();const other=partyRole==="investor"?room.ownerId:room.investorId;await notify(other,uid(req.user),`The ${partyRole} submitted a post-meeting decision in your AIFT Deal Room.`,room._id);return res.json({room:await populateRoom(DealRoom.findById(room._id))});}catch(error){return res.status(500).json({message:"Could not save Deal Room decision"});}
});

router.patch("/:id/status",auth,async(req,res)=>{
  try{
    if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT Admin can close or complete a Deal Room"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const status=clean(req.body?.status,30);if(!["completed","closed"].includes(status))return res.status(400).json({message:"Invalid Deal Room status"});
    if(status==="completed"){const decisions=room.decisions||[];const investorDecision=decisions.find(item=>item.role==="investor");const ownerDecision=decisions.find(item=>item.role==="owner");if(!investorDecision||!ownerDecision)return res.status(409).json({message:"Both parties must submit a post-meeting decision before completion"});if(investorDecision.decision!=="continue"||ownerDecision.decision!=="continue")return res.status(409).json({message:"A Deal Room can be completed only when both parties choose to continue. Otherwise close the room with an outcome note."});}
    room.status=status;room.workflowStage=status;if(status==="completed")room.completedAt=new Date();if(status==="closed")room.closedAt=new Date();room.history.push({status,note:clean(req.body?.note,1000)||`Deal Room ${status} by AIFT.`,actorId:uid(req.user)});await room.save();const review=await ReviewCase.findById(room.reviewCaseId);if(review&&status==="completed"){review.status="completed";review.resolvedAt=new Date();review.history.push({status:"completed",note:"AIFT Deal Room completed after due diligence, meeting and mutual post-meeting decisions.",actorId:uid(req.user)});await review.save();}return res.json({room:await populateRoom(DealRoom.findById(room._id)),reviewStatus:review?.status||null});
  }catch(error){return res.status(500).json({message:"Could not update Deal Room"});}
});

module.exports=router;
