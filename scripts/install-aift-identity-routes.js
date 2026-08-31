const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname,"..","server.js");
let source = fs.readFileSync(serverPath,"utf8");

const requireAnchor = `const familyChildrenRoutes =\n  require("./routes/familyChildren");`;
const requireReplacement = `${requireAnchor}\n\nconst studentIdentityRoutes =\n  require("./routes/studentIdentity");\n\nconst familyStudentLinkRoutes =\n  require("./routes/familyStudentLinks");`;

if(!source.includes('require("./routes/studentIdentity")')){
  if(!source.includes(requireAnchor)) throw new Error("Family route require anchor not found");
  source = source.replace(requireAnchor,requireReplacement);
}

const mountAnchor = `app.use(\n  "/api/family/children",\n  familyChildrenRoutes\n);`;
const mountReplacement = `${mountAnchor}\n\n/* AIFT verified Student Identity */\napp.use(\n  "/api/student-identity",\n  studentIdentityRoutes\n);\n\n/* Consent-based Family ↔ Student connections */\napp.use(\n  "/api/family-student-links",\n  familyStudentLinkRoutes\n);`;

if(!source.includes('"/api/student-identity"')){
  if(!source.includes(mountAnchor)) throw new Error("Family route mount anchor not found");
  source = source.replace(mountAnchor,mountReplacement);
}

fs.writeFileSync(serverPath,source);
console.log("AIFT identity routes installed in server.js");
