const mongoose = require("mongoose");

const APPLICATION_STATUSES = [
  "pending",
  "review",
  "shortlisted",
  "interview",
  "approved",
  "active",
  "completed",
  "rejected",
  "withdrawn"
];

const APPLICATION_SOURCES = [
  "student",
  "school_recommendation",
  "school_placement",
  "employer_invitation",
  "admin"
];

const APPLICATION_PROFILES = [
  "job",
  "internship",
  "project",
  "graduate_program",
  "placement",
  "general"
];

const statusHistorySchema = new mongoose.Schema(
  {
    status:{type:String,enum:APPLICATION_STATUSES,required:true},
    changedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    changedByRole:{type:String,trim:true,default:""},
    note:{type:String,trim:true,maxlength:2000,default:""},
    changedAt:{type:Date,default:Date.now}
  },
  {_id:false}
);

const attachmentSchema = new mongoose.Schema(
  {
    name:{type:String,trim:true,maxlength:300,default:""},
    url:{type:String,trim:true,maxlength:2000,required:true},
    publicId:{type:String,trim:true,maxlength:1000,default:""},
    mimeType:{type:String,trim:true,maxlength:200,default:""},
    size:{type:Number,min:0,default:null}
  },
  {_id:true}
);

const passportSnapshotSchema = new mongoose.Schema(
  {
    included:{type:Boolean,default:false},
    verified:{type:Boolean,default:false},
    aiftStudentId:{type:String,trim:true,maxlength:80,default:""},
    schoolId:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    schoolName:{type:String,trim:true,maxlength:250,default:""},
    program:{type:String,trim:true,maxlength:250,default:""},
    yearLevel:{type:String,trim:true,maxlength:120,default:""},
    verificationSource:{type:String,trim:true,maxlength:100,default:""},
    verifiedAt:{type:Date,default:null},
    capturedAt:{type:Date,default:null}
  },
  {_id:false}
);

const applicationAnswersSchema = new mongoose.Schema(
  {
    motivation:{type:String,trim:true,maxlength:6000,default:""},
    availability:{type:String,trim:true,maxlength:1500,default:""},
    projectProposal:{type:String,trim:true,maxlength:8000,default:""},
    workSampleUrl:{type:String,trim:true,maxlength:2000,default:""},
    expectedGraduation:{type:String,trim:true,maxlength:120,default:""},
    preferredStartDate:{type:Date,default:null}
  },
  {_id:false}
);

const InternshipApplicationSchema = new mongoose.Schema(
  {
    opportunityId:{type:mongoose.Schema.Types.ObjectId,ref:"SchoolOpportunity",required:true,index:true},
    schoolId:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null,index:true},
    companyId:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null,index:true},
    studentId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},

    status:{type:String,enum:APPLICATION_STATUSES,default:"pending",required:true,index:true},
    source:{type:String,enum:APPLICATION_SOURCES,default:"student",index:true},
    applicationProfile:{type:String,enum:APPLICATION_PROFILES,default:"general",index:true},

    message:{type:String,trim:true,maxlength:5000,default:""},
    notes:{type:String,trim:true,maxlength:5000,default:""},

    resumeUrl:{type:String,trim:true,maxlength:2000,default:""},
    portfolioUrl:{type:String,trim:true,maxlength:2000,default:""},
    coverLetter:{type:String,trim:true,maxlength:10000,default:""},
    attachments:{type:[attachmentSchema],default:[]},
    answers:{type:applicationAnswersSchema,default:()=>({})},
    passportSnapshot:{type:passportSnapshotSchema,default:()=>({})},

    recommendedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    recommendationMessage:{type:String,trim:true,maxlength:5000,default:""},

    reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    reviewedAt:{type:Date,default:null},
    interviewAt:{type:Date,default:null},
    interviewLocation:{type:String,trim:true,maxlength:1000,default:""},
    interviewNotes:{type:String,trim:true,maxlength:5000,default:""},

    approvedAt:{type:Date,default:null},
    startedAt:{type:Date,default:null},
    completedAt:{type:Date,default:null},
    rejectedAt:{type:Date,default:null},
    withdrawnAt:{type:Date,default:null},

    statusHistory:{type:[statusHistorySchema],default:[]},
    createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
    updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null}
  },
  {timestamps:true}
);

InternshipApplicationSchema.index(
  {opportunityId:1,studentId:1},
  {unique:true,name:"unique_student_opportunity_application"}
);
InternshipApplicationSchema.index({schoolId:1,status:1,createdAt:-1});
InternshipApplicationSchema.index({companyId:1,status:1,createdAt:-1});
InternshipApplicationSchema.index({studentId:1,status:1,createdAt:-1});
InternshipApplicationSchema.index({opportunityId:1,status:1,createdAt:-1});
InternshipApplicationSchema.index({studentId:1,applicationProfile:1,createdAt:-1});

module.exports = mongoose.models.InternshipApplication || mongoose.model("InternshipApplication",InternshipApplicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.APPLICATION_SOURCES = APPLICATION_SOURCES;
module.exports.APPLICATION_PROFILES = APPLICATION_PROFILES;
