const mongoose = require("mongoose");
const { Schema } = mongoose;

const chatSafetyStrikeSchema = new Schema({
  userId:{ type:Schema.Types.ObjectId, ref:"User", required:true, index:true },
  conversationId:{ type:Schema.Types.ObjectId, ref:"Conversation", default:null, index:true },
  receiverId:{ type:Schema.Types.ObjectId, ref:"User", default:null },
  category:{
    type:String,
    enum:["email","phone","social_handle","external_contact","other"],
    required:true
  },
  matchedValueHash:{ type:String, default:"", select:false },
  strikeNumber:{ type:Number, required:true, min:1, max:3 },
  action:{ type:String, enum:["warning","final_warning","account_deactivated"], required:true },
  source:{ type:String, enum:["message","message_edit"], default:"message" },
  metadata:{ type:Schema.Types.Mixed, default:{} }
},{ timestamps:true });

chatSafetyStrikeSchema.index({ userId:1, createdAt:-1 });

module.exports = mongoose.model("ChatSafetyStrike", chatSafetyStrikeSchema);
