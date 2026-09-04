const Notification = require("../models/Notification");

function clean(value,max=2000){return String(value||"").trim().slice(0,max);}
function id(value){return value?._id||value||null;}

async function createNotification(payload,{io=null,upsert=false}={}){
  const user=id(payload.user);
  const sender=id(payload.sender);
  if(!user||String(user)===String(sender))return null;
  const data={...payload,user,sender,text:clean(payload.text),title:clean(payload.title,180),link:clean(payload.link,1000)};
  let notification;
  if(upsert&&data.groupKey){
    notification=await Notification.findOneAndUpdate({user,groupKey:data.groupKey,dismissed:{$ne:true}},{$set:{...data,read:false,seen:false},$unset:{readAt:1,seenAt:1}},{new:true,upsert:true,setDefaultsOnInsert:true});
  }else notification=await Notification.create(data);
  const populated=await Notification.findById(notification._id).populate("sender","name profileImage companyName schoolName logo role").lean();
  io?.to?.(String(user)).emit("newNotification",populated);
  io?.to?.(String(user)).emit("notification_created",populated);
  return populated;
}

async function createManyNotifications(items,options={}){
  return Promise.all((items||[]).map(item=>createNotification(item,options).catch(error=>{console.error("NOTIFICATION CREATE ERROR:",error);return null;})));
}

module.exports={createNotification,createManyNotifications};
