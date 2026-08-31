const fs=require('fs'),path=require('path');const p=path.join(__dirname,'..','server.js');let s=fs.readFileSync(p,'utf8');
const importAnchor='const reviewCaseRoutes =\n  require("./routes/reviewCases");';
if(!s.includes(importAnchor))throw new Error('review route import anchor missing');
s=s.replace(importAnchor,importAnchor+'\n\nconst dealRoomRoutes =\n  require("./routes/dealRooms");');
const mountAnchor='app.use(\n  "/api/review-cases",\n  reviewCaseRoutes\n);';
if(!s.includes(mountAnchor))throw new Error('review route mount anchor missing');
s=s.replace(mountAnchor,mountAnchor+'\n\n/* Controlled AIFT investor ↔ Venture negotiation rooms */\napp.use(\n  "/api/deal-rooms",\n  dealRoomRoutes\n);');
fs.writeFileSync(p,s);console.log('Deal Room route mounted');
