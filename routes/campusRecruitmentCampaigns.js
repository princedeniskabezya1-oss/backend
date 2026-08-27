const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const CampusRecruitmentCampaign =
  require("../models/CampusRecruitmentCampaign");

const SchoolCompanyPartnership =
  require("../models/SchoolCompanyPartnership");

const User =
  require("../models/User");


const router =
  express.Router();


/* =========================================================
   CONSTANTS
========================================================= */

const COMPANY_ROLES =
  new Set([
    "employer",
    "company"
  ]);


const VALID_STATUSES =
  new Set([
    "draft",
    "scheduled",
    "active",
    "paused",
    "completed",
    "cancelled",
    "archived"
  ]);


const VALID_TYPES =
  new Set([
    "campus_hiring",
    "graduate_recruitment",
    "internship_recruitment",
    "school_visit",
    "career_fair",
    "hiring_drive",
    "assessment_drive",
    "interview_day",
    "talent_pipeline"
  ]);


const VALID_MODES =
  new Set([
    "online",
    "onsite",
    "hybrid"
  ]);


const USABLE_PARTNERSHIP_STATUSES =
  new Set([
    "approved",
    "active"
  ]);


/* =========================================================
   AUTH
========================================================= */

router.use(auth);


/* =========================================================
   HELPERS
========================================================= */

function normalizeId(value) {

  if (
    value &&
    typeof value === "object"
  ) {

    return String(
      value._id ||
      value.id ||
      ""
    );

  }


  return String(
    value ||
    ""
  );

}


function sameId(
  left,
  right
) {

  const a =
    normalizeId(left);

  const b =
    normalizeId(right);


  return Boolean(
    a &&
    b &&
    a === b
  );

}


function validObjectId(value) {

  return mongoose.Types.ObjectId.isValid(
    normalizeId(value)
  );

}


function safeString(
  value,
  max = 10000
) {

  return String(
    value ??
    ""
  )
    .trim()
    .slice(
      0,
      max
    );

}


function getUserId(req) {

  return normalizeId(
    req.user?._id ||
    req.user?.id
  );

}


function getRole(req) {

  return safeString(
    req.user?.role,
    100
  ).toLowerCase();

}


function stringArray(
  value,
  max = 180
) {

  let values = [];


  if (
    Array.isArray(value)
  ) {

    values =
      value;

  } else if (
    typeof value === "string"
  ) {

    values =
      value.split(",");

  }


  return [
    ...new Set(
      values
        .map(item =>
          safeString(
            item,
            max
          )
        )
        .filter(Boolean)
    )
  ];

}


function objectIdArray(value) {

  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .map(normalizeId)
        .filter(validObjectId)
    )
  ];

}


function graduationYearArray(value) {

  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .map(item =>
          Number(item)
        )
        .filter(item =>
          Number.isInteger(item) &&
          item >= 1900 &&
          item <= 2200
        )
    )
  ];

}


function nullableNumber(value) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;

}


function nullableDate(value) {

  if (!value) {
    return null;
  }


  const date =
    new Date(value);


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;

}


/* =========================================================
   POPULATION
========================================================= */

function populateCampaign(query) {

  return query

    .populate(
      "schoolId",
      [
        "name",
        "schoolName",
        "email",
        "avatar",
        "profileImage",
        "profilePicture",
        "schoolLogo",
        "location",
        "address"
      ].join(" ")
    )

    .populate(
      "companyId",
      [
        "name",
        "companyName",
        "email",
        "avatar",
        "profileImage",
        "profilePicture",
        "logo",
        "industry",
        "location",
        "address"
      ].join(" ")
    )

    .populate(
      "partnershipId",
      [
        "title",
        "type",
        "partnershipType",
        "status",
        "capabilities",
        "targetPrograms",
        "targetYearLevels",
        "targetSkills"
      ].join(" ")
    )

    .populate(
      "createdBy",
      "name fullName role email"
    )

    .populate(
      "updatedBy",
      "name fullName role email"
    );

}


/* =========================================================
   ACCESS
========================================================= */

function canAccessCampaign(
  req,
  campaign
) {

  const role =
    getRole(req);

  const userId =
    getUserId(req);


  if (
    role === "admin"
  ) {
    return true;
  }


  if (
    role === "school" &&
    sameId(
      campaign.schoolId,
      userId
    )
  ) {
    return true;
  }


  if (
    COMPANY_ROLES.has(role) &&
    sameId(
      campaign.companyId,
      userId
    )
  ) {
    return true;
  }


  return false;

}


function campaignAccessFilter(req) {

  const role =
    getRole(req);

  const userId =
    getUserId(req);


  if (
    role === "admin"
  ) {
    return {};
  }


  if (
    role === "school"
  ) {

    return {
      schoolId:
        userId
    };

  }


  if (
    COMPANY_ROLES.has(role)
  ) {

    return {
      companyId:
        userId
    };

  }


  return {
    _id:null
  };

}


/* =========================================================
   MANAGEMENT PERMISSION

   Employers own their campaigns.

   Schools can view campaigns addressed to them, but they
   cannot rewrite an employer's recruitment campaign.

   Admin may manage all campaigns.
========================================================= */

function canManageCampaign(
  req,
  campaign
) {

  const role =
    getRole(req);

  const userId =
    getUserId(req);


  if (
    role === "admin"
  ) {
    return true;
  }


  return Boolean(
    COMPANY_ROLES.has(role) &&
    sameId(
      campaign.companyId,
      userId
    )
  );

}


/* =========================================================
   PARTNERSHIP VALIDATION
========================================================= */

async function getUsablePartnership({
  partnershipId,
  companyId,
  schoolId
}) {

  if (
    !validObjectId(partnershipId)
  ) {

    return {
      error:
        "A valid partnership is required."
    };

  }


  const partnership =
    await SchoolCompanyPartnership
      .findById(
        partnershipId
      )
      .lean();


  if (!partnership) {

    return {
      error:
        "Partnership not found."
    };

  }


  if (
    !sameId(
      partnership.companyId,
      companyId
    ) ||
    !sameId(
      partnership.schoolId,
      schoolId
    )
  ) {

    return {
      error:
        "The selected partnership does not belong to this company and school."
    };

  }


  if (
    !USABLE_PARTNERSHIP_STATUSES.has(
      safeString(
        partnership.status,
        100
      ).toLowerCase()
    )
  ) {

    return {
      error:
        "This partnership must be approved or active before it can be used for campus recruitment."
    };

  }


  if (
    partnership.capabilities?.recruitment !==
    true
  ) {

    return {
      error:
        "Recruitment is not enabled for this school partnership."
    };

  }


  return {
    partnership
  };

}


/* =========================================================
   STATUS TRANSITIONS
========================================================= */

const STATUS_TRANSITIONS = {

  draft:
    new Set([
      "scheduled",
      "active",
      "cancelled"
    ]),

  scheduled:
    new Set([
      "active",
      "cancelled"
    ]),

  active:
    new Set([
      "paused",
      "completed",
      "cancelled"
    ]),

  paused:
    new Set([
      "active",
      "completed",
      "cancelled"
    ]),

  completed:
    new Set([
      "archived"
    ]),

  cancelled:
    new Set([
      "archived"
    ]),

  archived:
    new Set([])

};


function canTransition(
  current,
  next
) {

  if (
    current === next
  ) {
    return true;
  }


  return Boolean(
    STATUS_TRANSITIONS[
      current
    ]?.has(next)
  );

}


/* =========================================================
   HISTORY
========================================================= */

function addHistory(
  campaign,
  req,
  status,
  note = ""
) {

  campaign.statusHistory.push({
    status,

    changedBy:
      getUserId(req) ||
      null,

    changedByRole:
      getRole(req),

    note:
      safeString(
        note,
        3000
      ),

    changedAt:
      new Date()
  });

}


/* =========================================================
   STATUS TIMESTAMPS
========================================================= */

function applyStatusTimestamp(
  campaign,
  status
) {

  const now =
    new Date();


  switch (status) {

    case "scheduled":

      campaign.scheduledAt =
        campaign.scheduledAt ||
        now;

      break;


    case "active":

      campaign.activatedAt =
        campaign.activatedAt ||
        now;

      campaign.pausedAt =
        null;

      break;


    case "paused":

      campaign.pausedAt =
        now;

      break;


    case "completed":

      campaign.completedAt =
        campaign.completedAt ||
        now;

      break;


    case "cancelled":

      campaign.cancelledAt =
        campaign.cancelledAt ||
        now;

      break;


    case "archived":

      campaign.archivedAt =
        campaign.archivedAt ||
        now;

      break;

  }

}


/* =========================================================
   GET /api/campus-recruitment-campaigns
========================================================= */

router.get(
  "/",
  async (
    req,
    res
  ) => {

    try {

      const {
        schoolId,
        companyId,
        partnershipId,
        status,
        campaignType
      } =
        req.query;


      const requested = {};


      if (schoolId) {

        if (
          !validObjectId(
            schoolId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "schoolId is invalid."
            });

        }


        requested.schoolId =
          schoolId;

      }


      if (companyId) {

        if (
          !validObjectId(
            companyId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "companyId is invalid."
            });

        }


        requested.companyId =
          companyId;

      }


      if (partnershipId) {

        if (
          !validObjectId(
            partnershipId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "partnershipId is invalid."
            });

        }


        requested.partnershipId =
          partnershipId;

      }


      if (status) {

        const normalized =
          safeString(
            status,
            100
          ).toLowerCase();


        if (
          !VALID_STATUSES.has(
            normalized
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid campaign status."
            });

        }


        requested.status =
          normalized;

      }


      if (campaignType) {

        const normalized =
          safeString(
            campaignType,
            100
          ).toLowerCase();


        if (
          !VALID_TYPES.has(
            normalized
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid campaign type."
            });

        }


        requested.campaignType =
          normalized;

      }


      const filter = {
        $and:[
          campaignAccessFilter(req),
          requested
        ]
      };


      const campaigns =
        await populateCampaign(
          CampusRecruitmentCampaign
            .find(filter)
        )
          .sort({
            lastActivityAt:-1,
            createdAt:-1
          })
          .lean();


      res.json({
        success:true,
        campaigns,
        items:campaigns
      });


    } catch (error) {

      console.error(
        "GET CAMPUS RECRUITMENT CAMPAIGNS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load campus recruitment campaigns."
        });

    }

  }
);


/* =========================================================
   GET /api/campus-recruitment-campaigns/:id
========================================================= */

router.get(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !validObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid campaign id."
          });

      }


      const campaign =
        await populateCampaign(
          CampusRecruitmentCampaign
            .findById(
              req.params.id
            )
        )
          .lean();


      if (!campaign) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Campus recruitment campaign not found."
          });

      }


      if (
        !canAccessCampaign(
          req,
          campaign
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to view this campaign."
          });

      }


      res.json({
        success:true,
        campaign,
        item:campaign
      });


    } catch (error) {

      console.error(
        "GET CAMPUS RECRUITMENT CAMPAIGN ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the campus recruitment campaign."
        });

    }

  }
);


/* =========================================================
   POST /api/campus-recruitment-campaigns

   Employer/company creates a campaign.

   companyId is NEVER trusted from the browser for employer
   accounts. It comes from the authenticated account.
========================================================= */

router.post(
  "/",
  async (
    req,
    res
  ) => {

    try {

      const role =
        getRole(req);

      const userId =
        getUserId(req);


      if (
        !COMPANY_ROLES.has(role) &&
        role !== "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Only companies can create campus recruitment campaigns."
          });

      }


      let companyId = null;


      if (
        COMPANY_ROLES.has(role)
      ) {

        companyId =
          userId;

      } else {

        companyId =
          normalizeId(
            req.body.companyId
          );

      }


      const schoolId =
        normalizeId(
          req.body.schoolId
        );


      const partnershipId =
        normalizeId(
          req.body.partnershipId
        );


      if (
        !validObjectId(companyId) ||
        !validObjectId(schoolId)
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid company and school are required."
          });

      }


      const title =
        safeString(
          req.body.title,
          300
        );


      if (!title) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Campaign title is required."
          });

      }


      const partnershipResult =
        await getUsablePartnership({
          partnershipId,
          companyId,
          schoolId
        });


      if (
        partnershipResult.error
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              partnershipResult.error
          });

      }


      const partnership =
        partnershipResult.partnership;


      const [
        school,
        company
      ] =
        await Promise.all([

          User
            .findById(
              schoolId
            )
            .select(
              "_id role name schoolName"
            )
            .lean(),

          User
            .findById(
              companyId
            )
            .select(
              "_id role name companyName"
            )
            .lean()

        ]);


      if (!school) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "School account not found."
          });

      }


      if (!company) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Company account not found."
          });

      }


      if (
        safeString(
          school.role,
          100
        ).toLowerCase() !==
          "school"
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "The selected account is not a school."
          });

      }


      if (
        !COMPANY_ROLES.has(
          safeString(
            company.role,
            100
          ).toLowerCase()
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "The campaign owner is not a company account."
          });

      }


      const campaignType =
        safeString(
          req.body.campaignType ||
          "campus_hiring",
          100
        ).toLowerCase();


      if (
        !VALID_TYPES.has(
          campaignType
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid campaign type."
          });

      }


      const mode =
        safeString(
          req.body.mode ||
          "hybrid",
          100
        ).toLowerCase();


      if (
        !VALID_MODES.has(mode)
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid campaign mode."
          });

      }


      const requestedStatus =
        safeString(
          req.body.status ||
          "draft",
          100
        ).toLowerCase();


      const initialStatus =
        [
          "draft",
          "scheduled",
          "active"
        ].includes(
          requestedStatus
        )
          ? requestedStatus
          : "draft";


      const campaign =
        await CampusRecruitmentCampaign
          .create({
            companyId,

            schoolId,

            partnershipId,

            companyName:
              safeString(
                company.companyName ||
                company.name,
                250
              ),

            schoolName:
              safeString(
                school.schoolName ||
                school.name,
                250
              ),

            title,

            description:
              safeString(
                req.body.description,
                15000
              ),

            objective:
              safeString(
                req.body.objective,
                10000
              ),

            campaignType,

            mode,

            status:
              initialStatus,

            opportunityIds:
              objectIdArray(
                req.body.opportunityIds
              ),

            targetPrograms:
              req.body.targetPrograms !==
              undefined
                ? stringArray(
                    req.body.targetPrograms,
                    180
                  )
                : stringArray(
                    partnership.targetPrograms,
                    180
                  ),

            targetYearLevels:
              req.body.targetYearLevels !==
              undefined
                ? stringArray(
                    req.body.targetYearLevels,
                    100
                  )
                : stringArray(
                    partnership.targetYearLevels,
                    100
                  ),

            targetSkills:
              req.body.targetSkills !==
              undefined
                ? stringArray(
                    req.body.targetSkills,
                    180
                  )
                : stringArray(
                    partnership.targetSkills,
                    180
                  ),

            targetGraduationYears:
              graduationYearArray(
                req.body.targetGraduationYears
              ),

            expectedStudents:
              nullableNumber(
                req.body.expectedStudents
              ),

            targetHires:
              nullableNumber(
                req.body.targetHires
              ),

            startDate:
              nullableDate(
                req.body.startDate
              ),

            endDate:
              nullableDate(
                req.body.endDate
              ),

            applicationDeadline:
              nullableDate(
                req.body.applicationDeadline
              ),

            location:{
              venue:
                safeString(
                  req.body.location?.venue,
                  300
                ),

              address:
                safeString(
                  req.body.location?.address,
                  1000
                ),

              meetingUrl:
                safeString(
                  req.body.location?.meetingUrl,
                  2000
                )
            },

            allowStudentApplications:
              req.body.allowStudentApplications !==
              false,

            inviteEligibleStudents:
              req.body.inviteEligibleStudents ===
              true,

            visibleToStudents:
              req.body.visibleToStudents !==
              false,

            requireSchoolApproval:
              req.body.requireSchoolApproval ===
              true,

            createdBy:
              userId,

            updatedBy:
              userId,

            lastActivityAt:
              new Date(),

            statusHistory:[
              {
                status:
                  initialStatus,

                changedBy:
                  userId,

                changedByRole:
                  role,

                note:
                  "Campus recruitment campaign created.",

                changedAt:
                  new Date()
              }
            ]
          });


      applyStatusTimestamp(
        campaign,
        initialStatus
      );


      await campaign.save();


      const populated =
        await populateCampaign(
          CampusRecruitmentCampaign
            .findById(
              campaign._id
            )
        )
          .lean();


      res
        .status(201)
        .json({
          success:true,
          campaign:
            populated,
          item:
            populated
        });


    } catch (error) {

      console.error(
        "CREATE CAMPUS RECRUITMENT CAMPAIGN ERROR:",
        error
      );


      if (
        error?.name ===
        "ValidationError"
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              error.message
          });

      }


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to create the campus recruitment campaign."
        });

    }

  }
);


/* =========================================================
   PATCH /api/campus-recruitment-campaigns/:id
========================================================= */

router.patch(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !validObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid campaign id."
          });

      }


      const campaign =
        await CampusRecruitmentCampaign
          .findById(
            req.params.id
          );


      if (!campaign) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Campus recruitment campaign not found."
          });

      }


      if (
        !canManageCampaign(
          req,
          campaign
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to manage this campaign."
          });

      }


      /* =====================================================
         RELATIONSHIP FIELDS ARE IMMUTABLE

         A campaign cannot be moved to another company,
         school or partnership after creation.
      ===================================================== */


      /* =====================================================
         STATUS
      ===================================================== */

      if (
        req.body.status !==
        undefined
      ) {

        const nextStatus =
          safeString(
            req.body.status,
            100
          ).toLowerCase();


        if (
          !VALID_STATUSES.has(
            nextStatus
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid campaign status."
            });

        }


        if (
          !canTransition(
            campaign.status,
            nextStatus
          )
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                `Campaign cannot move from ${campaign.status} to ${nextStatus}.`
            });

        }


        if (
          nextStatus !==
          campaign.status
        ) {

          /*
            Before launching/scheduling, re-check the
            partnership. A partnership may have changed after
            this campaign was originally drafted.
          */

          if (
            nextStatus === "scheduled" ||
            nextStatus === "active"
          ) {

            const partnershipResult =
              await getUsablePartnership({
                partnershipId:
                  campaign.partnershipId,

                companyId:
                  campaign.companyId,

                schoolId:
                  campaign.schoolId
              });


            if (
              partnershipResult.error
            ) {

              return res
                .status(403)
                .json({
                  success:false,
                  message:
                    partnershipResult.error
                });

            }

          }


          campaign.status =
            nextStatus;


          applyStatusTimestamp(
            campaign,
            nextStatus
          );


          addHistory(
            campaign,
            req,
            nextStatus,
            req.body.statusNote ||
            ""
          );

        }

      }


      /* =====================================================
         STRINGS
      ===================================================== */

      const stringFields = [
        ["title", 300],
        ["description", 15000],
        ["objective", 10000]
      ];


      stringFields.forEach(
        (
          [
            field,
            max
          ]
        ) => {

          if (
            req.body[field] !==
            undefined
          ) {

            campaign[field] =
              safeString(
                req.body[field],
                max
              );

          }

        }
      );


      if (
        !safeString(
          campaign.title,
          300
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Campaign title is required."
          });

      }


      /* =====================================================
         TYPE / MODE
      ===================================================== */

      if (
        req.body.campaignType !==
        undefined
      ) {

        const campaignType =
          safeString(
            req.body.campaignType,
            100
          ).toLowerCase();


        if (
          !VALID_TYPES.has(
            campaignType
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid campaign type."
            });

        }


        campaign.campaignType =
          campaignType;

      }


      if (
        req.body.mode !==
        undefined
      ) {

        const mode =
          safeString(
            req.body.mode,
            100
          ).toLowerCase();


        if (
          !VALID_MODES.has(
            mode
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid campaign mode."
            });

        }


        campaign.mode =
          mode;

      }


      /* =====================================================
         OPPORTUNITIES
      ===================================================== */

      if (
        req.body.opportunityIds !==
        undefined
      ) {

        campaign.opportunityIds =
          objectIdArray(
            req.body.opportunityIds
          );

      }


      /* =====================================================
         TARGETING
      ===================================================== */

      if (
        req.body.targetPrograms !==
        undefined
      ) {

        campaign.targetPrograms =
          stringArray(
            req.body.targetPrograms,
            180
          );

      }


      if (
        req.body.targetYearLevels !==
        undefined
      ) {

        campaign.targetYearLevels =
          stringArray(
            req.body.targetYearLevels,
            100
          );

      }


      if (
        req.body.targetSkills !==
        undefined
      ) {

        campaign.targetSkills =
          stringArray(
            req.body.targetSkills,
            180
          );

      }


      if (
        req.body.targetGraduationYears !==
        undefined
      ) {

        campaign.targetGraduationYears =
          graduationYearArray(
            req.body.targetGraduationYears
          );

      }


      /* =====================================================
         NUMBERS
      ===================================================== */

      if (
        req.body.expectedStudents !==
        undefined
      ) {

        campaign.expectedStudents =
          nullableNumber(
            req.body.expectedStudents
          );

      }


      if (
        req.body.targetHires !==
        undefined
      ) {

        campaign.targetHires =
          nullableNumber(
            req.body.targetHires
          );

      }


      /* =====================================================
         DATES
      ===================================================== */

      if (
        req.body.startDate !==
        undefined
      ) {

        campaign.startDate =
          nullableDate(
            req.body.startDate
          );

      }


      if (
        req.body.endDate !==
        undefined
      ) {

        campaign.endDate =
          nullableDate(
            req.body.endDate
          );

      }


      if (
        req.body.applicationDeadline !==
        undefined
      ) {

        campaign.applicationDeadline =
          nullableDate(
            req.body.applicationDeadline
          );

      }


      /* =====================================================
         LOCATION
      ===================================================== */

      if (
        req.body.location &&
        typeof req.body.location ===
          "object"
      ) {

        if (
          req.body.location.venue !==
          undefined
        ) {

          campaign.location.venue =
            safeString(
              req.body.location.venue,
              300
            );

        }


        if (
          req.body.location.address !==
          undefined
        ) {

          campaign.location.address =
            safeString(
              req.body.location.address,
              1000
            );

        }


        if (
          req.body.location.meetingUrl !==
          undefined
        ) {

          campaign.location.meetingUrl =
            safeString(
              req.body.location.meetingUrl,
              2000
            );

        }

      }


      /* =====================================================
         SETTINGS
      ===================================================== */

      [
        "allowStudentApplications",
        "inviteEligibleStudents",
        "visibleToStudents",
        "requireSchoolApproval"
      ].forEach(
        field => {

          if (
            req.body[field] !==
            undefined
          ) {

            campaign[field] =
              req.body[field] ===
              true ||
              req.body[field] ===
              "true";

          }

        }
      );


      campaign.updatedBy =
        getUserId(req);

      campaign.lastActivityAt =
        new Date();


      await campaign.save();


      const populated =
        await populateCampaign(
          CampusRecruitmentCampaign
            .findById(
              campaign._id
            )
        )
          .lean();


      res.json({
        success:true,
        campaign:
          populated,
        item:
          populated
      });


    } catch (error) {

      console.error(
        "UPDATE CAMPUS RECRUITMENT CAMPAIGN ERROR:",
        error
      );


      if (
        error?.name ===
        "ValidationError"
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              error.message
          });

      }


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to update the campus recruitment campaign."
        });

    }

  }
);


/* =========================================================
   DELETE /api/campus-recruitment-campaigns/:id

   Campaign history is valuable for hiring analytics.

   Employers should cancel/archive instead of permanently
   deleting campaigns. Only admin can hard-delete.
========================================================= */

router.delete(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        getRole(req) !==
        "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Campus recruitment campaigns cannot be permanently deleted. Cancel or archive the campaign instead."
          });

      }


      if (
        !validObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid campaign id."
          });

      }


      const campaign =
        await CampusRecruitmentCampaign
          .findByIdAndDelete(
            req.params.id
          );


      if (!campaign) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Campus recruitment campaign not found."
          });

      }


      res.json({
        success:true,
        message:
          "Campus recruitment campaign permanently deleted."
      });


    } catch (error) {

      console.error(
        "DELETE CAMPUS RECRUITMENT CAMPAIGN ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the campus recruitment campaign."
        });

    }

  }
);


module.exports =
  router;
