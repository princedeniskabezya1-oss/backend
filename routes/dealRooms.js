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
  ["identity","Identity and participant review"],
  ["venture","Venture and ownership review"],
  ["traction","Business evidence and traction"],
  ["financials","Financial review"],
  ["legal","Legal and supporting records"],
  ["fit","Investment fit and next-step readiness"]
];
const MAX_REQUEST_FILES=10;

function uid(user){return user?._id||user?.id;}
function same(a,b){return String(a?._id||a||"")===String(b?._id||b||"");}
function valid(value){return mongoose.Types.ObjectId.isValid(String(value?._id||value||""));}
function clean(value,max=1000){return String(value??"").trim().slice(0,max);}
function isAdmin(user){return String(user?.role||"").toLowerCase()==="admin";}
function canAccess(user,room){const id=uid(user);return isAdmin(user)||same(id,room.investorId)||same(id,room.ownerId);}
function partyRole(user,room){if(isAdmin(user))return "admin";if(same(uid(user),room.ownerId))return "owner";if(same(uid(user),room.investorId))return "investor";return "";}
function counterpartyId(user,room){if(same(uid(user),room.ownerId))return room.investorId;if(same(uid(user),room.investorId))return room.ownerId;return null;}
function safeUserSelect(){return "name role profileImage companyName schoolName headline aiftVerified";}
function populateRoom(query){return query
  .populate("reviewCaseId","caseNumber type status priority title summary decisionNotes reviewedAt createdAt")
  .populate("ventureId","title slug tagline description ventureType stage industry fundingGoal fundingRaised currency seekingInvestment investmentRangeMin investmentRangeMax fundingStage coverUrl logoUrl")
  .populate("investorId",safeUserSelect()).populate("ownerId",safeUserSelect()).populate("openedBy",safeUserSelect())
  .populate("messages.senderId",safeUserSelect())
  .populate("meetings.proposedBy",safeUserSelect()).populate("meetings.respondedBy",safeUserSelect()).populate("meetings.scheduledBy",safeUserSelect()).populate("meetings.completedBy",safeUserSelect())
  .populate("documentRequests.requestedBy",safeUserSelect()).populate("documentRequests.reviewedBy",safeUserSelect()).populate("documentRequests.accessGrantedBy",safeUserSelect()).populate("documentRequests.files.uploadedBy",safeUserSelect())
  .populate("dueDiligence.updatedBy",safeUserSelect()).populate("decisionUnlockedBy",safeUserSelect()).populate("decisions.userId",safeUserSelect()).populate("finalOutcome.decidedBy",safeUserSelect());}
function seedDiligence(room){if(!Array.isArray(room.dueDiligence)||!room.dueDiligence.length)room.dueDiligence=DEFAULT_DILIGENCE.map(([key,label])=>({key,label,status:"pending"}));}
function validMeetingUrl(value){const text=clean(value,1600);if(!text)return "";try{const parsed=new URL(text);return ["https:","http:"].includes(parsed.protocol)?parsed.toString():"";}catch{return "";}}
function syncWorkflow(room){
  if(room.status==="completed"){room.workflowStage="completed";return;}
  if(room.status==="closed"){room.workflowStage="closed";return;}
  if(room.decisionUnlocked){room.workflowStage="decision";return;}
  const meetings=Array.isArray(room.meetings)?room.meetings:[];
  if(meetings.some(item=>["counterparty_accepted","scheduled","completed","accepted"].includes(item.status))){room.workflowStage="meeting";return;}
  const requests=Array.isArray(room.documentRequests)?room.documentRequests:[];
  if(requests.length){room.workflowStage="documents";return;}
  room.workflowStage="review";
}
function roomView(room,user){
  const obj=room?.toObject?room.toObject():JSON.parse(JSON.stringify(room||{}));
  const viewer=partyRole(user,room);
  obj.viewerRole=viewer;
  if(viewer!=="admin"){
    obj.dueDiligence=(obj.dueDiligence||[]).map(item=>({key:item.key,label:item.label,status:item.status,updatedAt:item.updatedAt}));
    obj.documentRequests=(obj.documentRequests||[]).map(request=>{
      const own=request.requestedFrom===viewer;
      const shared=Boolean(request.counterpartyAccess);
      return {
        ...request,
        adminNote:own?request.adminNote:"",
        files:(own||shared)?(request.files||[]):[]
      };
    });
  }
  return obj;
}
async function getRoomResponse(id,user){const populated=await populateRoom(DealRoom.findById(id));return populated?roomView(populated,user):null;}
async function notify(user,sender,text,roomId){if(!user)return;return Notification.create({user,type:"review_case",sender,text,link:`/deal-room.html?id=${roomId}`}).catch(()=>{});}
async function notifyParticipants(room,sender,text,exclude=null){const ids=[room.ownerId,room.investorId].filter(id=>!exclude||!same(id,exclude));await Promise.all(ids.map(id=>notify(id,sender,text,room._id)));}
function uploadRequestFiles(req,res,next){upload.array("files",MAX_REQUEST_FILES)(req,res,error=>{if(!error)return next();if(error.code==="LIMIT_FILE_SIZE")return res.status(413).json({message:"Each requested file must be 100 MB or smaller."});if(error.code==="LIMIT_FILE_COUNT")return res.status(400).json({message:`Upload up to ${MAX_REQUEST_FILES} files at once.`});return res.status(400).json({message:error.message||"The selected files could not be uploaded."});});}
function cloudinaryResourceType(mime){const type=String(mime||"").toLowerCase();if(type.startsWith("image/"))return "image";if(type.startsWith("video/")||type.startsWith("audio/"))return "video";return "raw";}
function attachmentKind(mime){const type=String(mime||"").toLowerCase();if(type.startsWith("image/"))return "image";if(type.startsWith("video/"))return "video";if(type.startsWith("audio/"))return "audio";if(type==="application/pdf")return "pdf";if(type.includes("word"))return "document";if(type.includes("presentation")||type.includes("powerpoint"))return "presentation";if(type.includes("spreadsheet")||type.includes("excel")||type==="text/csv")return "spreadsheet";return "file";}
function uploadBuffer(file,roomId,userId){return new Promise((resolve,reject)=>{const resourceType=cloudinaryResourceType(file.mimetype);const stream=cloudinary.uploader.upload_stream({folder:`aift/deal-rooms/${roomId}/requested/${userId}`,resource_type:resourceType,overwrite:false,unique_filename:true,use_filename:false},(error,result)=>error?reject(error):resolve({result,resourceType}));Readable.from(file.buffer).pipe(stream);});}

router.post("/from-review/:reviewCaseId",auth,async(req,res)=>{
  try{
    if(!isAdmin(req.user))return res.status(403).json({message:"Admin access required"});
    const review=await ReviewCase.findById(req.params.reviewCaseId);if(!review)return res.status(404).json({message:"Review case not found"});
    if(review.type!=="investment_interest")return res.status(400).json({message:"Only matched investment introductions can open a Deal Room"});
    if(review.status!=="matched")return res.status(409).json({message:`Deal Room can open only after both parties are matched. Current status: ${String(review.status).replaceAll("_"," ")}`});
    const interest=await VentureInterest.findById(review.resourceId);if(!interest||interest.type!=="investment"||interest.status!=="accepted")return res.status(409).json({message:"The Venture owner must accept the AIFT-approved introduction before a Deal Room can open"});
    const venture=await Venture.findById(interest.ventureId);if(!venture)return res.status(404).json({message:"Venture not found"});
    let room=await DealRoom.findOne({reviewCaseId:review._id});
    if(!room){room=await DealRoom.create({reviewCaseId:review._id,ventureId:venture._id,ventureInterestId:interest._id,investorId:interest.userId,ownerId:venture.ownerId,openedBy:uid(req.user),status:"negotiation",workflowStage:"review",dueDiligence:DEFAULT_DILIGENCE.map(([key,label])=>({key,label,status:"pending"})),history:[{status:"review",note:"AIFT opened a controlled Deal Room for participant review and due diligence.",actorId:uid(req.user)}]});}
    else{seedDiligence(room);syncWorkflow(room);await room.save();}
    review.status="negotiation";review.history.push({status:"negotiation",note:"AIFT Deal Room opened. Meetings, documents and final decisions are controlled by AIFT.",actorId:uid(req.user)});review.reviewedAt=new Date();await review.save();
    await notifyParticipants(room,uid(req.user),`AIFT opened a Deal Room for ${venture.title}. Review the overview and wait for AIFT-guided next steps.`);
    return res.status(201).json({message:"AIFT Deal Room opened",room:await getRoomResponse(room._id,req.user),reviewStatus:review.status});
  }catch(error){console.error("OPEN DEAL ROOM ERROR:",error);return res.status(500).json({message:"Could not open AIFT Deal Room"});}
});

router.get("/mine",auth,async(req,res)=>{try{const id=uid(req.user);const query=isAdmin(req.user)?{}:{$or:[{investorId:id},{ownerId:id}]};const rooms=await populateRoom(DealRoom.find(query).sort({updatedAt:-1}).limit(100));return res.json({rooms:rooms.map(room=>roomView(room,req.user))});}catch(error){return res.status(500).json({message:"Could not load Deal Rooms"});}});
router.get("/:id",auth,async(req,res)=>{try{if(!valid(req.params.id))return res.status(400).json({message:"Invalid Deal Room ID"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});seedDiligence(room);syncWorkflow(room);await room.save();return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not load Deal Room"});}});

router.post("/:id/messages",auth,async(req,res)=>{
  try{
    const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room))return res.status(403).json({message:"You do not have access to this Deal Room"});if(room.status!=="negotiation")return res.status(409).json({message:"This Deal Room is no longer open"});
    const text=clean(req.body?.text,4000);if(!text)return res.status(400).json({message:"Message is required"});
    if(!isAdmin(req.user)){
      const restriction=await getMessagingRestriction(uid(req.user));if(restriction?.restricted)return res.status(403).json({message:restriction.pendingReview?"Messaging is restricted pending AIFT review.":"Messaging is temporarily restricted by AIFT safety controls."});
      const other=counterpartyId(req.user,room);const safety=await enforceContactSafety({user:req.user,text,conversationId:room._id,receiverId:other});if(!safety.allowed)return res.status(safety.statusCode||422).json({message:safety.message,warningNumber:safety.warningNumber,action:safety.action});
    }
    room.messages.push({senderId:uid(req.user),text});room.history.push({status:"message",note:isAdmin(req.user)?"AIFT posted a Deal Room message.":"A participant posted a Deal Room message.",actorId:uid(req.user)});await room.save();
    if(isAdmin(req.user))await notifyParticipants(room,uid(req.user),"AIFT posted a new message in your Deal Room.");else await notify(counterpartyId(req.user,room),uid(req.user),"You have a new message in an AIFT Deal Room.",room._id);
    return res.status(201).json({room:await getRoomResponse(room._id,req.user)});
  }catch(error){console.error("DEAL ROOM MESSAGE ERROR:",error);return res.status(500).json({message:"Could not send Deal Room message"});}
});

router.patch("/:id/due-diligence/:itemId",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can update the internal review"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});seedDiligence(room);const item=room.dueDiligence.id(req.params.itemId);if(!item)return res.status(404).json({message:"Review item not found"});const status=clean(req.body?.status,30);if(!["pending","in_review","satisfied","needs_attention"].includes(status))return res.status(400).json({message:"Invalid review status"});item.status=status;item.note=clean(req.body?.note,1500);item.updatedBy=uid(req.user);item.updatedAt=new Date();room.history.push({status:"review_updated",note:`${item.label}: ${status.replaceAll("_"," ")}.`,actorId:uid(req.user)});syncWorkflow(room);await room.save();return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not update AIFT review"});}
});

router.post("/:id/document-requests",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can request Deal Room documents"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const requestedFrom=clean(req.body?.requestedFrom,20);if(!["owner","investor"].includes(requestedFrom))return res.status(400).json({message:"Choose whether the request is for the Venture owner or investor"});const title=clean(req.body?.title,180);if(!title)return res.status(400).json({message:"Document request title is required"});const dueAt=req.body?.dueAt?new Date(req.body.dueAt):null;if(dueAt&&Number.isNaN(dueAt.getTime()))return res.status(400).json({message:"Invalid due date"});room.documentRequests.push({title,description:clean(req.body?.description,1800),category:clean(req.body?.category,80)||"other",requestedFrom,requestedBy:uid(req.user),dueAt,status:"requested"});syncWorkflow(room);room.history.push({status:"document_requested",note:`AIFT requested ${title} from the ${requestedFrom}.`,actorId:uid(req.user)});await room.save();const target=requestedFrom==="owner"?room.ownerId:room.investorId;await notify(target,uid(req.user),`AIFT requested a document in your Deal Room: ${title}.`,room._id);return res.status(201).json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not create document request"});}
});

router.post("/:id/document-requests/:requestId/files",auth,uploadRequestFiles,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room)||isAdmin(req.user))return res.status(403).json({message:"Only the requested participant can submit these files"});const request=room.documentRequests.id(req.params.requestId);if(!request)return res.status(404).json({message:"Document request not found"});const viewer=partyRole(req.user,room);if(request.requestedFrom!==viewer)return res.status(403).json({message:"This document request is assigned to the other participant"});if(!["requested","needs_replacement"].includes(request.status))return res.status(409).json({message:"This document request is not accepting files right now"});const files=Array.isArray(req.files)?req.files:[];if(!files.length)return res.status(400).json({message:"Select at least one requested file"});request.files=[];for(const file of files){const {result,resourceType}=await uploadBuffer(file,room._id,uid(req.user));request.files.push({name:clean(file.originalname,180)||"Requested file",originalName:clean(file.originalname,220),type:attachmentKind(file.mimetype),mimeType:clean(file.mimetype,160),resourceType,bytes:Number(result.bytes||file.size||0),url:result.secure_url,uploadedBy:uid(req.user)});}request.status="submitted";request.counterpartyAccess=false;request.accessGrantedBy=null;request.accessGrantedAt=null;room.history.push({status:"document_submitted",note:`${request.title} submitted privately to AIFT for review.`,actorId:uid(req.user)});syncWorkflow(room);await room.save();await notify(room.openedBy,uid(req.user),`A requested Deal Room document was submitted for AIFT review: ${request.title}.`,room._id);return res.status(201).json({message:"Files submitted privately to AIFT",room:await getRoomResponse(room._id,req.user)});}catch(error){console.error("REQUESTED DOCUMENT UPLOAD ERROR:",error);return res.status(500).json({message:"Could not submit requested files"});}
});

router.patch("/:id/document-requests/:requestId/review",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can review submitted Deal Room documents"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const request=room.documentRequests.id(req.params.requestId);if(!request)return res.status(404).json({message:"Document request not found"});const status=clean(req.body?.status,30);if(!["under_review","accepted","needs_replacement","waived"].includes(status))return res.status(400).json({message:"Invalid document review status"});request.status=status;request.adminNote=clean(req.body?.adminNote,1800);request.reviewedBy=uid(req.user);request.reviewedAt=new Date();if(Object.prototype.hasOwnProperty.call(req.body||{},"counterpartyAccess")){request.counterpartyAccess=Boolean(req.body.counterpartyAccess);request.accessGrantedBy=request.counterpartyAccess?uid(req.user):null;request.accessGrantedAt=request.counterpartyAccess?new Date():null;}room.history.push({status:"document_reviewed",note:`AIFT marked ${request.title} as ${status.replaceAll("_"," ")}${request.counterpartyAccess?" and granted counterparty access":""}.`,actorId:uid(req.user)});await room.save();const target=request.requestedFrom==="owner"?room.ownerId:room.investorId;await notify(target,uid(req.user),`AIFT updated your document request: ${request.title} — ${status.replaceAll("_"," ")}.`,room._id);if(request.counterpartyAccess){const other=request.requestedFrom==="owner"?room.investorId:room.ownerId;await notify(other,uid(req.user),`AIFT granted you access to reviewed Deal Room documents: ${request.title}.`,room._id);}return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not review requested documents"});}
});

router.post("/:id/meetings",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room)||isAdmin(req.user))return res.status(403).json({message:"The investor or Venture owner can request a meeting"});if(room.status!=="negotiation")return res.status(409).json({message:"Meeting requests are closed for this Deal Room"});const preferred=req.body?.preferredStartAt?new Date(req.body.preferredStartAt):null;if(preferred&&Number.isNaN(preferred.getTime()))return res.status(400).json({message:"Invalid preferred meeting time"});room.meetings.push({title:clean(req.body?.title,180)||"AIFT Deal Room Meeting",reason:clean(req.body?.reason,1200),preferredStartAt:preferred,status:"requested",proposedBy:uid(req.user)});room.history.push({status:"meeting_requested",note:"A participant requested an AIFT-facilitated meeting.",actorId:uid(req.user)});syncWorkflow(room);await room.save();await notify(counterpartyId(req.user,room),uid(req.user),"The other Deal Room participant requested a meeting. Accept or decline the request before AIFT schedules it.",room._id);return res.status(201).json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not request a Deal Room meeting"});}
});

router.patch("/:id/meetings/:meetingId/respond",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room)||isAdmin(req.user))return res.status(403).json({message:"Only the other participant can respond to the meeting request"});const meeting=room.meetings.id(req.params.meetingId);if(!meeting)return res.status(404).json({message:"Meeting request not found"});if(!["requested","proposed"].includes(meeting.status))return res.status(409).json({message:"This meeting request has already been handled"});if(same(meeting.proposedBy,uid(req.user)))return res.status(403).json({message:"The participant who requested the meeting cannot approve their own request"});const response=clean(req.body?.response,20);if(!["accept","decline"].includes(response))return res.status(400).json({message:"Choose accept or decline"});meeting.status=response==="accept"?"counterparty_accepted":"declined";meeting.respondedBy=uid(req.user);meeting.respondedAt=new Date();meeting.responseNote=clean(req.body?.note,1000);room.history.push({status:meeting.status,note:response==="accept"?"Both participants agreed to the meeting request. Waiting for AIFT scheduling.":"The other participant declined the meeting request.",actorId:uid(req.user)});syncWorkflow(room);await room.save();if(response==="accept")await notify(room.openedBy,uid(req.user),"Both Deal Room participants agreed to a meeting request. AIFT can now approve and schedule it.",room._id);return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not respond to meeting request"});}
});

router.patch("/:id/meetings/:meetingId/schedule",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can approve and schedule Deal Room meetings"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const meeting=room.meetings.id(req.params.meetingId);if(!meeting)return res.status(404).json({message:"Meeting request not found"});if(!["counterparty_accepted","accepted"].includes(meeting.status))return res.status(409).json({message:"Both participants must agree to the meeting request before AIFT can schedule it"});const startAt=new Date(req.body?.startAt);if(Number.isNaN(startAt.getTime())||startAt<=new Date())return res.status(400).json({message:"Choose a future meeting time"});const joinUrl=validMeetingUrl(req.body?.joinUrl);if(!joinUrl)return res.status(400).json({message:"A valid meeting link is required when AIFT schedules the meeting"});meeting.status="scheduled";meeting.startAt=startAt;meeting.durationMinutes=Math.min(240,Math.max(15,Number(req.body?.durationMinutes)||30));meeting.joinUrl=joinUrl;meeting.note=clean(req.body?.note,1000);meeting.scheduledBy=uid(req.user);meeting.scheduledAt=new Date();room.history.push({status:"meeting_scheduled",note:`AIFT approved and scheduled the meeting for ${startAt.toISOString()}.`,actorId:uid(req.user)});syncWorkflow(room);await room.save();await notifyParticipants(room,uid(req.user),"AIFT approved and scheduled your Deal Room meeting. The Join Meeting link is now available in the room.");return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not schedule the Deal Room meeting"});}
});

router.patch("/:id/meetings/:meetingId/complete",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT Admin can mark a Deal Room meeting completed"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const meeting=room.meetings.id(req.params.meetingId);if(!meeting)return res.status(404).json({message:"Meeting not found"});if(meeting.status!=="scheduled")return res.status(409).json({message:"Only an AIFT-scheduled meeting can be completed"});meeting.status="completed";meeting.completedBy=uid(req.user);meeting.completedAt=new Date();room.history.push({status:"meeting_completed",note:"AIFT marked the Deal Room meeting completed. The final decision remains locked until AIFT opens it.",actorId:uid(req.user)});syncWorkflow(room);await room.save();await notifyParticipants(room,uid(req.user),"AIFT marked your Deal Room meeting completed. Please wait for AIFT to unlock the final decision.");return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not complete the Deal Room meeting"});}
});

router.patch("/:id/decision-gate",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can unlock the final decision"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const unlocked=Boolean(req.body?.unlocked);if(unlocked&&!(room.meetings||[]).some(item=>item.status==="completed"))return res.status(409).json({message:"AIFT must complete the scheduled meeting before unlocking the final decision"});room.decisionUnlocked=unlocked;room.decisionUnlockedBy=unlocked?uid(req.user):null;room.decisionUnlockedAt=unlocked?new Date():null;room.history.push({status:unlocked?"decision_unlocked":"decision_locked",note:unlocked?"AIFT unlocked the final participant decision.":"AIFT locked the final participant decision.",actorId:uid(req.user)});syncWorkflow(room);await room.save();await notifyParticipants(room,uid(req.user),unlocked?"AIFT unlocked the final Deal Room decision. Both parties can now submit their decision.":"AIFT temporarily locked the Deal Room decision.");return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not update the decision gate"});}
});

router.post("/:id/decision",auth,async(req,res)=>{
  try{const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});if(!canAccess(req.user,room)||isAdmin(req.user))return res.status(403).json({message:"Only the investor or Venture owner can submit this decision"});if(!room.decisionUnlocked)return res.status(409).json({message:"The final decision is still locked by AIFT"});const decision=clean(req.body?.decision,30);if(!["continue","hold","withdraw"].includes(decision))return res.status(400).json({message:"Invalid Deal Room decision"});const role=partyRole(req.user,room);room.decisions=(room.decisions||[]).filter(item=>!same(item.userId,uid(req.user)));room.decisions.push({userId:uid(req.user),role,decision,note:clean(req.body?.note,1500),decidedAt:new Date()});room.history.push({status:"decision_submitted",note:`${role} submitted a final Deal Room decision.`,actorId:uid(req.user)});await room.save();await notify(room.openedBy,uid(req.user),`The ${role} submitted a final Deal Room decision.`,room._id);return res.json({room:await getRoomResponse(room._id,req.user)});}catch(error){return res.status(500).json({message:"Could not save Deal Room decision"});}
});

router.patch("/:id/final-outcome",auth,async(req,res)=>{
  try{if(!isAdmin(req.user))return res.status(403).json({message:"Only AIFT can publish the final Deal Room result"});const room=await DealRoom.findById(req.params.id);if(!room)return res.status(404).json({message:"Deal Room not found"});const result=clean(req.body?.result,40);if(!["approved_to_proceed","more_information_required","declined","closed_no_deal"].includes(result))return res.status(400).json({message:"Invalid final outcome"});room.finalOutcome={result,note:clean(req.body?.note,2400),decidedBy:uid(req.user),decidedAt:new Date()};room.history.push({status:"final_outcome",note:`AIFT published the final Deal Room result: ${result.replaceAll("_"," ")}.`,actorId:uid(req.user)});if(result==="approved_to_proceed")room.status="completed";else if(["declined","closed_no_deal"].includes(result))room.status="closed";syncWorkflow(room);if(room.status==="completed")room.completedAt=new Date();if(room.status==="closed")room.closedAt=new Date();await room.save();const review=await ReviewCase.findById(room.reviewCaseId);if(review&&room.status==="completed"){review.status="completed";review.resolvedAt=new Date();review.history.push({status:"completed",note:"AIFT Deal Room completed with final approval to proceed.",actorId:uid(req.user)});await review.save();}await notifyParticipants(room,uid(req.user),`AIFT published the final Deal Room result: ${result.replaceAll("_"," ")}.`);return res.json({room:await getRoomResponse(room._id,req.user),reviewStatus:review?.status||null});}catch(error){return res.status(500).json({message:"Could not publish the final Deal Room result"});}
});

module.exports=router;
