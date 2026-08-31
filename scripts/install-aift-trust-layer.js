const fs=require("fs");
const path=require("path");

function patch(file,changes){
  const p=path.join(__dirname,"..",file);
  let s=fs.readFileSync(p,"utf8");
  for(const {find,replace,label} of changes){
    if(s.includes(replace)) continue;
    if(!s.includes(find)) throw new Error(`${label} anchor not found in ${file}`);
    s=s.replace(find,replace);
  }
  fs.writeFileSync(p,s);
}

patch("server.js",[
  {
    label:"review route require",
    find:'const familyStudentLinkRoutes =\n  require("./routes/familyStudentLinks");',
    replace:'const familyStudentLinkRoutes =\n  require("./routes/familyStudentLinks");\n\nconst reviewCaseRoutes =\n  require("./routes/reviewCases");'
  },
  {
    label:"review route mount",
    find:'app.use(\n  "/api/family-student-links",\n  familyStudentLinkRoutes\n);',
    replace:'app.use(\n  "/api/family-student-links",\n  familyStudentLinkRoutes\n);\n\n/* Central AIFT trust and approval queue */\napp.use(\n  "/api/review-cases",\n  reviewCaseRoutes\n);'
  }
]);

patch("routes/messages.js",[
  {
    label:"contact safety import",
    find:'const cloudinary = require("../config/cloudinary");',
    replace:'const cloudinary = require("../config/cloudinary");\nconst { enforceContactSafety, hasMessagingRestriction } = require("../utils/contactSafety");'
  },
  {
    label:"send safety",
    find:'    const conversation =\n      await findOrCreateDirectConversation(senderId,receiverId,senderId);',
    replace:'    if(await hasMessagingRestriction(senderId)){\n      return res.status(403).json({ code:"AIFT_MESSAGING_RESTRICTED", message:"Messaging is restricted pending AIFT review." });\n    }\n\n    const safety = await enforceContactSafety({ user:req.user, text, receiverId });\n    if(!safety.allowed){\n      return res.status(safety.statusCode).json({ code:"AIFT_CONTACT_SHARING_BLOCKED", message:safety.message, warningNumber:safety.warningNumber, action:safety.action });\n    }\n\n    const conversation =\n      await findOrCreateDirectConversation(senderId,receiverId,senderId);'
  },
  {
    label:"edit safety",
    find:'    message.editText(String(text || "").trim());\n    await message.save();',
    replace:'    if(await hasMessagingRestriction(userId)){\n      return res.status(403).json({ code:"AIFT_MESSAGING_RESTRICTED", message:"Messaging is restricted pending AIFT review." });\n    }\n\n    const safety = await enforceContactSafety({ user:req.user, text, conversationId:message.conversationId, receiverId:message.receiver });\n    if(!safety.allowed){\n      return res.status(safety.statusCode).json({ code:"AIFT_CONTACT_SHARING_BLOCKED", message:safety.message, warningNumber:safety.warningNumber, action:safety.action });\n    }\n\n    message.editText(String(text || "").trim());\n    await message.save();'
  }
]);

console.log("AIFT trust layer installed");
