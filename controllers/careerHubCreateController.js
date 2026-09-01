const mongoose = require("mongoose");

const User = require("../models/User");
const SchoolOpportunity = require("../models/SchoolOpportunity");
const SchoolScholarship = require("../models/SchoolScholarship");
const CareerEvent = require("../models/CareerEvent");
const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");

const {
  queueOpportunityPublish,
  queueScholarshipPublish,
  queueCareerEventPublish
} = require("../services/aiftReviewWorkflow");

const MANAGER_ROLES = new Set(["school","employer","company","admin"]);
const COMPANY_ROLES = new Set(["employer","company"]);

const OPPORTUNITY_TYPES = new Set(["internship","job","company_request","collaboration","placement","project","career_talk"]);
const WORK_SETUPS = new Set(["onsite","remote","hybrid","flexible","unspecified"]);
const EMPLOYMENT_TYPES = new Set(["full_time","part_time","contract","temporary","internship","project","volunteer","unspecified"]);
const OPPORTUNITY_VISIBILITY = new Set(["public","school","partners","private"]);

const SCHOLARSHIP_TYPES = new Set(["academic","merit","need_based","athletic","research","leadership","community","company_sponsored","government","international","other"]);
const SCHOLARSHIP_VISIBILITY = new Set(["public","school","partners","private"]);
const FUNDING_TYPES = new Set(["full","partial","fixed_amount","tuition_only","allowance","mixed"]);

const EVENT_TYPES = new Set(["career_fair","recruitment","seminar","webinar","workshop","networking","company_talk","orientation","mentorship","competition","hackathon","portfolio_review","mock_interview","job_fair","internship_fair","other"]);
const EVENT_FORMATS = new Set(["physical","online","hybrid"]);
const EVENT_VISIBILITY = new Set(["public","school","invited"]);
const EVENT_AUDIENCE = new Set(["students","graduates","alumni","job_seekers","teachers","employers","public"]);

function id(value){
  if(value && typeof value === "object") return String(value._id || value.id || "");
  return String(value || "");
}
function userId(req){ return id(req.user?._id || req.user?.id); }
function role(req){ return String(req.user?.role || "").trim().toLowerCase(); }
function text(value,max=10000){ return String(value ?? "").trim().slice(0,max); }
function validId(value){ return mongoose.Types.ObjectId.isValid(id(value)); }
function numberOrNull(value){
  if(value === "" || value === null || value === undefined) return null;
  const n=Number(value);
  return Number.isFinite(n) ? n : null;
}
function dateOrNull(value){
  if(!value) return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function list(value,max=300){
  const source=Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(source.map(item=>text(item,max)).filter(Boolean))];
}
function key(value){
  return text(value,120)
    .toLowerCase()
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"");
}
function choice(value,allowed,fallback,aliases={}){
  let normalized=key(value || fallback);
  normalized=aliases[normalized] || normalized;
  return allowed.has(normalized) ? normalized : fallback;
}
function bool(value,fallback=false){
  if(value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true" || value === 1 || value === "1";
}
function ownerFields(req,body={}){
  const currentRole=role(req);
  const currentUser=userId(req);
  if(currentRole === "school") return {schoolId:currentUser,employerId:null,companyId:null,source:"school"};
  if(COMPANY_ROLES.has(currentRole)) return {schoolId:null,employerId:currentUser,companyId:currentUser,source:"employer"};
  if(currentRole === "admin"){
    const schoolId=validId(body.schoolId) ? id(body.schoolId) : null;
    const company=id(body.companyId || body.employerId);
    return {schoolId,employerId:validId(company) ? company : null,companyId:validId(company) ? company : null,source:"admin"};
  }
  return {schoolId:null,employerId:null,companyId:null,source:""};
}
function slugify(value){
  return text(value,300).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,180);
}

async function getPartnerDirectory(req,res){
  try{
    if(!MANAGER_ROLES.has(role(req))) return res.status(403).json({success:false,message:"Your account cannot use the Career Hub partner directory."});
    const want=choice(req.query.type,new Set(["school","company"]),"school",{employer:"company",employers:"company",companies:"company",schools:"school"});
    const filter=want === "school" ? {role:"school"} : {role:{$in:["employer","company"]}};
    const search=text(req.query.search,120);
    if(search){
      filter.$or=[
        {name:{$regex:search,$options:"i"}},
        {schoolName:{$regex:search,$options:"i"}},
        {companyName:{$regex:search,$options:"i"}}
      ];
    }
    const users=await User.find(filter)
      .select("_id role name schoolName companyName schoolLogo logo profileImage profilePicture avatar industry location address")
      .sort({schoolName:1,companyName:1,name:1})
      .limit(100)
      .lean();
    res.json({success:true,items:users});
  }catch(error){
    console.error("CAREER HUB DIRECTORY ERROR:",error);
    res.status(500).json({success:false,message:"Unable to load Career Hub partners."});
  }
}

async function getVerifiedPartnerships(req,res){
  try{
    const filter={status:"active"};
    if(req.query.schoolId){
      if(!validId(req.query.schoolId)) return res.status(400).json({success:false,message:"schoolId is invalid."});
      filter.schoolId=req.query.schoolId;
    }
    if(req.query.companyId || req.query.employerId){
      const companyId=req.query.companyId || req.query.employerId;
      if(!validId(companyId)) return res.status(400).json({success:false,message:"companyId is invalid."});
      filter.companyId=companyId;
    }
    if(!filter.schoolId && !filter.companyId) return res.status(400).json({success:false,message:"A schoolId or companyId is required."});

    const partnerships=await SchoolCompanyPartnership.find(filter)
      .select("schoolId companyId schoolName companyName title type partnershipType capabilities targetPrograms startDate endDate activatedAt metrics")
      .populate("schoolId","name schoolName schoolLogo profileImage profilePicture avatar location address")
      .populate("companyId","name companyName logo profileImage profilePicture avatar industry location address")
      .sort({activatedAt:-1,createdAt:-1})
      .lean();

    res.json({success:true,verified:true,partnerships,items:partnerships});
  }catch(error){
    console.error("VERIFIED PARTNERSHIPS ERROR:",error);
    res.status(500).json({success:false,message:"Unable to load verified partnerships."});
  }
}

async function createCareerHubListing(req,res){
  try{
    const currentRole=role(req);
    if(!MANAGER_ROLES.has(currentRole)) return res.status(403).json({success:false,message:"Your account cannot create Career Hub listings."});

    const kind=choice(req.body.kind,new Set(["opportunity","scholarship","event"]),"");
    if(!kind) return res.status(400).json({success:false,message:"Choose Opportunity, Scholarship or Event."});

    const title=text(req.body.title,300);
    if(!title) return res.status(400).json({success:false,message:"Add a title before submitting."});

    const owner=ownerFields(req,req.body);

    if(kind === "opportunity"){
      if(!owner.schoolId && !owner.employerId) return res.status(400).json({success:false,message:"This opportunity needs a School or Company owner."});

      const type=choice(req.body.type,OPPORTUNITY_TYPES,"internship",{
        career_talks:"career_talk",
        career_talk_event:"career_talk",
        company:"company_request",
        company_opportunity:"company_request",
        work_placement:"placement"
      });
      const workSetup=choice(req.body.workSetup,WORK_SETUPS,"unspecified",{
        on_site:"onsite",on_site_work:"onsite",in_person:"onsite",virtual:"remote"
      });
      const employmentType=choice(req.body.employmentType,EMPLOYMENT_TYPES,type === "internship" ? "internship" : "unspecified",{
        fulltime:"full_time",parttime:"part_time",freelance:"contract"
      });
      const visibility=choice(req.body.visibility,OPPORTUNITY_VISIBILITY,"public",{everyone:"public",students:"school",partner:"partners"});

      const startDate=dateOrNull(req.body.startDate);
      const endDate=dateOrNull(req.body.endDate);
      const deadline=dateOrNull(req.body.deadline);
      if(startDate && endDate && endDate < startDate) return res.status(400).json({success:false,message:"End date must be after the start date."});

      const opportunity=await SchoolOpportunity.create({
        schoolId:owner.schoolId,
        employerId:owner.employerId,
        createdBy:userId(req),
        updatedBy:userId(req),
        source:owner.source,
        title,
        companyName:text(req.body.companyName,220),
        summary:text(req.body.summary,1000),
        description:text(req.body.description,12000),
        type,
        status:"pending",
        visibility,
        location:text(req.body.location,500),
        workSetup,
        employmentType,
        slots:numberOrNull(req.body.slots),
        durationText:text(req.body.durationText,250),
        startDate,
        endDate,
        deadline,
        programs:list(req.body.programs,160),
        skills:list(req.body.skills,160),
        yearLevels:list(req.body.yearLevels,100),
        requirements:list(req.body.requirements,1000),
        responsibilities:list(req.body.responsibilities,1000),
        applicationInstructions:text(req.body.applicationInstructions,5000),
        allowStudentApplications:bool(req.body.allowStudentApplications,true),
        allowSchoolRecommendations:bool(req.body.allowSchoolRecommendations,true),
        compensation:{
          type:choice(req.body.compensationType,new Set(["paid","unpaid","allowance","salary","stipend","negotiable","not_specified"]),"not_specified",{not_specified:"not_specified",not_sure:"not_specified"}),
          amount:numberOrNull(req.body.compensationAmount),
          currency:text(req.body.currency || "PHP",10).toUpperCase(),
          period:choice(req.body.compensationPeriod,new Set(["hour","day","week","month","project","one_time","unspecified"]),"unspecified",{one_time_payment:"one_time"}),
          notes:text(req.body.compensationNotes,1000)
        }
      });

      const reviewCase=await queueOpportunityPublish({opportunity,actor:req.user});
      return res.status(202).json({success:true,kind,opportunity,item:opportunity,reviewCase,reviewStatus:reviewCase.status,message:"Opportunity submitted to AIFT Review. It will become visible after approval."});
    }

    if(kind === "scholarship"){
      if(currentRole !== "school" && currentRole !== "admin") return res.status(403).json({success:false,message:"Scholarships are created by School accounts."});
      if(!owner.schoolId) return res.status(400).json({success:false,message:"A School owner is required."});

      const type=choice(req.body.type,SCHOLARSHIP_TYPES,"academic",{
        need:"need_based",needs_based:"need_based",need_based_scholarship:"need_based",company:"company_sponsored",company_sponsor:"company_sponsored"
      });
      const visibility=choice(req.body.visibility,SCHOLARSHIP_VISIBILITY,"public",{everyone:"public",students:"school",partner:"partners"});
      const fundingType=choice(req.body.fundingType,FUNDING_TYPES,"partial",{
        fixed:"fixed_amount",amount:"fixed_amount",tuition:"tuition_only",full_scholarship:"full",partial_scholarship:"partial"
      });
      const openDate=dateOrNull(req.body.applicationOpenDate);
      const deadline=dateOrNull(req.body.deadline);
      if(openDate && deadline && deadline < openDate) return res.status(400).json({success:false,message:"Scholarship deadline must be after the opening date."});

      const scholarship=await SchoolScholarship.create({
        schoolId:owner.schoolId,
        createdBy:userId(req),
        updatedBy:userId(req),
        title,
        summary:text(req.body.summary,1500),
        description:text(req.body.description,15000),
        type,
        status:"draft",
        visibility,
        sponsor:{
          name:text(req.body.sponsorName,250),
          type:choice(req.body.sponsorType,new Set(["school","company","government","foundation","organization","individual","other"]),"school",{employer:"company",ngo:"organization"}),
          website:text(req.body.sponsorWebsite,1500)
        },
        funding:{
          type:fundingType,
          amount:numberOrNull(req.body.fundingAmount),
          currency:text(req.body.currency || "PHP",10).toUpperCase(),
          percentage:numberOrNull(req.body.fundingPercentage),
          tuitionCovered:bool(req.body.tuitionCovered,fundingType === "full" || fundingType === "tuition_only"),
          allowanceIncluded:bool(req.body.allowanceIncluded,fundingType === "allowance" || fundingType === "mixed"),
          allowanceAmount:numberOrNull(req.body.allowanceAmount),
          notes:text(req.body.fundingNotes,3000)
        },
        numberOfAwards:numberOrNull(req.body.numberOfAwards),
        eligibility:{
          programs:list(req.body.programs,180),
          yearLevels:list(req.body.yearLevels,100),
          financialNeedRequired:bool(req.body.financialNeedRequired,type === "need_based"),
          enrolledRequired:bool(req.body.enrolledRequired,true),
          graduatingStudentsAllowed:bool(req.body.graduatingStudentsAllowed,true),
          otherCriteria:list(req.body.otherCriteria,1500)
        },
        requirements:list(req.body.requirements,1500),
        requiredDocuments:list(req.body.requiredDocuments,300),
        applicationInstructions:text(req.body.applicationInstructions,8000),
        allowInternalApplications:bool(req.body.allowInternalApplications,true),
        applicationOpenDate:openDate,
        deadline,
        academicYear:text(req.body.academicYear,100)
      });

      const reviewCase=await queueScholarshipPublish({scholarship,actor:req.user});
      return res.status(202).json({success:true,kind,scholarship,item:scholarship,reviewCase,reviewStatus:reviewCase.status,message:"Scholarship submitted to AIFT Review. Students will see it after approval."});
    }

    const eventType=choice(req.body.eventType || req.body.type,EVENT_TYPES,"career_fair",{
      careerfair:"career_fair",career_fairs:"career_fair",career_talk:"company_talk",company_talks:"company_talk",jobfair:"job_fair",internshipfair:"internship_fair",mockinterview:"mock_interview",portfolio:"portfolio_review"
    });
    const format=choice(req.body.format,EVENT_FORMATS,"physical",{
      onsite:"physical",on_site:"physical",in_person:"physical",virtual:"online",remote:"online"
    });
    const visibility=choice(req.body.visibility,EVENT_VISIBILITY,"public",{everyone:"public",private:"invited",invite_only:"invited"});
    const startAt=dateOrNull(req.body.startAt);
    const endAt=dateOrNull(req.body.endAt);
    if(!startAt || !endAt) return res.status(400).json({success:false,message:"Choose the event start and end time."});
    if(endAt <= startAt) return res.status(400).json({success:false,message:"Event end time must be after the start time."});

    const audienceAliases={
      student:"students",graduate:"graduates",job_seeker:"job_seekers",jobseeker:"job_seekers",teacher:"teachers",employer:"employers",company:"employers",companies:"employers",everyone:"public",all:"public"
    };
    const requestedAudience=list(req.body.audience,100).map(item=>choice(item,EVENT_AUDIENCE,"",audienceAliases)).filter(Boolean);
    const audience=requestedAudience.length ? [...new Set(requestedAudience)] : ["students"];

    const event=await CareerEvent.create({
      schoolId:owner.schoolId,
      companyId:owner.companyId,
      createdBy:userId(req),
      updatedBy:userId(req),
      title,
      slug:slugify(title),
      shortDescription:text(req.body.summary || req.body.shortDescription,1000),
      description:text(req.body.description,20000),
      eventType,
      format,
      location:{
        venueName:text(req.body.venueName || req.body.location?.venueName,300),
        address:text(req.body.address || req.body.location?.address,1000),
        city:text(req.body.city || req.body.location?.city,200),
        province:text(req.body.province || req.body.location?.province,200),
        country:text(req.body.country || req.body.location?.country || "Philippines",200)
      },
      onlinePlatform:text(req.body.onlinePlatform,200),
      meetingUrl:text(req.body.meetingUrl,2000),
      startAt,
      endAt,
      timezone:text(req.body.timezone || "Asia/Manila",100),
      registrationDeadline:dateOrNull(req.body.registrationDeadline),
      registrationRequired:bool(req.body.registrationRequired,true),
      capacity:numberOrNull(req.body.capacity),
      waitlistEnabled:bool(req.body.waitlistEnabled,true),
      audience,
      programs:list(req.body.programs,180),
      yearLevels:list(req.body.yearLevels,100),
      industries:list(req.body.industries,180),
      visibility,
      organizerName:text(req.body.organizerName,300),
      organizerEmail:text(req.body.organizerEmail,320).toLowerCase(),
      status:"draft",
      featured:false,
      tags:list(req.body.tags,150)
    });

    const reviewCase=await queueCareerEventPublish({event,actor:req.user});
    return res.status(202).json({success:true,kind,event,item:event,reviewCase,reviewStatus:reviewCase.status,message:"Career event submitted to AIFT Review. It will be published after approval."});
  }catch(error){
    console.error("AIFT CAREER HUB CREATE ERROR:",error);
    if(error?.name === "ValidationError") return res.status(400).json({success:false,message:error.message});
    res.status(500).json({success:false,message:"Unable to submit this Career Hub listing."});
  }
}

module.exports={
  createCareerHubListing,
  getPartnerDirectory,
  getVerifiedPartnerships
};
