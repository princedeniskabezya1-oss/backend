const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const FamilyStudentLinkRequest = require("../models/FamilyStudentLinkRequest");
const FamilyChild = require("../models/FamilyChild");
const Group = require("../models/Group");
const NotificationPreference = require("../models/NotificationPreference");
const NotificationReport = require("../models/NotificationReport");
const auth = require("../middleware/auth");

const router = express.Router();
const MAX_LIMIT = 250;
const userId = req => req.user?._id || req.user?.id;
const validId = value => mongoose.Types.ObjectId.isValid(value);
const emit = (req,event,payload) => req.app.get("io")?.to(String(userId(req))).emit(event,payload);
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

function baseQuery(req){
  const query={user:userId(req),dismissed:{$ne:true}};
  if(req.query.filter==="unread") query.read=false;
  if(req.query.filter==="read") query.read=true;
  if(req.query.type) query.type=String(req.query.type);
  if(req.query.before&&validId(req.query.before)) query._id={$lt:req.query.before};
  const search=String(req.query.q||"").trim();
  if(search){const safe=escapeRegExp(search.slice(0,100));query.$or=[{text:{$regex:safe,$options:"i"}},{title:{$regex:safe,$options:"i"}}];}
  return query;
}

router.get("/",auth,async(req,res)=>{
  try{
    const limit=Math.min(Math.max(Number(req.query.limit)||100,1),MAX_LIMIT);
    const preferences=await NotificationPreference.findOne({user:userId(req)}).select("notificationFeed").lean();
    const query=baseQuery(req),mutedTypes=preferences?.notificationFeed?.mutedTypes||[];
    if(mutedTypes.length&&!req.query.type)query.type={$nin:mutedTypes};
    const notifications=await Notification.find(query).populate("sender","name profileImage companyName schoolName logo role").sort({_id:-1}).limit(limit).lean();
    const weights=preferences?.notificationFeed?.typeWeights||{};
    notifications.forEach(item=>{item.relevanceWeight=Number(weights[item.type]||0);});
    return res.json(notifications);
  }catch(error){console.error("GET NOTIFICATIONS ERROR:",error);return res.status(500).json({message:"Failed to load notifications"});}
});

async function unreadCount(req,res){
  try{return res.json({count:await Notification.countDocuments({user:userId(req),read:false,dismissed:{$ne:true}})});}
  catch(error){console.error("UNREAD NOTIFICATION COUNT ERROR:",error);return res.status(500).json({message:"Failed to count notifications"});}
}
router.get("/unread",auth,unreadCount);
router.get("/unread-count",auth,unreadCount);

router.patch("/read-all",auth,async(req,res)=>{
  try{const now=new Date();const result=await Notification.updateMany({user:userId(req),read:false,dismissed:{$ne:true}},{$set:{read:true,readAt:now,seen:true,seenAt:now}});emit(req,"notificationsRead",{all:true,count:result.modifiedCount||0});return res.json({success:true,count:result.modifiedCount||0});}
  catch(error){return res.status(500).json({message:"Failed to mark notifications as read"});}
});

router.patch("/seen-all",auth,async(req,res)=>{
  try{const now=new Date();const result=await Notification.updateMany({user:userId(req),seen:false,dismissed:{$ne:true}},{$set:{seen:true,seenAt:now}});return res.json({success:true,count:result.modifiedCount||0});}
  catch(error){return res.status(500).json({message:"Failed to mark notifications as seen"});}
});

router.patch("/:id/read",auth,async(req,res)=>{
  try{const now=new Date();const notification=await Notification.findOneAndUpdate({_id:req.params.id,user:userId(req),dismissed:{$ne:true}},{$set:{read:true,readAt:now,seen:true,seenAt:now}},{new:true});if(!notification)return res.status(404).json({message:"Notification not found"});emit(req,"notificationUpdated",{id:notification._id,read:true});return res.json({message:"Marked as read",notification});}
  catch(error){return res.status(500).json({message:"Failed to update notification"});}
});

router.patch("/:id/unread",auth,async(req,res)=>{
  try{const notification=await Notification.findOneAndUpdate({_id:req.params.id,user:userId(req),dismissed:{$ne:true}},{$set:{read:false},$unset:{readAt:1}},{new:true});if(!notification)return res.status(404).json({message:"Notification not found"});emit(req,"notificationUpdated",{id:notification._id,read:false});return res.json({notification});}
  catch(error){return res.status(500).json({message:"Failed to update notification"});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{const now=new Date();const notification=await Notification.findOneAndUpdate({_id:req.params.id,user:userId(req)},{$set:{dismissed:true,dismissedAt:now,read:true,readAt:now}},{new:true});if(!notification)return res.status(404).json({message:"Notification not found"});emit(req,"notificationRemoved",{id:notification._id});return res.json({success:true});}
  catch(error){return res.status(500).json({message:"Failed to remove notification"});}
});

router.post("/:id/feedback",auth,async(req,res)=>{
  try{
    const notification=await Notification.findOne({_id:req.params.id,user:userId(req),dismissed:{$ne:true}}).lean();
    if(!notification)return res.status(404).json({message:"Notification not found"});
    const direction=String(req.body.direction||"");
    if(!["more","less"].includes(direction))return res.status(400).json({message:"Choose show more or show less"});
    const path=`notificationFeed.typeWeights.${notification.type}`;
    const amount=direction==="more"?1:-1;
    const preferences=await NotificationPreference.findOneAndUpdate({user:userId(req)},{$set:{user:userId(req),"notificationFeed.feedbackUpdatedAt":new Date()},$inc:{[path]:amount}},{upsert:true,new:true,setDefaultsOnInsert:true});
    emit(req,"notificationPreferenceUpdated",{type:notification.type,direction});
    return res.json({success:true,direction,type:notification.type,weight:Number(preferences.notificationFeed?.typeWeights?.get?.(notification.type)||0)});
  }catch(error){console.error("NOTIFICATION FEEDBACK ERROR:",error);return res.status(500).json({message:"Could not save notification preference"});}
});

router.post("/:id/mute-type",auth,async(req,res)=>{
  try{
    const notification=await Notification.findOne({_id:req.params.id,user:userId(req),dismissed:{$ne:true}}).lean();
    if(!notification)return res.status(404).json({message:"Notification not found"});
    await NotificationPreference.findOneAndUpdate({user:userId(req)},{$set:{user:userId(req),"notificationFeed.feedbackUpdatedAt":new Date()},$addToSet:{"notificationFeed.mutedTypes":notification.type}},{upsert:true,new:true,setDefaultsOnInsert:true});
    await Notification.updateMany({user:userId(req),type:notification.type,dismissed:{$ne:true}},{$set:{dismissed:true,dismissedAt:new Date(),read:true,readAt:new Date()}});
    emit(req,"notificationPreferenceUpdated",{type:notification.type,muted:true});
    return res.json({success:true,type:notification.type});
  }catch(error){console.error("MUTE NOTIFICATION TYPE ERROR:",error);return res.status(500).json({message:"Could not turn off this notification type"});}
});

router.post("/:id/report",auth,async(req,res)=>{
  try{
    const notification=await Notification.findOne({_id:req.params.id,user:userId(req)}).lean();
    if(!notification)return res.status(404).json({message:"Notification not found"});
    const allowed=["not_relevant","misleading","spam","offensive","technical_issue","other"];
    const reason=allowed.includes(String(req.body.reason))?String(req.body.reason):"technical_issue";
    const report=await NotificationReport.findOneAndUpdate({reporter:userId(req),notification:notification._id},{$set:{notificationType:notification.type,reason,details:String(req.body.details||"").trim().slice(0,1000),status:"open",metadata:{link:notification.link||""}}},{upsert:true,new:true,setDefaultsOnInsert:true});
    return res.status(201).json({success:true,reportId:report._id});
  }catch(error){console.error("REPORT NOTIFICATION ERROR:",error);return res.status(500).json({message:"Could not submit this report"});}
});

router.post("/:id/action",auth,async(req,res)=>{
  try{
    const notification=await Notification.findOne({_id:req.params.id,user:userId(req),dismissed:{$ne:true}});
    if(!notification)return res.status(404).json({message:"Notification not found"});
    if(notification.actionState&&notification.actionState!=="pending")return res.status(409).json({message:"This notification was already handled"});
    const action=String(req.body.action||"");
    if(!["accept","decline"].includes(action))return res.status(400).json({message:"Invalid notification action"});
    if(notification.type==="family_link_request"){
      const request=await FamilyStudentLinkRequest.findOne({_id:notification.metadata?.requestId,studentId:userId(req),status:"pending"});
      if(!request)return res.status(409).json({message:"This request is no longer available"});
      request.status=action==="accept"?"accepted":"declined";request.respondedAt=new Date();await request.save();
      const child=await FamilyChild.findOne({_id:request.familyChildId,familyId:request.familyId});
      if(child){child.linkedStudentId=action==="accept"?userId(req):null;child.linkStatus=action==="accept"?"linked":"unlinked";child.consentConfirmed=action==="accept";child.consentConfirmedAt=action==="accept"?new Date():null;await child.save();}
    }else if(notification.type==="group_invite"){
      const group=await Group.findOne({_id:notification.metadata?.groupId,isActive:true});
      if(!group)return res.status(409).json({message:"This group is no longer available"});
      if(action==="accept"&&!group.members.some(id=>String(id)===String(userId(req)))){group.members.push(userId(req));group.membersCount=group.members.length;await group.save();}
    }else{return res.status(400).json({message:"This notification has no direct action"});}
    notification.actionState=action==="accept"?"accepted":"declined";notification.read=true;notification.readAt=new Date();notification.seen=true;notification.seenAt=new Date();await notification.save();
    emit(req,"notificationUpdated",{id:notification._id,read:true,actionState:notification.actionState});
    return res.json({success:true,actionState:notification.actionState,link:notification.link||""});
  }catch(error){console.error("NOTIFICATION ACTION ERROR:",error);return res.status(500).json({message:"Failed to complete notification action"});}
});

module.exports=router;
