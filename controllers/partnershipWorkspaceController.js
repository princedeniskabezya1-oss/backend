const crypto = require("crypto");
const mongoose = require("mongoose");

const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");
const PartnershipWorkspace = require("../models/PartnershipWorkspace");
const Meeting = require("../models/Meeting");
const Notification = require("../models/Notification");

const COMPANY_ROLES = new Set(["employer","company"]);
const WORKSPACE_STATUSES = new Set(["review","approved","active","paused"]);
const EDITABLE_STATUSES = new Set(["review","approved"]);
const CAPABILITY_KEYS = [
  "internships",
  "jobs",
  "recruitment",
  "training",
  "careerEvents",
  "scholarships",
  "mentorship",
  "research"
];
const WORK_TYPES = new Set([
  "internship",
  "job",
  "recruitment",
  "training",
  "scholarship",
  "career_event",
  "mentorship",
  "research",
  "student_project",
  "industry_project",
  "other"
]);

function id(value){
  if(value && typeof value === "object") return String(value._id || value.id || "");
  return String(value || "");
}
function same(left,right){ return Boolean(id(left) && id(right) && id(left) === id(right)); }
function userId(req){ return id(req.user?._id || req.user?.id); }
function role(req){ return String(req.user?.role || "").trim().toLowerCase(); }
function text(value,max=3000){ return String(value ?? "").trim().slice(0,max); }
function validId(value){ return mongoose.Types.ObjectId.isValid(id(value)); }
function list(value,max=500){
  const source=Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(source.map(item=>text(item,max)).filter(Boolean))].slice(0,100);
}
function bool(value){ return value === true || value === "true" || value === 1 || value === "1"; }
function partyRole(req,partnership){
  if(role(req) === "admin") return "admin";
  if(role(req) === "school" && same(partnership.schoolId,userId(req))) return "school";
  if(COMPANY_ROLES.has(role(req)) && same(partnership.companyId,userId(req))) return "company";
  return "";
}
function counterpartId(req,partnership){
  const party=partyRole(req,partnership);
  if(party === "school") return id(partnership.companyId);
  if(party === "company") return id(partnership.schoolId);
  return "";
}
function counterpartLabel(req,partnership){
  const party=partyRole(req,partnership);
  return party === "school" ? (partnership.companyName || "Company") : (partnership.schoolName || "School");
}
function dashboardLink(req){ return partyRole(req,{schoolId:userId(req),companyId:userId(req)}) === "school" ? "/school.html" : "/employer.html"; }

async function notify(user,sender,message,link){
  if(!validId(user)) return;
  await Notification.create({
    user,
    sender:validId(sender) ? sender : undefined,
    type:"opportunity",
    text:text(message,1000),
    link:text(link,1500)
  }).catch(()=>{});
}

async function loadPartnership(req,partnershipId){
  if(!validId(partnershipId)) return {error:{status:400,message:"Invalid partnership id."}};

  const partnership=await SchoolCompanyPartnership.findById(partnershipId)
    .populate("schoolId","name schoolName schoolLogo profileImage profilePicture avatar email")
    .populate("companyId","name companyName logo profileImage profilePicture avatar email industry");

  if(!partnership) return {error:{status:404,message:"Partnership not found."}};
  if(!partyRole(req,partnership)) return {error:{status:403,message:"You are not part of this partnership."}};

  if(!WORKSPACE_STATUSES.has(partnership.status)){
    return {
      error:{
        status:409,
        message:partnership.status === "pending"
          ? "AIFT must verify the partnership introduction before the private workspace opens."
          : "This partnership workspace is not available at the current stage."
      },
      partnership
    };
  }

  return {partnership};
}

function workspaceView(workspace,partnership,req){
  const obj=workspace.toObject ? workspace.toObject() : workspace;
  return {
    ...obj,
    partnership:{
      _id:partnership._id,
      title:partnership.title,
      type:partnership.type,
      status:partnership.status,
      requestedBy:partnership.requestedBy,
      schoolId:partnership.schoolId,
      companyId:partnership.companyId,
      schoolName:partnership.schoolName,
      companyName:partnership.companyName,
      capabilities:partnership.capabilities,
      activities:partnership.activities,
      targetPrograms:partnership.targetPrograms,
      objective:partnership.objective,
      description:partnership.description,
      proposedStartDate:partnership.proposedStartDate,
      proposedEndDate:partnership.proposedEndDate
    },
    viewerRole:partyRole(req,partnership),
    canEditAgreement:EDITABLE_STATUSES.has(partnership.status),
    canRequestMeeting:EDITABLE_STATUSES.has(partnership.status),
    canApprovePartnership:partnership.status === "review"
  };
}

async function getOrCreateWorkspace(partnership){
  let workspace=await PartnershipWorkspace.findOne({partnershipId:partnership._id});
  if(workspace) return workspace;

  workspace=await PartnershipWorkspace.create({
    partnershipId:partnership._id,
    agreementSummary:partnership.objective || partnership.description || "",
    capabilities:{
      internships:partnership.capabilities?.internships === true,
      jobs:partnership.capabilities?.jobs === true,
      recruitment:partnership.capabilities?.recruitment === true,
      training:partnership.capabilities?.training === true,
      careerEvents:partnership.capabilities?.careerEvents === true,
      scholarships:partnership.capabilities?.scholarships === true,
      mentorship:partnership.capabilities?.mentorship === true,
      research:partnership.capabilities?.research === true
    },
    activities:Array.isArray(partnership.activities) ? partnership.activities : [],
    targetPrograms:Array.isArray(partnership.targetPrograms) ? partnership.targetPrograms : []
  });
  return workspace;
}

async function populateWorkspace(workspaceId){
  return PartnershipWorkspace.findById(workspaceId)
    .populate("updatedBy","name schoolName companyName role profileImage")
    .populate("workItems.proposedBy","name schoolName companyName role profileImage")
    .populate("workItems.respondedBy","name schoolName companyName role profileImage")
    .populate("meetingRequests.requestedBy","name schoolName companyName role profileImage")
    .populate("meetingRequests.respondedBy","name schoolName companyName role profileImage")
    .populate("meetingRequests.meetingId","title meetingCode joinUrl startTime endTime status host invitedUsers");
}

async function getWorkspace(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message,partnershipStatus:loaded.partnership?.status});

    const workspace=await getOrCreateWorkspace(loaded.partnership);
    const populated=await populateWorkspace(workspace._id);
    return res.json({success:true,workspace:workspaceView(populated,loaded.partnership,req)});
  }catch(error){
    console.error("GET PARTNERSHIP WORKSPACE ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to load the partnership workspace."});
  }
}

async function updateAgreement(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message});
    const partnership=loaded.partnership;

    if(!EDITABLE_STATUSES.has(partnership.status)){
      return res.status(409).json({success:false,message:"Agreement details can only be negotiated before the partnership becomes active."});
    }

    const workspace=await getOrCreateWorkspace(partnership);
    if(req.body.agreementSummary !== undefined) workspace.agreementSummary=text(req.body.agreementSummary,8000);
    if(req.body.activities !== undefined) workspace.activities=list(req.body.activities,1000);
    if(req.body.targetPrograms !== undefined) workspace.targetPrograms=list(req.body.targetPrograms,180);

    if(req.body.capabilities && typeof req.body.capabilities === "object"){
      CAPABILITY_KEYS.forEach(key=>{
        if(req.body.capabilities[key] !== undefined) workspace.capabilities[key]=bool(req.body.capabilities[key]);
      });
    }

    workspace.updatedBy=userId(req);
    workspace.lastActivityAt=new Date();
    await workspace.save();

    partnership.objective=workspace.agreementSummary;
    partnership.activities=workspace.activities;
    partnership.targetPrograms=workspace.targetPrograms;
    CAPABILITY_KEYS.forEach(key=>{ partnership.capabilities[key]=workspace.capabilities[key] === true; });
    partnership.updatedBy=userId(req);
    partnership.lastActivityAt=new Date();
    await partnership.save();

    const populated=await populateWorkspace(workspace._id);
    return res.json({success:true,message:"Partnership agreement updated.",workspace:workspaceView(populated,partnership,req)});
  }catch(error){
    console.error("UPDATE PARTNERSHIP AGREEMENT ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to update the partnership agreement."});
  }
}

async function proposeWorkItem(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message});
    if(!EDITABLE_STATUSES.has(loaded.partnership.status)) return res.status(409).json({success:false,message:"New partnership plans can only be proposed during agreement review."});

    const title=text(req.body.title,220);
    if(!title) return res.status(400).json({success:false,message:"Add a title for what you want to work on."});
    const type=WORK_TYPES.has(String(req.body.type||"").toLowerCase()) ? String(req.body.type).toLowerCase() : "other";

    const workspace=await getOrCreateWorkspace(loaded.partnership);
    workspace.workItems.push({
      type,
      title,
      description:text(req.body.description,3000),
      proposedBy:userId(req),
      status:"proposed"
    });
    workspace.updatedBy=userId(req);
    workspace.lastActivityAt=new Date();
    await workspace.save();

    await notify(
      counterpartId(req,loaded.partnership),
      userId(req),
      `A new ${type.replaceAll("_"," ")} idea was added to your partnership workspace: ${title}.`,
      partyRole(req,loaded.partnership) === "school" ? "/employer.html" : "/school.html"
    );

    const populated=await populateWorkspace(workspace._id);
    return res.status(201).json({success:true,message:"Partnership plan proposed.",workspace:workspaceView(populated,loaded.partnership,req)});
  }catch(error){
    console.error("PROPOSE PARTNERSHIP WORK ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to add the partnership plan."});
  }
}

async function respondWorkItem(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message});
    if(!EDITABLE_STATUSES.has(loaded.partnership.status)) return res.status(409).json({success:false,message:"Partnership plans can no longer be changed at this stage."});

    const workspace=await getOrCreateWorkspace(loaded.partnership);
    const item=workspace.workItems.id(req.params.itemId);
    if(!item) return res.status(404).json({success:false,message:"Partnership plan not found."});
    if(same(item.proposedBy,userId(req))) return res.status(403).json({success:false,message:"The other party must respond to this partnership plan."});
    if(item.status !== "proposed") return res.status(409).json({success:false,message:"This partnership plan already has a response."});

    const status=String(req.body.status||"").toLowerCase();
    if(!["agreed","declined"].includes(status)) return res.status(400).json({success:false,message:"Choose Agree or Decline."});

    item.status=status;
    item.respondedBy=userId(req);
    item.respondedAt=new Date();
    workspace.updatedBy=userId(req);
    workspace.lastActivityAt=new Date();
    await workspace.save();

    const populated=await populateWorkspace(workspace._id);
    return res.json({success:true,message:status === "agreed" ? "Partnership plan agreed." : "Partnership plan declined.",workspace:workspaceView(populated,loaded.partnership,req)});
  }catch(error){
    console.error("RESPOND PARTNERSHIP WORK ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to update the partnership plan."});
  }
}

async function uniqueMeetingCode(){
  for(let i=0;i<10;i+=1){
    const code=crypto.randomBytes(5).toString("hex").toUpperCase();
    if(!(await Meeting.exists({meetingCode:code}))) return code;
  }
  throw new Error("Could not create a meeting code");
}

function meetingJoinUrl(req,code){
  const frontend=String(process.env.FRONTEND_URL || req.headers.origin || "").replace(/\/+$/,"");
  return `${frontend}/meeting.html?code=${encodeURIComponent(code)}`;
}

async function requestMeeting(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message});
    if(!EDITABLE_STATUSES.has(loaded.partnership.status)) return res.status(409).json({success:false,message:"Meeting requests are for the private agreement stage before activation."});

    const preferredAt=new Date(req.body.preferredAt);
    if(Number.isNaN(preferredAt.getTime()) || preferredAt <= new Date()) return res.status(400).json({success:false,message:"Choose a future date and time for the meeting."});

    const duration=Math.max(15,Math.min(Number(req.body.durationMinutes||30),180));
    const workspace=await getOrCreateWorkspace(loaded.partnership);

    const existing=workspace.meetingRequests.some(item=>
      same(item.requestedBy,userId(req)) && item.status === "requested"
    );
    if(existing) return res.status(409).json({success:false,message:"You already have a meeting request waiting for the other party."});

    workspace.meetingRequests.push({
      requestedBy:userId(req),
      preferredAt,
      durationMinutes:duration,
      purpose:text(req.body.purpose,1800),
      status:"requested"
    });
    workspace.updatedBy=userId(req);
    workspace.lastActivityAt=new Date();
    await workspace.save();

    await notify(
      counterpartId(req,loaded.partnership),
      userId(req),
      `${counterpartLabel(req,loaded.partnership)} partnership: a private agreement meeting was requested.`,
      partyRole(req,loaded.partnership) === "school" ? "/employer.html" : "/school.html"
    );

    const populated=await populateWorkspace(workspace._id);
    return res.status(201).json({success:true,message:"Meeting request sent to the other party.",workspace:workspaceView(populated,loaded.partnership,req)});
  }catch(error){
    console.error("REQUEST PARTNERSHIP MEETING ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to request the partnership meeting."});
  }
}

async function respondMeeting(req,res){
  try{
    const loaded=await loadPartnership(req,req.params.partnershipId);
    if(loaded.error) return res.status(loaded.error.status).json({success:false,message:loaded.error.message});
    if(!EDITABLE_STATUSES.has(loaded.partnership.status)) return res.status(409).json({success:false,message:"Meeting requests can no longer be changed at this stage."});

    const workspace=await getOrCreateWorkspace(loaded.partnership);
    const request=workspace.meetingRequests.id(req.params.requestId);
    if(!request) return res.status(404).json({success:false,message:"Meeting request not found."});
    if(same(request.requestedBy,userId(req))) return res.status(403).json({success:false,message:"The other party must respond to this meeting request."});
    if(request.status !== "requested") return res.status(409).json({success:false,message:"This meeting request already has a response."});

    const decision=String(req.body.status||"").toLowerCase();
    if(!["accepted","declined"].includes(decision)) return res.status(400).json({success:false,message:"Choose Accept or Decline."});

    request.respondedBy=userId(req);
    request.respondedAt=new Date();
    request.responseNote=text(req.body.note,1200);

    if(decision === "declined"){
      request.status="declined";
      workspace.updatedBy=userId(req);
      workspace.lastActivityAt=new Date();
      await workspace.save();
    }else{
      const code=await uniqueMeetingCode();
      const requester=id(request.requestedBy);
      const counterparty=userId(req);
      const startTime=request.preferredAt;
      const endTime=new Date(startTime.getTime() + request.durationMinutes * 60000);

      const meeting=await Meeting.create({
        title:`Partnership Agreement — ${loaded.partnership.schoolName || "School"} × ${loaded.partnership.companyName || "Company"}`,
        description:request.purpose || "Private AIFT partnership agreement meeting.",
        host:requester,
        schoolId:id(loaded.partnership.schoolId),
        companyId:id(loaded.partnership.companyId),
        meetingCode:code,
        joinUrl:meetingJoinUrl(req,code),
        meetingType:"scheduled",
        status:"scheduled",
        invitedUsers:[counterparty],
        startTime,
        endTime,
        accessMode:"invite_only",
        allowGuests:false,
        requireHostApproval:false,
        allowJoinBeforeHost:true,
        waitingRoomEnabled:false,
        recordingEnabled:false,
        allowFileSharing:false,
        participants:[{
          user:requester,
          role:"host",
          audioEnabled:true,
          videoEnabled:true
        }]
      });

      request.status="scheduled";
      request.meetingId=meeting._id;
      workspace.updatedBy=userId(req);
      workspace.lastActivityAt=new Date();
      await workspace.save();

      await notify(
        requester,
        userId(req),
        `Your partnership meeting request was accepted. The AIFT meeting is scheduled for ${startTime.toLocaleString()}.`,
        `/meeting.html?code=${code}`
      );
      await notify(
        counterparty,
        requester,
        `Partnership meeting scheduled for ${startTime.toLocaleString()}.`,
        `/meeting.html?code=${code}`
      );
    }

    const populated=await populateWorkspace(workspace._id);
    return res.json({success:true,message:decision === "accepted" ? "Meeting accepted and scheduled inside AIFT." : "Meeting request declined.",workspace:workspaceView(populated,loaded.partnership,req)});
  }catch(error){
    console.error("RESPOND PARTNERSHIP MEETING ERROR:",error);
    return res.status(500).json({success:false,message:"Unable to respond to the partnership meeting."});
  }
}

module.exports={
  getWorkspace,
  updateAgreement,
  proposeWorkItem,
  respondWorkItem,
  requestMeeting,
  respondMeeting
};
