const fs = require("fs");
const path = require("path");

const root = path.join(__dirname,"..");
const serverPath = path.join(root,"server.js");
let source = fs.readFileSync(serverPath,"utf8");

const requireAnchor = `const familyChildrenRoutes =\n  require("./routes/familyChildren");`;
if(!source.includes('require("./routes/studentIdentity")')){
  source = source.replace(requireAnchor,`${requireAnchor}\n\nconst studentIdentityRoutes =\n  require("./routes/studentIdentity");\n\nconst familyStudentLinkRoutes =\n  require("./routes/familyStudentLinks");`);
}

if(!source.includes('require("./routes/aiftReviewTickets")')){
  const anchor = `const ventureRoutes =\n  require("./routes/ventures");`;
  if(!source.includes(anchor)) throw new Error("Venture require anchor not found");
  source = source.replace(anchor,`${anchor}\n\nconst aiftReviewTicketRoutes =\n  require("./routes/aiftReviewTickets");`);
}

const mountAnchor = `app.use(\n  "/api/family/children",\n  familyChildrenRoutes\n);`;
if(!source.includes('"/api/student-identity"')){
  source = source.replace(mountAnchor,`${mountAnchor}\n\napp.use(\n  "/api/student-identity",\n  studentIdentityRoutes\n);\n\napp.use(\n  "/api/family-student-links",\n  familyStudentLinkRoutes\n);`);
}

if(!source.includes('"/api/aift-review"')){
  const anchor = `app.use(\n  "/api/ventures",\n  ventureRoutes\n);`;
  if(!source.includes(anchor)) throw new Error("Venture mount anchor not found");
  source = source.replace(anchor,`${anchor}\n\n/* Central AIFT trust and verification queue */\napp.use(\n  "/api/aift-review",\n  aiftReviewTicketRoutes\n);`);
}

fs.writeFileSync(serverPath,source);

const messagesPath = path.join(root,"routes","messages.js");
let messages = fs.readFileSync(messagesPath,"utf8");

if(!messages.includes('require("../services/chatSafety")')){
  const anchor = `const cloudinary = require("../config/cloudinary");`;
  if(!messages.includes(anchor)) throw new Error("Message import anchor not found");
  messages = messages.replace(anchor,`${anchor}\nconst { enforceChatSafety } = require("../services/chatSafety");`);
}

if(!messages.includes("CHAT_SAFETY_SEND_GUARD")){
  const anchor = `    const conversation =\n      await findOrCreateDirectConversation(senderId,receiverId,senderId);`;
  if(!messages.includes(anchor)) throw new Error("Message send anchor not found");
  const guard = `    /* CHAT_SAFETY_SEND_GUARD */\n    const chatSafety = await enforceChatSafety({\n      userId:senderId,\n      receiverId,\n      text,\n      source:"message"\n    });\n    if(!chatSafety.allowed){\n      return res.status(chatSafety.accountDeactivated ? 403 : 422).json(chatSafety);\n    }\n\n${anchor}`;
  messages = messages.replace(anchor,guard);
}

if(!messages.includes("CHAT_SAFETY_EDIT_GUARD")){
  const anchor = `    message.editText(String(text || "").trim());`;
  if(!messages.includes(anchor)) throw new Error("Message edit anchor not found");
  const guard = `    /* CHAT_SAFETY_EDIT_GUARD */\n    const chatSafety = await enforceChatSafety({\n      userId,\n      receiverId:message.receiver,\n      conversationId:message.conversationId,\n      text,\n      source:"message_edit"\n    });\n    if(!chatSafety.allowed){\n      return res.status(chatSafety.accountDeactivated ? 403 : 422).json(chatSafety);\n    }\n\n${anchor}`;
  messages = messages.replace(anchor,guard);
}

fs.writeFileSync(messagesPath,messages);
console.log("AIFT production trust layer installed");
