const express = require("express");
const crypto = require("crypto");
const auth = require("../middleware/auth");
const User = require("../models/User");
const StudentIdentity = require("../models/StudentIdentity");

const router = express.Router();

function getUserId(user){
  return user?._id || user?.id;
}

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
  for(let attempt = 0; attempt < 10; attempt += 1){
    const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
    const value = `AIFT-STU-${suffix}`;
    const exists = await StudentIdentity.exists({ aiftStudentId:value });
    if(!exists) return value;
  }
  throw new Error("Could not generate a unique AIFT Student ID");
}

async function ensureIdentity(student){
  let identity = await StudentIdentity.findOne({ studentId:student._id });
  if(identity) return identity;

  const schoolId = getVerifiedSchoolId(student);
  if(!schoolId) return null;

  identity = await StudentIdentity.create({
    studentId:student._id,
    aiftStudentId:await createUniqueAiftStudentId(),
    schoolId,
    verificationSource:getVerificationSource(student),
    verifiedAt:new Date(),
    status:"active"
  });

  return identity;
}

router.get("/me", auth, async (req,res) => {
  try{
    if(req.user.role !== "student"){
      return res.status(403).json({ message:"Student account required" });
    }

    const student = await User.findById(getUserId(req.user))
      .select("_id name profileImage role schoolId linkedSchoolId createdBySchool course yearLevel status");

    if(!student || student.status === "deactivated"){
      return res.status(404).json({ message:"Student account not found" });
    }

    const identity = await ensureIdentity(student);
    if(!identity){
      return res.status(403).json({
        message:"AIFT Student ID is available only after school verification",
        verified:false,
        identity:null
      });
    }

    await identity.populate("schoolId", "name schoolName schoolLogo profileImage");

    return res.json({ verified:identity.status === "active", identity });
  }catch(error){
    console.error("GET STUDENT IDENTITY ERROR:",error);
    return res.status(500).json({ message:"Could not load AIFT Student ID" });
  }
});

router.get("/school/students", auth, async (req,res) => {
  try{
    if(!["school","admin"].includes(req.user.role)){
      return res.status(403).json({ message:"School access required" });
    }

    const query = req.user.role === "admin" ? {} : { schoolId:getUserId(req.user) };
    const identities = await StudentIdentity.find({ ...query, status:"active" })
      .populate("studentId", "name profileImage course yearLevel schoolId linkedSchoolId")
      .sort({ createdAt:-1 })
      .lean();

    return res.json({ identities });
  }catch(error){
    console.error("GET SCHOOL STUDENT IDENTITIES ERROR:",error);
    return res.status(500).json({ message:"Could not load AIFT Student IDs" });
  }
});

module.exports = router;
