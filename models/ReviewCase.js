const mongoose = require("mongoose");

const ReviewCaseSchema = new mongoose.Schema({
  caseNumber:{ type:String, required:true, unique:true, index:true, uppercase:true, trim:true },
  type:{ type:String, enum:["venture","investment_interest","scholarship","scholarship_application","internship","partnership","opportunity","family_verification","student_verification","chat_safety","other"], required:true, index:true },
  requesterId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", required:true, index:true },
  targetUserId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", default:null, index:true },
  resourceType:{ type:String, default:"", trim:true, maxlength:80 },
  resourceId:{ type:mongoose.Schema.Types.ObjectId, default:null, index:true },
  title:{ type:String, required:true, trim:true, maxlength:220 },
  summary:{ type:String, default:"", trim:true, maxlength:3000 },
  status:{ type:String, enum:["submitted","under_review","information_requested","approved","rejected","matched","negotiation","completed","cancelled","expired"], default:"submitted", index:true },
  priority:{ type:String, enum:["low","normal","high","urgent"], default:"normal", index:true },
  assignedTo:{ type:mongoose.Schema.Types.ObjectId, ref:"User", default:null, index:true },
  submittedAt:{ type:Date, default:Date.now },
  reviewedAt:{ type:Date, default:null },
  resolvedAt:{ type:Date, default:null },
  decisionNotes:{ type:String, default:"", maxlength:3000 },
  metadata:{ type:mongoose.Schema.Types.Mixed, default:{} },
  history:[{
    status:{ type:String, required:true },
    note:{ type:String, default:"", maxlength:1000 },
    actorId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
    at:{ type:Date, default:Date.now }
  }]
},{ timestamps:true });

ReviewCaseSchema.index({ status:1, priority:1, createdAt:1 });
ReviewCaseSchema.index({ requesterId:1, createdAt:-1 });
ReviewCaseSchema.index({ type:1, status:1, createdAt:-1 });

module.exports = mongoose.model("ReviewCase", ReviewCaseSchema);
