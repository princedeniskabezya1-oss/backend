const mongoose = require("mongoose");

const SchoolOpportunity = require("../models/SchoolOpportunity");
const InternshipApplication = require("../models/InternshipApplication");
const StudentIdentity = require("../models/StudentIdentity");
const User = require("../models/User");
const { queueInternshipApplication } = require("../services/aiftReviewWorkflow");

const STUDENT_ROLES = new Set(["student","talent"]);
const APPLY_TYPES = new Set(["internship","job","placement","project"]);
const LIVE_STATUSES = new Set(["approved","open","active"]);

function id(value){
  if(value && typeof value === "object") return String(value._id || value.id || "");
  return String(value || "");
}
function validId(value){ return mongoose.Types.ObjectId.isValid(id(value)); }
function text(value,max=5000){ return String(value ?? "").trim().slice(0,max); }
function bool(value){ return value === true || value === "true" || value === 1 || value === "1"; }
function role(req){ return text(req.user?.role,100).toLowerCase(); }
function userId(req){ return id(req.user?._id || req.user?.id); }
function dateOrNull(value){
  if(!value) return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function same(a,b){ return Boolean(id(a) && id(b) && id(a) === id(b)); }

function applicationProfile(opportunity){
  const offering=text(opportunity?.metadata?.offeringType,100).toLowerCase();
  const kind=text(opportunity?.metadata?.applicationKind,100).toLowerCase();

  if(kind.includes("graduate_program") || offering === "graduate_program") return "graduate_program";
  if(kind.includes("internship") || opportunity?.type === "internship") return "internship";
  if(kind.includes("project") || ["student_project","freelance_project","volunteer_project"].includes(offering)) return "project";
  if(kind.includes("placement") || ["apprenticeship","placement"].includes(offering)) return "placement";
  if(kind.includes("job") || opportunity?.type === "job") return "job";
  if(opportunity?.type === "project") return "project";
  if(opportunity?.type === "placement") return offering === "graduate_program" ? "graduate_program" : "placement";
  return "general";
}

async function buildPassportSnapshot(applicant,includePassport){
  if(!includePassport){
    return {included:false,verified:false,capturedAt:new Date()};
  }

  if(String(applicant.role || "").toLowerCase() !== "student"){
    const error=new Error("AIFT Passport is currently available to verified Student accounts.");
    error.status=409;
    throw error;
  }

  const identity=await StudentIdentity.findOne({studentId:applicant._id,status:"active"})
    .populate("schoolId","name schoolName role status")
    .lean();

  const controlledSchool=id(applicant.createdBySchool || applicant.linkedSchoolId);
  const identitySchool=id(identity?.schoolId);
  const schoolValid=identity?.schoolId?.role === "school" && identity?.schoolId?.status === "active";

  if(!identity || !controlledSchool || !same(controlledSchool,identitySchool) || !schoolValid){
    const error=new Error("Your AIFT Passport is not verified yet. Complete School verification or submit without the Passport.");
    error.status=409;
    throw error;
  }

  return {
    included:true,
    verified:true,
    aiftStudentId:text(identity.aiftStudentId,80),
    schoolId:identity.schoolId._id,
    schoolName:text(identity.schoolId.schoolName || identity.schoolId.name,250),
    program:text(applicant.course || applicant.program,250),
    yearLevel:text(applicant.yearLevel,120),
    verificationSource:text(identity.verificationSource,100),
    verifiedAt:identity.verifiedAt || null,
    capturedAt:new Date()
  };
}

async function applyToCareerOpportunity(req,res){
  try{
    if(!STUDENT_ROLES.has(role(req))){
      return res.status(403).json({success:false,message:"Only Student or Talent accounts can apply to Career Hub opportunities."});
    }

    if(!validId(req.params.id)){
      return res.status(400).json({success:false,message:"Invalid opportunity id."});
    }

    const [opportunity,applicant]=await Promise.all([
      SchoolOpportunity.findById(req.params.id).lean(),
      User.findById(userId(req)).select("_id role status name email course program yearLevel schoolId linkedSchoolId createdBySchool")
    ]);

    if(!opportunity) return res.status(404).json({success:false,message:"Opportunity not found."});
    if(!applicant || applicant.status === "deactivated") return res.status(401).json({success:false,message:"Student account could not be loaded."});
    if(!APPLY_TYPES.has(opportunity.type)) return res.status(400).json({success:false,message:"This opportunity does not use the Career Application path."});
    if(!LIVE_STATUSES.has(opportunity.status)) return res.status(409).json({success:false,message:"This opportunity is not accepting applications right now."});
    if(opportunity.allowStudentApplications === false) return res.status(403).json({success:false,message:"This opportunity only accepts School recommendations right now."});
    if(opportunity.deadline && new Date(opportunity.deadline) < new Date()) return res.status(409).json({success:false,message:"The application deadline has passed."});

    const existing=await InternshipApplication.findOne({opportunityId:opportunity._id,studentId:applicant._id}).lean();
    if(existing){
      return res.status(409).json({success:false,message:"You already have an application for this opportunity.",applicationId:existing._id,status:existing.status});
    }

    const profile=applicationProfile(opportunity);
    const passportSnapshot=await buildPassportSnapshot(applicant,bool(req.body.includePassport));
    const preferredStartDate=dateOrNull(req.body.preferredStartDate);
    const schoolId=id(applicant.linkedSchoolId || applicant.schoolId || opportunity.schoolId) || null;
    const now=new Date();

    const application=await InternshipApplication.create({
      opportunityId:opportunity._id,
      studentId:applicant._id,
      schoolId,
      companyId:id(opportunity.employerId) || null,
      status:"pending",
      source:"student",
      applicationProfile:profile,
      message:text(req.body.message,5000),
      coverLetter:text(req.body.coverLetter,10000),
      resumeUrl:text(req.body.resumeUrl,2000),
      portfolioUrl:text(req.body.portfolioUrl,2000),
      answers:{
        motivation:text(req.body.motivation,6000),
        availability:text(req.body.availability,1500),
        projectProposal:text(req.body.projectProposal,8000),
        workSampleUrl:text(req.body.workSampleUrl,2000),
        expectedGraduation:text(req.body.expectedGraduation,120),
        preferredStartDate
      },
      passportSnapshot,
      createdBy:applicant._id,
      updatedBy:applicant._id,
      statusHistory:[{
        status:"pending",
        changedBy:applicant._id,
        changedByRole:role(req),
        note:`${profile.replaceAll("_"," ")} application submitted through Student Career Hub.`,
        changedAt:now
      }]
    });

    await SchoolOpportunity.updateOne({_id:opportunity._id},{$inc:{applicationCount:1}});

    const reviewCase=await queueInternshipApplication({application,opportunity,actor:req.user});

    const populated=await InternshipApplication.findById(application._id)
      .populate("opportunityId","title type status companyName employerId schoolId workSetup location deadline description summary metadata")
      .populate("companyId","name companyName logo profileImage")
      .populate("schoolId","name schoolName schoolLogo profileImage")
      .lean();

    return res.status(202).json({
      success:true,
      application:populated,
      item:populated,
      reviewCase,
      reviewStatus:reviewCase?.status || "submitted",
      message:"Application submitted to AIFT Review. You can track it from My Applications."
    });
  }catch(error){
    console.error("STUDENT CAREER APPLY ERROR:",error);
    if(error?.status) return res.status(error.status).json({success:false,message:error.message});
    if(error?.code === 11000) return res.status(409).json({success:false,message:"You already have an application for this opportunity."});
    if(error?.name === "ValidationError") return res.status(400).json({success:false,message:error.message});
    return res.status(500).json({success:false,message:"AIFT could not submit this application."});
  }
}

module.exports={applyToCareerOpportunity};
