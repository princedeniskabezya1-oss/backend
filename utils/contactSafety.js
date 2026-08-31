const ChatSafetyViolation = require("../models/ChatSafetyViolation");
const Notification = require("../models/Notification");
const ReviewCase = require("../models/ReviewCase");
const crypto = require("crypto");

const SECOND_WARNING_RESTRICTION_MS = 24 * 60 * 60 * 1000;
const patterns = [
  { category:"email", regex:/\b[A-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\sat\s)\s*[A-Z0-9.-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*[A-Z]{2,}\b/i },
  { category:"phone", regex:/(?:\+?\d[\s().-]*){8,15}/ },
  { category:"url", regex:/\b(?:https?:\/\/|www\.)\S+|\b[A-Z0-9-]+\.(?:com|net|org|ph|io|me|co)\b/i },
  { category:"social", regex:/\b(?:whats?app|telegram|viber|signal|wechat|messenger|facebook|instagram|insta|linkedin|discord|skype|tiktok)\b\s*(?:[:@-]?\s*[A-Z0-9_.+-]{3,})?/i },
  { category:"contact_request", regex:/\b(?:call|text|message|email|contact|reach)\s+me\s+(?:at|on|via)\b/i },
  { category:"obfuscated_contact", regex:/\b(?:my\s+)?(?:number|phone|email|whatsapp|telegram)\s*(?:is|:|-)/i }
];

function inspectContactSharing(text){
  const value=String(text||"").trim();
  if(!value) return null;
  for(const item of patterns){ const match=value.match(item.regex); if(match) return { category:item.category, matchedValue:String(match[0]||"").slice(0,160) }; }
  return null;
}

async function createChatSafetyReview(userId,violation){
  const existing=await ReviewCase.findOne({ type:"chat_safety", resourceType:"ChatSafetyViolation", resourceId:violation._id, status:{ $nin:["rejected","completed","cancelled","expired"] } });
  if(existing) return existing;
  const review=await ReviewCase.create({
    caseNumber:`AIFT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    type:"chat_safety", requesterId:userId, resourceType:"ChatSafetyViolation", resourceId:violation._id,
    title:"Repeated attempt to share external contact information",
    summary:"Messaging was restricted after repeated blocked attempts to move communication outside AIFT.",
    status:"submitted", priority:"high",
    metadata:{ category:violation.category, warningNumber:violation.warningNumber, conversationId:String(violation.conversationId||""), receiverId:String(violation.receiverId||"") },
    history:[{ status:"submitted", note:"Automatically escalated by AIFT chat safety.", actorId:userId }]
  });
  violation.reviewCaseId=review._id; await violation.save(); return review;
}

async function enforceContactSafety({ user,text,conversationId=null,receiverId=null }){
  const detected=inspectContactSharing(text); if(!detected) return { allowed:true };
  const userId=user?._id||user?.id;
  const previousCount=await ChatSafetyViolation.countDocuments({ userId });
  const warningNumber=previousCount+1;
  const action=warningNumber>=3?"admin_review":warningNumber===2?"messaging_restricted":"blocked_warning";
  const restrictedUntil=warningNumber===2?new Date(Date.now()+SECOND_WARNING_RESTRICTION_MS):warningNumber>=3?new Date("2999-12-31T23:59:59.000Z"):null;
  const violation=await ChatSafetyViolation.create({ userId,conversationId,receiverId,category:detected.category,matchedValue:detected.matchedValue,messageExcerpt:String(text||"").slice(0,300),warningNumber,action,restrictedUntil });

  let reviewCase=null;
  if(warningNumber>=3){
    reviewCase=await createChatSafetyReview(userId,violation);
    await Notification.create({ user:userId,type:"review_case",text:"Your messaging access has been restricted and sent for AIFT review after repeated attempts to share contact information.",link:"/home.html" }).catch(()=>{});
  }

  return { allowed:false,violation,reviewCase,warningNumber,action,statusCode:warningNumber>=3?403:422,
    message:warningNumber>=3?"Message blocked. Your messaging access is restricted pending AIFT review.":warningNumber===2?"Message blocked. Warning 2 of 3. Messaging is temporarily restricted for 24 hours.":"Message blocked. AIFT does not allow personal contact information in chat. Warning 1 of 3." };
}

async function getMessagingRestriction(userId){
  const latest=await ChatSafetyViolation.findOne({ userId, reviewed:{ $ne:true }, action:{ $in:["messaging_restricted","admin_review"] } }).sort({ createdAt:-1 }).lean();
  if(!latest) return null;
  if(latest.action==="admin_review") return { restricted:true,pendingReview:true,violation:latest };
  if(latest.restrictedUntil && new Date(latest.restrictedUntil)>new Date()) return { restricted:true,pendingReview:false,restrictedUntil:latest.restrictedUntil,violation:latest };
  return null;
}
async function hasMessagingRestriction(userId){ return Boolean(await getMessagingRestriction(userId)); }

module.exports={ inspectContactSharing,enforceContactSafety,hasMessagingRestriction,getMessagingRestriction };
