const Venture = require("../models/Venture");
const VentureInterest = require("../models/VentureInterest");
const ScholarshipApplication = require("../models/ScholarshipApplication");
const InternshipApplication = require("../models/InternshipApplication");
const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");
const SchoolOpportunity = require("../models/SchoolOpportunity");
const SchoolScholarship = require("../models/SchoolScholarship");
const CareerEvent = require("../models/CareerEvent");
const Notification = require("../models/Notification");
const ChatSafetyViolation = require("../models/ChatSafetyViolation");

function id(value){ return value?._id || value?.id || value || null; }
function clean(value,max=1000){ return String(value ?? "").trim().slice(0,max); }
function withArticle(value){const word=clean(value,80);return `${/^[aeiou]/i.test(word)?"an":"a"} ${word}`;}

async function notify(user,text,link,adminId){
  if(!id(user)) return;
  await Notification.create({
    user:id(user),
    sender:id(adminId) || null,
    type:"review_case",
    text:clean(text,1000),
    link:clean(link,2000)
  }).catch(()=>{});
}

function historyNote(review){
  return clean(review.decisionNotes || `AIFT Review ${review.caseNumber}: ${review.status}.`,2000);
}

async function syncVenture(review,admin){
  const venture=await Venture.findById(review.resourceId);
  if(!venture) return { synced:false, reason:"Venture not found" };
  if(review.status === "approved") venture.status="active";
  else if(review.status === "rejected") venture.status="rejected";
  else if(review.status === "cancelled") venture.status="draft";
  else if(review.status === "information_requested") venture.status="submitted";
  else return { synced:false, reason:"No Venture state change required" };
  await venture.save();
  await notify(venture.ownerId,`AIFT Review ${review.caseNumber}: your venture “${venture.title}” is ${review.status.replaceAll("_"," ")}.`,`/venture.html?id=${venture._id}`,admin);
  return { synced:true, resourceStatus:venture.status };
}

async function syncVentureInterest(review,admin){
  const interest=await VentureInterest.findById(review.resourceId);
  if(!interest) return { synced:false, reason:"Venture interest not found" };
  if(review.status === "approved") interest.status="pending";
  else if(review.status === "rejected") interest.status="declined";
  else if(review.status === "cancelled") interest.status="withdrawn";
  else return { synced:false, reason:"No Venture interest state change required" };
  await interest.save();
  await notify(interest.userId,`AIFT Review ${review.caseNumber}: your ${interest.type} request is ${review.status}.`,`/venture.html?id=${interest.ventureId}`,admin);
  if(review.status === "approved"){
    const venture=await Venture.findById(interest.ventureId).select("ownerId title").lean();
    if(venture?.ownerId){
      await notify(venture.ownerId,`AIFT approved ${withArticle(interest.type)} request for “${venture.title}”. You can now review it inside AIFT.`,`/venture.html?id=${interest.ventureId}`,admin);
    }
  }
  return { synced:true, resourceStatus:interest.status };
}

async function syncCareerOpportunity(review,admin){
  const opportunity=await SchoolOpportunity.findById(review.resourceId);
  if(!opportunity) return { synced:false, reason:"Career Hub opportunity not found" };
  if(review.status === "approved"){
    opportunity.status="active";
    opportunity.publishedAt=opportunity.publishedAt || new Date();
  }else if(review.status === "rejected") opportunity.status="rejected";
  else if(review.status === "information_requested") opportunity.status="pending";
  else if(review.status === "cancelled") opportunity.status="draft";
  else return { synced:false, reason:"No Career Hub opportunity state change required" };
  opportunity.updatedBy=id(admin);
  await opportunity.save();
  const owner=opportunity.employerId || opportunity.schoolId;
  await notify(owner,`AIFT Review ${review.caseNumber}: opportunity “${opportunity.title}” is ${review.status.replaceAll("_"," ")}.`,opportunity.employerId ? `/employer.html?tab=career&opportunityId=${opportunity._id}` : `/school.html?section=career&opportunityId=${opportunity._id}`,admin);
  return { synced:true, resourceStatus:opportunity.status };
}

async function syncScholarshipPublish(review,admin){
  const scholarship=await SchoolScholarship.findById(review.resourceId);
  if(!scholarship) return { synced:false, reason:"Scholarship not found" };
  if(review.status === "approved"){
    scholarship.status="open";
    scholarship.publishedAt=scholarship.publishedAt || new Date();
  }else if(["rejected","cancelled","information_requested"].includes(review.status)) scholarship.status="draft";
  else return { synced:false, reason:"No scholarship publication state change required" };
  scholarship.updatedBy=id(admin);
  await scholarship.save();
  await notify(scholarship.schoolId,`AIFT Review ${review.caseNumber}: scholarship “${scholarship.title}” is ${review.status.replaceAll("_"," ")}.`,`/school.html?section=career&scholarshipId=${scholarship._id}`,admin);
  return { synced:true, resourceStatus:scholarship.status };
}

async function syncCareerEvent(review,admin){
  const event=await CareerEvent.findById(review.resourceId);
  if(!event) return { synced:false, reason:"Career event not found" };
  if(review.status === "approved"){
    event.status=event.registrationRequired === false ? "published" : "registration_open";
    event.publishedAt=event.publishedAt || new Date();
  }else if(["rejected","cancelled","information_requested"].includes(review.status)) event.status="draft";
  else return { synced:false, reason:"No career event publication state change required" };
  event.updatedBy=id(admin);
  await event.save();
  const owner=event.companyId || event.schoolId;
  await notify(owner,`AIFT Review ${review.caseNumber}: career event “${event.title}” is ${review.status.replaceAll("_"," ")}.`,event.companyId ? `/employer.html?tab=career&eventId=${event._id}` : `/school.html?section=career&eventId=${event._id}`,admin);
  return { synced:true, resourceStatus:event.status };
}

async function syncScholarshipApplication(review,admin){
  const application=await ScholarshipApplication.findById(review.resourceId);
  if(!application) return { synced:false, reason:"Scholarship application not found" };
  let next=null;
  if(review.status === "approved") next="review";
  else if(review.status === "rejected") next="rejected";
  else if(review.status === "cancelled") next="withdrawn";
  else if(review.status === "information_requested") next="submitted";
  else return { synced:false, reason:"No scholarship state change required" };
  if(application.status !== next){
    application.status=next;
    application.history=Array.isArray(application.history) ? application.history : [];
    application.history.push({status:next,changedBy:id(admin),changedByRole:"admin",note:historyNote(review),changedAt:new Date()});
    await application.save();
  }
  await notify(application.submittedByFamilyId || application.studentId,`AIFT Review ${review.caseNumber}: scholarship application is ${review.status.replaceAll("_"," ")}.`,application.submittedByFamilyId?`/family.html?section=scholarships&applicationId=${application._id}`:`/student.html?section=career&focus=scholarships&applicationId=${application._id}`,admin);
  if(review.status === "approved") await notify(application.schoolId,`AIFT approved scholarship application ${review.caseNumber} for school review.`,`/school.html?section=career&applicationId=${application._id}`,admin);
  return { synced:true, resourceStatus:application.status };
}

async function syncInternshipApplication(review,admin){
  const application=await InternshipApplication.findById(review.resourceId);
  if(!application) return { synced:false, reason:"Career application not found" };
  let next=null;
  if(review.status === "approved") next="review";
  else if(review.status === "rejected") next="rejected";
  else if(review.status === "cancelled") next="withdrawn";
  else if(review.status === "information_requested") next="pending";
  else return { synced:false, reason:"No career application state change required" };
  if(application.status !== next){
    application.status=next;
    application.statusHistory=Array.isArray(application.statusHistory) ? application.statusHistory : [];
    application.statusHistory.push({status:next,changedBy:id(admin),changedByRole:"admin",note:historyNote(review),changedAt:new Date()});
    application.updatedBy=id(admin);
    await application.save();
  }
  await notify(application.studentId,`AIFT Review ${review.caseNumber}: your career application is ${review.status.replaceAll("_"," ")}.`,`/my-applications.html?applicationId=${application._id}`,admin);
  if(review.status === "approved") await notify(application.companyId || application.schoolId,`AIFT approved career application ${review.caseNumber} for your review.`,application.companyId ? `/employer.html?tab=applications&applicationId=${application._id}` : `/school.html?section=career&applicationId=${application._id}`,admin);
  return { synced:true, resourceStatus:application.status };
}

async function syncPartnership(review,admin){
  const partnership=await SchoolCompanyPartnership.findById(review.resourceId);
  if(!partnership) return { synced:false, reason:"Partnership not found" };

  let next=null;
  if(review.status === "approved") next="review";
  else if(review.status === "rejected") next="rejected";
  else if(review.status === "cancelled") next="cancelled";
  else if(review.status === "information_requested") next="pending";
  else return { synced:false, reason:"No partnership state change required" };

  if(partnership.status !== next){
    partnership.status=next;
    partnership.statusHistory=Array.isArray(partnership.statusHistory) ? partnership.statusHistory : [];
    partnership.statusHistory.push({status:next,changedBy:id(admin),changedByRole:"admin",note:historyNote(review),changedAt:new Date()});
    partnership.updatedBy=id(admin);
    partnership.lastActivityAt=new Date();
    if(next === "rejected") partnership.rejectedAt=partnership.rejectedAt || new Date();
    if(next === "cancelled") partnership.cancelledAt=partnership.cancelledAt || new Date();
    await partnership.save();
  }

  const requester=String(id(review.requesterId) || "");
  const relationshipKind=partnership.relationshipKind || "school_company";

  if(relationshipKind === "company_company"){
    const firstCompany=String(id(partnership.companyId) || "");
    const secondCompany=String(id(partnership.partnerCompanyId) || "");
    const recipient=requester === firstCompany ? secondCompany : firstCompany;

    await notify(
      requester,
      `AIFT Review ${review.caseNumber}: company partnership proposal is ${review.status.replaceAll("_"," ")}.`,
      "/employer.html?tab=partnerships",
      admin
    );

    if(review.status === "approved" && recipient){
      await notify(
        recipient,
        `AIFT approved company partnership proposal ${review.caseNumber}. You can now privately negotiate the agreement, request a meeting and review the proposal.`,
        "/employer.html?tab=partnerships",
        admin
      );
    }

    return { synced:true, resourceStatus:partnership.status };
  }

  const school=String(id(partnership.schoolId) || "");
  const company=String(id(partnership.companyId) || "");
  const recipient=requester === school ? company : school;

  await notify(
    requester,
    `AIFT Review ${review.caseNumber}: partnership proposal is ${review.status.replaceAll("_"," ")}.`,
    requester === school ? "/school.html?section=partnerships" : "/employer.html?tab=partnerships",
    admin
  );

  if(review.status === "approved"){
    await notify(
      recipient,
      `AIFT approved partnership proposal ${review.caseNumber} for your review.`,
      recipient === school ? "/school.html?section=partnerships" : "/employer.html?tab=partnerships",
      admin
    );
  }

  return { synced:true, resourceStatus:partnership.status };
}

async function syncChatSafety(review,admin){
  const violation=await ChatSafetyViolation.findById(review.resourceId);
  if(!violation)return {synced:false,reason:"Chat safety violation not found"};
  if(["approved","completed","rejected","cancelled"].includes(review.status)){
    violation.reviewed=true;
    violation.reviewedBy=id(admin);
    violation.reviewedAt=new Date();
    violation.reviewNotes=historyNote(review);
    violation.restrictedUntil=new Date();
    await violation.save();
    await notify(violation.userId,`AIFT completed messaging safety review ${review.caseNumber}. Your review restriction has been released.`,"/messages.html",admin);
    return {synced:true,resourceStatus:"restriction_released"};
  }
  return {synced:false,reason:"Chat restriction remains pending AIFT review"};
}

async function syncReviewDecision(review,admin){
  if(!review?.resourceId) return { synced:false, reason:"Review case has no resource" };
  switch(review.type){
    case "venture": return syncVenture(review,admin);
    case "investment_interest": return syncVentureInterest(review,admin);
    case "opportunity":
      if(review.resourceType === "VentureInterest") return syncVentureInterest(review,admin);
      if(review.resourceType === "SchoolOpportunity") return syncCareerOpportunity(review,admin);
      if(review.resourceType === "CareerEvent") return syncCareerEvent(review,admin);
      return { synced:false, reason:"Unsupported opportunity resource" };
    case "scholarship": return syncScholarshipPublish(review,admin);
    case "career_event": return syncCareerEvent(review,admin);
    case "scholarship_application": return syncScholarshipApplication(review,admin);
    case "internship": return syncInternshipApplication(review,admin);
    case "partnership": return syncPartnership(review,admin);
    case "chat_safety": return syncChatSafety(review,admin);
    default: return { synced:false, reason:"Review type does not require resource synchronization" };
  }
}

module.exports={ syncReviewDecision };
