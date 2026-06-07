const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const Meeting = require("../models/Meeting");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const CallLog = require("../models/CallLog");

const authMiddleware = require("../middleware/auth");

const router = express.Router();

function isValidId(id){
  return mongoose.Types.ObjectId.isValid(id);
}

function getIo(req){
  return req.app.get("io") || req.io;
}

function safeString(value = ""){
  return String(value || "").trim();
}

function makeMeetingCode(){
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function hashPassword(password){
  if(!password) return "";
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function passwordMatches(input, stored){
  if(!stored) return true;
  return stored === hashPassword(input) || stored === input;
}

function buildJoinUrl(req, code){
  const frontend =
    process.env.FRONTEND_URL ||
    req.headers.origin ||
    "";

  return `${frontend}/meeting.html?code=${encodeURIComponent(code)}`;
}

async function createUniqueMeetingCode(){
  let code = makeMeetingCode();

  for(let i = 0; i < 8; i++){
    const exists = await Meeting.exists({ meetingCode:code });
    if(!exists) return code;
    code = makeMeetingCode();
  }

  throw new Error("Could not generate unique meeting code");
}

function canViewMeeting(meeting,userId){
  const id = String(userId);

  if(String(meeting.host) === id) return true;

  if(meeting.accessMode === "open") return true;

  if(meeting.accessMode === "waiting_room") return true;

  if(meeting.invitedUsers?.some(user => String(user?._id || user) === id)) return true;

  if(meeting.waitingRoomUsers?.some(user => String(user?._id || user) === id)) return true;

  if(meeting.participants?.some(p => String(p.user?._id || p.user) === id)) return true;

  return false;
}

function isHost(meeting,userId){
  return String(meeting.host) === String(userId);
}

function isHostOrCohost(meeting,userId){
  if(isHost(meeting,userId)) return true;

  return meeting.participants?.some(p =>
    String(p.user) === String(userId) &&
    ["host","cohost"].includes(p.role)
  );
}

function getParticipant(meeting,userId){
  return meeting.participants.find(p => String(participantUserId(p)) === String(userId));
}

async function findOrCreateDirectConversation(userA,userB,createdBy){
  let conversation = await Conversation.findOne({
    type:"direct",
    participantIds:{
      $all:[userA,userB]
    }
  });

  if(conversation) return conversation;

  return Conversation.create({
    type:"direct",
    createdBy,
    participants:[
      {
        user:userA,
        role:"member"
      },
      {
        user:userB,
        role:"member"
      }
    ],
    participantIds:[userA,userB],
    metadata:{
      source:"meeting_invite"
    }
  });
}

function emitMeeting(req,meeting,event,payload = {}){
  getIo(req)?.to(`meeting:${meeting._id}`).emit(event,{
    meetingId:meeting._id,
    ...payload
  });
}

async function addSystemMessage(conversationId,text,userId){
  if(!conversationId || !isValidId(conversationId)) return null;

  const conversation = await Conversation.findById(conversationId);
  if(!conversation) return null;

  const participants = conversation.participantIds || [];

  const receiver =
    participants.find(id => String(id) !== String(userId)) ||
    participants[0];

  if(!receiver) return null;

  const message = await Message.create({
    conversationId,
    sender:userId,
    receiver,
    participants,
    text,
    messageType:"system"
  });

  conversation.setLastMessage(message);
  await conversation.save();

  return message;
}
function normalizeAccessMode(value){
  const mode = String(value || "").toLowerCase();

  if(["open","restricted","waiting_room","invite_only","domain_only"].includes(mode)){
    return mode;
  }

  return "restricted";
}

function participantUserId(participant){
  return (
    participant?.user?._id ||
    participant?.user?.id ||
    participant?.user ||
    ""
  );
}

function isParticipantActive(meeting,userId){
  return meeting.participants?.some(p =>
    String(participantUserId(p)) === String(userId) &&
    !p.leftAt &&
    p.removedByHost !== true
  );
}

function isInvited(meeting,userId){
  return meeting.invitedUsers?.some(id =>
    String(id?._id || id) === String(userId)
  );
}

function canJoinMeeting(meeting,user){
  if(!meeting || !user) return false;

  const userId = user.id || user._id;

  if(isHost(meeting,userId)) return true;

  if(meeting.lockMeeting){
    return false;
  }

  if(isParticipantActive(meeting,userId)){
    return true;
  }

  if(meeting.accessMode === "open"){
    return true;
  }

  if(meeting.accessMode === "invite_only"){
    return isInvited(meeting,userId);
  }

  if(meeting.accessMode === "waiting_room"){
    return true;
  }

  if(meeting.accessMode === "domain_only"){
    if(!meeting.companyId && !meeting.schoolId){
      return false;
    }

    return (
      String(user.companyId || "") === String(meeting.companyId || "") ||
      String(user.schoolId || user.linkedSchoolId || "") === String(meeting.schoolId || "")
    );
  }

  return isInvited(meeting,userId);
}

/* =========================
   CREATE MEETING
========================= */

router.post("/", authMiddleware, async (req,res)=>{
  try{
    const title = safeString(req.body.title);

    if(!title){
      return res.status(400).json({ message:"Meeting title is required" });
    }

    const code = await createUniqueMeetingCode();

    const invitedUsers = Array.isArray(req.body.invitedUsers)
      ? req.body.invitedUsers.filter(isValidId)
      : [];

    const meeting = await Meeting.create({
      title,
      description:safeString(req.body.description),
      host:req.user.id,
      conversationId:isValidId(req.body.conversationId) ? req.body.conversationId : undefined,
      schoolId:isValidId(req.body.schoolId) ? req.body.schoolId : undefined,
      companyId:isValidId(req.body.companyId) ? req.body.companyId : undefined,
      classId:isValidId(req.body.classId) ? req.body.classId : undefined,
      meetingCode:code,
      joinUrl:buildJoinUrl(req,code),
      meetingType:req.body.meetingType || "instant",
      status:req.body.meetingType === "scheduled" ? "scheduled" : "waiting",
      invitedUsers,
      startTime:req.body.startTime || undefined,
      endTime:req.body.endTime || undefined,
      maxParticipants:Number(req.body.maxParticipants || 100),
      passwordProtected:!!req.body.passwordProtected,
      password:req.body.passwordProtected ? hashPassword(req.body.password) : "",
accessMode:normalizeAccessMode(req.body.accessMode || "open"),
allowGuests:req.body.allowGuests === true,
requireHostApproval:req.body.requireHostApproval === true,
lockMeeting:false,
allowJoinBeforeHost:req.body.allowJoinBeforeHost === true,

hostControls:{
  muteParticipantsOnEntry:req.body.hostControls?.muteParticipantsOnEntry === true,
  allowParticipantsToUnmute:req.body.hostControls?.allowParticipantsToUnmute !== false,
  allowParticipantsToShareScreen:req.body.hostControls?.allowParticipantsToShareScreen !== false,
  allowParticipantsToChat:req.body.hostControls?.allowParticipantsToChat !== false,
  allowParticipantsToInvite:req.body.hostControls?.allowParticipantsToInvite === true
},

waitingRoomEnabled:!!req.body.waitingRoomEnabled,
recordingEnabled:!!req.body.recordingEnabled,
allowScreenShare:req.body.allowScreenShare !== false,
      allowChat:req.body.allowChat !== false,
      allowFileSharing:req.body.allowFileSharing !== false,
      allowRaiseHand:req.body.allowRaiseHand !== false,
      allowParticipantVideo:req.body.allowParticipantVideo !== false,
      allowParticipantAudio:req.body.allowParticipantAudio !== false,
      participants:[
        {
          user:req.user.id,
          role:"host",
          joinedAt:req.body.meetingType === "scheduled" ? undefined : new Date(),
          audioEnabled:true,
          videoEnabled:true
        }
      ]
    });

    if(meeting.conversationId){
      await Conversation.findByIdAndUpdate(meeting.conversationId,{
        startedAsMeeting:meeting.meetingType === "instant",
        lastMeetingAt:new Date()
      });

      await addSystemMessage(
        meeting.conversationId,
        `Meeting created: ${meeting.title}`,
        req.user.id
      );
    }

    invitedUsers.forEach(userId=>{
      getIo(req)?.to(String(userId)).emit("meetingInvited",{
        meetingId:meeting._id,
        title:meeting.title,
        meetingCode:meeting.meetingCode,
        joinUrl:meeting.joinUrl,
        host:req.user.id
      });
    });

    res.status(201).json(meeting);

  }catch(error){
    console.error("CREATE MEETING ERROR:",error);
    res.status(500).json({ message:error.message || "Unable to create meeting" });
  }
});

/* =========================
   LIST MY MEETINGS
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const query = {
      $or:[
        { host:req.user.id },
        { invitedUsers:req.user.id },
        { "participants.user":req.user.id }
      ]
    };

    if(req.query.status) query.status = req.query.status;
    if(req.query.type) query.meetingType = req.query.type;

    const meetings = await Meeting.find(query)
      .populate("host","name companyName schoolName role profileImage logo")
      .populate("participants.user","name companyName schoolName role profileImage logo")
      .sort({ startTime:1, createdAt:-1 })
      .limit(Math.min(Number(req.query.limit || 80),150));

    res.json(meetings);

  }catch(error){
    console.error("LIST MEETINGS ERROR:",error);
    res.status(500).json({ message:"Unable to load meetings" });
  }
});

/* =========================
   GET BY CODE
   IMPORTANT: this must stay before /:id
========================= */

router.get("/code/:code", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findOne({
      meetingCode:String(req.params.code || "").toUpperCase()
    })
      .populate("host","name companyName schoolName role profileImage logo")
      .populate("participants.user","name companyName schoolName role profileImage logo")
      .populate("invitedUsers","name companyName schoolName role profileImage logo");

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    res.json(meeting);

  }catch(error){
    console.error("GET MEETING BY CODE ERROR:",error);
    res.status(500).json({ message:"Unable to load meeting" });
  }
});

/* =========================
   GET BY ID
========================= */

router.get("/:id", authMiddleware, async (req,res)=>{
  try{
    if(!isValidId(req.params.id)){
      return res.status(400).json({ message:"Invalid meeting ID" });
    }

    const meeting = await Meeting.findById(req.params.id)
      .populate("host","name companyName schoolName role profileImage logo")
      .populate("participants.user","name companyName schoolName role profileImage logo")
      .populate("invitedUsers","name companyName schoolName role profileImage logo");

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!canViewMeeting(meeting,req.user.id)){
      return res.status(403).json({ message:"You do not have access to this meeting" });
    }

    res.json(meeting);

  }catch(error){
    console.error("GET MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to load meeting" });
  }
});

/* =========================
   JOIN
========================= */

router.post("/:id/join", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(["ended","cancelled"].includes(meeting.status)){
      return res.status(400).json({ message:"This meeting is no longer available" });
    }

if(meeting.passwordProtected && !passwordMatches(req.body.password,meeting.password)){
  return res.status(403).json({ message:"Incorrect meeting password" });
}

if(!canJoinMeeting(meeting,req.user)){
  return res.status(403).json({
    message:"You need an invitation or host approval to join this meeting"
  });
}

const participant = getParticipant(meeting,req.user.id);

if(
  (
    meeting.waitingRoomEnabled ||
    meeting.accessMode === "waiting_room" ||
    meeting.requireHostApproval
  ) &&
  !participant &&
  !isHost(meeting,req.user.id)
){
      const alreadyWaiting = meeting.waitingRoomUsers.some(id =>
        String(id) === String(req.user.id)
      );

      if(!alreadyWaiting){
        meeting.waitingRoomUsers.push(req.user.id);
        await meeting.save();
      }

      getIo(req)?.to(String(meeting.host)).emit("meetingWaitingRoomRequest",{
        meetingId:meeting._id,
        userId:req.user.id
      });

      return res.json({
        waitingRoom:true,
        message:"Waiting for host approval"
      });
    }

    if(!participant){
      if(meeting.participants.length >= meeting.maxParticipants){
        return res.status(400).json({ message:"Meeting is full" });
      }

      meeting.participants.push({
        user:req.user.id,
        role:isHost(meeting,req.user.id) ? "host" : "participant",
        joinedAt:new Date(),
        audioEnabled:meeting.allowParticipantAudio,
        videoEnabled:meeting.allowParticipantVideo
      });

      meeting.analytics.totalParticipants += 1;
      meeting.analytics.peakParticipants = Math.max(
        meeting.analytics.peakParticipants || 0,
        meeting.participants.length
      );
    }else{
      participant.joinedAt = new Date();
      participant.leftAt = undefined;
      participant.removedByHost = false;
    }

    if(["scheduled","waiting"].includes(meeting.status)){
      meeting.status = "live";
      meeting.actualStartedAt = meeting.actualStartedAt || new Date();
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingParticipantJoined",{
      userId:req.user.id
    });

    res.json({ success:true, meeting });

  }catch(error){
    console.error("JOIN MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to join meeting" });
  }
});

/* =========================
   LEAVE
========================= */

router.post("/:id/leave", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    const participant = getParticipant(meeting,req.user.id);

    if(participant){
      participant.leftAt = new Date();

      if(participant.joinedAt){
        participant.attendanceDuration += Math.max(
          0,
          Math.floor((participant.leftAt - participant.joinedAt) / 1000)
        );
      }

      participant.audioEnabled = false;
      participant.videoEnabled = false;
      participant.screenSharing = false;
      participant.handRaised = false;

      await meeting.save();
    }

    emitMeeting(req,meeting,"meetingParticipantLeft",{
      userId:req.user.id
    });

    res.json({ success:true });

  }catch(error){
    console.error("LEAVE MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to leave meeting" });
  }
});

/* =========================
   START
========================= */

router.patch("/:id/start", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can start meeting" });
    }

    meeting.status = "live";
    meeting.actualStartedAt = meeting.actualStartedAt || new Date();

    await meeting.save();

    emitMeeting(req,meeting,"meetingStarted",{
      startedBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("START MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to start meeting" });
  }
});

/* =========================
   END
========================= */

router.patch("/:id/end", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can end meeting" });
    }

    meeting.status = "ended";
    meeting.actualEndedAt = new Date();

    if(meeting.actualStartedAt){
      meeting.durationSeconds = Math.max(
        0,
        Math.floor((meeting.actualEndedAt - meeting.actualStartedAt) / 1000)
      );
    }

    meeting.participants.forEach(p=>{
      if(p.joinedAt && !p.leftAt){
        p.leftAt = new Date();
        p.attendanceDuration += Math.max(
          0,
          Math.floor((p.leftAt - p.joinedAt) / 1000)
        );
      }

      p.audioEnabled = false;
      p.videoEnabled = false;
      p.screenSharing = false;
      p.handRaised = false;
    });

    await meeting.save();

    await CallLog.create({
      caller:req.user.id,
      participants:meeting.participants.map(p => p.user),
      meetingId:meeting._id,
      conversationId:meeting.conversationId,
      callType:"meeting",
      status:"ended",
      startedAt:meeting.actualStartedAt,
      endedAt:meeting.actualEndedAt,
      durationSeconds:meeting.durationSeconds,
      endedBy:req.user.id
    });

    emitMeeting(req,meeting,"meetingEnded",{
      endedBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("END MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to end meeting" });
  }
});

/* =========================
   CANCEL
========================= */

router.patch("/:id/cancel", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host can cancel meeting" });
    }

    meeting.status = "cancelled";
    meeting.actualEndedAt = new Date();

    await meeting.save();

    emitMeeting(req,meeting,"meetingCancelled",{
      cancelledBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("CANCEL MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to cancel meeting" });
  }
});

/* =========================
   INVITE USERS
========================= */

router.post("/:id/invite", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id)
      .populate("host","name companyName schoolName role profileImage logo");

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can invite users" });
    }

    const users = Array.isArray(req.body.users)
      ? req.body.users.filter(isValidId)
      : [];

    if(!users.length){
      return res.status(400).json({ message:"Select at least one user to invite" });
    }

    const joinUrl =
      req.body.inviteLink ||
      meeting.joinUrl ||
      buildJoinUrl(req,meeting.meetingCode);

    const createdMessages = [];

    for(const userId of users){
      if(!meeting.invitedUsers.some(id => String(id) === String(userId))){
        meeting.invitedUsers.push(userId);
      }

      const conversation =
        await findOrCreateDirectConversation(req.user.id,userId,req.user.id);

      const hostName =
        meeting.host?.companyName ||
        meeting.host?.schoolName ||
        meeting.host?.name ||
        "AIFT Host";

      const message = await Message.create({
        conversationId:conversation._id,
        sender:req.user.id,
        receiver:userId,
        participants:[req.user.id,userId],
        messageType:"meeting",
        text:`${hostName} invited you to join ${meeting.title}\n\nJoin meeting: ${joinUrl}`,
        call:{
          callType:"meeting",
          status:"started",
          meetingId:meeting._id,
          meetingUrl:joinUrl,
          startedAt:new Date()
        },
        meetingInvite:{
          meetingId:meeting._id,
          meetingCode:meeting.meetingCode,
          title:meeting.title,
          joinUrl,
          logoUrl:"images/aift-logo.png",
          hostName
        }
      });

      conversation.setLastMessage(message);
      conversation.incrementUnreadForOthers(req.user.id);
      await conversation.save();

      const populated = await Message.findById(message._id)
        .populate("sender","name companyName schoolName role profileImage logo")
        .populate("receiver","name companyName schoolName role profileImage logo");

      createdMessages.push(populated);

      getIo(req)?.to(String(userId)).emit("newMessage", populated);
      getIo(req)?.to(String(req.user.id)).emit("newMessage", populated);

      getIo(req)?.to(String(userId)).emit("meetingInvited",{
        meetingId:meeting._id,
        title:meeting.title,
        meetingCode:meeting.meetingCode,
        joinUrl,
        invitedBy:req.user.id
      });
    }

    meeting.joinUrl = joinUrl;
    await meeting.save();

    res.json({
      success:true,
      meeting,
      messages:createdMessages
    });

  }catch(error){
    console.error("INVITE MEETING ERROR:",error);
    res.status(500).json({ message:"Unable to invite users" });
  }
});
/* =========================
   WAITING ROOM APPROVE / REJECT
========================= */

router.patch("/:id/waiting-room/:userId/approve", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can approve users" });
    }

    const userId = req.params.userId;

    meeting.waitingRoomUsers = meeting.waitingRoomUsers.filter(id =>
      String(id) !== String(userId)
    );

    if(!getParticipant(meeting,userId)){
      meeting.participants.push({
        user:userId,
        role:"participant",
        joinedAt:new Date(),
        audioEnabled:meeting.allowParticipantAudio,
        videoEnabled:meeting.allowParticipantVideo
      });
    }

    await meeting.save();

    getIo(req)?.to(String(userId)).emit("meetingWaitingRoomApproved",{
      meetingId:meeting._id
    });

    emitMeeting(req,meeting,"meetingParticipantJoined",{
      userId
    });

    res.json(meeting);

  }catch(error){
    console.error("APPROVE WAITING ROOM ERROR:",error);
    res.status(500).json({ message:"Unable to approve participant" });
  }
});

router.patch("/:id/waiting-room/:userId/reject", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can reject users" });
    }

    const userId = req.params.userId;

    meeting.waitingRoomUsers = meeting.waitingRoomUsers.filter(id =>
      String(id) !== String(userId)
    );

    await meeting.save();

    getIo(req)?.to(String(userId)).emit("meetingWaitingRoomRejected",{
      meetingId:meeting._id
    });

    res.json(meeting);

  }catch(error){
    console.error("REJECT WAITING ROOM ERROR:",error);
    res.status(500).json({ message:"Unable to reject participant" });
  }
});

/* =========================
   PARTICIPANT CONTROLS
========================= */

router.patch("/:id/participants/:userId/role", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host can update roles" });
    }

    const participant = getParticipant(meeting,req.params.userId);

    if(!participant){
      return res.status(404).json({ message:"Participant not found" });
    }

    const role = safeString(req.body.role);

    if(!["host","cohost","participant","viewer"].includes(role)){
      return res.status(400).json({ message:"Invalid role" });
    }

    participant.role = role;
    await meeting.save();

    emitMeeting(req,meeting,"meetingParticipantRoleUpdated",{
      userId:req.params.userId,
      role
    });

    res.json(meeting);

  }catch(error){
    console.error("UPDATE ROLE ERROR:",error);
    res.status(500).json({ message:"Unable to update role" });
  }
});

router.patch("/:id/participants/:userId/remove", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can remove users" });
    }

    const participant = getParticipant(meeting,req.params.userId);

    if(!participant){
      return res.status(404).json({ message:"Participant not found" });
    }

    participant.leftAt = new Date();
    participant.removedByHost = true;
    participant.audioEnabled = false;
    participant.videoEnabled = false;
    participant.screenSharing = false;

    await meeting.save();

    getIo(req)?.to(String(req.params.userId)).emit("meetingRemovedByHost",{
      meetingId:meeting._id
    });

    emitMeeting(req,meeting,"meetingParticipantRemoved",{
      userId:req.params.userId
    });

    res.json(meeting);

  }catch(error){
    console.error("REMOVE PARTICIPANT ERROR:",error);
    res.status(500).json({ message:"Unable to remove participant" });
  }
});

router.patch("/:id/my-controls", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    const participant = getParticipant(meeting,req.user.id);

    if(!participant){
      return res.status(404).json({ message:"You are not in this meeting" });
    }

    if(typeof req.body.audioEnabled === "boolean"){
      participant.audioEnabled = req.body.audioEnabled;
    }

    if(typeof req.body.videoEnabled === "boolean"){
      participant.videoEnabled = req.body.videoEnabled;
    }

    if(typeof req.body.handRaised === "boolean"){
      participant.handRaised = req.body.handRaised;
    }

    if(typeof req.body.screenSharing === "boolean"){
      if(req.body.screenSharing && !meeting.allowScreenShare){
        return res.status(403).json({ message:"Screen sharing is disabled" });
      }

      participant.screenSharing = req.body.screenSharing;
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingParticipantControlsUpdated",{
      userId:req.user.id,
      audioEnabled:participant.audioEnabled,
      videoEnabled:participant.videoEnabled,
      handRaised:participant.handRaised,
      screenSharing:participant.screenSharing
    });

    res.json(meeting);

  }catch(error){
    console.error("MY CONTROLS ERROR:",error);
    res.status(500).json({ message:"Unable to update controls" });
  }
});

/* =========================
   HOST SETTINGS
========================= */

router.patch("/:id/settings", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can update settings" });
    }

    [
      "waitingRoomEnabled",
      "recordingEnabled",
      "allowScreenShare",
      "allowChat",
      "allowFileSharing",
      "allowRaiseHand",
      "allowParticipantVideo",
      "allowParticipantAudio"
    ].forEach(key=>{
      if(typeof req.body[key] === "boolean"){
        meeting[key] = req.body[key];
      }
    });

    if(req.body.maxParticipants){
      meeting.maxParticipants = Math.max(2,Number(req.body.maxParticipants));
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingSettingsUpdated",{
      updatedBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("UPDATE SETTINGS ERROR:",error);
    res.status(500).json({ message:"Unable to update meeting settings" });
  }
});

/* =========================
   ADVANCED ACCESS SETTINGS
========================= */

router.patch("/:id/access", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host can update meeting access" });
    }

    if(req.body.accessMode !== undefined){
      meeting.accessMode = normalizeAccessMode(req.body.accessMode);
    }

    if(typeof req.body.allowGuests === "boolean"){
      meeting.allowGuests = req.body.allowGuests;
    }

    if(typeof req.body.requireHostApproval === "boolean"){
      meeting.requireHostApproval = req.body.requireHostApproval;
    }

    if(typeof req.body.lockMeeting === "boolean"){
      meeting.lockMeeting = req.body.lockMeeting;
    }

    if(typeof req.body.allowJoinBeforeHost === "boolean"){
      meeting.allowJoinBeforeHost = req.body.allowJoinBeforeHost;
    }

    if(req.body.hostControls){
      meeting.hostControls = {
        ...(meeting.hostControls?.toObject?.() || meeting.hostControls || {}),
        ...req.body.hostControls
      };
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingAccessUpdated",{
      updatedBy:req.user.id,
      accessMode:meeting.accessMode,
      lockMeeting:meeting.lockMeeting,
      hostControls:meeting.hostControls
    });

    res.json(meeting);

  }catch(error){
    console.error("UPDATE MEETING ACCESS ERROR:",error);
    res.status(500).json({ message:"Unable to update meeting access" });
  }
});

router.patch("/:id/mute-all", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can mute participants" });
    }

    meeting.participants.forEach(p=>{
      if(String(participantUserId(p)) !== String(req.user.id)){
        p.audioEnabled = false;
      }
    });

    await meeting.save();

    emitMeeting(req,meeting,"meetingMuteAll",{
      mutedBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("MUTE ALL ERROR:",error);
    res.status(500).json({ message:"Unable to mute participants" });
  }
});

router.patch("/:id/end-for-everyone", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host can end meeting for everyone" });
    }

    meeting.status = "ended";
    meeting.actualEndedAt = new Date();

    meeting.participants.forEach(p=>{
      p.leftAt = p.leftAt || new Date();
      p.audioEnabled = false;
      p.videoEnabled = false;
      p.screenSharing = false;
      p.handRaised = false;
    });

    if(meeting.actualStartedAt){
      meeting.durationSeconds = Math.max(
        0,
        Math.floor((meeting.actualEndedAt - meeting.actualStartedAt) / 1000)
      );
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingEnded",{
      endedBy:req.user.id,
      forEveryone:true
    });

    res.json(meeting);

  }catch(error){
    console.error("END FOR EVERYONE ERROR:",error);
    res.status(500).json({ message:"Unable to end meeting" });
  }
});

/* =========================
   RECORDING METADATA
========================= */

router.post("/:id/recordings/start", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can start recording" });
    }

    if(!meeting.recordingEnabled){
      return res.status(400).json({ message:"Recording is disabled for this meeting" });
    }

    meeting.recordings.push({
      startedAt:new Date()
    });

    await meeting.save();

    emitMeeting(req,meeting,"meetingRecordingStarted",{
      startedBy:req.user.id
    });

    res.json(meeting);

  }catch(error){
    console.error("START RECORDING ERROR:",error);
    res.status(500).json({ message:"Unable to start recording" });
  }
});

router.post("/:id/recordings/stop", authMiddleware, async (req,res)=>{
  try{
    const meeting = await Meeting.findById(req.params.id);

    if(!meeting){
      return res.status(404).json({ message:"Meeting not found" });
    }

    if(!isHostOrCohost(meeting,req.user.id)){
      return res.status(403).json({ message:"Only host or cohost can stop recording" });
    }

    const recording = meeting.recordings[meeting.recordings.length - 1];

    if(!recording || recording.endedAt){
      return res.status(400).json({ message:"No active recording found" });
    }

    recording.endedAt = new Date();
    recording.recordingUrl = req.body.recordingUrl || "";
    recording.fileSize = Number(req.body.fileSize || 0);

    if(recording.startedAt){
      recording.durationSeconds = Math.max(
        0,
        Math.floor((recording.endedAt - recording.startedAt) / 1000)
      );
    }

    await meeting.save();

    emitMeeting(req,meeting,"meetingRecordingStopped",{
      stoppedBy:req.user.id,
      recordingUrl:recording.recordingUrl
    });

    res.json(meeting);

  }catch(error){
    console.error("STOP RECORDING ERROR:",error);
    res.status(500).json({ message:"Unable to stop recording" });
  }
});

module.exports = router;
