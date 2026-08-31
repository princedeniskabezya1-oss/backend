const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const AiftReviewTicket = require("../models/AiftReviewTicket");
const Notification = require("../models/Notification");

const router = express.Router();

const CATEGORIES = new Set(["venture","scholarship","internship","partnership","investment","career_event","opportunity","other"]);
const ACTIONS = new Set(["publish_request","application","interest","funding_commitment","partnership_request","verification","other"]);
const STATUSES = new Set(["submitted","in_review","needs_information","approved","rejected","matched","meeting","completed","cancelled"]);

function uid(user){ return user?._id || user?.id; }
function clean(value,max=500){ return String(value || "").trim().slice(0,max); }
function validId(value){ return mongoose.Types.ObjectId.isValid(String(value || "")); }
function requireAdmin(req,res,next){
  if(req.user?.role !== "admin") return res.status(403).json({ message:"AIFT Admin access required" });
  next();
}
function ticketNumber(){
  const date = new Date().toISOString().slice(0,10).replaceAll("-","");
  return `AIFT-${date}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

router.post("/", auth, async (req,res) => {
  try{
    const category = clean(req.body?.category,40);
    const action = clean(req.body?.action,60);
    const resourceType = clean(req.body?.resourceType,80);
    const resourceId = clean(req.body?.resourceId,50);
    const title = clean(req.body?.title,240);

    if(!CATEGORIES.has(category) || !ACTIONS.has(action) || !resourceType || !validId(resourceId) || !title){
      return res.status(400).json({ message:"Valid review category, action, resource and title are required" });
    }

    const existing = await AiftReviewTicket.findOne({
      requesterId:uid(req.user), resourceType, resourceId, action,
      status:{ $in:["submitted","in_review","needs_information","approved","matched","meeting"] }
    });
    if(existing) return res.status(409).json({ message:"An active AIFT review already exists for this request", ticket:existing });

    const ticket = await AiftReviewTicket.create({
      ticketNumber:ticketNumber(),
      category,
      action,
      requesterId:uid(req.user),
      targetUserId:validId(req.body?.targetUserId) ? req.body.targetUserId : null,
      resourceType,
      resourceId,
      title,
      summary:clean(req.body?.summary,3000),
      priority:"normal",
      status:"submitted",
      checklist:Array.isArray(req.body?.checklist)
        ? req.body.checklist.slice(0,20).map(item => ({ key:clean(item?.key,80), label:clean(item?.label,180), status:"pending" })).filter(item => item.key && item.label)
        : [],
      history:[{ status:"submitted", note:"Submitted for AIFT verification", actorId:uid(req.user) }],
      metadata:req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
    });

    await Notification.create({
      user:uid(req.user),
      type:"review_submitted",
      text:`${ticket.ticketNumber}: ${title} is now under AIFT review.`,
      link:`/review-status.html?ticket=${ticket._id}`
    });

    return res.status(201).json({ message:"Submitted to AIFT Review Center", ticket });
  }catch(error){
    console.error("CREATE AIFT REVIEW TICKET ERROR:",error);
    return res.status(500).json({ message:"Could not create AIFT review ticket" });
  }
});

router.get("/mine", auth, async (req,res) => {
  try{
    const tickets = await AiftReviewTicket.find({ requesterId:uid(req.user) })
      .populate("assignedTo","name profileImage role")
      .sort({ updatedAt:-1 })
      .lean();
    return res.json({ tickets });
  }catch(error){
    return res.status(500).json({ message:"Could not load review tickets" });
  }
});

router.get("/admin", auth, requireAdmin, async (req,res) => {
  try{
    const query = {};
    if(STATUSES.has(clean(req.query.status,40))) query.status = clean(req.query.status,40);
    if(CATEGORIES.has(clean(req.query.category,40))) query.category = clean(req.query.category,40);
    const tickets = await AiftReviewTicket.find(query)
      .populate("requesterId","name email role profileImage companyName schoolName")
      .populate("targetUserId","name role profileImage companyName schoolName")
      .populate("assignedTo","name role profileImage")
      .sort({ priority:-1, createdAt:1 })
      .limit(500)
      .lean();
    return res.json({ tickets, total:tickets.length });
  }catch(error){
    return res.status(500).json({ message:"Could not load AIFT Review Center" });
  }
});

router.patch("/:id", auth, requireAdmin, async (req,res) => {
  try{
    const ticket = await AiftReviewTicket.findById(req.params.id);
    if(!ticket) return res.status(404).json({ message:"Review ticket not found" });

    const nextStatus = clean(req.body?.status,40);
    if(nextStatus && !STATUSES.has(nextStatus)) return res.status(400).json({ message:"Invalid review status" });

    if(nextStatus){
      ticket.status = nextStatus;
      ticket.history.push({ status:nextStatus, note:clean(req.body?.note,1000), actorId:uid(req.user) });
      if(["approved","rejected"].includes(nextStatus)) ticket.reviewedAt = new Date();
      if(nextStatus === "completed") ticket.completedAt = new Date();
    }
    if(Object.prototype.hasOwnProperty.call(req.body || {},"reviewNotes")) ticket.reviewNotes = clean(req.body.reviewNotes,5000);
    if(Object.prototype.hasOwnProperty.call(req.body || {},"assignedTo")) ticket.assignedTo = validId(req.body.assignedTo) ? req.body.assignedTo : null;
    await ticket.save();

    if(nextStatus){
      const type = nextStatus === "approved" ? "review_approved" : nextStatus === "rejected" ? "review_rejected" : nextStatus === "needs_information" ? "review_needs_information" : "review_case";
      await Notification.create({
        user:ticket.requesterId,
        sender:uid(req.user),
        type,
        text:`${ticket.ticketNumber}: ${ticket.title} — ${nextStatus.replaceAll("_"," ")}.`,
        link:`/review-status.html?ticket=${ticket._id}`
      });
    }

    return res.json({ message:"Review ticket updated", ticket });
  }catch(error){
    console.error("UPDATE AIFT REVIEW TICKET ERROR:",error);
    return res.status(500).json({ message:"Could not update review ticket" });
  }
});

module.exports = router;
