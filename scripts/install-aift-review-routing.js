const fs=require("fs");
const path=require("path");
const root=path.join(__dirname,"..");

function patch(file,fn){
  const target=path.join(root,file);
  const before=fs.readFileSync(target,"utf8");
  const after=fn(before);
  if(after===before) throw new Error(`${file}: expected patch was not applied`);
  fs.writeFileSync(target,after);
  console.log(`patched ${file}`);
}
function once(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(needle,replacement);
}

patch("routes/ventures.js",source=>{
  source=once(source,'const auth =\n  require("../middleware/auth");','const auth =\n  require("../middleware/auth");\n\nconst {\n  queueVenturePublish,\n  queueVentureInterest,\n  latestReview\n} = require("../services/aiftReviewWorkflow");','ventures import');

  source=once(source,'      venture.status =\n        "active";\n\n\n      await venture.save();\n\n\n      res.json({\n        message:\n          "Venture published successfully",\n\n        venture\n      });','      if(isAdmin(req.user)){\n        venture.status = "active";\n        await venture.save();\n        return res.json({\n          message:"Venture published successfully",\n          venture,\n          reviewStatus:"approved"\n        });\n      }\n\n      const existingReview = await latestReview("venture", venture._id);\n\n      if(existingReview?.status === "approved"){\n        venture.status = "active";\n        await venture.save();\n        return res.json({\n          message:"Venture published successfully",\n          venture,\n          reviewCase:existingReview,\n          reviewStatus:"approved"\n        });\n      }\n\n      if(existingReview && ["submitted","under_review","information_requested","matched","negotiation"].includes(existingReview.status)){\n        venture.status = "submitted";\n        await venture.save();\n        return res.status(202).json({\n          message:"Venture is already in AIFT review.",\n          venture,\n          reviewCase:existingReview,\n          reviewStatus:existingReview.status\n        });\n      }\n\n      const reviewCase = await queueVenturePublish({ venture, actor:req.user });\n      venture.status = "submitted";\n      await venture.save();\n\n      return res.status(202).json({\n        message:"Venture submitted for AIFT review. It will become discoverable after approval.",\n        venture,\n        reviewCase,\n        reviewStatus:reviewCase.status\n      });','venture publish');

  source=once(source,'      const populated =\n        await VentureInterest\n          .findById(\n            interest._id\n          )\n          .populate(\n            "userId",\n            "name role profileImage headline companyName aiftVerified"\n          );\n\n\n      res\n        .status(201)\n        .json({\n          message:\n            "Interest sent successfully",\n\n          interest:\n            populated\n        });','      const populated =\n        await VentureInterest\n          .findById(\n            interest._id\n          )\n          .populate(\n            "userId",\n            "name role profileImage headline companyName aiftVerified"\n          );\n\n      const reviewCase = await queueVentureInterest({\n        venture,\n        interest,\n        actor:req.user\n      });\n\n      res\n        .status(202)\n        .json({\n          message:"Interest submitted for AIFT review before founder action.",\n          interest:populated,\n          reviewCase,\n          reviewStatus:reviewCase.status\n        });','venture interest');

  return source;
});

patch("routes/scholarshipApplications.js",source=>{
  source=once(source,'const FamilyChild = require("../models/FamilyChild");','const FamilyChild = require("../models/FamilyChild");\nconst { queueScholarshipApplication } = require("../services/aiftReviewWorkflow");','scholarship import');
  source=once(source,'    return res.status(201).json({\n      success:true,\n      application:populated,\n      item:populated\n    });','    let reviewCase = null;\n    if(initialStatus === "submitted"){\n      reviewCase = await queueScholarshipApplication({\n        application,\n        scholarship,\n        actor:req.user\n      });\n    }\n\n    return res.status(initialStatus === "submitted" ? 202 : 201).json({\n      success:true,\n      application:populated,\n      item:populated,\n      reviewCase,\n      reviewStatus:reviewCase?.status || null,\n      message:reviewCase\n        ? "Scholarship application submitted for AIFT review before school processing."\n        : "Scholarship application draft saved."\n    });','scholarship response');
  return source;
});

patch("routes/internshipApplications.js",source=>{
  source=once(source,'const User =\n  require("../models/User");','const User =\n  require("../models/User");\n\nconst { queueInternshipApplication } =\n  require("../services/aiftReviewWorkflow");','internship import');
  const anchor='      res\n        .status(201)\n        .json({';
  const index=source.indexOf(anchor,source.indexOf('POST /api/internship-applications'));
  if(index<0) throw new Error('internship response anchor not found');
  const end=source.indexOf('        });',index);
  if(end<0) throw new Error('internship response end not found');
  const block=source.slice(index,end+'        });'.length);
  const replacement='      const reviewCase = await queueInternshipApplication({\n        application,\n        opportunity,\n        actor:req.user\n      });\n\n      res\n        .status(202)\n        .json({\n          success:true,\n          application:populated,\n          item:populated,\n          reviewCase,\n          reviewStatus:reviewCase.status,\n          message:"Application submitted for AIFT review before receiving-party processing."\n        });';
  source=source.slice(0,index)+replacement+source.slice(end+'        });'.length);
  return source;
});

patch("routes/schoolCompanyPartnerships.js",source=>{
  source=once(source,'const User =\n  require("../models/User");','const User =\n  require("../models/User");\n\nconst { queuePartnership } =\n  require("../services/aiftReviewWorkflow");','partnership import');
  const marker='      res\n        .status(201)';
  const index=source.indexOf(marker,source.indexOf('POST /api/school-company-partnerships'));
  if(index<0) throw new Error('partnership response anchor not found');
  const end=source.indexOf('        });',index);
  if(end<0) throw new Error('partnership response end not found');
  const replacement='      const reviewCase = await queuePartnership({\n        partnership,\n        actor:req.user\n      });\n\n      res\n        .status(202)\n        .json({\n          success:true,\n          partnership:populated,\n          item:populated,\n          reviewCase,\n          reviewStatus:reviewCase.status,\n          message:"Partnership proposal submitted for AIFT review before receiving-party action."\n        });';
  source=source.slice(0,index)+replacement+source.slice(end+'        });'.length);
  return source;
});
