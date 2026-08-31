const ChatSafetyViolation = require("../models/ChatSafetyViolation");
const Notification = require("../models/Notification");

const patterns = [
  { category:"email", regex:/\b[A-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\sat\s)\s*[A-Z0-9.-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*[A-Z]{2,}\b/i },
  { category:"phone", regex:/(?:\+?\d[\s().-]*){8,15}/ },
  { category:"url", regex:/\b(?:https?:\/\/|www\.)\S+|\b[A-Z0-9-]+\.(?:com|net|org|ph|io|me|co)\b/i },
  { category:"social", regex:/\b(?:whats?app|telegram|viber|signal|wechat|messenger|facebook|instagram|insta|linkedin|discord|skype|tiktok)\b\s*(?:[:@-]?\s*[A-Z0-9_.+-]{3,})?/i },
  { category:"contact_request", regex:/\b(?:call|text|message|email|contact|reach)\s+me\s+(?:at|on|via)\b/i },
  { category:"obfuscated_contact", regex:/\b(?:my\s+)?(?:number|phone|email|whatsapp|telegram)\s*(?:is|:|-)/i }
];

function inspectContactSharing(text){
  const value = String(text || "").trim();
  if(!value) return null;
  for(const item of patterns){
    const match = value.match(item.regex);
    if(match) return { category:item.category, matchedValue:String(match[0] || "").slice(0,160) };
  }
  return null;
}

async function enforceContactSafety({ user, text, conversationId=null, receiverId=null }){
  const detected = inspectContactSharing(text);
  if(!detected) return { allowed:true };

  const userId = user?._id || user?.id;
  const previousCount = await ChatSafetyViolation.countDocuments({ userId });
  const warningNumber = previousCount + 1;
  const action = warningNumber >= 3 ? "admin_review" : warningNumber === 2 ? "messaging_restricted" : "blocked_warning";

  const violation = await ChatSafetyViolation.create({
    userId, conversationId, receiverId,
    category:detected.category,
    matchedValue:detected.matchedValue,
    messageExcerpt:String(text || "").slice(0,300),
    warningNumber,
    action
  });

  if(warningNumber >= 3){
    await Notification.create({
      user:userId,
      type:"review_case",
      text:"Your messaging access has been restricted and sent for AIFT review after repeated attempts to share contact information.",
      link:"/home.html"
    }).catch(()=>{});
  }

  return {
    allowed:false,
    violation,
    warningNumber,
    action,
    statusCode:warningNumber >= 3 ? 403 : 422,
    message:warningNumber >= 3
      ? "Message blocked. Your messaging access is restricted pending AIFT review."
      : `Message blocked. AIFT does not allow personal contact information in chat. Warning ${warningNumber} of 3.`
  };
}

async function hasMessagingRestriction(userId){
  const latest = await ChatSafetyViolation.findOne({ userId }).sort({ createdAt:-1 }).lean();
  return Boolean(latest && latest.warningNumber >= 3 && latest.reviewed !== true);
}

module.exports = { inspectContactSharing, enforceContactSafety, hasMessagingRestriction };
