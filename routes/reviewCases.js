const express = require("express");
const crypto = require("crypto");
const auth = require("../middleware/auth");
const ReviewCase = require("../models/ReviewCase");
const Notification = require("../models/Notification");

const router = express.Router();
const allowedTypes = new Set(["venture","investment_interest","scholarship","scholarship_application","internship","partnership","opportunity","family_verification","student_verification","chat_safety","other"]);
const allowedStatuses = new Set(["submitted","under_review","information_requested","approved","rejected","matched","negotiation","completed","cancelled","expired"]);

function uid(user){ return user?._id || user?.id; }
function clean(value,max=500){ return String(value || "").trim().slice(0,max); }
async function caseNumber(){
  for(let i=0;i<10;i+=1){
    const value=`AIFT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    if(!(await ReviewCase.exists({ caseNumber:value }))) return value;
  }
  throw new Error("Could not create case number");
}

router.post("/", auth, async (req,res)=>{
  try{
    const type=clean(req.body?.type,60);
    const title=clean(req.body?.title,220);
    if(!allowedTypes.has(type) || !title) return res.status(400).json({ message:"Valid review type and title are required" });
    const review=await ReviewCase.create({
      caseNumber:await caseNumber(), type, requesterId:uid(req.user),
      targetUserId:req.body?.targetUserId || null,
      resourceType:clean(req.body?.resourceType,80), resourceId:req.body?.resourceId || null,
      title, summary:clean(req.body?.summary,3000), status:"submitted",
      metadata:req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
      history:[{ status:"submitted", note:"Submitted for AIFT review", actorId:uid(req.user) }]
    });
    return res.status(201).json(review);
  }catch(error){
    console.error("CREATE REVIEW CASE ERROR:",error);
    return res.status(500).json({ message:"Could not create AIFT review case" });
  }
});

router.get("/mine", auth, async (req,res)=>{
  try{
    const cases=await ReviewCase.find({ requesterId:uid(req.user) }).sort({ createdAt:-1 }).lean();
    return res.json({ cases });
  }catch(error){ return res.status(500).json({ message:"Could not load review cases" }); }
});

router.get("/admin", auth, async (req,res)=>{
  try{
    if(req.user.role !== "admin") return res.status(403).json({ message:"Admin access required" });
    const query={};
    if(req.query.status && allowedStatuses.has(String(req.query.status))) query.status=String(req.query.status);
    if(req.query.type && allowedTypes.has(String(req.query.type))) query.type=String(req.query.type);
    const cases=await ReviewCase.find(query)
      .populate("requesterId","name role profileImage companyName schoolName")
      .populate("targetUserId","name role profileImage companyName schoolName")
      .populate("assignedTo","name role profileImage")
      .sort({ priority:-1, createdAt:1 }).limit(500).lean();
    return res.json({ cases, total:cases.length });
  }catch(error){ return res.status(500).json({ message:"Could not load AIFT Review Center" }); }
});

router.patch("/:id/admin", auth, async (req,res)=>{
  try{
    if(req.user.role !== "admin") return res.status(403).json({ message:"Admin access required" });
    const review=await ReviewCase.findById(req.params.id);
    if(!review) return res.status(404).json({ message:"Review case not found" });
    const status=clean(req.body?.status,40);
    if(status && !allowedStatuses.has(status)) return res.status(400).json({ message:"Invalid review status" });
    if(status){
      review.status=status;
      review.history.push({ status, note:clean(req.body?.note,1000), actorId:uid(req.user) });
      if(["approved","rejected","completed","cancelled"].includes(status)) review.resolvedAt=new Date();
      review.reviewedAt=new Date();
    }
    if(req.body?.priority && ["low","normal","high","urgent"].includes(req.body.priority)) review.priority=req.body.priority;
    if(Object.prototype.hasOwnProperty.call(req.body || {},"assignedTo")) review.assignedTo=req.body.assignedTo || null;
    if(Object.prototype.hasOwnProperty.call(req.body || {},"decisionNotes")) review.decisionNotes=clean(req.body.decisionNotes,3000);
    await review.save();
    await Notification.create({
      user:review.requesterId, type:"review_case", sender:uid(req.user),
      text:`AIFT Review ${review.caseNumber} is now ${review.status.replaceAll("_"," ")}.`,
      link:"/home.html"
    }).catch(()=>{});
    return res.json(review);
  }catch(error){
    console.error("UPDATE REVIEW CASE ERROR:",error);
    return res.status(500).json({ message:"Could not update review case" });
  }
});

module.exports=router;
