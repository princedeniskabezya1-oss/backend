const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const User = require("../models/User");
const FamilyChild = require("../models/FamilyChild");
const SchoolScholarship = require("../models/SchoolScholarship");
const SchoolOpportunity = require("../models/SchoolOpportunity");
const ScholarshipApplication = require("../models/ScholarshipApplication");
const Venture = require("../models/Venture");
const FamilySavedDiscovery = require("../models/FamilySavedDiscovery");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { enforceContactSafety, hasMessagingRestriction } = require("../utils/contactSafety");

const router = express.Router();

const FAMILY_RELATIONSHIP_TYPES = new Set([
  "",
  "parent",
  "guardian",
  "family_member",
  "other"
]);

const DISCOVERY_TYPES = new Set([
  "scholarship",
  "opportunity"
]);

const OPEN_SCHOLARSHIP_STATUSES = [
  "published",
  "open"
];

const OPEN_OPPORTUNITY_STATUSES = [
  "approved",
  "open",
  "active"
];

function cleanString(value,maxLength = 500){
  if(value === undefined || value === null) return "";
  return String(value).trim().slice(0,maxLength);
}

function cleanStringArray(value,maxItems = 30,maxLength = 100){
  if(!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map(item => cleanString(item,maxLength))
      .filter(Boolean)
  )].slice(0,maxItems);
}

function isFamilyUser(user){
  return Boolean(user && (user._id || user.id));
}

function familyAccessGuard(req,res,next){
  if(!isFamilyUser(req.user)){
    return res.status(403).json({
      success:false,
      message:"Sign in to access Family Advantage"
    });
  }
  next();
}

function validId(value){
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function escapeRegex(value){
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function parsePositiveInt(value,fallback,max){
  const parsed = Number.parseInt(value,10);
  if(!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed,max);
}

function serializeFamilyProfile(user){
  const familyProfile = user.familyProfile || {};

  return {
    user:{
      id:String(user._id),
      name:user.name || "",
      email:user.email || "",
      role:user.role,
      profileImage:user.profileImage || null,
      location:user.location || ""
    },

    familyProfile:{
      investorEnabled:familyProfile.investorEnabled === true,
      relationshipType:familyProfile.relationshipType || "",
      preferredLocation:familyProfile.preferredLocation || "",
      educationPriorities:Array.isArray(familyProfile.educationPriorities)
        ? familyProfile.educationPriorities
        : [],
      investmentInterests:Array.isArray(familyProfile.investmentInterests)
        ? familyProfile.investmentInterests
        : [],
      investorProfileCompleted:
        familyProfile.investorProfileCompleted === true,
      onboardingCompleted:
        familyProfile.onboardingCompleted === true
    }
  };
}

function scholarshipVisibilityFilter(){
  const now = new Date();

  return {
    visibility:"public",
    status:{ $in:OPEN_SCHOLARSHIP_STATUSES },
    $and:[
      {
        $or:[
          { applicationOpenDate:null },
          { applicationOpenDate:{ $lte:now } }
        ]
      },
      {
        $or:[
          { deadline:null },
          { deadline:{ $gte:now } }
        ]
      }
    ]
  };
}

function opportunityVisibilityFilter(){
  const now = new Date();

  return {
    visibility:"public",
    status:{ $in:OPEN_OPPORTUNITY_STATUSES },
    $or:[
      { deadline:null },
      { deadline:{ $gte:now } }
    ]
  };
}

function populateScholarship(query){
  return query
    .populate(
      "schoolId",
      "name schoolName schoolLogo profileImage location address programs aiftVerified"
    )
    .populate(
      "createdBy",
      "name schoolName role profileImage"
    );
}

function populateOpportunity(query){
  return query
    .populate(
      "schoolId",
      "name schoolName schoolLogo profileImage location address programs aiftVerified"
    )
    .populate(
      "employerId",
      "name companyName profileImage location industry aiftVerified"
    );
}

async function loadSavedTarget(itemType,itemId){
  if(itemType === "scholarship"){
    return populateScholarship(
      SchoolScholarship.findOne({
        _id:itemId,
        ...scholarshipVisibilityFilter()
      })
    ).lean();
  }

  if(itemType === "opportunity"){
    return populateOpportunity(
      SchoolOpportunity.findOne({
        _id:itemId,
        ...opportunityVisibilityFilter()
      })
    ).lean();
  }

  return null;
}

router.use(auth,familyAccessGuard);

/* =========================================================
   PROFILE
========================================================= */

router.get("/profile",async (req,res) => {
  try{
    const user = await User.findById(req.user._id)
      .select(
        "_id name email role profileImage location familyProfile"
      );

    if(!user){
      return res.status(404).json({
        success:false,
        message:"Family account not found"
      });
    }

    return res.json({
      success:true,
      ...serializeFamilyProfile(user)
    });
  }catch(error){
    console.error("GET FAMILY PROFILE ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load family profile"
    });
  }
});

router.patch("/profile",async (req,res) => {
  try{
    const user = await User.findById(req.user._id);

    if(!user){
      return res.status(404).json({
        success:false,
        message:"Family account not found"
      });
    }

    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : {};

    if(!user.familyProfile){
      user.familyProfile = {};
    }

    if(Object.prototype.hasOwnProperty.call(body,"relationshipType")){
      const relationshipType = cleanString(body.relationshipType,50).toLowerCase();

      if(!FAMILY_RELATIONSHIP_TYPES.has(relationshipType)){
        return res.status(400).json({
          success:false,
          message:"Invalid family relationship type"
        });
      }

      user.familyProfile.relationshipType = relationshipType;
    }

    if(Object.prototype.hasOwnProperty.call(body,"preferredLocation")){
      user.familyProfile.preferredLocation = cleanString(
        body.preferredLocation,
        200
      );
    }

    if(Object.prototype.hasOwnProperty.call(body,"educationPriorities")){
      if(!Array.isArray(body.educationPriorities)){
        return res.status(400).json({
          success:false,
          message:"Education priorities must be an array"
        });
      }

      user.familyProfile.educationPriorities = cleanStringArray(
        body.educationPriorities
      );
    }

    if(Object.prototype.hasOwnProperty.call(body,"investmentInterests")){
      if(!Array.isArray(body.investmentInterests)){
        return res.status(400).json({
          success:false,
          message:"Investment interests must be an array"
        });
      }

      user.familyProfile.investmentInterests = cleanStringArray(
        body.investmentInterests
      );
    }

    if(Object.prototype.hasOwnProperty.call(body,"onboardingCompleted")){
      user.familyProfile.onboardingCompleted =
        body.onboardingCompleted === true;
    }

    await user.save();

    return res.json({
      success:true,
      message:"Family profile updated",
      ...serializeFamilyProfile(user)
    });
  }catch(error){
    console.error("UPDATE FAMILY PROFILE ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not update family profile"
    });
  }
});

router.patch("/investor",async (req,res) => {
  try{
    if(typeof req.body?.enabled !== "boolean"){
      return res.status(400).json({
        success:false,
        message:"Investor mode requires a boolean enabled value"
      });
    }

    const user = await User.findById(req.user._id);

    if(!user){
      return res.status(404).json({
        success:false,
        message:"Family account not found"
      });
    }

    if(!user.familyProfile){
      user.familyProfile = {};
    }

    user.familyProfile.investorEnabled = req.body.enabled;
    user.familyProfile.investorProfileCompleted = Boolean(
      req.body.enabled === true &&
      Array.isArray(user.familyProfile.investmentInterests) &&
      user.familyProfile.investmentInterests.length > 0
    );

    await user.save();

    return res.json({
      success:true,
      message:req.body.enabled
        ? "Investor mode enabled"
        : "Investor mode disabled",
      ...serializeFamilyProfile(user)
    });
  }catch(error){
    console.error("UPDATE INVESTOR MODE ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not update Investor Mode"
    });
  }
});

/* =========================================================
   PRODUCTION OVERVIEW
========================================================= */

router.get("/overview",async (req,res) => {
  try{
    const familyId = req.user._id;

    const [
      profileUser,
      children,
      ventures,
      scholarshipApplications,
      savedCount,
      activeOpportunityCount,
      schoolCount,
      employerCount,
      publicVentureCount,
      scholarships,
      opportunities
    ] = await Promise.all([
      User.findById(familyId)
        .select("_id name email role profileImage location familyProfile")
        .lean(),

      FamilyChild.find({
        familyId,
        status:{ $ne:"archived" }
      })
        .populate(
          "linkedStudentId",
          "name profileImage schoolId linkedSchoolId course yearLevel role"
        )
        .sort({ createdAt:1 })
        .lean(),

      Venture.find({ ownerId:familyId })
        .sort({ updatedAt:-1 })
        .limit(5)
        .lean(),

      ScholarshipApplication.find({
        submittedByFamilyId:familyId
      })
        .populate(
          "scholarshipId",
          "title type status funding deadline"
        )
        .populate(
          "schoolId",
          "name schoolName schoolLogo profileImage"
        )
        .populate(
          "familyChildId",
          "firstName lastName profileImage"
        )
        .sort({ updatedAt:-1 })
        .limit(5)
        .lean(),

      FamilySavedDiscovery.countDocuments({ familyId }),

      SchoolOpportunity.countDocuments(
        opportunityVisibilityFilter()
      ),

      User.countDocuments({
        role:"school",
        status:{ $ne:"deactivated" },
        isPublic:{ $ne:false }
      }),

      User.countDocuments({
        role:"employer",
        status:{ $ne:"deactivated" },
        isPublic:{ $ne:false }
      }),

      Venture.countDocuments({
        status:"active",
        visibility:{ $in:["public","aift-only"] }
      }),

      populateScholarship(
        SchoolScholarship.find(
          scholarshipVisibilityFilter()
        )
      )
        .sort({ deadline:1,createdAt:-1 })
        .limit(4)
        .lean(),

      populateOpportunity(
        SchoolOpportunity.find(
          opportunityVisibilityFilter()
        )
      )
        .sort({ deadline:1,publishedAt:-1,createdAt:-1 })
        .limit(4)
        .lean()
    ]);

    if(!profileUser){
      return res.status(404).json({
        success:false,
        message:"Family account not found"
      });
    }

    const requests = [
      ...ventures.map(item => ({
        kind:"venture",
        _id:item._id,
        title:item.title || "Untitled Venture",
        status:item.status || "draft",
        updatedAt:item.updatedAt,
        createdAt:item.createdAt,
        data:item
      })),

      ...scholarshipApplications.map(item => ({
        kind:"scholarship",
        _id:item._id,
        title:item.scholarshipId?.title || "Scholarship Application",
        status:item.status || "draft",
        updatedAt:item.updatedAt,
        createdAt:item.createdAt,
        data:item
      }))
    ]
      .sort((a,b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
      )
      .slice(0,5);

    return res.json({
      success:true,
      profile:{
        success:true,
        ...serializeFamilyProfile(profileUser)
      },
      metrics:{
        totalRequests:
          await Venture.countDocuments({ ownerId:familyId }) +
          await ScholarshipApplication.countDocuments({ submittedByFamilyId:familyId }),
        activeOpportunities:activeOpportunityCount,
        savedPrograms:savedCount,
        interestedProjects:0,
        children:children.length
      },
      children,
      requests,
      recommendations:{
        scholarships,
        opportunities
      },
      network:{
        schools:schoolCount,
        employers:employerCount,
        opportunities:activeOpportunityCount,
        ventures:publicVentureCount
      }
    });
  }catch(error){
    console.error("GET FAMILY OVERVIEW ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load the Family dashboard"
    });
  }
});

/* =========================================================
   SCHOOL DISCOVERY
========================================================= */

router.get("/schools",async (req,res) => {
  try{
    const page = parsePositiveInt(req.query.page,1,100000);
    const limit = parsePositiveInt(req.query.limit,24,100);
    const skip = (page - 1) * limit;

    const query = {
      role:"school",
      status:{ $ne:"deactivated" },
      isPublic:{ $ne:false }
    };

    const search = cleanString(req.query.search,200);
    const location = cleanString(req.query.location,200);
    const program = cleanString(req.query.program,200);

    const and = [];

    if(search){
      const rx = new RegExp(escapeRegex(search),"i");
      and.push({
        $or:[
          { schoolName:rx },
          { name:rx },
          { schoolDescription:rx },
          { programs:rx },
          { location:rx },
          { address:rx }
        ]
      });
    }

    if(location){
      const rx = new RegExp(escapeRegex(location),"i");
      and.push({
        $or:[
          { location:rx },
          { address:rx }
        ]
      });
    }

    if(program){
      const rx = new RegExp(escapeRegex(program),"i");
      and.push({ programs:rx });
    }

    if(and.length){
      query.$and = and;
    }

    const [schools,total] = await Promise.all([
      User.find(query)
        .select(
          "_id name schoolName schoolLogo profileImage schoolDescription programs address location website contactEmail aiftVerified followers"
        )
        .sort({ aiftVerified:-1,schoolName:1,name:1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    return res.json({
      success:true,
      schools,
      pagination:{
        page,
        limit,
        total,
        pages:Math.max(1,Math.ceil(total / limit))
      }
    });
  }catch(error){
    console.error("GET FAMILY SCHOOLS ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load schools"
    });
  }
});

/* =========================================================
   SCHOLARSHIP DISCOVERY
========================================================= */

router.get("/scholarships",async (req,res) => {
  try{
    const page = parsePositiveInt(req.query.page,1,100000);
    const limit = parsePositiveInt(req.query.limit,24,100);
    const skip = (page - 1) * limit;

    const base = scholarshipVisibilityFilter();
    const filters = [base];

    const search = cleanString(req.query.search,200);
    const type = cleanString(req.query.type,100).toLowerCase();
    const schoolId = cleanString(req.query.schoolId,100);

    if(search){
      const rx = new RegExp(escapeRegex(search),"i");
      filters.push({
        $or:[
          { title:rx },
          { summary:rx },
          { description:rx },
          { academicYear:rx }
        ]
      });
    }

    if(type){
      filters.push({ type });
    }

    if(schoolId){
      if(!validId(schoolId)){
        return res.status(400).json({
          success:false,
          message:"Invalid schoolId"
        });
      }
      filters.push({ schoolId });
    }

    const query = filters.length === 1 ? base : { $and:filters };

    const [scholarships,total] = await Promise.all([
      populateScholarship(
        SchoolScholarship.find(query)
      )
        .sort({ deadline:1,createdAt:-1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SchoolScholarship.countDocuments(query)
    ]);

    return res.json({
      success:true,
      scholarships,
      items:scholarships,
      pagination:{
        page,
        limit,
        total,
        pages:Math.max(1,Math.ceil(total / limit))
      }
    });
  }catch(error){
    console.error("GET FAMILY SCHOLARSHIPS ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load scholarships"
    });
  }
});

/* =========================================================
   EDUCATION / CAREER OPPORTUNITY DISCOVERY
========================================================= */

router.get("/opportunities",async (req,res) => {
  try{
    const page = parsePositiveInt(req.query.page,1,100000);
    const limit = parsePositiveInt(req.query.limit,24,100);
    const skip = (page - 1) * limit;

    const base = opportunityVisibilityFilter();
    const filters = [base];

    const search = cleanString(req.query.search,200);
    const type = cleanString(req.query.type,100).toLowerCase();
    const location = cleanString(req.query.location,200);
    const workSetup = cleanString(req.query.workSetup,100).toLowerCase();

    if(search){
      const rx = new RegExp(escapeRegex(search),"i");
      filters.push({
        $or:[
          { title:rx },
          { companyName:rx },
          { summary:rx },
          { description:rx },
          { programs:rx },
          { skills:rx },
          { location:rx }
        ]
      });
    }

    if(type) filters.push({ type });

    if(location){
      filters.push({
        location:new RegExp(escapeRegex(location),"i")
      });
    }

    if(workSetup) filters.push({ workSetup });

    const query = filters.length === 1 ? base : { $and:filters };

    const [opportunities,total] = await Promise.all([
      populateOpportunity(
        SchoolOpportunity.find(query)
      )
        .sort({ deadline:1,publishedAt:-1,createdAt:-1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SchoolOpportunity.countDocuments(query)
    ]);

    return res.json({
      success:true,
      opportunities,
      items:opportunities,
      pagination:{
        page,
        limit,
        total,
        pages:Math.max(1,Math.ceil(total / limit))
      }
    });
  }catch(error){
    console.error("GET FAMILY OPPORTUNITIES ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load opportunities"
    });
  }
});

/* =========================================================
   SAVED DISCOVERY ITEMS
========================================================= */

router.get("/saved",async (req,res) => {
  try{
    const savedRows = await FamilySavedDiscovery.find({
      familyId:req.user._id
    })
      .sort({ createdAt:-1 })
      .lean();

    const saved = [];

    for(const row of savedRows){
      const item = await loadSavedTarget(row.itemType,row.itemId);
      if(item){
        saved.push({
          _id:row._id,
          itemType:row.itemType,
          itemId:row.itemId,
          savedAt:row.createdAt,
          item
        });
      }
    }

    return res.json({
      success:true,
      saved,
      total:saved.length
    });
  }catch(error){
    console.error("GET FAMILY SAVED ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load saved Family items"
    });
  }
});

router.post("/saved",async (req,res) => {
  try{
    const itemType = cleanString(req.body?.itemType,50).toLowerCase();
    const itemId = cleanString(req.body?.itemId,100);

    if(!DISCOVERY_TYPES.has(itemType)){
      return res.status(400).json({
        success:false,
        message:"Invalid saved item type"
      });
    }

    if(!validId(itemId)){
      return res.status(400).json({
        success:false,
        message:"A valid itemId is required"
      });
    }

    const item = await loadSavedTarget(itemType,itemId);

    if(!item){
      return res.status(404).json({
        success:false,
        message:"Item not found or is no longer available"
      });
    }

    const saved = await FamilySavedDiscovery.findOneAndUpdate(
      {
        familyId:req.user._id,
        itemType,
        itemId
      },
      {
        $setOnInsert:{
          familyId:req.user._id,
          itemType,
          itemId
        }
      },
      {
        upsert:true,
        new:true,
        setDefaultsOnInsert:true
      }
    );

    return res.status(201).json({
      success:true,
      saved:true,
      saveId:saved._id,
      itemType,
      itemId,
      item
    });
  }catch(error){
    console.error("SAVE FAMILY DISCOVERY ERROR:",error);

    if(error?.code === 11000){
      return res.json({ success:true,saved:true });
    }

    return res.status(500).json({
      success:false,
      message:"Could not save this item"
    });
  }
});

router.delete("/saved/:itemType/:itemId",async (req,res) => {
  try{
    const itemType = cleanString(req.params.itemType,50).toLowerCase();
    const itemId = cleanString(req.params.itemId,100);

    if(!DISCOVERY_TYPES.has(itemType) || !validId(itemId)){
      return res.status(400).json({
        success:false,
        message:"Invalid saved item"
      });
    }

    await FamilySavedDiscovery.findOneAndDelete({
      familyId:req.user._id,
      itemType,
      itemId
    });

    return res.json({
      success:true,
      removed:true,
      itemType,
      itemId
    });
  }catch(error){
    console.error("REMOVE FAMILY SAVED ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not remove this saved item"
    });
  }
});


/* =========================================================
   FAMILY-ONLY MESSAGING
   Kept separate from the main AIFT Messages experience.
   Investor anonymity hides identity from the other participant,
   while AIFT still retains the authenticated account internally
   for abuse prevention, moderation and legal/compliance needs.
========================================================= */

function familyChatParticipant(conversation,userId){
  return (conversation?.participants || []).find(participant =>
    String(participant?.user?._id || participant?.user || "") === String(userId) &&
    participant.isActive !== false
  );
}

function familyChatHasParticipant(conversation,userId){
  return Boolean(familyChatParticipant(conversation,userId));
}

function familyChatAnonymousIds(conversation){
  return new Set(
    (conversation?.metadata?.familyChat?.anonymousInvestorIds || [])
      .map(value => String(value?._id || value || ""))
      .filter(Boolean)
  );
}

function familyChatUserName(user = {}){
  return user.companyName || user.schoolName || user.name || "AIFT Member";
}

function familyChatUserImage(user = {}){
  return user.profileImage || user.logo || "";
}

function serializeFamilyConversation(conversation,viewerId){
  const participants = Array.isArray(conversation?.participants)
    ? conversation.participants
    : [];

  const otherParticipant =
    participants.find(item =>
      String(item?.user?._id || item?.user || "") !== String(viewerId)
    ) || participants[0];

  const otherUser = otherParticipant?.user || {};
  const otherId = String(otherUser?._id || otherUser || "");
  const anonymousIds = familyChatAnonymousIds(conversation);
  const hideOtherIdentity =
    otherId &&
    otherId !== String(viewerId) &&
    anonymousIds.has(otherId);

  const me = familyChatParticipant(conversation,viewerId);

  return {
    _id:conversation._id,
    conversationId:conversation._id,
    type:"family_chat",
    mode:conversation?.metadata?.familyChat?.mode || "family",
    displayName:hideOtherIdentity
      ? "Anonymous Investor"
      : familyChatUserName(otherUser),
    displayImage:hideOtherIdentity
      ? ""
      : familyChatUserImage(otherUser),
    otherRole:hideOtherIdentity
      ? "investor"
      : String(otherUser?.role || ""),
    anonymous:hideOtherIdentity,
    myAnonymousMode:anonymousIds.has(String(viewerId)),
    unreadCount:Number(me?.unreadCount || 0),
    lastMessage:conversation?.lastMessage?.text || "",
    lastMessageDate:conversation?.lastMessage?.createdAt || conversation?.updatedAt,
    updatedAt:conversation?.updatedAt
  };
}

function serializeFamilyMessage(message,viewerId,conversation){
  const senderId = String(message?.sender?._id || message?.sender || "");
  const mine = senderId === String(viewerId);
  const messageAnonymous =
    message?.metadata?.familyChat?.anonymous === true;
  const hideSender = messageAnonymous && !mine;
  const sender = message?.sender || {};

  return {
    _id:message._id,
    conversationId:message.conversationId,
    text:message.deletedForEveryone
      ? "This message was deleted"
      : String(message.text || ""),
    createdAt:message.createdAt,
    updatedAt:message.updatedAt,
    status:message.status,
    mine,
    senderAnonymous:hideSender,
    senderDisplayName:hideSender
      ? "Anonymous Investor"
      : familyChatUserName(sender),
    senderImage:hideSender
      ? ""
      : familyChatUserImage(sender),
    mode:message?.metadata?.familyChat?.mode ||
      conversation?.metadata?.familyChat?.mode ||
      "family"
  };
}

async function loadFamilyConversation(conversationId,userId){
  if(!validId(conversationId)) return null;

  const conversation = await Conversation.findOne({
    _id:conversationId,
    "metadata.source":"family_chat",
    participantIds:userId,
    isActive:true
  });

  return conversation;
}

router.get("/chat/conversations",async (req,res) => {
  try{
    const userId = req.user._id || req.user.id;

    const conversations = await Conversation.find({
      participantIds:userId,
      isActive:true,
      "metadata.source":"family_chat"
    })
      .populate(
        "participants.user",
        "name companyName schoolName role profileImage logo"
      )
      .sort({ updatedAt:-1 })
      .limit(100)
      .lean();

    return res.json({
      success:true,
      conversations:conversations.map(item =>
        serializeFamilyConversation(item,userId)
      )
    });
  }catch(error){
    console.error("GET FAMILY CHAT CONVERSATIONS ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load Family conversations"
    });
  }
});

router.post("/chat/direct",async (req,res) => {
  try{
    const userId = req.user._id || req.user.id;
    const targetId = cleanString(req.body?.userId,100);
    const requestedMode =
      cleanString(req.body?.mode,20).toLowerCase() === "investor"
        ? "investor"
        : "family";
    const anonymous = req.body?.anonymous === true;

    if(!validId(targetId) || String(targetId) === String(userId)){
      return res.status(400).json({
        success:false,
        message:"A valid Family chat recipient is required"
      });
    }

    const [me,target] = await Promise.all([
      User.findById(userId).select("_id familyProfile"),
      User.findById(targetId).select("_id name companyName schoolName role profileImage logo")
    ]);

    if(!me || !target){
      return res.status(404).json({
        success:false,
        message:"The selected AIFT account could not be found"
      });
    }

    if(
      anonymous &&
      (
        requestedMode !== "investor" ||
        me.familyProfile?.investorEnabled !== true
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Anonymous chat is available only when Investor Mode is enabled."
      });
    }

    let conversation = await Conversation.findOne({
      type:"direct",
      participantIds:{ $all:[userId,targetId] },
      "metadata.source":"family_chat"
    });

    if(!conversation){
      conversation = await Conversation.create({
        type:"direct",
        createdBy:userId,
        participants:[
          { user:userId,role:"member" },
          { user:targetId,role:"member" }
        ],
        participantIds:[userId,targetId],
        metadata:{
          source:"family_chat",
          familyChat:{
            mode:requestedMode,
            anonymousInvestorIds:anonymous ? [userId] : [],
            createdFrom:"family"
          }
        }
      });
    }else{
      conversation.metadata = conversation.metadata || {};
      conversation.metadata.source = "family_chat";
      conversation.metadata.familyChat = conversation.metadata.familyChat || {};
      conversation.metadata.familyChat.mode = requestedMode;
      conversation.metadata.familyChat.createdFrom = "family";

      const anonymousIds = new Set(
        (conversation.metadata.familyChat.anonymousInvestorIds || [])
          .map(value => String(value))
      );

      if(anonymous) anonymousIds.add(String(userId));
      else anonymousIds.delete(String(userId));

      conversation.metadata.familyChat.anonymousInvestorIds =
        [...anonymousIds]
          .filter(validId)
          .map(value => new mongoose.Types.ObjectId(value));

      conversation.markModified("metadata.familyChat");
      await conversation.save();
    }

    const populated = await Conversation.findById(conversation._id)
      .populate(
        "participants.user",
        "name companyName schoolName role profileImage logo"
      )
      .lean();

    return res.status(201).json({
      success:true,
      conversation:serializeFamilyConversation(populated,userId)
    });
  }catch(error){
    console.error("CREATE FAMILY CHAT ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not start the Family conversation"
    });
  }
});

router.patch("/chat/:conversationId/privacy",async (req,res) => {
  try{
    const userId = req.user._id || req.user.id;
    const anonymous = req.body?.anonymous === true;
    const conversation = await loadFamilyConversation(
      req.params.conversationId,
      userId
    );

    if(!conversation){
      return res.status(404).json({
        success:false,
        message:"Family conversation not found"
      });
    }

    const user = await User.findById(userId).select("_id familyProfile");

    if(
      anonymous &&
      (
        conversation.metadata?.familyChat?.mode !== "investor" ||
        user?.familyProfile?.investorEnabled !== true
      )
    ){
      return res.status(403).json({
        success:false,
        message:"Anonymous identity is available only in Investor Mode."
      });
    }

    conversation.metadata = conversation.metadata || {};
    conversation.metadata.familyChat = conversation.metadata.familyChat || {};

    const anonymousIds = new Set(
      (conversation.metadata.familyChat.anonymousInvestorIds || [])
        .map(value => String(value))
    );

    if(anonymous) anonymousIds.add(String(userId));
    else anonymousIds.delete(String(userId));

    conversation.metadata.familyChat.anonymousInvestorIds =
      [...anonymousIds]
        .filter(validId)
        .map(value => new mongoose.Types.ObjectId(value));

    conversation.markModified("metadata.familyChat");
    await conversation.save();

    return res.json({
      success:true,
      anonymous
    });
  }catch(error){
    console.error("UPDATE FAMILY CHAT PRIVACY ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not update your Family chat privacy"
    });
  }
});

router.get("/chat/:conversationId/messages",async (req,res) => {
  try{
    const userId = req.user._id || req.user.id;
    const conversation = await loadFamilyConversation(
      req.params.conversationId,
      userId
    );

    if(!conversation){
      return res.status(404).json({
        success:false,
        message:"Family conversation not found"
      });
    }

    const messages = await Message.find({
      conversationId:conversation._id,
      deletedFor:{ $ne:userId }
    })
      .populate(
        "sender",
        "name companyName schoolName role profileImage logo"
      )
      .sort({ createdAt:1 })
      .limit(500)
      .lean();

    return res.json({
      success:true,
      conversationId:conversation._id,
      messages:messages.map(message =>
        serializeFamilyMessage(message,userId,conversation)
      )
    });
  }catch(error){
    console.error("GET FAMILY CHAT MESSAGES ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not load Family messages"
    });
  }
});

router.patch("/chat/:conversationId/read",async (req,res) => {
  try{
    const userId = req.user._id || req.user.id;
    const conversation = await loadFamilyConversation(
      req.params.conversationId,
      userId
    );

    if(!conversation){
      return res.status(404).json({
        success:false,
        message:"Family conversation not found"
      });
    }

    conversation.markRead(userId);
    await conversation.save();

    await Message.updateMany(
      {
        conversationId:conversation._id,
        sender:{ $ne:userId },
        seen:{ $ne:true }
      },
      {
        $set:{
          seen:true,
          seenAt:new Date(),
          status:"seen"
        }
      }
    );

    return res.json({ success:true });
  }catch(error){
    console.error("READ FAMILY CHAT ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not mark Family messages as read"
    });
  }
});

router.post("/chat/:conversationId/messages",async (req,res) => {
  try{
    const senderId = req.user._id || req.user.id;
    const textValue = cleanString(req.body?.text,10000);

    if(!textValue){
      return res.status(400).json({
        success:false,
        message:"Write a message first."
      });
    }

    const conversation = await loadFamilyConversation(
      req.params.conversationId,
      senderId
    );

    if(!conversation){
      return res.status(404).json({
        success:false,
        message:"Family conversation not found"
      });
    }

    if(await hasMessagingRestriction(senderId)){
      return res.status(403).json({
        success:false,
        code:"AIFT_FAMILY_MESSAGING_RESTRICTED",
        message:"Family messaging is restricted pending AIFT review."
      });
    }

    const recipientId = (conversation.participantIds || [])
      .map(String)
      .find(value => value !== String(senderId));

    if(!recipientId){
      return res.status(400).json({
        success:false,
        message:"The Family chat recipient is unavailable."
      });
    }

    const safety = await enforceContactSafety({
      user:req.user,
      text:textValue,
      conversationId:conversation._id,
      receiverId:recipientId
    });

    if(!safety.allowed){
      return res.status(safety.statusCode).json({
        success:false,
        code:"AIFT_FAMILY_CONTACT_SHARING_BLOCKED",
        message:safety.message,
        warningNumber:safety.warningNumber,
        action:safety.action
      });
    }

    const mode =
      conversation.metadata?.familyChat?.mode === "investor"
        ? "investor"
        : "family";

    const anonymousIds = familyChatAnonymousIds(conversation);
    const anonymous =
      mode === "investor" &&
      anonymousIds.has(String(senderId));

    const message = await Message.create({
      conversationId:conversation._id,
      sender:senderId,
      receiver:recipientId,
      participants:conversation.participantIds,
      text:textValue,
      messageType:"text",
      metadata:{
        source:"family_chat",
        ipAddress:req.ip,
        userAgent:req.headers["user-agent"],
        familyChat:{
          anonymous,
          senderAlias:anonymous
            ? "Anonymous Investor"
            : "",
          mode
        }
      }
    });

    conversation.setLastMessage(message);
    conversation.incrementUnreadForOthers(senderId);
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate(
        "sender",
        "name companyName schoolName role profileImage logo"
      )
      .lean();

    const io = req.app.get("io") || req.io;

    io?.to(String(recipientId)).emit("familyMessage",{
      conversationId:String(conversation._id),
      messageId:String(message._id)
    });

    return res.status(201).json({
      success:true,
      message:serializeFamilyMessage(
        populated,
        senderId,
        conversation
      )
    });
  }catch(error){
    console.error("SEND FAMILY CHAT MESSAGE ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Could not send the Family message"
    });
  }
});

module.exports = router;
