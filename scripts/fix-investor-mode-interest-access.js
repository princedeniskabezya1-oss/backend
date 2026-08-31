const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'..','routes','ventures.js');
let s=fs.readFileSync(p,'utf8');
const old=`        const investorRole =\n          normalizeRole(\n            investorUser\n          );\n\n\n        const investorAllowed =\n          (\n            investorRole ===\n              \"admin\" ||\n            (\n              investorRole ===\n                \"family\" &&\n              investorUser\n                .familyProfile\n                ?.investorEnabled ===\n                true\n            )\n          );`;
const replacement=`        const investorAllowed =\n          hasInvestorAccess(\n            investorUser\n          );`;
if(!s.includes(old)) throw new Error('Investment authorization anchor not found');
s=s.replace(old,replacement);
fs.writeFileSync(p,s);
console.log('Investor Mode investment-interest authorization aligned with Investor discovery access.');
