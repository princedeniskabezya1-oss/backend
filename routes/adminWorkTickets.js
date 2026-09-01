const express = require("express");
const auth = require("../middleware/auth");
const AdminWorkTicket = require("../models/AdminWorkTicket");
const ReviewCase = require("../models/ReviewCase");
const DealRoom = require("../models/DealRoom");
const PartnershipWorkspace = require("../models/PartnershipWorkspace");
const SchoolCompanyPartnership = require("../models/SchoolCompanyPartnership");

const router = express.Router();
router.use(auth);

const OPEN_REVIEW = new Set(["submitted", "under_review", "information_requested", "matched"]);
const ACTIVE_TICKET_STATUSES = ["new", "in_progress", "waiting"];

function isAdmin(user){ return String(user?.role || "").toLowerCase() === "admin"; }
function id(value){ return String(value?._id || value?.id || value || ""); }
function text(value,max=2000){ return String(value ?? "").trim().slice(0,max); }
function date(value){
  if(!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function latestDate(values){
  return values.map(date).filter(Boolean).sort((a,b)=>b-a)[0] || new Date();
}
function reviewName(review){ return review?.caseNumber || review?.title || "AIFT review"; }
function roomName(room){ return room?.ventureId?.title || room?.ventureTitle || "Venture Deal Room"; }
function partnershipName(partnership){
  return partnership?.title || `${partnership?.schoolName || "School"} × ${partnership?.companyName || "Company"}`;
}

async function upsertGenerated(activeKeys, spec){
  activeKeys.add(spec.key);
  let ticket = await AdminWorkTicket.findOne({ key:spec.key });
  const sourceActivityAt = date(spec.lastSourceActivityAt) || new Date();

  if(!ticket){
    ticket = new AdminWorkTicket({
      ...spec,
      lastSourceActivityAt:sourceActivityAt,
      status:spec.status || "new",
      history:[{
        status:spec.status || "new",
        note:"AIFT generated this work ticket from live workflow activity."
      }]
    });
    await ticket.save();
    return ticket;
  }

  const previousSource = date(ticket.lastSourceActivityAt);
  const sourceChanged = !previousSource || sourceActivityAt > previousSource;

  [
    "category","sourceType","sourceId","reviewCaseId","dealRoomId","partnershipId",
    "title","description","nextAction","priority","waitingOn","dueAt","targetUrl","metadata",
    "lastUserActivityAt"
  ].forEach(field=>{
    if(Object.prototype.hasOwnProperty.call(spec,field)) ticket[field] = spec[field];
  });
  ticket.lastSourceActivityAt = sourceActivityAt;

  const desired = spec.status || "new";
  if(ticket.status === "resolved" || ticket.status === "dismissed"){
    if(sourceChanged){
      ticket.status = desired;
      ticket.resolvedAt = null;
      ticket.history.push({status:desired,note:"New workflow activity reopened this ticket."});
    }
  }else if(desired === "new" && ticket.status === "waiting"){
    ticket.status = "new";
    ticket.waitingOn = spec.waitingOn || "aift";
    ticket.history.push({status:"new",note:"This item now requires AIFT action."});
  }else if(desired === "in_progress" && ticket.status === "new"){
    ticket.status = "in_progress";
    ticket.startedAt = ticket.startedAt || new Date();
    ticket.history.push({status:"in_progress",note:"The source workflow shows that review work has started."});
  }else if(desired === "waiting" && ticket.status === "new" && spec.forceWaiting === true){
    ticket.status = "waiting";
    ticket.history.push({status:"waiting",note:"This item is waiting on another party or a scheduled time."});
  }

  await ticket.save();
  return ticket;
}

async function syncReviewTickets(activeKeys){
  const cases = await ReviewCase.find({ status:{ $in:[...OPEN_REVIEW] } })
    .sort({ updatedAt:-1 })
    .limit(300)
    .lean();

  for(const review of cases){
    let status = "new";
    let waitingOn = "aift";
    let nextAction = "Review the submission and choose the correct AIFT action.";
    let priority = ["high","urgent"].includes(review.priority) ? review.priority : "normal";

    if(review.status === "under_review"){
      status = "in_progress";
      nextAction = "Continue the AIFT evaluation and record the next decision.";
    }else if(review.status === "information_requested"){
      status = "waiting";
      waitingOn = "user";
      nextAction = "Wait for the requester to provide the information AIFT requested.";
    }else if(review.status === "matched" && review.type === "investment_interest"){
      priority = "urgent";
      nextAction = "Open the controlled AIFT Deal Room for the matched investment introduction.";
    }

    await upsertGenerated(activeKeys,{
      key:`review:${id(review._id)}`,
      category:"review",
      sourceType:"review_case",
      sourceId:id(review._id),
      reviewCaseId:review._id,
      title:review.status === "matched" && review.type === "investment_interest"
        ? "Open matched investment Deal Room"
        : `Review ${text(review.type,80).replaceAll("_"," ")}`,
      description:`${reviewName(review)} · ${review.title || "AIFT review request"}`,
      nextAction,
      priority,
      status,
      waitingOn,
      lastSourceActivityAt:review.updatedAt || review.createdAt,
      lastUserActivityAt:review.createdAt,
      metadata:{reviewStatus:review.status,reviewType:review.type,caseNumber:review.caseNumber}
    });
  }
}

async function syncDealRoomTickets(activeKeys){
  const rooms = await DealRoom.find({ status:{ $in:["negotiation","completed","closed"] } })
    .populate("ventureId","title")
    .populate("reviewCaseId","caseNumber")
    .sort({ updatedAt:-1 })
    .limit(200);

  const now = new Date();

  for(const room of rooms){
    const roomTitle = roomName(room);
    const base = {
      sourceType:"deal_room",
      sourceId:id(room._id),
      dealRoomId:room._id,
      reviewCaseId:room.reviewCaseId?._id || room.reviewCaseId || null,
      targetUrl:`/deal-room.html?id=${encodeURIComponent(id(room._id))}`,
      metadata:{roomTitle,workflowStage:room.workflowStage,roomStatus:room.status}
    };

    for(const request of room.documentRequests || []){
      const requestId = id(request._id);
      const sourceAt = latestDate([request.reviewedAt, ...(request.files || []).map(file=>file.uploadedAt), request.updatedAt]);

      if(["requested","needs_replacement"].includes(request.status)){
        await upsertGenerated(activeKeys,{
          ...base,
          key:`deal:${id(room._id)}:document:${requestId}`,
          category:"document",
          title:`Waiting for document: ${request.title}`,
          description:`${roomTitle} · Requested from ${request.requestedFrom}.`,
          nextAction:request.status === "needs_replacement"
            ? "The participant must upload the replacement requested by AIFT."
            : "Wait for the requested participant to upload the files.",
          priority:request.status === "needs_replacement" ? "high" : "normal",
          status:"waiting",
          forceWaiting:true,
          waitingOn:"user",
          dueAt:request.dueAt || null,
          lastSourceActivityAt:sourceAt,
          lastUserActivityAt:sourceAt,
          metadata:{...base.metadata,requestId,requestTitle:request.title,requestStatus:request.status,requestedFrom:request.requestedFrom}
        });
      }

      if(["submitted","under_review"].includes(request.status)){
        await upsertGenerated(activeKeys,{
          ...base,
          key:`deal:${id(room._id)}:document:${requestId}`,
          category:"document",
          title:`Review submitted document: ${request.title}`,
          description:`${roomTitle} · ${request.files?.length || 0} file${request.files?.length === 1 ? "" : "s"} submitted privately to AIFT.`,
          nextAction:"Inspect the submitted files, record the review result, and decide whether counterparty access should be granted.",
          priority:"urgent",
          status:request.status === "under_review" ? "in_progress" : "new",
          waitingOn:"aift",
          dueAt:request.dueAt || null,
          lastSourceActivityAt:sourceAt,
          lastUserActivityAt:sourceAt,
          metadata:{...base.metadata,requestId,requestTitle:request.title,requestStatus:request.status,requestedFrom:request.requestedFrom,fileCount:request.files?.length || 0}
        });
      }
    }

    for(const meeting of room.meetings || []){
      const meetingId = id(meeting._id);
      const sourceAt = latestDate([meeting.respondedAt,meeting.scheduledAt,meeting.completedAt,meeting.updatedAt,meeting.createdAt]);

      if(["counterparty_accepted","accepted"].includes(meeting.status)){
        await upsertGenerated(activeKeys,{
          ...base,
          key:`deal:${id(room._id)}:meeting-schedule:${meetingId}`,
          category:"meeting",
          title:"Approve and schedule Deal Room meeting",
          description:`${roomTitle} · Both participants agreed to meet.`,
          nextAction:"AIFT must confirm the official meeting time and provide the controlled meeting link.",
          priority:"urgent",
          status:"new",
          waitingOn:"aift",
          lastSourceActivityAt:sourceAt,
          lastUserActivityAt:sourceAt,
          metadata:{...base.metadata,meetingId,meetingStatus:meeting.status}
        });
      }

      if(meeting.status === "scheduled"){
        const startAt = date(meeting.startAt);
        const duration = Math.max(15,Number(meeting.durationMinutes || 30));
        const evaluationDue = startAt ? new Date(startAt.getTime() + duration * 60000) : null;
        const duePassed = evaluationDue && evaluationDue <= now;
        await upsertGenerated(activeKeys,{
          ...base,
          key:`deal:${id(room._id)}:meeting-evaluate:${meetingId}`,
          category:"evaluation",
          title:duePassed ? "Evaluate completed meeting window" : "Upcoming Deal Room meeting",
          description:duePassed
            ? `${roomTitle} · The scheduled meeting time has passed.`
            : `${roomTitle} · Meeting scheduled for ${startAt ? startAt.toLocaleString() : "a future time"}.`,
          nextAction:duePassed
            ? "Confirm what happened in the meeting and mark it completed when appropriate."
            : "Keep this reminder until the meeting has taken place.",
          priority:duePassed ? "urgent" : "high",
          status:duePassed ? "new" : "waiting",
          forceWaiting:!duePassed,
          waitingOn:duePassed ? "aift" : "meeting_time",
          dueAt:evaluationDue,
          reminderAt:evaluationDue,
          lastSourceActivityAt:sourceAt,
          metadata:{...base.metadata,meetingId,meetingStatus:meeting.status,startAt:meeting.startAt}
        });
      }
    }

    const completedMeeting = (room.meetings || []).find(meeting=>meeting.status === "completed");
    if(completedMeeting && !room.decisionUnlocked && room.status === "negotiation"){
      await upsertGenerated(activeKeys,{
        ...base,
        key:`deal:${id(room._id)}:decision-unlock`,
        category:"decision",
        title:"Review room and unlock participant decision",
        description:`${roomTitle} · The AIFT-controlled meeting is complete.`,
        nextAction:"Review the room and due-diligence state, then unlock decisions only when AIFT is ready.",
        priority:"urgent",
        status:"new",
        waitingOn:"aift",
        lastSourceActivityAt:completedMeeting.completedAt || room.updatedAt,
        metadata:{...base.metadata,meetingId:id(completedMeeting._id)}
      });
    }

    const decisions = Array.isArray(room.decisions) ? room.decisions : [];
    const finalResult = String(room.finalOutcome?.result || "pending");
    const continueDecisions = decisions.filter(item=>item.decision === "continue");

    if(room.decisionUnlocked && continueDecisions.length && finalResult === "pending"){
      const sourceAt = latestDate(continueDecisions.map(item=>item.decidedAt));
      await upsertGenerated(activeKeys,{
        ...base,
        key:`deal:${id(room._id)}:continue-negotiation`,
        category:"negotiation",
        title:"Participant wants to continue negotiation",
        description:`${roomTitle} · ${continueDecisions.length} participant${continueDecisions.length === 1 ? " has" : "s have"} selected Continue.`,
        nextAction:decisions.length >= 2
          ? "Evaluate both decisions and publish the official AIFT outcome or next negotiation step."
          : "Review the Continue request and wait for the other participant's decision if still outstanding.",
        priority:decisions.length >= 2 ? "urgent" : "high",
        status:"new",
        waitingOn:"aift",
        lastSourceActivityAt:sourceAt,
        lastUserActivityAt:sourceAt,
        metadata:{...base.metadata,decisionCount:decisions.length,continueCount:continueDecisions.length}
      });
    }

    if(room.decisionUnlocked && decisions.length >= 2 && finalResult === "pending"){
      const sourceAt = latestDate(decisions.map(item=>item.decidedAt));
      await upsertGenerated(activeKeys,{
        ...base,
        key:`deal:${id(room._id)}:publish-outcome`,
        category:"decision",
        title:"Publish final AIFT Deal Room result",
        description:`${roomTitle} · Both participant decisions are available.`,
        nextAction:"Review both decisions and publish the official AIFT result.",
        priority:"urgent",
        status:"new",
        waitingOn:"aift",
        lastSourceActivityAt:sourceAt,
        lastUserActivityAt:sourceAt,
        metadata:{...base.metadata,decisionCount:decisions.length}
      });
    }

    if(finalResult === "more_information_required" && room.status === "negotiation"){
      await upsertGenerated(activeKeys,{
        ...base,
        key:`deal:${id(room._id)}:negotiation-followup`,
        category:"negotiation",
        title:"Continue negotiation follow-up",
        description:`${roomTitle} · AIFT requested more information before a final result.`,
        nextAction:"Decide what evidence, meeting, or evaluation is needed next and guide both participants.",
        priority:"high",
        status:"new",
        waitingOn:"aift",
        lastSourceActivityAt:room.finalOutcome?.decidedAt || room.updatedAt,
        metadata:{...base.metadata,finalResult}
      });
    }
  }
}

async function syncPartnershipTickets(activeKeys){
  const workspaces = await PartnershipWorkspace.find({})
    .populate({
      path:"partnershipId",
      select:"title schoolName companyName status schoolId companyId"
    })
    .sort({lastActivityAt:-1})
    .limit(200);

  const now = new Date();

  for(const workspace of workspaces){
    const partnership = workspace.partnershipId;
    if(!partnership) continue;
    if(!["review","approved","active","paused"].includes(partnership.status)) continue;
    const partnershipId = partnership._id;
    const name = partnershipName(partnership);
    const base = {
      sourceType:"partnership_workspace",
      sourceId:id(workspace._id),
      partnershipId,
      metadata:{workspaceId:id(workspace._id),partnershipStatus:partnership.status,partnershipName:name}
    };

    for(const meeting of workspace.meetingRequests || []){
      const sourceAt = latestDate([meeting.respondedAt,meeting.updatedAt,meeting.createdAt]);
      if(meeting.status === "requested"){
        await upsertGenerated(activeKeys,{
          ...base,
          key:`partnership:${id(partnershipId)}:meeting:${id(meeting._id)}`,
          category:"meeting",
          title:"Partnership meeting awaiting response",
          description:`${name} · One organization requested a private partnership meeting.`,
          nextAction:"No AIFT action is required yet; keep this visible until the other organization responds.",
          priority:"normal",
          status:"waiting",
          forceWaiting:true,
          waitingOn:"counterparty",
          dueAt:meeting.preferredAt || null,
          lastSourceActivityAt:sourceAt,
          lastUserActivityAt:sourceAt,
          metadata:{...base.metadata,meetingRequestId:id(meeting._id),meetingStatus:meeting.status}
        });
      }

      if(meeting.status === "scheduled"){
        const preferredAt = date(meeting.preferredAt);
        const duration = Math.max(15,Number(meeting.durationMinutes || 30));
        const evaluationDue = preferredAt ? new Date(preferredAt.getTime() + duration * 60000) : null;
        const duePassed = evaluationDue && evaluationDue <= now;
        await upsertGenerated(activeKeys,{
          ...base,
          key:`partnership:${id(partnershipId)}:evaluate:${id(meeting._id)}`,
          category:"evaluation",
          title:duePassed ? "Review partnership meeting outcome" : "Upcoming partnership meeting",
          description:duePassed ? `${name} · The private partnership meeting time has passed.` : `${name} · Private meeting scheduled.`,
          nextAction:duePassed
            ? "Review the latest partnership agreement activity and determine whether any AIFT follow-up is needed."
            : "Keep this reminder visible until the meeting time passes.",
          priority:duePassed ? "high" : "normal",
          status:duePassed ? "new" : "waiting",
          forceWaiting:!duePassed,
          waitingOn:duePassed ? "aift" : "meeting_time",
          dueAt:evaluationDue,
          reminderAt:evaluationDue,
          lastSourceActivityAt:sourceAt,
          metadata:{...base.metadata,meetingRequestId:id(meeting._id),meetingStatus:meeting.status}
        });
      }
    }

    const workItems = Array.isArray(workspace.workItems) ? workspace.workItems : [];
    const agreed = workItems.filter(item=>item.status === "agreed");
    const proposed = workItems.filter(item=>item.status === "proposed");
    if(partnership.status === "review" && agreed.length && proposed.length === 0){
      await upsertGenerated(activeKeys,{
        ...base,
        key:`partnership:${id(partnershipId)}:agreement-review`,
        category:"partnership",
        title:"Evaluate negotiated partnership scope",
        description:`${name} · ${agreed.length} partnership plan${agreed.length === 1 ? "" : "s"} agreed by both organizations.`,
        nextAction:"Review the negotiated scope, meeting activity, and readiness before the partnership moves toward approval/activation.",
        priority:"high",
        status:"new",
        waitingOn:"aift",
        lastSourceActivityAt:workspace.lastActivityAt || workspace.updatedAt,
        lastUserActivityAt:workspace.lastActivityAt || workspace.updatedAt,
        metadata:{...base.metadata,agreedItems:agreed.length}
      });
    }
  }
}

async function syncTickets(){
  const activeKeys = new Set();
  await syncReviewTickets(activeKeys);
  await syncDealRoomTickets(activeKeys);
  await syncPartnershipTickets(activeKeys);

  const current = await AdminWorkTicket.find({generated:true,status:{$in:ACTIVE_TICKET_STATUSES}}).select("_id key status");
  const stale = current.filter(ticket=>!activeKeys.has(ticket.key));
  if(stale.length){
    const now = new Date();
    await AdminWorkTicket.updateMany(
      {_id:{$in:stale.map(ticket=>ticket._id)}},
      {$set:{status:"resolved",resolvedAt:now,waitingOn:"",lastAdminActivityAt:now},$push:{history:{status:"resolved",note:"The linked workflow no longer requires this ticket.",at:now}}}
    );
  }
}

router.get("/",async(req,res)=>{
  try{
    if(!isAdmin(req.user)) return res.status(403).json({message:"Admin access required"});
    if(String(req.query.sync || "true") !== "false") await syncTickets();

    const filter = {};
    if(req.query.status){
      const statuses = String(req.query.status).split(",").map(value=>value.trim()).filter(Boolean);
      if(statuses.length) filter.status = {$in:statuses};
    }
    if(req.query.category) filter.category = req.query.category;
    if(req.query.search){
      const search = text(req.query.search,160);
      filter.$or = [
        {title:{$regex:search,$options:"i"}},
        {description:{$regex:search,$options:"i"}},
        {nextAction:{$regex:search,$options:"i"}}
      ];
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 250),1),500);
    const tickets = await AdminWorkTicket.find(filter)
      .populate("assignedTo","name email profileImage role")
      .populate("openedBy","name email profileImage role")
      .populate("reviewCaseId","caseNumber type status title requesterId")
      .populate("partnershipId","title schoolName companyName status")
      .sort({status:1,priority:-1,reminderAt:1,updatedAt:-1})
      .limit(limit)
      .lean();

    const counts = await AdminWorkTicket.aggregate([
      {$group:{_id:"$status",count:{$sum:1}}}
    ]);
    const summary = {new:0,in_progress:0,waiting:0,resolved:0,dismissed:0};
    counts.forEach(item=>{ if(Object.prototype.hasOwnProperty.call(summary,item._id)) summary[item._id]=item.count; });

    return res.json({tickets,summary,total:tickets.length,syncedAt:new Date()});
  }catch(error){
    console.error("ADMIN WORK TICKETS ERROR:",error);
    return res.status(500).json({message:"Could not load the AIFT Admin Work Queue"});
  }
});

router.patch("/:id",async(req,res)=>{
  try{
    if(!isAdmin(req.user)) return res.status(403).json({message:"Admin access required"});
    const ticket = await AdminWorkTicket.findById(req.params.id);
    if(!ticket) return res.status(404).json({message:"Work ticket not found"});

    const now = new Date();
    const allowedStatuses = new Set(["new","in_progress","waiting","resolved","dismissed"]);
    const nextStatus = req.body.status ? String(req.body.status).toLowerCase() : "";
    const note = text(req.body.note,1600);

    if(nextStatus){
      if(!allowedStatuses.has(nextStatus)) return res.status(400).json({message:"Invalid work ticket status"});
      if(nextStatus !== ticket.status){
        ticket.status = nextStatus;
        ticket.history.push({status:nextStatus,note:note || `Admin changed the ticket to ${nextStatus.replaceAll("_"," ")}.`,actorId:req.user._id || req.user.id,at:now});
      }
      if(nextStatus === "in_progress"){
        ticket.openedBy = ticket.openedBy || req.user._id || req.user.id;
        ticket.openedAt = ticket.openedAt || now;
        ticket.startedAt = ticket.startedAt || now;
        ticket.assignedTo = ticket.assignedTo || req.user._id || req.user.id;
        ticket.waitingOn = "aift";
      }
      if(nextStatus === "resolved" || nextStatus === "dismissed"){
        ticket.resolvedAt = now;
        ticket.waitingOn = "";
      }else{
        ticket.resolvedAt = null;
      }
    }

    if(req.body.priority && ["low","normal","high","urgent"].includes(req.body.priority)) ticket.priority=req.body.priority;
    if(Object.prototype.hasOwnProperty.call(req.body,"reminderAt")) ticket.reminderAt = req.body.reminderAt ? date(req.body.reminderAt) : null;
    if(Object.prototype.hasOwnProperty.call(req.body,"assignedTo")) ticket.assignedTo = req.body.assignedTo || null;
    if(req.body.waitingOn && ["aift","user","counterparty","meeting_time"].includes(req.body.waitingOn)) ticket.waitingOn=req.body.waitingOn;

    ticket.lastAdminActivityAt = now;
    if(note && !nextStatus) ticket.history.push({status:ticket.status,note,actorId:req.user._id || req.user.id,at:now});
    await ticket.save();

    return res.json({message:"Work ticket updated",ticket});
  }catch(error){
    console.error("UPDATE ADMIN WORK TICKET ERROR:",error);
    return res.status(500).json({message:"Could not update the work ticket"});
  }
});

module.exports = router;
module.exports.syncTickets = syncTickets;
