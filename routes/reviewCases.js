const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const ReviewCase = require("../models/ReviewCase");
const Notification = require("../models/Notification");

const router = express.Router();
const allowedTypes = new Set(["venture","investment_interest","scholarship","scholarship_application","internship","partnership","opportunity","family_verification","student_verification","chat_safety","other"]);
const allowedStatuses = new Set(["submitted","under_review","information_requested","approved","rejected","matched","negotiation","completed","cancelled","expired"]);
const openStatuses = ["submitted","under_review","information_requested","approved","matched","negotiation"];
const transitions={
  submitted:new Set(["under_review","rejected","cancelled"]),
  under_review:new Set(["information_requested","approved","rejected","cancelled"]),
  information_requested:new Set(["under_review","rejected","cancelled"]),
  approved:new Set(["matched","rejected","cancelled"]),
  matched:new Set(["negotiation","cancelled"]),
  negotiation:new Set(["completed","cancelled"]),
  completed:new Set(), rejected:new Set(), cancelled:new Set(), expired:new Set()
};
function uid(user){ return user?._id || user?.id; }
function clean(value,max=500){ return String(value || "").trim().slice(0,max); }
function validId(value){ return mongoose.Types.ObjectId.isValid(String(value?._id || value || "")); }
async function caseNumber(){for(let i=0;i<10;i+=1){const value=`AIFT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;if(!(await ReviewCase.exists({caseNumber:value})))return value;}throw new Error("Could not create case number");}
async function createOrReuseReviewCase({type,requesterId,targetUserId=null,resourceType="",resourceId=null,title,summary="",metadata={},priority="normal",note="Submitted for AIFT review"}){
 const safeType=clean(type,60),safeTitle=clean(title,220);if(!allowedTypes.has(safeType)||!safeTitle||!validId(requesterId))throw new Error("Valid review type, requester and title are required");
 const normalizedResourceId=validId(resourceId)?resourceId:null;const existing=normalizedResourceId?await ReviewCase.findOne({type:safeType,resourceId:normalizedResourceId,status:{$in:openStatuses}}).sort({createdAt:-1}):null;
 if(existing){existing.requesterId=requesterId;if(validId(targetUserId))existing.targetUserId=targetUserId;if(resourceType)existing.resourceType=clean(resourceType,80);existing.title=safeTitle;existing.summary=clean(summary,3000);existing.metadata=metadata&&typeof metadata==="object"?metadata:{};if(["low","normal","high","urgent"].includes(priority))existing.priority=priority;await existing.save();return existing;}
 return ReviewCase.create({caseNumber:await caseNumber(),type:safeType,requesterId,targetUserId:validId(targetUserId)?targetUserId:null,resourceType:clean(resourceType,80),resourceId:normalizedResourceId,title:safeTitle,summary:clean(summary,3000),status:"submitted",priority:["low","normal","high","urgent"].includes(priority)?priority:"normal",metadata:metadata&&typeof metadata==="object"?metadata:{},history:[{status:"submitted",note:clean(note,1000)||"Submitted for AIFT review",actorId:requesterId}]});
}
async function getLatestReviewCase(type,resourceId){if(!allowedTypes.has(clean(type,60))||!validId(resourceId))return null;return ReviewCase.findOne({type:clean(type,60),resourceId}).sort({createdAt:-1});}
router.post("/",auth,async(req,res)=>{try{const review=await createOrReuseReviewCase({type:req.body?.type,requesterId:uid(req.user),targetUserId:req.body?.targetUserId,resourceType:req.body?.resourceType,resourceId:req.body?.resourceId,title:req.body?.title,summary:req.body?.summary,metadata:req.body?.metadata,priority:req.body?.priority});return res.status(201).json(review);}catch(error){console.error("CREATE REVIEW CASE ERROR:",error);return res.status(400).json({message:error.message||"Could not create AIFT review case"});}});
router.get("/mine",auth,async(req,res)=>{try{return res.json({cases:await ReviewCase.find({requesterId:uid(req.user)}).sort({createdAt:-1}).lean()});}catch{return res.status(500).json({message:"Could not load review cases"});}});
router.get("/admin",auth,async(req,res)=>{try{if(req.user.role!=="admin")return res.status(403).json({message:"Admin access required"});const query={};if(req.query.status&&allowedStatuses.has(String(req.query.status)))query.status=String(req.query.status);if(req.query.type&&allowedTypes.has(String(req.query.type)))query.type=String(req.query.type);const cases=await ReviewCase.find(query).populate("requesterId","name role profileImage companyName schoolName familyProfile").populate("targetUserId","name role profileImage companyName schoolName").populate("assignedTo","name role profileImage").sort({priority:-1,createdAt:1}).limit(500).lean();return res.json({cases,total:cases.length});}catch{return res.status(500).json({message:"Could not load AIFT Review Center"});}});
router.patch("/:id/admin",auth,async(req,res)=>{try{
 if(req.user.role!=="admin")return res.status(403).json({message:"Admin access required"});const review=await ReviewCase.findById(req.params.id);if(!review)return res.status(404).json({message:"Review case not found"});const status=clean(req.body?.status,40);if(status&&!allowedStatuses.has(status))return res.status(400).json({message:"Invalid review status"});
 if(review.type==="investment_interest"&&review.status==="matched"&&status==="negotiation")return res.status(409).json({message:"Matched investment introductions enter negotiation only by opening an AIFT Deal Room.",currentStatus:review.status,requiredAction:"POST /api/deal-rooms/from-review/:reviewCaseId"});
 if(status&&status!==review.status){const next=transitions[review.status]||new Set();if(!next.has(status))return res.status(409).json({message:`Invalid review transition: ${review.status.replaceAll("_"," ")} cannot move directly to ${status.replaceAll("_"," ")}. Complete the required stage first.`,currentStatus:review.status,allowedNext:[...next]});review.status=status;review.history.push({status,note:clean(req.body?.note,1000),actorId:uid(req.user)});if(["rejected","completed","cancelled"].includes(status))review.resolvedAt=new Date();else review.resolvedAt=null;review.reviewedAt=new Date();}
 if(req.body?.priority&&["low","normal","high","urgent"].includes(req.body.priority))review.priority=req.body.priority;if(Object.prototype.hasOwnProperty.call(req.body||{},"assignedTo"))review.assignedTo=req.body.assignedTo||null;if(Object.prototype.hasOwnProperty.call(req.body||{},"decisionNotes"))review.decisionNotes=clean(req.body.decisionNotes,3000);await review.save();
 let resourceSync={synced:false,reason:"No decision status supplied"};if(status){try{const {syncReviewDecision}=require("../services/aiftReviewDecisionSync");resourceSync=await syncReviewDecision(review,req.user);}catch(syncError){console.error("REVIEW RESOURCE SYNC ERROR:",syncError);review.history.push({status:review.status,note:`Resource synchronization failed: ${clean(syncError.message,700)}`,actorId:uid(req.user)});await review.save();return res.status(500).json({message:"Review decision was saved, but the linked resource could not be synchronized. Please retry the decision.",review,resourceSync:{synced:false,reason:syncError.message}});}}
 await Notification.create({user:review.requesterId,type:"review_case",sender:uid(req.user),text:`AIFT Review ${review.caseNumber} is now ${review.status.replaceAll("_"," ")}.`,link:"/home.html"}).catch(()=>{});return res.json({review,resourceSync,allowedNext:[...(transitions[review.status]||new Set())]});
}catch(error){console.error("UPDATE REVIEW CASE ERROR:",error);return res.status(500).json({message:"Could not update review case"});}});
router.createOrReuseReviewCase=createOrReuseReviewCase;router.getLatestReviewCase=getLatestReviewCase;router.allowedReviewStatuses=allowedStatuses;router.reviewTransitions=transitions;module.exports=router;