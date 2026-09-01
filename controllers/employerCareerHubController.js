const mongoose = require("mongoose");

const User = require("../models/User");
const SchoolOpportunity = require("../models/SchoolOpportunity");
const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");
const CampusRecruitmentCampaign = require("../models/CampusRecruitmentCampaign");

const {
  queueOpportunityPublish,
  queuePartnership
} = require("../services/aiftReviewWorkflow");

const COMPANY_ROLES = new Set(["employer","company"]);
const ACTIVE_PARTNERSHIP_STATUSES = new Set(["approved","active"]);

const OFFERING_MAP = {
  job:{type:"job",employmentType:"full_time",audiences:["talent","job_seekers","graduates"],applicationKind:"job_application"},
  internship:{type:"internship",employmentType:"internship",audiences:["students","graduates"],applicationKind:"internship_application"},
  student_project:{type:"project",employmentType:"project",audiences:["students"],applicationKind:"project_application"},
  freelance_project:{type:"project",employmentType:"contract",audiences:["talent","job_seekers"],applicationKind:"project_application"},
  graduate_program:{type:"placement",employmentType:"full_time",audiences:["graduates","talent"],applicationKind:"graduate_program_application"},
  apprenticeship:{type:"placement",employmentType:"temporary",audiences:["students","graduates"],applicationKind:"placement_application"},
  volunteer_project:{type:"project",employmentType:"volunteer",audiences:["students","talent","job_seekers"],applicationKind:"project_application"}
};

const CAMPUS_PURPOSE_MAP = {
  recruit_students:{campaignType:"campus_hiring",audiences:["students","graduates"],callToAction:"apply"},
  offer_internships:{campaignType:"internship_recruitment",audiences:["students","graduates"],callToAction:"apply"},
  graduate_recruitment:{campaignType:"graduate_recruitment",audiences:["graduates","alumni","talent"],callToAction:"apply"},
  offer_jobs:{campaignType:"hiring_drive",audiences:["graduates","alumni","talent","job_seekers"],callToAction:"apply"},
  student_project:{campaignType:"student_project",audiences:["students"],callToAction:"join_project"},
  project_challenge:{campaignType:"project_challenge",audiences:["students","graduates"],callToAction:"join_project"},
  career_fair:{campaignType:"career_fair",audiences:["students","graduates","alumni"],callToAction:"attend"},
  training_workshop:{campaignType:"training_workshop",audiences:["students","graduates"],callToAction:"register"},
  company_talk:{campaignType:"company_talk",audiences:["students","graduates"],callToAction:"register"},
  assessment_day:{campaignType:"assessment_drive",audiences:["students","graduates","talent"],callToAction:"register"},
  interview_day:{campaignType:"interview_day",audiences:["students","graduates","talent"],callToAction:"register"},
  talent_pipeline:{campaignType:"talent_pipeline",audiences:["students","graduates","talent"],callToAction:"apply"}
};

function id(value){
  if(value && typeof value === "object") return String(value._id || value.id || "");
  return String(value || "");
}
function role(req){ return String(req.user?.role || "").trim().toLowerCase(); }
function userId(req){ return id(req.user?._id || req.user?.id); }
function validId(value){ return mongoose.Types.ObjectId.isValid(id(value)); }
function text(value,max=5000){ return String(value ?? "").trim().slice(0,max); }
function list(value,max=300){
  const source=Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(source.map(item=>text(item,max)).filter(Boolean))].slice(0,100);
}
function bool(value,fallback=false){
  if(value === undefined || value === null || value === "") return fallback;
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}
function numberOrNull(value){
  if(value === "" || value === undefined || value === null) return null;
  const number=Number(value);
  return Number.isFinite(number) ? number : null;
}
function dateOrNull(value){
  if(!value) return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function normalizeWorkSetup(value){
  const normalized=String(value || "unspecified").trim().toLowerCase().replace(/[^a-z]+/g,"_").replace(/^_|_$/g,"");
  const aliases={on_site:"onsite",in_person:"onsite",virtual:"remote"};
  const chosen=aliases[normalized] || normalized;
  return ["onsite","remote","hybrid","flexible","unspecified"].includes(chosen) ? chosen : "unspecified";
}
function normalizeEmploymentType(value,fallback){
  const normalized=String(value || fallback || "unspecified").trim().toLowerCase().replace(/[^a-z]+/g,"_").replace(/^_|_$/g,"");
  const aliases={fulltime:"full_time",parttime:"part_time",freelance:"contract"};
  const chosen=aliases[normalized] || normalized;
  return ["full_time","part_time","contract","temporary","internship","project","volunteer","unspecified"].includes(chosen) ? chosen : fallback;
}
function normalizeCompensation(value){
  const normalized=String(value || "not_specified").trim().toLowerCase().replace(/[^a-z]+/g,"_").replace(/^_|_$/g,"");
  return ["paid","unpaid","allowance","salary","stipend","negotiable","not_specified"].includes(normalized) ? normalized : "not_specified";
}
function ensureCompany(req,res){
  if(!COMPANY_ROLES.has(role(req)) && role(req) !== "admin"){
    res.status(403).json({success:false,message:"Only Employer accounts can use this Employer Career Hub action."});
    return false;
  }
  return true;
}

async function createEmployerOpportunity(req,res){
  try{
    if(!ensureCompany(req,res)) return;
    const owner=role(req) === "admin" ? id(req.body.companyId || req.body.employerId) : userId(req);
    if(!validId(owner)) return res.status(400).json({success:false,message:"A valid Employer account is required."});

    const offeringKey=String(req.body.offeringType || "job").trim().toLowerCase();
    const config=OFFERING_MAP[offeringKey];
    if(!config) return res.status(400).json({success:false,message:"Choose a valid opportunity type."});

    const title=text(req.body.title,220);
    const description=text(req.body.description,12000);
    if(!title) return res.status(400).json({success:false,message:"Add a clear opportunity title."});
    if(!description) return res.status(400).json({success:false,message:"Add a short description of what the person will do."});

    const requestedAudiences=list(req.body.targetAudiences,80).filter(item=>
      ["students","graduates","talent","job_seekers","experienced_professionals"].includes(item)
    );
    const audiences=requestedAudiences.length ? requestedAudiences : config.audiences;

    const educationRelevant=audiences.some(item=>["students","graduates"].includes(item)) ||
      ["internship","student_project","graduate_program","apprenticeship"].includes(offeringKey);

    const programs=educationRelevant ? list(req.body.programs,160) : [];
    const yearLevels=educationRelevant ? list(req.body.yearLevels,100) : [];

    let employmentType=normalizeEmploymentType(req.body.employmentType,config.employmentType);
    if(offeringKey === "internship") employmentType="internship";
    if(offeringKey === "student_project") employmentType="project";
    if(offeringKey === "freelance_project") employmentType="contract";

    const startDate=dateOrNull(req.body.startDate);
    const endDate=dateOrNull(req.body.endDate);
    const deadline=dateOrNull(req.body.deadline);
    if(startDate && endDate && endDate < startDate){
      return res.status(400).json({success:false,message:"End date must be after the start date."});
    }

    const company=await User.findById(owner).select("companyName name").lean();
    if(!company) return res.status(404).json({success:false,message:"Employer account not found."});

    const opportunity=await SchoolOpportunity.create({
      schoolId:null,
      employerId:owner,
      createdBy:userId(req),
      updatedBy:userId(req),
      source:"employer",
      title,
      companyName:text(company.companyName || company.name,220),
      summary:text(req.body.summary || description,1000),
      description,
      type:config.type,
      status:"pending",
      visibility:"public",
      location:text(req.body.location,500),
      workSetup:normalizeWorkSetup(req.body.workSetup),
      employmentType,
      slots:numberOrNull(req.body.slots),
      durationText:text(req.body.durationText,250),
      startDate,
      endDate,
      deadline,
      programs,
      skills:list(req.body.skills,160),
      yearLevels,
      requirements:list(req.body.requirements,1000),
      responsibilities:list(req.body.responsibilities,1000),
      applicationInstructions:text(req.body.applicationInstructions,5000),
      allowStudentApplications:bool(req.body.allowDirectApplications,true),
      allowSchoolRecommendations:educationRelevant && bool(req.body.allowSchoolRecommendations,true),
      compensation:{
        type:normalizeCompensation(req.body.compensationType),
        amount:numberOrNull(req.body.compensationAmount),
        minAmount:numberOrNull(req.body.compensationMin),
        maxAmount:numberOrNull(req.body.compensationMax),
        currency:text(req.body.currency || "PHP",10).toUpperCase(),
        period:["hour","day","week","month","project","one_time"].includes(req.body.compensationPeriod) ? req.body.compensationPeriod : "unspecified",
        notes:text(req.body.compensationNotes,1000)
      },
      metadata:{
        ...(req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
        employerCareerHubVersion:2,
        offeringType:offeringKey,
        applicationKind:config.applicationKind,
        targetAudiences:audiences,
        educationRelevant,
        roleCategory:text(req.body.roleCategory,180),
        experienceLevel:text(req.body.experienceLevel,120),
        projectOutcome:text(req.body.projectOutcome,1000)
      }
    });

    const reviewCase=await queueOpportunityPublish({opportunity,actor:req.user});
    return res.status(202).json({
      success:true,
      opportunity,
      item:opportunity,
      reviewCase,
      message:"Opportunity submitted to AIFT Review. Applications open after publication approval."
    });
  }catch(error){
    console.error("CREATE EMPLOYER SMART OPPORTUNITY ERROR:",error);
    return res.status(error?.name === "ValidationError" ? 400 : 500).json({
      success:false,
      message:error?.name === "ValidationError" ? error.message : "Unable to create the Employer opportunity."
    });
  }
}

async function listCompanyPartnerships(req,res){
  try{
    if(!ensureCompany(req,res)) return;
    const companyId=role(req) === "admin" && validId(req.query.companyId) ? id(req.query.companyId) : userId(req);
    const partnerships=await SchoolCompanyPartnership.find({
      relationshipKind:"company_company",
      $or:[{companyId},{partnerCompanyId:companyId}]
    })
      .populate("companyId","name companyName logo profileImage industry location")
      .populate("partnerCompanyId","name companyName logo profileImage industry location")
      .sort({lastActivityAt:-1,createdAt:-1})
      .lean();

    return res.json({success:true,partnerships,items:partnerships});
  }catch(error){
    console.error("LIST COMPANY PARTNERSHIPS ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to load company partnerships."});
  }
}

async function createCompanyPartnership(req,res){
  try{
    if(!ensureCompany(req,res)) return;
    const companyId=role(req) === "admin" ? id(req.body.companyId) : userId(req);
    const partnerCompanyId=id(req.body.partnerCompanyId);
    if(!validId(companyId) || !validId(partnerCompanyId)){
      return res.status(400).json({success:false,message:"Choose a valid company partner."});
    }
    if(companyId === partnerCompanyId){
      return res.status(400).json({success:false,message:"Choose another company as the partnership recipient."});
    }

    const [company,partner]=await Promise.all([
      User.findById(companyId).select("role name companyName").lean(),
      User.findById(partnerCompanyId).select("role name companyName").lean()
    ]);
    if(!company || !partner) return res.status(404).json({success:false,message:"One of the company accounts could not be found."});
    if(!COMPANY_ROLES.has(String(partner.role || "").toLowerCase())){
      return res.status(400).json({success:false,message:"The selected organization is not a company account."});
    }

    const type=String(req.body.type || "collaboration").toLowerCase();
    const validTypes=["internship_partnership","job_placement","recruitment","training","collaboration","career_event","scholarship","research","mentorship","industry_linkage"];
    if(!validTypes.includes(type)) return res.status(400).json({success:false,message:"Choose a valid partnership purpose."});

    const existing=await SchoolCompanyPartnership.findOne({
      relationshipKind:"company_company",
      type,
      status:{$in:["draft","pending","review","approved","active","paused"]},
      $or:[
        {companyId,partnerCompanyId},
        {companyId:partnerCompanyId,partnerCompanyId:companyId}
      ]
    }).lean();
    if(existing){
      return res.status(409).json({success:false,message:"A live partnership process already exists between these companies for this purpose.",partnershipId:existing._id,status:existing.status});
    }

    const capabilities=req.body.capabilities && typeof req.body.capabilities === "object" ? req.body.capabilities : {};
    const partnership=await SchoolCompanyPartnership.create({
      relationshipKind:"company_company",
      schoolId:null,
      companyId,
      partnerCompanyId,
      companyName:text(company.companyName || company.name,250),
      partnerCompanyName:text(partner.companyName || partner.name,250),
      title:text(req.body.title || `${company.companyName || company.name} × ${partner.companyName || partner.name}`,300),
      type,
      partnershipType:type,
      status:"pending",
      requestedBy:"company",
      requestedByOrganizationId:companyId,
      message:text(req.body.message,10000),
      objective:text(req.body.objective,10000),
      description:text(req.body.description,15000),
      activities:list(req.body.activities,1500),
      benefits:list(req.body.benefits,1500),
      capabilities:{
        internships:bool(capabilities.internships),
        jobs:bool(capabilities.jobs),
        recruitment:bool(capabilities.recruitment),
        training:bool(capabilities.training),
        careerEvents:bool(capabilities.careerEvents),
        scholarships:bool(capabilities.scholarships),
        mentorship:bool(capabilities.mentorship),
        research:bool(capabilities.research)
      },
      targetPrograms:list(req.body.targetPrograms,180),
      targetSkills:list(req.body.targetSkills,180),
      proposedStartDate:dateOrNull(req.body.proposedStartDate),
      proposedEndDate:dateOrNull(req.body.proposedEndDate),
      createdBy:userId(req),
      updatedBy:userId(req),
      lastActivityAt:new Date(),
      statusHistory:[{
        status:"pending",
        changedBy:userId(req),
        changedByRole:role(req),
        note:"Company-to-company partnership proposal created.",
        changedAt:new Date()
      }]
    });

    const reviewCase=await queuePartnership({partnership,actor:req.user});
    const populated=await SchoolCompanyPartnership.findById(partnership._id)
      .populate("companyId","name companyName logo profileImage industry")
      .populate("partnerCompanyId","name companyName logo profileImage industry")
      .lean();

    return res.status(202).json({
      success:true,
      partnership:populated,
      item:populated,
      reviewCase,
      message:"Company partnership submitted to AIFT Review. The private negotiation workspace opens after verification."
    });
  }catch(error){
    console.error("CREATE COMPANY PARTNERSHIP ERROR:",error);
    if(error?.code === 11000) return res.status(409).json({success:false,message:"A live partnership already exists between these companies."});
    return res.status(error?.name === "ValidationError" ? 400 : 500).json({success:false,message:error?.name === "ValidationError" ? error.message : "Unable to create the company partnership."});
  }
}

async function updateCompanyPartnershipStatus(req,res){
  try{
    if(!ensureCompany(req,res)) return;
    if(!validId(req.params.id)) return res.status(400).json({success:false,message:"Invalid partnership id."});
    const partnership=await SchoolCompanyPartnership.findById(req.params.id);
    if(!partnership || partnership.relationshipKind !== "company_company"){
      return res.status(404).json({success:false,message:"Company partnership not found."});
    }

    const me=userId(req);
    const isFirst=String(partnership.companyId) === me;
    const isSecond=String(partnership.partnerCompanyId) === me;
    if(role(req) !== "admin" && !isFirst && !isSecond){
      return res.status(403).json({success:false,message:"You are not part of this company partnership."});
    }

    const next=String(req.body.status || "").toLowerCase();
    const requestedBy=id(partnership.requestedByOrganizationId || partnership.companyId);
    const isRequester=me === requestedBy;
    const isRecipient=!isRequester && (isFirst || isSecond);

    if(next === "approved"){
      if(partnership.status !== "review") return res.status(409).json({success:false,message:"AIFT verification and private review must happen before approval."});
      if(role(req) !== "admin" && !isRecipient) return res.status(403).json({success:false,message:"The receiving company must approve this partnership."});
      partnership.approvedAt=partnership.approvedAt || new Date();
    }else if(next === "rejected"){
      if(partnership.status !== "review") return res.status(409).json({success:false,message:"This partnership is not awaiting the receiving company decision."});
      if(role(req) !== "admin" && !isRecipient) return res.status(403).json({success:false,message:"The receiving company must reject this partnership."});
      partnership.rejectedAt=new Date();
      partnership.rejectionReason=text(req.body.rejectionReason || req.body.note,5000);
    }else if(next === "active"){
      if(partnership.status !== "approved") return res.status(409).json({success:false,message:"Approve the partnership before activation."});
      partnership.activatedAt=partnership.activatedAt || new Date();
    }else if(next === "cancelled"){
      if(role(req) !== "admin" && !isRequester) return res.status(403).json({success:false,message:"Only the requesting company can cancel this proposal."});
      partnership.cancelledAt=new Date();
    }else{
      return res.status(400).json({success:false,message:"Choose approved, rejected, active or cancelled."});
    }

    partnership.status=next;
    partnership.updatedBy=userId(req);
    partnership.lastActivityAt=new Date();
    partnership.statusHistory.push({
      status:next,
      changedBy:userId(req),
      changedByRole:role(req),
      note:text(req.body.note || req.body.rejectionReason,3000),
      changedAt:new Date()
    });
    await partnership.save();

    return res.json({success:true,partnership,message:`Company partnership moved to ${next}.`});
  }catch(error){
    console.error("UPDATE COMPANY PARTNERSHIP STATUS ERROR:",error);
    return res.status(error?.name === "ValidationError" ? 400 : 500).json({success:false,message:error?.name === "ValidationError" ? error.message : "Unable to update the company partnership."});
  }
}

async function createEmployerCampusProgram(req,res){
  try{
    if(!ensureCompany(req,res)) return;
    const companyId=role(req) === "admin" ? id(req.body.companyId) : userId(req);
    const schoolId=id(req.body.schoolId);
    const partnershipId=id(req.body.partnershipId);
    if(!validId(companyId) || !validId(schoolId) || !validId(partnershipId)){
      return res.status(400).json({success:false,message:"Choose the School partnership for this Campus program."});
    }

    const partnership=await SchoolCompanyPartnership.findOne({
      _id:partnershipId,
      relationshipKind:"school_company",
      companyId,
      schoolId,
      status:{$in:[...ACTIVE_PARTNERSHIP_STATUSES]}
    }).lean();
    if(!partnership){
      return res.status(403).json({success:false,message:"Campus programs can only be sent through an approved or active School partnership."});
    }

    const purpose=String(req.body.purpose || "recruit_students").toLowerCase();
    const config=CAMPUS_PURPOSE_MAP[purpose];
    if(!config) return res.status(400).json({success:false,message:"Choose what you want to offer on Campus."});

    const title=text(req.body.title,300);
    if(!title) return res.status(400).json({success:false,message:"Add a simple title for the Campus program."});

    const [school,company]=await Promise.all([
      User.findById(schoolId).select("name schoolName").lean(),
      User.findById(companyId).select("name companyName").lean()
    ]);
    if(!school || !company) return res.status(404).json({success:false,message:"The School or Employer account could not be found."});

    const opportunityIds=list(req.body.opportunityIds,100).filter(validId);
    const targetAudiences=list(req.body.targetAudiences,80).filter(item=>
      ["students","graduates","alumni","talent","job_seekers"].includes(item)
    );
    const startDate=dateOrNull(req.body.startDate);
    const endDate=dateOrNull(req.body.endDate);
    const deadline=dateOrNull(req.body.applicationDeadline);
    if(startDate && endDate && endDate < startDate){
      return res.status(400).json({success:false,message:"Campus program end date must be after the start date."});
    }

    const mode=["online","onsite","hybrid"].includes(req.body.mode) ? req.body.mode : "hybrid";
    const status=startDate && startDate > new Date() ? "scheduled" : "draft";

    const campaign=await CampusRecruitmentCampaign.create({
      companyId,
      schoolId,
      partnershipId,
      companyName:text(company.companyName || company.name,250),
      schoolName:text(school.schoolName || school.name,250),
      title,
      description:text(req.body.description,15000),
      objective:text(req.body.objective,10000),
      campaignType:config.campaignType,
      mode,
      status,
      opportunityIds,
      targetAudiences:targetAudiences.length ? targetAudiences : config.audiences,
      targetPrograms:list(req.body.targetPrograms,180),
      targetYearLevels:list(req.body.targetYearLevels,100),
      targetSkills:list(req.body.targetSkills,180),
      expectedStudents:numberOrNull(req.body.expectedStudents),
      targetHires:numberOrNull(req.body.targetHires),
      targetProjectParticipants:numberOrNull(req.body.targetProjectParticipants),
      startDate,
      endDate,
      applicationDeadline:deadline,
      location:{
        venue:text(req.body.venue,300),
        address:text(req.body.address,1000),
        meetingUrl:text(req.body.meetingUrl,2000)
      },
      allowStudentApplications:config.callToAction === "apply" || config.callToAction === "join_project",
      inviteEligibleStudents:bool(req.body.inviteEligibleStudents,false),
      visibleToStudents:true,
      requireSchoolApproval:bool(req.body.requireSchoolApproval,true),
      callToAction:config.callToAction,
      createdBy:userId(req),
      updatedBy:userId(req),
      lastActivityAt:new Date(),
      statusHistory:[{
        status,
        changedBy:userId(req),
        changedByRole:role(req),
        note:`Campus program created for purpose: ${purpose.replaceAll("_"," ")}.`,
        changedAt:new Date()
      }],
      metadata:{
        employerCareerHubVersion:2,
        purpose,
        linkedOpportunityCount:opportunityIds.length
      }
    });

    return res.status(201).json({success:true,campaign,item:campaign,message:"Campus program created. It is connected to the selected School partnership."});
  }catch(error){
    console.error("CREATE EMPLOYER CAMPUS PROGRAM ERROR:",error);
    return res.status(error?.name === "ValidationError" ? 400 : 500).json({success:false,message:error?.name === "ValidationError" ? error.message : "Unable to create the Campus program."});
  }
}

module.exports={
  createEmployerOpportunity,
  listCompanyPartnerships,
  createCompanyPartnership,
  updateCompanyPartnershipStatus,
  createEmployerCampusProgram
};
