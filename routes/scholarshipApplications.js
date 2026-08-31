const express = require("express");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const ScholarshipApplication = require("../models/ScholarshipApplication");
const SchoolScholarship = require("../models/SchoolScholarship");
const FamilyChild = require("../models/FamilyChild");
const { queueScholarshipApplication } = require("../services/aiftReviewWorkflow");

const router = express.Router();
router.use(auth);

const STUDENT_ROLES = new Set(["student", "talent"]);
const FAMILY_ROLES = new Set(["family"]);
const APPLICATION_STATUSES = new Set([
  "draft",
  "submitted",
  "review",
  "shortlisted",
  "approved",
  "awarded",
  "rejected",
  "withdrawn"
]);
const ACTIVE_SCHOLARSHIP_STATUSES = new Set(["published", "open"]);

function normalizeId(value){
  if(value && typeof value === "object"){
    return String(value._id || value.id || "");
  }
  return String(value || "");
}

function sameId(left,right){
  const a = normalizeId(left);
  const b = normalizeId(right);
  return Boolean(a && b && a === b);
}

function validId(value){
  return mongoose.Types.ObjectId.isValid(normalizeId(value));
}

function safeString(value,max = 15000){
  return String(value ?? "").trim().slice(0,max);
}

function getUserId(req){
  return normalizeId(req.user?._id || req.user?.id);
}

function getRole(req){
  return safeString(req.user?.role,100).toLowerCase();
}

function getStudentSchoolId(req){
  return normalizeId(
    req.user?.schoolId ||
    req.user?.linkedSchoolId ||
    req.user?.school
  );
}

function stringArray(value){
  if(Array.isArray(value)){
    return [...new Set(
      value.map(item => safeString(item,1500)).filter(Boolean)
    )];
  }
  if(typeof value === "string"){
    return [...new Set(
      value.split(",").map(item => item.trim()).filter(Boolean)
    )];
  }
  return [];
}

function numberOrNull(value){
  if(value === "" || value === null || value === undefined){
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDocuments(value){
  if(!Array.isArray(value)) return [];

  return value
    .filter(document => document && document.url)
    .map(document => ({
      name:safeString(document.name,300),
      url:safeString(document.url,2000),
      publicId:safeString(document.publicId,1000),
      mimeType:safeString(document.mimeType,200),
      size:numberOrNull(document.size),
      uploadedAt:document.uploadedAt || new Date()
    }));
}

function scholarshipIsOpen(scholarship){
  if(!ACTIVE_SCHOLARSHIP_STATUSES.has(scholarship.status)){
    return false;
  }

  const now = new Date();

  if(
    scholarship.applicationOpenDate &&
    now < new Date(scholarship.applicationOpenDate)
  ){
    return false;
  }

  if(
    scholarship.deadline &&
    now > new Date(scholarship.deadline)
  ){
    return false;
  }

  return true;
}

function applicantCanAccessScholarship(req,scholarship,studentSchoolId = ""){
  if(!ACTIVE_SCHOLARSHIP_STATUSES.has(scholarship.status)){
    return false;
  }

  if(scholarship.visibility === "public"){
    return true;
  }

  if(scholarship.visibility === "school"){
    const role = getRole(req);
    const schoolId =
      role === "family"
        ? normalizeId(studentSchoolId)
        : getStudentSchoolId(req);

    return sameId(scholarship.schoolId,schoolId);
  }

  return false;
}

function missingRequiredDocuments(scholarship,application){
  const required = Array.isArray(scholarship.requiredDocuments)
    ? scholarship.requiredDocuments
    : [];

  if(!required.length) return [];

  const uploadedNames = new Set(
    (Array.isArray(application.documents) ? application.documents : [])
      .map(document => safeString(document.name,300).toLowerCase())
      .filter(Boolean)
  );

  return required.filter(requirement =>
    !uploadedNames.has(safeString(requirement,300).toLowerCase())
  );
}

function addHistory(application,req,status,note = ""){
  application.statusHistory.push({
    status,
    changedBy:getUserId(req) || null,
    changedByRole:getRole(req),
    note:safeString(note,3000),
    changedAt:new Date()
  });
}

const STATUS_TRANSITIONS = {
  draft:new Set(["submitted","withdrawn"]),
  submitted:new Set(["review","shortlisted","approved","rejected","withdrawn"]),
  review:new Set(["shortlisted","approved","rejected","withdrawn"]),
  shortlisted:new Set(["approved","rejected","withdrawn"]),
  approved:new Set(["awarded","rejected","withdrawn"]),
  awarded:new Set([]),
  rejected:new Set([]),
  withdrawn:new Set([])
};

function canTransition(currentStatus,nextStatus){
  if(currentStatus === nextStatus) return true;
  return Boolean(STATUS_TRANSITIONS[currentStatus]?.has(nextStatus));
}

function canViewApplication(req,application){
  const role = getRole(req);
  const userId = getUserId(req);

  if(role === "admin") return true;

  if(STUDENT_ROLES.has(role)){
    return sameId(application.studentId,userId);
  }

  if(FAMILY_ROLES.has(role)){
    return sameId(application.submittedByFamilyId,userId);
  }

  if(role === "school"){
    return sameId(application.schoolId,userId);
  }

  return false;
}

function canReviewApplication(req,application){
  const role = getRole(req);
  if(role === "admin") return true;

  return (
    role === "school" &&
    sameId(application.schoolId,getUserId(req))
  );
}

function populateApplication(query){
  return query
    .populate(
      "studentId",
      "name fullName email avatar profileImage profilePicture role course program yearLevel schoolId linkedSchoolId"
    )
    .populate(
      "familyChildId",
      "firstName lastName birthDate profileImage location educationLevel grade currentSchool track goal interests linkStatus linkedStudentId"
    )
    .populate(
      "submittedByFamilyId",
      "name fullName email profileImage role"
    )
    .populate(
      "schoolId",
      "name schoolName email schoolLogo profileImage profilePicture location address"
    )
    .populate({
      path:"scholarshipId",
      select:[
        "title",
        "summary",
        "description",
        "type",
        "status",
        "visibility",
        "schoolId",
        "funding",
        "numberOfAwards",
        "awardsGranted",
        "applicationOpenDate",
        "deadline",
        "awardDate",
        "academicYear",
        "semester",
        "requirements",
        "requiredDocuments",
        "allowInternalApplications"
      ].join(" ")
    })
    .populate("reviewedBy","name fullName email role")
    .populate("createdBy","name fullName email role")
    .populate("updatedBy","name fullName email role");
}

async function getOwnedFamilyChild(req,childId){
  if(!validId(childId)) return null;

  const child = await FamilyChild.findOne({
    _id:childId,
    familyId:req.user._id,
    status:{ $ne:"archived" }
  }).populate(
    "linkedStudentId",
    "name email profileImage schoolId linkedSchoolId course yearLevel role status"
  );

  return child;
}

async function resolveApplicant(req){
  const role = getRole(req);
  const userId = getUserId(req);

  if(STUDENT_ROLES.has(role)){
    return {
      role,
      studentId:userId,
      familyChildId:null,
      submittedByFamilyId:null,
      studentSchoolId:getStudentSchoolId(req)
    };
  }

  if(FAMILY_ROLES.has(role)){
    const child = await getOwnedFamilyChild(req,req.body?.childId);

    if(!child){
      const error = new Error("Select a valid child profile before applying.");
      error.statusCode = 400;
      throw error;
    }

    if(
      child.linkStatus !== "linked" ||
      !child.linkedStudentId?._id
    ){
      const error = new Error(
        "This child must be linked to an AIFT Student account before a scholarship application can be submitted."
      );
      error.statusCode = 409;
      throw error;
    }

    if(child.linkedStudentId.status === "deactivated"){
      const error = new Error("The linked AIFT Student account is deactivated.");
      error.statusCode = 409;
      throw error;
    }

    return {
      role,
      studentId:normalizeId(child.linkedStudentId._id),
      familyChildId:normalizeId(child._id),
      submittedByFamilyId:userId,
      studentSchoolId:normalizeId(
        child.linkedStudentId.schoolId ||
        child.linkedStudentId.linkedSchoolId
      )
    };
  }

  const error = new Error("Your account cannot create scholarship applications.");
  error.statusCode = 403;
  throw error;
}

function applyEditableFields(application,body){
  if(body.personalStatement !== undefined){
    application.personalStatement = safeString(body.personalStatement);
  }

  if(body.financialNeedStatement !== undefined){
    application.financialNeedStatement = safeString(
      body.financialNeedStatement,
      10000
    );
  }

  if(body.achievements !== undefined){
    application.achievements = stringArray(body.achievements);
  }

  if(body.documents !== undefined){
    if(!Array.isArray(body.documents)){
      const error = new Error("documents must be an array.");
      error.statusCode = 400;
      throw error;
    }
    application.documents = normalizeDocuments(body.documents);
  }

  if(body.academicSnapshot && typeof body.academicSnapshot === "object"){
    const snapshot = body.academicSnapshot;

    if(snapshot.program !== undefined){
      application.academicSnapshot.program = safeString(snapshot.program,200);
    }
    if(snapshot.yearLevel !== undefined){
      application.academicSnapshot.yearLevel = safeString(snapshot.yearLevel,100);
    }
    if(snapshot.gpa !== undefined){
      application.academicSnapshot.gpa = numberOrNull(snapshot.gpa);
    }
    if(snapshot.gradeAverage !== undefined){
      application.academicSnapshot.gradeAverage = numberOrNull(snapshot.gradeAverage);
    }
  }
}

router.get("/",async (req,res) => {
  try{
    const role = getRole(req);
    const userId = getUserId(req);
    const filter = {};

    if(role === "admin"){
      // Admin may use optional filters below.
    }else if(STUDENT_ROLES.has(role)){
      filter.studentId = userId;
    }else if(FAMILY_ROLES.has(role)){
      filter.submittedByFamilyId = userId;
    }else if(role === "school"){
      filter.schoolId = userId;
    }else{
      return res.status(403).json({
        success:false,
        message:"Your account cannot access scholarship applications."
      });
    }

    if(req.query.scholarshipId){
      if(!validId(req.query.scholarshipId)){
        return res.status(400).json({ success:false,message:"Invalid scholarshipId." });
      }
      filter.scholarshipId = req.query.scholarshipId;
    }

    if(req.query.studentId && role === "admin"){
      if(!validId(req.query.studentId)){
        return res.status(400).json({ success:false,message:"Invalid studentId." });
      }
      filter.studentId = req.query.studentId;
    }

    if(req.query.familyChildId && (role === "admin" || role === "family")){
      if(!validId(req.query.familyChildId)){
        return res.status(400).json({ success:false,message:"Invalid familyChildId." });
      }
      filter.familyChildId = req.query.familyChildId;
    }

    if(req.query.schoolId && role === "admin"){
      if(!validId(req.query.schoolId)){
        return res.status(400).json({ success:false,message:"Invalid schoolId." });
      }
      filter.schoolId = req.query.schoolId;
    }

    if(req.query.status){
      const status = safeString(req.query.status,100).toLowerCase();
      if(!APPLICATION_STATUSES.has(status)){
        return res.status(400).json({ success:false,message:"Invalid application status." });
      }
      filter.status = status;
    }

    const applications = await populateApplication(
      ScholarshipApplication.find(filter)
    )
      .sort({ submittedAt:-1,createdAt:-1 })
      .lean();

    return res.json({
      success:true,
      applications,
      items:applications
    });
  }catch(error){
    console.error("GET SCHOLARSHIP APPLICATIONS ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Unable to load scholarship applications."
    });
  }
});

router.get("/:id",async (req,res) => {
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ success:false,message:"Invalid application id." });
    }

    const application = await populateApplication(
      ScholarshipApplication.findById(req.params.id)
    ).lean();

    if(!application){
      return res.status(404).json({ success:false,message:"Scholarship application not found." });
    }

    if(!canViewApplication(req,application)){
      return res.status(403).json({
        success:false,
        message:"You are not allowed to view this application."
      });
    }

    return res.json({ success:true,application,item:application });
  }catch(error){
    console.error("GET SCHOLARSHIP APPLICATION ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Unable to load the scholarship application."
    });
  }
});

router.post("/",async (req,res) => {
  try{
    const applicant = await resolveApplicant(req);
    const scholarshipId = normalizeId(req.body.scholarshipId);

    if(!validId(scholarshipId)){
      return res.status(400).json({ success:false,message:"A valid scholarship is required." });
    }

    const scholarship = await SchoolScholarship.findById(scholarshipId);

    if(!scholarship){
      return res.status(404).json({ success:false,message:"Scholarship not found." });
    }

    if(!scholarship.allowInternalApplications){
      return res.status(409).json({
        success:false,
        message:"This scholarship does not accept applications through AIFT."
      });
    }

    if(!applicantCanAccessScholarship(req,scholarship,applicant.studentSchoolId)){
      return res.status(403).json({
        success:false,
        message:"The selected student is not eligible to access this scholarship."
      });
    }

    if(!scholarshipIsOpen(scholarship)){
      return res.status(409).json({
        success:false,
        message:"Applications for this scholarship are not currently open."
      });
    }

    const existing = await ScholarshipApplication.findOne({
      scholarshipId,
      studentId:applicant.studentId
    });

    if(existing){
      return res.status(409).json({
        success:false,
        message:"This student already has an application for this scholarship.",
        applicationId:existing._id,
        status:existing.status
      });
    }

    const requestedStatus = safeString(req.body.status || "submitted",100).toLowerCase();
    const initialStatus = requestedStatus === "draft" ? "draft" : "submitted";
    const academicSnapshot =
      req.body.academicSnapshot && typeof req.body.academicSnapshot === "object"
        ? req.body.academicSnapshot
        : {};

    const application = new ScholarshipApplication({
      scholarshipId,
      schoolId:scholarship.schoolId,
      studentId:applicant.studentId,
      familyChildId:applicant.familyChildId,
      submittedByFamilyId:applicant.submittedByFamilyId,
      status:initialStatus,
      personalStatement:safeString(req.body.personalStatement),
      financialNeedStatement:safeString(req.body.financialNeedStatement,10000),
      achievements:stringArray(req.body.achievements),
      documents:normalizeDocuments(req.body.documents),
      academicSnapshot:{
        program:safeString(academicSnapshot.program,200),
        yearLevel:safeString(academicSnapshot.yearLevel,100),
        gpa:numberOrNull(academicSnapshot.gpa),
        gradeAverage:numberOrNull(academicSnapshot.gradeAverage)
      },
      submittedAt:initialStatus === "submitted" ? new Date() : null,
      createdBy:getUserId(req),
      updatedBy:getUserId(req),
      statusHistory:[
        {
          status:initialStatus,
          changedBy:getUserId(req),
          changedByRole:applicant.role,
          note:
            initialStatus === "submitted"
              ? applicant.role === "family"
                ? "Scholarship application submitted by Family account for linked child."
                : "Scholarship application submitted."
              : "Scholarship application draft created.",
          changedAt:new Date()
        }
      ]
    });

    if(initialStatus === "submitted"){
      const missing = missingRequiredDocuments(scholarship,application);
      if(missing.length){
        return res.status(400).json({
          success:false,
          message:"Required scholarship documents are missing.",
          missingDocuments:missing
        });
      }
    }

    await application.save();

    if(initialStatus === "submitted"){
      await SchoolScholarship.updateOne(
        { _id:scholarship._id },
        { $inc:{ applicationCount:1 } }
      );
    }

    const populated = await populateApplication(
      ScholarshipApplication.findById(application._id)
    ).lean();

    let reviewCase = null;
    if(initialStatus === "submitted"){
      reviewCase = await queueScholarshipApplication({
        application,
        scholarship,
        actor:req.user
      });
    }

    return res.status(initialStatus === "submitted" ? 202 : 201).json({
      success:true,
      application:populated,
      item:populated,
      reviewCase,
      reviewStatus:reviewCase?.status || null,
      message:reviewCase
        ? "Scholarship application submitted for AIFT review before school processing."
        : "Scholarship application draft saved."
    });
  }catch(error){
    console.error("CREATE SCHOLARSHIP APPLICATION ERROR:",error);

    if(error?.statusCode){
      return res.status(error.statusCode).json({ success:false,message:error.message });
    }

    if(error?.code === 11000){
      return res.status(409).json({
        success:false,
        message:"This student already has an application for this scholarship."
      });
    }

    if(error?.name === "ValidationError"){
      return res.status(400).json({ success:false,message:error.message });
    }

    return res.status(500).json({
      success:false,
      message:"Unable to create the scholarship application."
    });
  }
});

router.patch("/:id",async (req,res) => {
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ success:false,message:"Invalid application id." });
    }

    const application = await ScholarshipApplication.findById(req.params.id);

    if(!application){
      return res.status(404).json({ success:false,message:"Scholarship application not found." });
    }

    if(!canViewApplication(req,application)){
      return res.status(403).json({
        success:false,
        message:"You are not allowed to update this application."
      });
    }

    const scholarship = await SchoolScholarship.findById(application.scholarshipId);

    if(!scholarship){
      return res.status(404).json({
        success:false,
        message:"The scholarship connected to this application no longer exists."
      });
    }

    const role = getRole(req);
    const userId = getUserId(req);
    const applicantRole = STUDENT_ROLES.has(role) || FAMILY_ROLES.has(role);

    if(applicantRole){
      if(role === "family" && !sameId(application.submittedByFamilyId,userId)){
        return res.status(403).json({ success:false,message:"You cannot edit another family's application." });
      }

      if(STUDENT_ROLES.has(role) && !sameId(application.studentId,userId)){
        return res.status(403).json({ success:false,message:"You cannot edit another student's application." });
      }

      if(application.status === "draft"){
        applyEditableFields(application,req.body);
      }

      if(req.body.status !== undefined){
        const nextStatus = safeString(req.body.status,100).toLowerCase();

        if(!APPLICATION_STATUSES.has(nextStatus)){
          return res.status(400).json({ success:false,message:"Invalid application status." });
        }

        if(!["submitted","withdrawn"].includes(nextStatus)){
          return res.status(403).json({
            success:false,
            message:"Applicants cannot perform this application status change."
          });
        }

        if(!canTransition(application.status,nextStatus)){
          return res.status(409).json({
            success:false,
            message:`Application cannot move from ${application.status} to ${nextStatus}.`
          });
        }

        if(nextStatus === "submitted"){
          if(!scholarshipIsOpen(scholarship)){
            return res.status(409).json({
              success:false,
              message:"Applications for this scholarship are no longer open."
            });
          }

          const missing = missingRequiredDocuments(scholarship,application);
          if(missing.length){
            return res.status(400).json({
              success:false,
              message:"Required scholarship documents are missing.",
              missingDocuments:missing
            });
          }

          application.status = "submitted";
          application.submittedAt = new Date();
          addHistory(
            application,
            req,
            "submitted",
            role === "family"
              ? "Scholarship application submitted by Family account."
              : "Scholarship application submitted."
          );

          await SchoolScholarship.updateOne(
            { _id:scholarship._id },
            { $inc:{ applicationCount:1 } }
          );
        }else{
          application.status = "withdrawn";
          application.withdrawnAt = new Date();
          addHistory(
            application,
            req,
            "withdrawn",
            req.body.statusNote || "Application withdrawn by applicant."
          );
        }
      }
    }else if(role === "school" || role === "admin"){
      if(!canReviewApplication(req,application)){
        return res.status(403).json({
          success:false,
          message:"You are not allowed to review this application."
        });
      }

      if(req.body.reviewerNotes !== undefined){
        application.reviewerNotes = safeString(req.body.reviewerNotes,10000);
      }

      if(req.body.status !== undefined){
        const nextStatus = safeString(req.body.status,100).toLowerCase();
        const schoolStatuses = new Set([
          "review",
          "shortlisted",
          "approved",
          "awarded",
          "rejected"
        ]);

        if(!schoolStatuses.has(nextStatus)){
          return res.status(403).json({
            success:false,
            message:"The school cannot perform this application status change."
          });
        }

        if(!canTransition(application.status,nextStatus)){
          return res.status(409).json({
            success:false,
            message:`Application cannot move from ${application.status} to ${nextStatus}.`
          });
        }

        if(
          nextStatus === "awarded" &&
          scholarship.numberOfAwards !== null &&
          scholarship.numberOfAwards !== undefined &&
          scholarship.awardsGranted >= scholarship.numberOfAwards
        ){
          return res.status(409).json({
            success:false,
            message:"All available scholarship awards have already been granted."
          });
        }

        application.status = nextStatus;
        application.reviewedBy = userId;
        application.reviewedAt = new Date();

        if(nextStatus === "approved") application.approvedAt = new Date();
        if(nextStatus === "rejected") application.rejectedAt = new Date();

        if(nextStatus === "awarded"){
          application.awardedAt = new Date();
          application.awardAmount =
            numberOrNull(req.body.awardAmount) ??
            scholarship.funding?.amount ??
            null;
          application.awardCurrency = safeString(
            req.body.awardCurrency || scholarship.funding?.currency || "PHP",
            10
          ).toUpperCase();
          application.awardNotes = safeString(req.body.awardNotes,5000);

          await SchoolScholarship.updateOne(
            { _id:scholarship._id },
            { $inc:{ awardsGranted:1 } }
          );
        }

        addHistory(
          application,
          req,
          nextStatus,
          req.body.statusNote || req.body.reviewerNotes || ""
        );
      }
    }else{
      return res.status(403).json({
        success:false,
        message:"Your account cannot update scholarship applications."
      });
    }

    application.updatedBy = userId;
    await application.save();

    const populated = await populateApplication(
      ScholarshipApplication.findById(application._id)
    ).lean();

    return res.json({ success:true,application:populated,item:populated });
  }catch(error){
    console.error("UPDATE SCHOLARSHIP APPLICATION ERROR:",error);

    if(error?.statusCode){
      return res.status(error.statusCode).json({ success:false,message:error.message });
    }

    if(error?.name === "ValidationError"){
      return res.status(400).json({ success:false,message:error.message });
    }

    return res.status(500).json({
      success:false,
      message:"Unable to update the scholarship application."
    });
  }
});

router.delete("/:id",async (req,res) => {
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ success:false,message:"Invalid application id." });
    }

    const application = await ScholarshipApplication.findById(req.params.id);

    if(!application){
      return res.status(404).json({ success:false,message:"Scholarship application not found." });
    }

    const role = getRole(req);
    const userId = getUserId(req);

    if(role === "admin"){
      await application.deleteOne();
      return res.json({
        success:true,
        message:"Scholarship application permanently deleted."
      });
    }

    const ownsStudentDraft =
      STUDENT_ROLES.has(role) &&
      sameId(application.studentId,userId);

    const ownsFamilyDraft =
      FAMILY_ROLES.has(role) &&
      sameId(application.submittedByFamilyId,userId);

    if(!ownsStudentDraft && !ownsFamilyDraft){
      return res.status(403).json({
        success:false,
        message:"You are not allowed to delete this application."
      });
    }

    if(application.status !== "draft"){
      return res.status(409).json({
        success:false,
        message:"Submitted scholarship applications cannot be permanently deleted. Withdraw the application instead."
      });
    }

    await application.deleteOne();

    return res.json({
      success:true,
      message:"Scholarship application draft deleted."
    });
  }catch(error){
    console.error("DELETE SCHOLARSHIP APPLICATION ERROR:",error);
    return res.status(500).json({
      success:false,
      message:"Unable to delete the scholarship application."
    });
  }
});

module.exports = router;
