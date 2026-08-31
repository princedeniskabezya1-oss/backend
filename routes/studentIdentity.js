const express = require("express");
const crypto = require("crypto");
const auth = require("../middleware/auth");
const User = require("../models/User");
const StudentIdentity = require("../models/StudentIdentity");

const router = express.Router();

function getUserId(user){ return user?._id || user?.id; }
function clean(value,max=100){ return String(value || "").trim().slice(0,max); }

function getVerifiedSchoolId(student){
  if(student.createdBySchool) return student.createdBySchool;
  if(student.linkedSchoolId) return student.linkedSchoolId;
  if(student.schoolId) return student.schoolId;
  return null;
}

function getVerificationSource(student){
  if(student.createdBySchool) return "created_by_school";
  return "school_linked";
}

async function createUniqueAiftStudentId(){
  for(let attempt = 0; attempt < 12; attempt += 1){
    const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
    const value = `AIFT-STU-${suffix}`;
    if(!(await StudentIdentity.exists({ aiftStudentId:value }))) return value;
  }
  throw new Error("Could not generate a unique AIFT Student ID");
}

async function ensureIdentity(student){
  let identity = await StudentIdentity.findOne({ studentId:student._id });
  const schoolId = getVerifiedSchoolId(student);

  if(!schoolId){
    if(identity?.status === "active"){
      identity.status = "revoked";
      identity.revokedAt = new Date();
      identity.revokedReason = "Student is no longer linked to a verified school";
      await identity.save();
    }
    return null;
  }

  if(identity){
    if(identity.status !== "active" || String(identity.schoolId) !== String(schoolId)){
      identity.schoolId = schoolId;
      identity.verificationSource = getVerificationSource(student);
      identity.status = "active";
      identity.verifiedAt = new Date();
      identity.revokedAt = null;
      identity.revokedReason = "";
      await identity.save();
    }
    return identity;
  }

  return StudentIdentity.create({
    studentId:student._id,
    aiftStudentId:await createUniqueAiftStudentId(),
    schoolId,
    verificationSource:getVerificationSource(student),
    verifiedAt:new Date(),
    status:"active"
  });
}

router.get("/me", auth, async (req,res) => {
  try{
    if(req.user.role !== "student") return res.status(403).json({ message:"Student account required" });

    const student = await User.findById(getUserId(req.user))
      .select("_id name profileImage role schoolId linkedSchoolId createdBySchool course yearLevel status");

    if(!student || student.status === "deactivated") return res.status(404).json({ message:"Student account not found" });

    const identity = await ensureIdentity(student);
    if(!identity){
      return res.status(403).json({
        message:"AIFT Student ID is available only after school verification",
        verified:false,
        identity:null
      });
    }

    await identity.populate("schoolId", "name schoolName schoolLogo profileImage");
    return res.json({ verified:true, identity });
  }catch(error){
    console.error("GET STUDENT IDENTITY ERROR:",error);
    return res.status(500).json({ message:"Could not load AIFT Student ID" });
  }
});

router.get("/lookup/:aiftStudentId", auth, async (req,res) => {
  try{
    if(!["family","school","employer","admin"].includes(req.user.role)){
      return res.status(403).json({ message:"AIFT Student ID lookup is not available for this account" });
    }

    const aiftStudentId = clean(req.params.aiftStudentId,50).toUpperCase();
    if(!/^AIFT-STU-[A-F0-9]{10}$/.test(aiftStudentId)){
      return res.status(400).json({ message:"Invalid AIFT Student ID format" });
    }

    const identity = await StudentIdentity.findOne({ aiftStudentId, status:"active" })
      .populate("studentId", "name profileImage course yearLevel role status")
      .populate("schoolId", "name schoolName schoolLogo profileImage")
      .lean();

    if(!identity || identity.studentId?.role !== "student" || identity.studentId?.status !== "active"){
      return res.status(404).json({ message:"Verified AIFT Student ID not found" });
    }

    return res.json({
      verified:true,
      identity:{
        aiftStudentId:identity.aiftStudentId,
        verifiedAt:identity.verifiedAt,
        verificationSource:identity.verificationSource,
        student:{
          _id:identity.studentId._id,
          name:identity.studentId.name,
          profileImage:identity.studentId.profileImage,
          course:identity.studentId.course,
          yearLevel:identity.studentId.yearLevel
        },
        school:identity.schoolId || null
      }
    });
  }catch(error){
    console.error("LOOKUP STUDENT IDENTITY ERROR:",error);
    return res.status(500).json({ message:"Could not verify AIFT Student ID" });
  }
});

router.get("/school/students", auth, async (req,res) => {
  try{
    if(!["school","admin"].includes(req.user.role)) return res.status(403).json({ message:"School access required" });

    const query = req.user.role === "admin" ? {} : { schoolId:getUserId(req.user) };
    const identities = await StudentIdentity.find({ ...query, status:"active" })
      .populate("studentId", "name profileImage course yearLevel schoolId linkedSchoolId status")
      .sort({ createdAt:-1 })
      .lean();

    return res.json({ identities:identities.filter(item => item.studentId?.status === "active") });
  }catch(error){
    console.error("GET SCHOOL STUDENT IDENTITIES ERROR:",error);
    return res.status(500).json({ message:"Could not load AIFT Student IDs" });
  }
});

module.exports = router;
