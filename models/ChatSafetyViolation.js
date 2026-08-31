const mongoose = require("mongoose");

const ChatSafetyViolationSchema = new mongoose.Schema({
  userId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", required:true, index:true },
  conversationId:{ type:mongoose.Schema.Types.ObjectId, ref:"Conversation", default:null, index:true },
  receiverId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
  category:{ type:String, enum:["email","phone","url","social","contact_request","obfuscated_contact"], required:true },
  matchedValue:{ type:String, default:"", maxlength:160 },
  messageExcerpt:{ type:String, default:"", maxlength:300 },
  warningNumber:{ type:Number, min:1, default:1 },
  action:{ type:String, enum:["blocked_warning","messaging_restricted","admin_review"], default:"blocked_warning" },
  reviewed:{ type:Boolean, default:false, index:true },
  reviewedBy:{ type:mongoose.Schema.Types.ObjectId, ref:"User", default:null },
  reviewedAt:{ type:Date, default:null },
  reviewNotes:{ type:String, default:"", maxlength:1000 }
},{ timestamps:true });

ChatSafetyViolationSchema.index({ userId:1, createdAt:-1 });
ChatSafetyViolationSchema.index({ reviewed:1, action:1, createdAt:-1 });

module.exports = mongoose.model("ChatSafetyViolation", ChatSafetyViolationSchema);
