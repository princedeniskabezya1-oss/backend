const mongoose = require("mongoose");

const { Schema } = mongoose;

const aiftReviewTicketSchema = new Schema({
  ticketNumber:{ type:String, required:true, unique:true, index:true, trim:true },
  category:{
    type:String,
    required:true,
    enum:["venture","scholarship","internship","partnership","investment","career_event","opportunity","other"],
    index:true
  },
  action:{
    type:String,
    required:true,
    enum:["publish_request","application","interest","funding_commitment","partnership_request","verification","other"]
  },
  requesterId:{ type:Schema.Types.ObjectId, ref:"User", required:true, index:true },
  targetUserId:{ type:Schema.Types.ObjectId, ref:"User", default:null, index:true },
  resourceType:{ type:String, required:true, trim:true, maxlength:80 },
  resourceId:{ type:Schema.Types.ObjectId, required:true, index:true },
  status:{
    type:String,
    enum:["submitted","in_review","needs_information","approved","rejected","matched","meeting","completed","cancelled"],
    default:"submitted",
    index:true
  },
  priority:{ type:String, enum:["low","normal","high","urgent"], default:"normal", index:true },
  title:{ type:String, required:true, trim:true, maxlength:240 },
  summary:{ type:String, default:"", trim:true, maxlength:3000 },
  assignedTo:{ type:Schema.Types.ObjectId, ref:"User", default:null, index:true },
  reviewNotes:{ type:String, default:"", trim:true, maxlength:5000 },
  checklist:[{
    key:{ type:String, trim:true, maxlength:80 },
    label:{ type:String, trim:true, maxlength:180 },
    status:{ type:String, enum:["pending","passed","failed","not_applicable"], default:"pending" },
    note:{ type:String, trim:true, maxlength:1000 },
    checkedBy:{ type:Schema.Types.ObjectId, ref:"User", default:null },
    checkedAt:{ type:Date, default:null }
  }],
  history:[{
    status:{ type:String, required:true },
    note:{ type:String, default:"", maxlength:1000 },
    actorId:{ type:Schema.Types.ObjectId, ref:"User", default:null },
    createdAt:{ type:Date, default:Date.now }
  }],
  submittedAt:{ type:Date, default:Date.now },
  reviewedAt:{ type:Date, default:null },
  completedAt:{ type:Date, default:null },
  metadata:{ type:Schema.Types.Mixed, default:{} }
},{ timestamps:true });

aiftReviewTicketSchema.index({ status:1, priority:-1, createdAt:1 });
aiftReviewTicketSchema.index({ requesterId:1, createdAt:-1 });
aiftReviewTicketSchema.index({ resourceType:1, resourceId:1, action:1 });

module.exports = mongoose.model("AiftReviewTicket", aiftReviewTicketSchema);
