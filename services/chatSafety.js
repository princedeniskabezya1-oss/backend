const crypto = require("crypto");
const User = require("../models/User");
const ChatSafetyStrike = require("../models/ChatSafetyStrike");
const Notification = require("../models/Notification");

const CONTACT_PATTERNS = [
  { category:"email", regex:/\b[A-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\))\s*[A-Z0-9.-]+\s*(?:\.|\[dot\]|\(dot\))\s*[A-Z]{2,}\b/i },
  { category:"phone", regex:/(?:\+?\d[\s().-]*){8,15}/ },
  { category:"social_handle", regex:/\b(?:whatsapp|telegram|viber|wechat|signal|instagram|facebook|messenger|discord|skype|line)\b\s*(?:[:@-]|is)?\s*[A-Z0-9_.+-]{3,}/i },
  { category:"external_contact", regex:/\b(?:contact|call|text|message|email|reach\s+me|dm\s+me)\b.{0,30}(?:\+?\d[\d\s().-]{7,}|[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+)/i }
];

function detectContactSharing(text){
  const value = String(text || "").trim();
  if(!value) return null;
  for(const pattern of CONTACT_PATTERNS){
    const match = value.match(pattern.regex);
    if(match){
      return { category:pattern.category, value:match[0] };
    }
  }
  return null;
}

function hashMatch(value){
  return crypto.createHash("sha256").update(String(value || "").toLowerCase()).digest("hex");
}

async function enforceChatSafety({ userId, receiverId=null, conversationId=null, text="", source="message" }){
  const detected = detectContactSharing(text);
  if(!detected) return { allowed:true, strikeCount:0 };

  const priorCount = await ChatSafetyStrike.countDocuments({ userId });
  const strikeNumber = Math.min(priorCount + 1, 3);
  const action = strikeNumber >= 3
    ? "account_deactivated"
    : strikeNumber === 2
      ? "final_warning"
      : "warning";

  await ChatSafetyStrike.create({
    userId,
    receiverId,
    conversationId,
    category:detected.category,
    matchedValueHash:hashMatch(detected.value),
    strikeNumber,
    action,
    source
  });

  if(strikeNumber >= 3){
    await User.updateOne(
      { _id:userId },
      { $set:{ status:"deactivated", deactivatedAt:new Date(), deactivationReason:"chat_contact_sharing_policy" } }
    );
  }

  try{
    await Notification.create({
      user:userId,
      type:"chat_safety_warning",
      text:strikeNumber >= 3
        ? "Your account was deactivated after three attempts to share private contact information in AIFT chat."
        : `AIFT blocked private contact information in chat. Warning ${strikeNumber} of 3. Keep communication inside AIFT.`,
      link:"/"
    });
  }catch(error){
    console.error("CHAT SAFETY NOTIFICATION ERROR:",error);
  }

  return {
    allowed:false,
    category:detected.category,
    strikeCount:strikeNumber,
    accountDeactivated:strikeNumber >= 3,
    code:strikeNumber >= 3 ? "CHAT_SAFETY_ACCOUNT_DEACTIVATED" : "CHAT_SAFETY_CONTACT_BLOCKED",
    message:strikeNumber >= 3
      ? "Private contact information is not allowed in AIFT chat. This was warning 3 of 3 and the account has been deactivated for review."
      : `Private contact information is not allowed in AIFT chat. Warning ${strikeNumber} of 3.`
  };
}

module.exports = { detectContactSharing, enforceChatSafety };
