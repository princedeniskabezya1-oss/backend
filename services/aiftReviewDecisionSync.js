const Venture = require("../models/Venture");
const VentureInterest = require("../models/VentureInterest");
const ScholarshipApplication = require("../models/ScholarshipApplication");
const InternshipApplication = require("../models/InternshipApplication");
const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");
const Notification = require("../models/Notification");

function id(value){ return value?._id || value?.id || value || null; }
function clean(value,max=1000){ return String(value ?? "").trim().slice(0,max); }

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
  await notify(
    venture.ownerId,
    `AIFT Review ${review.caseNumber}: your venture “${venture.title}” is ${review.status.replaceAll("_"," ")}.`,
    `/venture.html?id=${venture._id}`,
    admin
  );
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
  await notify(
    interest.userId,
    `AIFT Review ${review.caseNumber}: your ${interest.type} request is ${review.status}.`,
    `/venture.html?id=${interest.ventureId}`,
    admin
  );

  if(review.status === "approved"){
    const venture=await Venture.findById(interest.ventureId).select("ownerId title").lean();
    if(venture?.ownerId){
      await notify(
        venture.ownerId,
        `AIFT approved a ${interest.type} request for “${venture.title}”. You can now review it inside AIFT.`,
        `/venture.html?id=${interest.ventureId}`,
        admin
      );
    }
  }

  return { synced:true, resourceStatus:interest.status };
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
    application.history.push({
      status:next,
      changedBy:id(admin),
      changedByRole:"admin",
      note:historyNote(review),
      changedAt:new Date()
    });
    await application.save();
  }

  await notify(
    application.submittedByFamilyId || application.studentId,
    `AIFT Review ${review.caseNumber}: scholarship application is ${review.status.replaceAll("_"," ")}.`,
    "/student.html",
    admin
  );
  if(review.status === "approved"){
    await notify(
      application.schoolId,
      `AIFT approved scholarship application ${review.caseNumber} for school review.`,
      "/school.html",
      admin
    );
  }
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
    application.statusHistory.push({
      status:next,
      changedBy:id(admin),
      changedByRole:"admin",
      note:historyNote(review),
      changedAt:new Date()
    });
    application.updatedBy=id(admin);
    await application.save();
  }

  await notify(
    application.studentId,
    `AIFT Review ${review.caseNumber}: your career application is ${review.status.replaceAll("_"," ")}.`,
    "/student.html",
    admin
  );
  if(review.status === "approved"){
    await notify(
      application.companyId || application.schoolId,
      `AIFT approved career application ${review.caseNumber} for your review.`,
      application.companyId ? "/employer.html" : "/school.html",
      admin
    );
  }
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
    partnership.statusHistory.push({
      status:next,
      changedBy:id(admin),
      changedByRole:"admin",
      note:historyNote(review),
      changedAt:new Date()
    });
    partnership.updatedBy=id(admin);
    partnership.lastActivityAt=new Date();
    if(next === "rejected") partnership.rejectedAt=partnership.rejectedAt || new Date();
    if(next === "cancelled") partnership.cancelledAt=partnership.cancelledAt || new Date();
    await partnership.save();
  }

  const requester=id(review.requesterId);
  const school=id(partnership.schoolId);
  const company=id(partnership.companyId);
  const recipient=String(requester) === String(school) ? company : school;

  await notify(
    requester,
    `AIFT Review ${review.caseNumber}: partnership proposal is ${review.status.replaceAll("_"," ")}.`,
    String(requester) === String(school) ? "/school.html" : "/employer.html",
    admin
  );
  if(review.status === "approved"){
    await notify(
      recipient,
      `AIFT approved partnership proposal ${review.caseNumber} for your review.`,
      String(recipient) === String(school) ? "/school.html" : "/employer.html",
      admin
    );
  }
  return { synced:true, resourceStatus:partnership.status };
}

async function syncReviewDecision(review,admin){
  if(!review?.resourceId) return { synced:false, reason:"Review case has no resource" };

  switch(review.type){
    case "venture": return syncVenture(review,admin);
    case "investment_interest":
    case "opportunity":
      if(review.resourceType === "VentureInterest") return syncVentureInterest(review,admin);
      return { synced:false, reason:"Unsupported opportunity resource" };
    case "scholarship_application": return syncScholarshipApplication(review,admin);
    case "internship": return syncInternshipApplication(review,admin);
    case "partnership": return syncPartnership(review,admin);
    default: return { synced:false, reason:"Review type does not require resource synchronization" };
  }
}

module.exports={ syncReviewDecision };
