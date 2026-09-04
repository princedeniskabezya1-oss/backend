const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const ReviewCase = require("../models/ReviewCase");
const Notification = require("../models/Notification");
const Venture = require("../models/Venture");
const VentureInterest = require("../models/VentureInterest");
const ScholarshipApplication = require("../models/ScholarshipApplication");
const SchoolScholarship = require("../models/SchoolScholarship");

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
function sameId(left,right){ return Boolean(left&&right&&String(left?._id||left)===String(right?._id||right)); }
function reviewDestination(review){
 const resourceId=String(review?.resourceId||"");const metadata=review?.metadata&&typeof review.metadata==="object"?review.metadata:{};const resourceType=String(review?.resourceType||"").toLowerCase();
 if(resourceType==="venture")return resourceId?`/venture.html?id=${resourceId}`:"/student.html?section=career&focus=ventures";
 if(resourceType==="ventureinterest")return metadata.ventureId?`/venture.html?id=${metadata.ventureId}`:"/family.html?section=investments";
 if(resourceType==="schoolopportunity")return resourceId?`/job-details.html?id=${resourceId}`:"/student.html?section=career";
 if(resourceType==="scholarshipapplication")return `/student.html?section=career&focus=scholarships${resourceId?`&applicationId=${resourceId}`:""}`;
 if(resourceType==="internshipapplication")return `/my-applications.html${resourceId?`?applicationId=${resourceId}`:""}`;
 if(resourceType==="schoolcompanypartnership")return "/school.html?section=partnerships";
 if(resourceType==="chatsafetyviolation")return "/messages.html";
 return "/student.html?section=career";
}
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

router.delete("/:id/request",auth,async(req,res)=>{try{
 if(!validId(req.params.id))return res.status(400).json({message:"Invalid review case id"});
 const review=await ReviewCase.findById(req.params.id);
 if(!review)return res.status(404).json({message:"Review case not found"});
 if(!sameId(review.requesterId,uid(req.user)))return res.status(403).json({message:"You can only delete your own submitted request"});
 if(review.status!=="submitted")return res.status(409).json({message:"A request can only be deleted while its AIFT review status is submitted.",currentStatus:review.status});
 if(!validId(review.resourceId))return res.status(409).json({message:"This review request is not linked to a deletable resource"});

 let deletedResourceType="";
 if(review.type==="venture"||String(review.resourceType||"").toLowerCase()==="venture"){
   const venture=await Venture.findById(review.resourceId);
   if(!venture)return res.status(404).json({message:"The submitted Venture request no longer exists"});
   if(!sameId(venture.ownerId,uid(req.user)))return res.status(403).json({message:"You do not own this Venture request"});
   if(venture.status!=="submitted")return res.status(409).json({message:"A Venture request can only be deleted while its status is submitted.",currentStatus:venture.status});
   await VentureInterest.deleteMany({ventureId:venture._id});
   await venture.deleteOne();
   deletedResourceType="venture";
 }else if(review.type==="investment_interest"||String(review.resourceType||"").toLowerCase()==="ventureinterest"){
   const interest=await VentureInterest.findById(review.resourceId);
   if(!interest)return res.status(404).json({message:"The submitted investment interest no longer exists"});
   if(!sameId(interest.userId,uid(req.user)))return res.status(403).json({message:"You do not own this investment interest"});
   if(interest.type!=="investment")return res.status(409).json({message:"Only submitted investment interests can be deleted from Investor Mode"});
   if(interest.status!=="pending")return res.status(409).json({message:"This investment interest can no longer be deleted because it has already progressed.",currentStatus:interest.status});
   const ventureId=interest.ventureId;
   await interest.deleteOne();
   if(validId(ventureId))await Venture.updateOne({_id:ventureId,interestCount:{$gt:0}},{$inc:{interestCount:-1}}).catch(()=>{});
   deletedResourceType="investment_interest";
 }else if(review.type==="scholarship_application"||String(review.resourceType||"").toLowerCase()==="scholarshipapplication"){
   const application=await ScholarshipApplication.findById(review.resourceId);
   if(!application)return res.status(404).json({message:"The submitted scholarship application no longer exists"});
   const ownsApplication=sameId(application.submittedByFamilyId,uid(req.user))||sameId(application.studentId,uid(req.user));
   if(!ownsApplication)return res.status(403).json({message:"You do not own this scholarship application"});
   if(application.status!=="submitted")return res.status(409).json({message:"A scholarship application can only be deleted while its status is submitted.",currentStatus:application.status});
   const scholarshipId=application.scholarshipId;
   await application.deleteOne();
   if(validId(scholarshipId))await SchoolScholarship.updateOne({_id:scholarshipId,applicationCount:{$gt:0}},{$inc:{applicationCount:-1}}).catch(()=>{});
   deletedResourceType="scholarship_application";
 }else{
   return res.status(409).json({message:"This submitted request type cannot be deleted from My Requests yet."});
 }

 review.status="cancelled";
 review.resolvedAt=new Date();
 review.decisionNotes=deletedResourceType==="investment_interest"?"Investment interest deleted by the investor while still submitted.":"Request deleted by the requester while still submitted.";
 review.history.push({status:"cancelled",note:deletedResourceType==="investment_interest"?"Investor deleted the submitted investment interest before AIFT processing began.":"Requester deleted the submitted request before AIFT processing was completed.",actorId:uid(req.user)});
 await review.save();
 return res.json({message:deletedResourceType==="investment_interest"?"Submitted investment interest deleted successfully":"Submitted request deleted successfully",deletedResourceType,reviewStatus:review.status,review});
}catch(error){console.error("DELETE SUBMITTED REVIEW REQUEST ERROR:",error);return res.status(500).json({message:"Could not delete the submitted request"});}});

router.patch("/:id/admin",auth,async(req,res)=>{try{
 if(req.user.role!=="admin")return res.status(403).json({message:"Admin access required"});const review=await ReviewCase.findById(req.params.id);if(!review)return res.status(404).json({message:"Review case not found"});const status=clean(req.body?.status,40);if(status&&!allowedStatuses.has(status))return res.status(400).json({message:"Invalid review status"});
 if(review.type==="investment_interest"&&review.status==="matched"&&status==="negotiation")return res.status(409).json({message:"Matched investment introductions enter negotiation only by opening an AIFT Deal Room.",currentStatus:review.status,requiredAction:"POST /api/deal-rooms/from-review/:reviewCaseId"});
 if(status&&status!==review.status){const next=transitions[review.status]||new Set();if(!next.has(status))return res.status(409).json({message:`Invalid review transition: ${review.status.replaceAll("_"," ")} cannot move directly to ${status.replaceAll("_"," ")}. Complete the required stage first.`,currentStatus:review.status,allowedNext:[...next]});review.status=status;review.history.push({status,note:clean(req.body?.note,1000),actorId:uid(req.user)});if(["rejected","completed","cancelled"].includes(status))review.resolvedAt=new Date();else review.resolvedAt=null;review.reviewedAt=new Date();}
 if(req.body?.priority&&["low","normal","high","urgent"].includes(req.body.priority))review.priority=req.body.priority;if(Object.prototype.hasOwnProperty.call(req.body||{},"assignedTo"))review.assignedTo=req.body.assignedTo||null;if(Object.prototype.hasOwnProperty.call(req.body||{},"decisionNotes"))review.decisionNotes=clean(req.body.decisionNotes,3000);await review.save();
 let resourceSync={synced:false,reason:"No decision status supplied"};if(status){try{const {syncReviewDecision}=require("../services/aiftReviewDecisionSync");resourceSync=await syncReviewDecision(review,req.user);}catch(syncError){console.error("REVIEW RESOURCE SYNC ERROR:",syncError);review.history.push({status:review.status,note:`Resource synchronization failed: ${clean(syncError.message,700)}`,actorId:uid(req.user)});await review.save();return res.status(500).json({message:"Review decision was saved, but the linked resource could not be synchronized. Please retry the decision.",review,resourceSync:{synced:false,reason:syncError.message}});}}
 const readableStatus=review.status==="negotiation"?"under negotiation":review.status.replaceAll("_"," ");await Notification.create({user:review.requesterId,type:"review_case",sender:uid(req.user),text:`AIFT Review ${review.caseNumber} is now ${readableStatus}.`,link:reviewDestination(review),entityType:"review",entityId:review._id,metadata:{...(review.metadata||{}),reviewCaseId:String(review._id),reviewType:review.type,resourceType:review.resourceType,resourceId:String(review.resourceId||"")}}).catch(()=>{});return res.json({review,resourceSync,allowedNext:[...(transitions[review.status]||new Set())]});
}catch(error){console.error("UPDATE REVIEW CASE ERROR:",error);return res.status(500).json({message:"Could not update review case"});}});
router.createOrReuseReviewCase=createOrReuseReviewCase;router.getLatestReviewCase=getLatestReviewCase;router.allowedReviewStatuses=allowedStatuses;router.reviewTransitions=transitions;module.exports=router;
