const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const FamilyChild = require("../models/FamilyChild");
const StudentIdentity = require("../models/StudentIdentity");
const FamilyStudentLinkRequest = require("../models/FamilyStudentLinkRequest");
const Notification = require("../models/Notification");

const router = express.Router();

function userId(user){ return user?._id || user?.id; }
function clean(value,max=100){ return String(value || "").trim().slice(0,max); }

async function expireRequests(query){
  await FamilyStudentLinkRequest.updateMany(
    { ...query, status:"pending", expiresAt:{ $lte:new Date() } },
    { $set:{ status:"expired", respondedAt:new Date() } }
  );
}

router.get("/family", auth, async (req,res) => {
  try{
    if(req.user.role !== "family") return res.status(403).json({ message:"Family account required" });
    await expireRequests({ familyId:userId(req.user) });
    const requests = await FamilyStudentLinkRequest.find({ familyId:userId(req.user) })
      .populate("familyChildId", "firstName lastName profileImage linkStatus linkedStudentId")
      .populate("studentId", "name profileImage course yearLevel")
      .populate({ path:"studentIdentityId", select:"aiftStudentId schoolId verifiedAt", populate:{ path:"schoolId", select:"name schoolName schoolLogo profileImage" } })
      .sort({ createdAt:-1 })
      .lean();
    return res.json({ requests });
  }catch(error){
    console.error("GET FAMILY LINK REQUESTS ERROR:",error);
    return res.status(500).json({ message:"Could not load family connection requests" });
  }
});

router.post("/request", auth, async (req,res) => {
  try{
    if(req.user.role !== "family") return res.status(403).json({ message:"Family account required" });

    const familyChildId = clean(req.body?.familyChildId,50);
    const aiftStudentId = clean(req.body?.aiftStudentId,50).toUpperCase();
    const relationshipType = clean(req.body?.relationshipType,30);
    const allowedRelationships = new Set(["parent","guardian","sibling","family_member","other"]);

    if(!familyChildId || !/^AIFT-STU-[A-F0-9]{10}$/.test(aiftStudentId) || !allowedRelationships.has(relationshipType)){
      return res.status(400).json({ message:"Child, valid AIFT Student ID and relationship are required" });
    }

    const child = await FamilyChild.findOne({ _id:familyChildId, familyId:userId(req.user), status:{ $ne:"archived" } });
    if(!child) return res.status(404).json({ message:"Family child profile not found" });
    if(child.linkStatus === "linked") return res.status(409).json({ message:"This child is already linked" });

    const identity = await StudentIdentity.findOne({ aiftStudentId, status:"active" });
    if(!identity) return res.status(404).json({ message:"Verified AIFT Student ID not found" });

    const student = await User.findOne({ _id:identity.studentId, role:"student", status:"active" }).select("_id name");
    if(!student) return res.status(404).json({ message:"Verified student account not found" });

    await expireRequests({ familyId:userId(req.user), familyChildId:child._id });
    const existing = await FamilyStudentLinkRequest.findOne({ familyId:userId(req.user), familyChildId:child._id, status:"pending" });
    if(existing) return res.status(409).json({ message:"This child already has a pending connection request" });

    const request = await FamilyStudentLinkRequest.create({
      familyId:userId(req.user), familyChildId:child._id, studentId:student._id,
      studentIdentityId:identity._id, relationshipType, status:"pending",
      expiresAt:new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    });

    child.linkStatus = "pending";
    child.linkedStudentId = null;
    await child.save();

    await Notification.create({
      user:student._id, type:"family_link_request", sender:userId(req.user),
      text:`A Family account requested to connect as your ${relationshipType.replaceAll("_"," ")}. Review the request before sharing Family access.`,
      link:`/student.html?section=notifications&familyLinkRequest=${request._id}`
    });

    return res.status(201).json({ message:"Connection request sent to the student", request });
  }catch(error){
    console.error("CREATE FAMILY STUDENT LINK REQUEST ERROR:",error);
    return res.status(500).json({ message:"Could not send family connection request" });
  }
});

router.patch("/:id/cancel", auth, async (req,res) => {
  try{
    if(req.user.role !== "family") return res.status(403).json({ message:"Family account required" });
    const request = await FamilyStudentLinkRequest.findOne({ _id:req.params.id, familyId:userId(req.user), status:"pending" });
    if(!request) return res.status(404).json({ message:"Pending connection request not found" });
    request.status = "cancelled";
    request.respondedAt = new Date();
    await request.save();
    await FamilyChild.updateOne({ _id:request.familyChildId, familyId:request.familyId, linkStatus:"pending" }, { $set:{ linkStatus:"unlinked", linkedStudentId:null } });
    return res.json({ message:"Connection request cancelled" });
  }catch(error){
    console.error("CANCEL FAMILY STUDENT LINK ERROR:",error);
    return res.status(500).json({ message:"Could not cancel family connection request" });
  }
});

router.get("/student/pending", auth, async (req,res) => {
  try{
    if(req.user.role !== "student") return res.status(403).json({ message:"Student account required" });
    await expireRequests({ studentId:userId(req.user) });
    const requests = await FamilyStudentLinkRequest.find({ studentId:userId(req.user), status:"pending" })
      .populate("familyId", "name profileImage")
      .populate("familyChildId", "firstName lastName profileImage")
      .sort({ createdAt:-1 }).lean();
    return res.json({ requests });
  }catch(error){
    console.error("GET STUDENT FAMILY LINK REQUESTS ERROR:",error);
    return res.status(500).json({ message:"Could not load family connection requests" });
  }
});

router.get("/student/active", auth, async (req,res) => {
  try{
    if(req.user.role !== "student") return res.status(403).json({ message:"Student account required" });
    const requests = await FamilyStudentLinkRequest.find({ studentId:userId(req.user), status:"accepted" })
      .populate("familyId", "name profileImage")
      .populate("familyChildId", "firstName lastName profileImage")
      .sort({ respondedAt:-1 }).lean();
    return res.json({ requests });
  }catch(error){
    console.error("GET ACTIVE FAMILY LINKS ERROR:",error);
    return res.status(500).json({ message:"Could not load active family connections" });
  }
});

router.patch("/:id/respond", auth, async (req,res) => {
  try{
    if(req.user.role !== "student") return res.status(403).json({ message:"Student account required" });
    const decision = clean(req.body?.decision,20);
    if(!["accept","decline"].includes(decision)) return res.status(400).json({ message:"Decision must be accept or decline" });

    const request = await FamilyStudentLinkRequest.findOne({ _id:req.params.id, studentId:userId(req.user), status:"pending" });
    if(!request) return res.status(404).json({ message:"Pending family connection request not found" });
    if(request.expiresAt <= new Date()){
      request.status = "expired"; request.respondedAt = new Date(); await request.save();
      await FamilyChild.updateOne({ _id:request.familyChildId, familyId:request.familyId, linkStatus:"pending" }, { $set:{ linkStatus:"unlinked", linkedStudentId:null } });
      return res.status(410).json({ message:"This family connection request has expired" });
    }

    if(decision === "accept"){
      const conflict = await FamilyChild.exists({ familyId:request.familyId, linkedStudentId:userId(req.user), _id:{ $ne:request.familyChildId }, status:{ $ne:"archived" } });
      if(conflict) return res.status(409).json({ message:"This student is already linked in that Family account" });
    }

    request.status = decision === "accept" ? "accepted" : "declined";
    request.respondedAt = new Date();
    await request.save();

    const child = await FamilyChild.findOne({ _id:request.familyChildId, familyId:request.familyId });
    if(child){
      child.linkedStudentId = decision === "accept" ? userId(req.user) : null;
      child.linkStatus = decision === "accept" ? "linked" : "unlinked";
      await child.save();
    }

    await Notification.create({
      user:request.familyId,
      type:decision === "accept" ? "family_link_accepted" : "family_link_declined",
      sender:userId(req.user),
      text:decision === "accept" ? "Your AIFT student connection request was accepted." : "Your AIFT student connection request was declined.",
      link:"/family.html"
    });

    return res.json({ message:decision === "accept" ? "Family connection accepted" : "Family connection declined", request });
  }catch(error){
    console.error("RESPOND FAMILY STUDENT LINK ERROR:",error);
    return res.status(500).json({ message:"Could not update family connection request" });
  }
});

router.patch("/:id/revoke", auth, async (req,res) => {
  try{
    if(req.user.role !== "student") return res.status(403).json({ message:"Student account required" });
    const request = await FamilyStudentLinkRequest.findOne({ _id:req.params.id, studentId:userId(req.user), status:"accepted" });
    if(!request) return res.status(404).json({ message:"Active family connection not found" });

    request.status = "revoked"; request.revokedAt = new Date(); await request.save();
    await FamilyChild.updateOne({ _id:request.familyChildId, familyId:request.familyId, linkedStudentId:userId(req.user) }, { $set:{ linkedStudentId:null, linkStatus:"unlinked" } });
    await Notification.create({ user:request.familyId, type:"family_link_revoked", sender:userId(req.user), text:"An AIFT student revoked a Family account connection.", link:"/family.html" });
    return res.json({ message:"Family connection revoked" });
  }catch(error){
    console.error("REVOKE FAMILY STUDENT LINK ERROR:",error);
    return res.status(500).json({ message:"Could not revoke family connection" });
  }
});

module.exports = router;
