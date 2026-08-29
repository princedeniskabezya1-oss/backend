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
  return Boolean(
    user &&
    (user.role === "family" || user.role === "admin")
  );
}

function familyAccessGuard(req,res,next){
  if(!isFamilyUser(req.user)){
    return res.status(403).json({
      success:false,
      message:"Family account access required"
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

module.exports = router;
