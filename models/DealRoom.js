const mongoose=require("mongoose");

const MessageSchema=new mongoose.Schema({
  senderId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  text:{type:String,trim:true,maxlength:4000,required:true},
  createdAt:{type:Date,default:Date.now}
},{_id:true});

const MeetingSchema=new mongoose.Schema({
  title:{type:String,trim:true,maxlength:180,default:"AIFT Deal Room Meeting"},
  startAt:{type:Date,required:true},
  durationMinutes:{type:Number,min:15,max:240,default:30},
  status:{type:String,enum:["proposed","accepted","declined","cancelled","completed"],default:"proposed"},
  proposedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  respondedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  respondedAt:{type:Date,default:null},
  completedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  completedAt:{type:Date,default:null},
  joinUrl:{type:String,trim:true,maxlength:1600,default:""},
  note:{type:String,trim:true,maxlength:1000,default:""}
},{timestamps:true});

const SharedDocumentSchema=new mongoose.Schema({
  ventureDocumentId:{type:mongoose.Schema.Types.ObjectId,default:null},
  name:{type:String,trim:true,maxlength:180,required:true},
  originalName:{type:String,trim:true,maxlength:220,default:""},
  type:{type:String,trim:true,maxlength:80,default:"other"},
  mimeType:{type:String,trim:true,maxlength:160,default:""},
  resourceType:{type:String,trim:true,maxlength:40,default:"raw"},
  bytes:{type:Number,min:0,default:0},
  url:{type:String,trim:true,maxlength:1600,required:true},
  sharedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  sharedAt:{type:Date,default:Date.now}
},{_id:true});

const DueDiligenceSchema=new mongoose.Schema({
  key:{type:String,trim:true,maxlength:80,required:true},
  label:{type:String,trim:true,maxlength:180,required:true},
  status:{type:String,enum:["pending","in_review","satisfied","needs_attention"],default:"pending"},
  note:{type:String,trim:true,maxlength:1500,default:""},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  updatedAt:{type:Date,default:Date.now}
},{_id:true});

const DecisionSchema=new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  role:{type:String,enum:["investor","owner"],required:true},
  decision:{type:String,enum:["continue","hold","withdraw"],required:true},
  note:{type:String,trim:true,maxlength:1500,default:""},
  decidedAt:{type:Date,default:Date.now}
},{_id:true});

const HistorySchema=new mongoose.Schema({
  status:{type:String,trim:true,maxlength:60,required:true},
  note:{type:String,trim:true,maxlength:1000,default:""},
  actorId:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  createdAt:{type:Date,default:Date.now}
},{_id:false});

const DealRoomSchema=new mongoose.Schema({
  reviewCaseId:{type:mongoose.Schema.Types.ObjectId,ref:"ReviewCase",required:true,unique:true,index:true},
  ventureId:{type:mongoose.Schema.Types.ObjectId,ref:"Venture",required:true,index:true},
  ventureInterestId:{type:mongoose.Schema.Types.ObjectId,ref:"VentureInterest",required:true,index:true},
  investorId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  ownerId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  openedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  status:{type:String,enum:["negotiation","completed","closed"],default:"negotiation",index:true},
  workflowStage:{type:String,enum:["due_diligence","meeting","decision","completed","closed"],default:"due_diligence",index:true},
  messages:{type:[MessageSchema],default:[]},
  meetings:{type:[MeetingSchema],default:[]},
  sharedDocuments:{type:[SharedDocumentSchema],default:[]},
  dueDiligence:{type:[DueDiligenceSchema],default:[]},
  decisions:{type:[DecisionSchema],default:[]},
  history:{type:[HistorySchema],default:[]},
  completedAt:{type:Date,default:null},
  closedAt:{type:Date,default:null}
},{timestamps:true});

DealRoomSchema.index({investorId:1,status:1,updatedAt:-1});
DealRoomSchema.index({ownerId:1,status:1,updatedAt:-1});

module.exports=mongoose.model("DealRoom",DealRoomSchema);
