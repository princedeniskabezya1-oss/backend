const mongoose = require("mongoose");

const PARTNERSHIP_TYPES = [
  "internship_partnership",
  "job_placement",
  "recruitment",
  "training",
  "collaboration",
  "career_event",
  "scholarship",
  "research",
  "mentorship",
  "industry_linkage"
];

const PARTNERSHIP_STATUSES = [
  "draft",
  "pending",
  "review",
  "approved",
  "active",
  "paused",
  "completed",
  "rejected",
  "cancelled",
  "expired",
  "archived"
];

const REQUESTED_BY_VALUES = [
  "school",
  "company",
  "employer",
  "admin"
];

const RELATIONSHIP_KINDS = [
  "school_company",
  "company_company"
];

const contactPersonSchema = new mongoose.Schema(
  {
    name:{type:String,trim:true,maxlength:180,default:""},
    title:{type:String,trim:true,maxlength:180,default:""},
    email:{type:String,trim:true,lowercase:true,maxlength:254,default:""},
    phone:{type:String,trim:true,maxlength:100,default:""}
  },
  {_id:false}
);

const partnershipDocumentSchema = new mongoose.Schema(
  {
    name:{type:String,trim:true,maxlength:300,default:""},
    url:{type:String,trim:true,maxlength:2000,required:true},
    publicId:{type:String,trim:true,maxlength:1000,default:""},
    mimeType:{type:String,trim:true,maxlength:200,default:""},
    uploadedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    uploadedAt:{type:Date,default:Date.now}
  },
  {_id:true}
);

const partnershipHistorySchema = new mongoose.Schema(
  {
    status:{type:String,enum:PARTNERSHIP_STATUSES,required:true},
    changedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    changedByRole:{type:String,trim:true,default:""},
    note:{type:String,trim:true,maxlength:3000,default:""},
    changedAt:{type:Date,default:Date.now}
  },
  {_id:false}
);

const SchoolCompanyPartnershipSchema = new mongoose.Schema(
  {
    relationshipKind:{
      type:String,
      enum:RELATIONSHIP_KINDS,
      default:"school_company",
      index:true
    },

    schoolId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"User",
      default:null,
      index:true
    },
    companyId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"User",
      required:true,
      index:true
    },
    partnerCompanyId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"User",
      default:null,
      index:true
    },

    schoolName:{type:String,trim:true,maxlength:250,default:""},
    companyName:{type:String,trim:true,maxlength:250,default:""},
    partnerCompanyName:{type:String,trim:true,maxlength:250,default:""},

    title:{type:String,trim:true,maxlength:300,default:""},
    type:{
      type:String,
      enum:PARTNERSHIP_TYPES,
      default:"internship_partnership",
      index:true
    },
    partnershipType:{
      type:String,
      enum:PARTNERSHIP_TYPES,
      default:"internship_partnership"
    },
    status:{
      type:String,
      enum:PARTNERSHIP_STATUSES,
      default:"pending",
      index:true
    },
    requestedBy:{
      type:String,
      enum:REQUESTED_BY_VALUES,
      required:true
    },
    requestedByOrganizationId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"User",
      default:null,
      index:true
    },

    message:{type:String,trim:true,maxlength:10000,default:""},
    objective:{type:String,trim:true,maxlength:10000,default:""},
    description:{type:String,trim:true,maxlength:15000,default:""},
    benefits:{type:[{type:String,trim:true,maxlength:1500}],default:[]},
    activities:{type:[{type:String,trim:true,maxlength:1500}],default:[]},

    capabilities:{
      internships:{type:Boolean,default:false},
      jobs:{type:Boolean,default:false},
      recruitment:{type:Boolean,default:false},
      training:{type:Boolean,default:false},
      careerEvents:{type:Boolean,default:false},
      scholarships:{type:Boolean,default:false},
      mentorship:{type:Boolean,default:false},
      research:{type:Boolean,default:false}
    },

    targetPrograms:{type:[{type:String,trim:true,maxlength:180}],default:[]},
    targetYearLevels:{type:[{type:String,trim:true,maxlength:100}],default:[]},
    targetSkills:{type:[{type:String,trim:true,maxlength:180}],default:[]},

    internshipSlots:{type:Number,min:0,default:null},
    jobSlots:{type:Number,min:0,default:null},
    expectedStudents:{type:Number,min:0,default:null},

    proposedStartDate:{type:Date,default:null},
    proposedEndDate:{type:Date,default:null},
    startDate:{type:Date,default:null},
    endDate:{type:Date,default:null},
    approvedAt:{type:Date,default:null},
    activatedAt:{type:Date,default:null},
    completedAt:{type:Date,default:null},
    rejectedAt:{type:Date,default:null},
    cancelledAt:{type:Date,default:null},
    archivedAt:{type:Date,default:null},

    schoolContact:{type:contactPersonSchema,default:()=>({})},
    companyContact:{type:contactPersonSchema,default:()=>({})},
    partnerCompanyContact:{type:contactPersonSchema,default:()=>({})},

    documents:{type:[partnershipDocumentSchema],default:[]},

    schoolNotes:{type:String,trim:true,maxlength:10000,default:""},
    companyNotes:{type:String,trim:true,maxlength:10000,default:""},
    partnerCompanyNotes:{type:String,trim:true,maxlength:10000,default:""},
    rejectionReason:{type:String,trim:true,maxlength:5000,default:""},

    metrics:{
      opportunitiesCreated:{type:Number,min:0,default:0},
      studentsApplied:{type:Number,min:0,default:0},
      studentsPlaced:{type:Number,min:0,default:0},
      studentsHired:{type:Number,min:0,default:0},
      eventsCompleted:{type:Number,min:0,default:0}
    },

    statusHistory:{type:[partnershipHistorySchema],default:[]},

    createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    lastActivityAt:{type:Date,default:Date.now,index:true},
    metadata:{type:mongoose.Schema.Types.Mixed,default:{}}
  },
  {timestamps:true}
);

SchoolCompanyPartnershipSchema.pre("validate",function validatePartnership(next){
  if(this.relationshipKind === "company_company"){
    if(!this.companyId || !this.partnerCompanyId){
      return next(new Error("A company partnership requires two company accounts."));
    }
    if(String(this.companyId) === String(this.partnerCompanyId)){
      return next(new Error("A company cannot create a partnership with itself."));
    }

    /*
      Legacy MongoDB deployments may still have the historical
      unique index on {schoolId, companyId, type}. Keep the second
      company in schoolId as an internal compatibility key so two
      different partner companies do not collide on schoolId:null.

      relationshipKind remains the authoritative semantic type and
      partnerCompanyId remains the authoritative second company.
      Normal School-partnership list queries exclude these records.
    */
    this.schoolId = this.partnerCompanyId;
    this.schoolName = this.partnerCompanyName || "";
  }else{
    this.relationshipKind = "school_company";
    if(!this.schoolId || !this.companyId){
      return next(new Error("A school-company partnership requires both a school and a company."));
    }
    this.partnerCompanyId = null;
    this.partnerCompanyName = "";
  }

  if(
    this.proposedStartDate &&
    this.proposedEndDate &&
    this.proposedEndDate < this.proposedStartDate
  ){
    return next(new Error("Proposed end date cannot be before the proposed start date."));
  }

  if(
    this.startDate &&
    this.endDate &&
    this.endDate < this.startDate
  ){
    return next(new Error("Partnership end date cannot be before the start date."));
  }

  if(
    this.isModified("status") &&
    ["approved","active"].includes(this.status)
  ){
    const hasAiftVerification = Array.isArray(this.statusHistory) &&
      this.statusHistory.some(entry =>
        entry?.status === "review" &&
        String(entry?.changedByRole || "").toLowerCase() === "admin"
      );

    if(!hasAiftVerification){
      return next(new Error(
        "AIFT verification must be completed before this partnership can be approved or activated."
      ));
    }
  }

  next();
});

function queryContainsOrganizationFilter(query){
  if(!query || typeof query !== "object") return false;
  if(Object.prototype.hasOwnProperty.call(query,"companyId")) return true;
  if(Object.prototype.hasOwnProperty.call(query,"schoolId")) return true;
  return Object.values(query).some(value=>{
    if(Array.isArray(value)) return value.some(queryContainsOrganizationFilter);
    return value && typeof value === "object" && queryContainsOrganizationFilter(value);
  });
}

SchoolCompanyPartnershipSchema.pre(/^find/,function hideCompanyPartnershipsFromLegacyLists(next){
  const query=this.getQuery() || {};

  /*
    New company-partnership code always requests relationshipKind
    explicitly. Existing School↔Company list/public/Campus queries do
    not, so keep company_company records out of those legacy surfaces.
    ID-only internal lookups remain available for AIFT sync/workspaces.
  */
  if(
    !Object.prototype.hasOwnProperty.call(query,"relationshipKind") &&
    queryContainsOrganizationFilter(query)
  ){
    this.where({relationshipKind:{$ne:"company_company"}});
  }

  next();
});

SchoolCompanyPartnershipSchema.index({schoolId:1,companyId:1,status:1});
SchoolCompanyPartnershipSchema.index({companyId:1,partnerCompanyId:1,status:1});
SchoolCompanyPartnershipSchema.index({schoolId:1,createdAt:-1});
SchoolCompanyPartnershipSchema.index({companyId:1,createdAt:-1});
SchoolCompanyPartnershipSchema.index({partnerCompanyId:1,createdAt:-1});
SchoolCompanyPartnershipSchema.index({schoolId:1,type:1,status:1});
SchoolCompanyPartnershipSchema.index({companyId:1,type:1,status:1});
SchoolCompanyPartnershipSchema.index({partnerCompanyId:1,type:1,status:1});

SchoolCompanyPartnershipSchema.index(
  {schoolId:1,companyId:1,type:1},
  {
    unique:true,
    partialFilterExpression:{
      relationshipKind:"school_company",
      status:{$in:["draft","pending","review","approved","active","paused"]}
    },
    name:"unique_live_school_company_partnership"
  }
);

SchoolCompanyPartnershipSchema.index(
  {companyId:1,partnerCompanyId:1,type:1},
  {
    unique:true,
    partialFilterExpression:{
      relationshipKind:"company_company",
      status:{$in:["draft","pending","review","approved","active","paused"]}
    },
    name:"unique_live_company_company_partnership"
  }
);

module.exports =
  mongoose.models.SchoolCompanyPartnership ||
  mongoose.model("SchoolCompanyPartnership",SchoolCompanyPartnershipSchema);

module.exports.PARTNERSHIP_TYPES = PARTNERSHIP_TYPES;
module.exports.PARTNERSHIP_STATUSES = PARTNERSHIP_STATUSES;
module.exports.RELATIONSHIP_KINDS = RELATIONSHIP_KINDS;
