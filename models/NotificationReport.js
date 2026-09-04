const mongoose = require("mongoose");

const notificationReportSchema = new mongoose.Schema({
  reporter:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  notification:{type:mongoose.Schema.Types.ObjectId,ref:"Notification",required:true,index:true},
  notificationType:{type:String,trim:true},
  reason:{type:String,enum:["not_relevant","misleading","spam","offensive","technical_issue","other"],default:"technical_issue"},
  details:{type:String,trim:true,maxlength:1000},
  status:{type:String,enum:["open","reviewing","resolved","dismissed"],default:"open",index:true},
  metadata:{type:mongoose.Schema.Types.Mixed,default:undefined}
},{timestamps:true});

notificationReportSchema.index({reporter:1,notification:1},{unique:true});
module.exports=mongoose.model("NotificationReport",notificationReportSchema);
