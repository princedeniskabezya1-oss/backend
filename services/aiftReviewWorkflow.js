const ReviewCase = require("../models/ReviewCase");
const reviewCaseRoutes = require("../routes/reviewCases");

const createOrReuseReviewCase = reviewCaseRoutes.createOrReuseReviewCase;

function id(value){ return value?._id || value?.id || value || null; }
function text(value,max=500){ return String(value ?? "").trim().slice(0,max); }

async function queueVenturePublish({ venture, actor }){
  return createOrReuseReviewCase({
    type:"venture",
    requesterId:id(actor),
    targetUserId:id(venture.schoolId),
    resourceType:"Venture",
    resourceId:id(venture),
    title:`Review venture: ${text(venture.title,160)}`,
    summary:text(venture.description || venture.tagline || "Venture submitted for marketplace review.",3000),
    metadata:{
      ventureType:venture.ventureType || "",
      stage:venture.stage || "",
      visibility:venture.visibility || "public",
      seekingInvestment:venture.seekingInvestment === true,
      fundingGoal:Number(venture.fundingGoal || 0),
      currency:venture.currency || "PHP"
    },
    priority:venture.seekingInvestment === true ? "high" : "normal",
    note:"Venture submitted for AIFT marketplace review before publication."
  });
}

async function queueVentureInterest({ venture, interest, actor }){
  const type=interest.type === "investment" ? "investment_interest" : "opportunity";
  return createOrReuseReviewCase({
    type,
    requesterId:id(actor),
    targetUserId:id(venture.ownerId),
    resourceType:"VentureInterest",
    resourceId:id(interest),
    title:`Review ${text(interest.type,50)} request for ${text(venture.title,130)}`,
    summary:text(interest.message || `AIFT ${interest.type} request submitted for review.`,3000),
    metadata:{
      ventureId:String(id(venture) || ""),
      ventureTitle:venture.title || "",
      interestType:interest.type || "",
      amountMin:Number(interest.amountMin || 0),
      amountMax:Number(interest.amountMax || 0),
      currency:interest.currency || venture.currency || "PHP"
    },
    priority:interest.type === "investment" ? "high" : "normal",
    note:"Venture support request submitted for AIFT review before founder action."
  });
}

async function queueScholarshipApplication({ application, scholarship, actor }){
  return createOrReuseReviewCase({
    type:"scholarship_application",
    requesterId:id(actor),
    targetUserId:id(application.schoolId),
    resourceType:"ScholarshipApplication",
    resourceId:id(application),
    title:`Review scholarship application: ${text(scholarship?.title || "Scholarship",150)}`,
    summary:text(application.personalStatement || "Scholarship application submitted through AIFT.",3000),
    metadata:{
      scholarshipId:String(id(application.scholarshipId) || ""),
      scholarshipTitle:scholarship?.title || "",
      studentId:String(id(application.studentId) || ""),
      familyChildId:String(id(application.familyChildId) || ""),
      submittedByFamilyId:String(id(application.submittedByFamilyId) || "")
    },
    priority:"normal",
    note:"Scholarship application submitted for AIFT trust review before school processing."
  });
}

async function queueInternshipApplication({ application, opportunity, actor }){
  return createOrReuseReviewCase({
    type:"internship",
    requesterId:id(actor),
    targetUserId:id(application.companyId || application.schoolId),
    resourceType:"InternshipApplication",
    resourceId:id(application),
    title:`Review career application: ${text(opportunity?.title || "Opportunity",150)}`,
    summary:text(application.coverLetter || application.message || "Career application submitted through AIFT.",3000),
    metadata:{
      opportunityId:String(id(application.opportunityId) || ""),
      opportunityTitle:opportunity?.title || "",
      opportunityType:opportunity?.type || "",
      studentId:String(id(application.studentId) || ""),
      schoolId:String(id(application.schoolId) || ""),
      companyId:String(id(application.companyId) || ""),
      source:application.source || ""
    },
    priority:"normal",
    note:"Career application submitted for AIFT trust review before receiving-party processing."
  });
}

async function queuePartnership({ partnership, actor }){
  return createOrReuseReviewCase({
    type:"partnership",
    requesterId:id(actor),
    targetUserId:String(id(actor)) === String(id(partnership.schoolId)) ? id(partnership.companyId) : id(partnership.schoolId),
    resourceType:"SchoolCompanyPartnership",
    resourceId:id(partnership),
    title:`Review partnership: ${text(partnership.title || partnership.type || "School-company partnership",160)}`,
    summary:text(partnership.description || partnership.objective || partnership.message || "Partnership proposal submitted through AIFT.",3000),
    metadata:{
      schoolId:String(id(partnership.schoolId) || ""),
      companyId:String(id(partnership.companyId) || ""),
      partnershipType:partnership.type || partnership.partnershipType || "",
      requestedBy:partnership.requestedBy || ""
    },
    priority:"normal",
    note:"Partnership proposal submitted for AIFT review before receiving-party action."
  });
}

async function latestReview(type,resourceId){
  if(!resourceId) return null;
  return ReviewCase.findOne({ type, resourceId:id(resourceId) }).sort({ createdAt:-1 }).lean();
}

module.exports={
  queueVenturePublish,
  queueVentureInterest,
  queueScholarshipApplication,
  queueInternshipApplication,
  queuePartnership,
  latestReview
};
