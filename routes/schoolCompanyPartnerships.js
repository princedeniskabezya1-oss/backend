const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const SchoolCompanyPartnership =
  require("../models/SchoolCompanyPartnership");

const User =
  require("../models/User");


const router =
  express.Router();


/* =========================================================
   CONSTANTS
========================================================= */

const SCHOOL_ROLES =
  new Set([
    "school"
  ]);


const COMPANY_ROLES =
  new Set([
    "employer",
    "company"
  ]);


const VALID_TYPES =
  new Set([
    "internship_partnership",
    "job_placement",
    "recruitment",
    "training",
    "collaboration",
    "career_event",
    "scholarship",
    "research",
    "mentorship",
    "industry_linkage"
  ]);


const VALID_STATUSES =
  new Set([
    "draft",
    "pending",
    "review",
    "approved",
    "active",
    "paused",
    "completed",
    "rejected",
    "cancelled",
    "expired",
    "archived"
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
  )
    .toLowerCase();

}


function stringArray(value) {

  if (
    Array.isArray(value)
  ) {

    return [
      ...new Set(
        value
          .map(item =>
            safeString(
              item,
              1500
            )
          )
          .filter(Boolean)
      )
    ];

  }


  if (
    typeof value === "string"
  ) {

    return [
      ...new Set(
        value
          .split(",")
          .map(item =>
            item.trim()
          )
          .filter(Boolean)
      )
    ];

  }


  return [];

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

function populatePartnership(query) {

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

function canAccess(
  req,
  partnership
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
      partnership.schoolId,
      userId
    )
  ) {
    return true;
  }


  if (
    COMPANY_ROLES.has(role) &&
    sameId(
      partnership.companyId,
      userId
    )
  ) {
    return true;
  }


  return false;

}


/* =========================================================
   LIST ACCESS FILTER
========================================================= */

function accessFilter(req) {

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
   STATUS TRANSITIONS
========================================================= */

const STATUS_TRANSITIONS = {

  draft:
    new Set([
      "pending",
      "cancelled"
    ]),

  pending:
    new Set([
      "review",
      "approved",
      "rejected",
      "cancelled"
    ]),

  review:
    new Set([
      "approved",
      "rejected",
      "cancelled"
    ]),

  approved:
    new Set([
      "active",
      "cancelled"
    ]),

  active:
    new Set([
      "paused",
      "completed",
      "cancelled",
      "expired"
    ]),

  paused:
    new Set([
      "active",
      "completed",
      "cancelled",
      "expired"
    ]),

  completed:
    new Set([
      "archived"
    ]),

  rejected:
    new Set([
      "archived"
    ]),

  cancelled:
    new Set([
      "archived"
    ]),

  expired:
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
   ROLE-BASED STATUS PERMISSION

   The recipient controls approval/rejection.

   The requester cannot simply approve their own proposal.
========================================================= */

function canSetStatus(
  req,
  partnership,
  nextStatus
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


  const requester =
    partnership.requestedBy;


  const schoolIsRequester =
    requester === "school";


  const companyIsRequester =
    requester === "company" ||
    requester === "employer";


  /*
    Requester may cancel their proposal.
  */

  if (
    nextStatus === "cancelled"
  ) {

    if (
      schoolIsRequester &&
      role === "school" &&
      sameId(
        partnership.schoolId,
        userId
      )
    ) {
      return true;
    }


    if (
      companyIsRequester &&
      COMPANY_ROLES.has(role) &&
      sameId(
        partnership.companyId,
        userId
      )
    ) {
      return true;
    }

  }


  /*
    Recipient may review / approve / reject.
  */

  if (
    [
      "review",
      "approved",
      "rejected"
    ].includes(nextStatus)
  ) {

    if (
      schoolIsRequester &&
      COMPANY_ROLES.has(role) &&
      sameId(
        partnership.companyId,
        userId
      )
    ) {
      return true;
    }


    if (
      companyIsRequester &&
      role === "school" &&
      sameId(
        partnership.schoolId,
        userId
      )
    ) {
      return true;
    }

  }


  /*
    Once approved, either party can manage the operational
    lifecycle.
  */

  if (
    [
      "active",
      "paused",
      "completed",
      "expired",
      "archived"
    ].includes(nextStatus)
  ) {

    return canAccess(
      req,
      partnership
    );

  }


  return false;

}


/* =========================================================
   STATUS HISTORY
========================================================= */

function addHistory(
  partnership,
  req,
  status,
  note = ""
) {

  partnership.statusHistory.push({
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
  partnership,
  status
) {

  const now =
    new Date();


  switch (status) {

    case "approved":

      partnership.approvedAt =
        partnership.approvedAt ||
        now;

      break;


    case "active":

      partnership.activatedAt =
        partnership.activatedAt ||
        now;

      partnership.startDate =
        partnership.startDate ||
        partnership.proposedStartDate ||
        now;

      break;


    case "completed":

      partnership.completedAt =
        partnership.completedAt ||
        now;

      break;


    case "rejected":

      partnership.rejectedAt =
        partnership.rejectedAt ||
        now;

      break;


    case "cancelled":

      partnership.cancelledAt =
        partnership.cancelledAt ||
        now;

      break;


    case "archived":

      partnership.archivedAt =
        partnership.archivedAt ||
        now;

      break;

  }

}


/* =========================================================
   GET /api/school-company-partnerships
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
        status,
        type
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
                "Invalid partnership status."
            });

        }


        requested.status =
          normalized;

      }


      if (type) {

        const normalized =
          safeString(
            type,
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
                "Invalid partnership type."
            });

        }


        requested.type =
          normalized;

      }


      const filter = {
        $and:[
          accessFilter(req),
          requested
        ]
      };


      const partnerships =
        await populatePartnership(
          SchoolCompanyPartnership
            .find(filter)
        )
          .sort({
            lastActivityAt:-1,
            createdAt:-1
          })
          .lean();


      res.json({
        success:true,
        partnerships,
        items:partnerships
      });


    } catch (error) {

      console.error(
        "GET SCHOOL COMPANY PARTNERSHIPS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load partnerships."
        });

    }

  }
);


/* =========================================================
   GET /api/school-company-partnerships/:id
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
              "Invalid partnership id."
          });

      }


      const partnership =
        await populatePartnership(
          SchoolCompanyPartnership
            .findById(
              req.params.id
            )
        )
          .lean();


      if (!partnership) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Partnership not found."
          });

      }


      if (
        !canAccess(
          req,
          partnership
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to view this partnership."
          });

      }


      res.json({
        success:true,
        partnership,
        item:partnership
      });


    } catch (error) {

      console.error(
        "GET PARTNERSHIP ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the partnership."
        });

    }

  }
);


/* =========================================================
   POST /api/school-company-partnerships

   School -> company proposal
   Company -> school proposal

   Identity is derived from authenticated account.
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
        role !== "school" &&
        !COMPANY_ROLES.has(role) &&
        role !== "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot create partnership proposals."
          });

      }


      let schoolId = null;
      let companyId = null;
      let requestedBy = null;


      /* =====================================================
         SCHOOL REQUEST
      ===================================================== */

      if (
        role === "school"
      ) {

        schoolId =
          userId;

        companyId =
          normalizeId(
            req.body.companyId
          );

        requestedBy =
          "school";

      }


      /* =====================================================
         COMPANY REQUEST
      ===================================================== */

      else if (
        COMPANY_ROLES.has(role)
      ) {

        companyId =
          userId;

        schoolId =
          normalizeId(
            req.body.schoolId
          );

        requestedBy =
          "company";

      }


      /* =====================================================
         ADMIN
      ===================================================== */

      else {

        schoolId =
          normalizeId(
            req.body.schoolId
          );

        companyId =
          normalizeId(
            req.body.companyId
          );

        requestedBy =
          safeString(
            req.body.requestedBy ||
            "admin",
            100
          ).toLowerCase();

      }


      if (
        !validObjectId(
          schoolId
        ) ||
        !validObjectId(
          companyId
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid school and company are required."
          });

      }


      if (
        sameId(
          schoolId,
          companyId
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "School and company must be different accounts."
          });

      }


      /*
        Verify both parties actually exist and have the
        expected account roles.
      */

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
              "_id role name schoolName email"
            )
            .lean(),

          User
            .findById(
              companyId
            )
            .select(
              "_id role name companyName email"
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
              "The selected account is not a company."
          });

      }


      const type =
        safeString(
          req.body.type ||
          req.body.partnershipType ||
          "internship_partnership",
          100
        ).toLowerCase();


      if (
        !VALID_TYPES.has(type)
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid partnership type."
          });

      }


      const existing =
        await SchoolCompanyPartnership
          .findOne({
            schoolId,
            companyId,
            type,
            status:{
              $in:[
                "draft",
                "pending",
                "review",
                "approved",
                "active",
                "paused"
              ]
            }
          })
          .lean();


      if (existing) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "An active partnership process already exists between this school and company for this partnership type.",
            partnershipId:
              existing._id,
            status:
              existing.status
          });

      }


      const capabilities =
        req.body.capabilities &&
        typeof req.body.capabilities ===
          "object"
          ? req.body.capabilities
          : {};


      const partnership =
        await SchoolCompanyPartnership
          .create({
            schoolId,

            companyId,

            schoolName:
              safeString(
                school.schoolName ||
                school.name,
                250
              ),

            companyName:
              safeString(
                company.companyName ||
                company.name,
                250
              ),

            title:
              safeString(
                req.body.title,
                300
              ),

            type,

            partnershipType:
              type,

            status:
              role === "admin" &&
              req.body.status === "draft"
                ? "draft"
                : "pending",

            requestedBy,

            message:
              safeString(
                req.body.message
              ),

            objective:
              safeString(
                req.body.objective
              ),

            description:
              safeString(
                req.body.description,
                15000
              ),

            benefits:
              stringArray(
                req.body.benefits
              ),

            activities:
              stringArray(
                req.body.activities
              ),

            capabilities:{
              internships:
                capabilities.internships ===
                true,

              jobs:
                capabilities.jobs ===
                true,

              recruitment:
                capabilities.recruitment ===
                true,

              training:
                capabilities.training ===
                true,

              careerEvents:
                capabilities.careerEvents ===
                true,

              scholarships:
                capabilities.scholarships ===
                true,

              mentorship:
                capabilities.mentorship ===
                true,

              research:
                capabilities.research ===
                true
            },

            targetPrograms:
              stringArray(
                req.body.targetPrograms
              ),

            targetYearLevels:
              stringArray(
                req.body.targetYearLevels
              ),

            targetSkills:
              stringArray(
                req.body.targetSkills
              ),

            internshipSlots:
              nullableNumber(
                req.body.internshipSlots
              ),

            jobSlots:
              nullableNumber(
                req.body.jobSlots
              ),

            expectedStudents:
              nullableNumber(
                req.body.expectedStudents
              ),

            proposedStartDate:
              nullableDate(
                req.body.proposedStartDate
              ),

            proposedEndDate:
              nullableDate(
                req.body.proposedEndDate
              ),

            createdBy:
              userId,

            updatedBy:
              userId,

            lastActivityAt:
              new Date(),

            statusHistory:[
              {
                status:
                  role === "admin" &&
                  req.body.status === "draft"
                    ? "draft"
                    : "pending",

                changedBy:
                  userId,

                changedByRole:
                  role,

                note:
                  "Partnership proposal created.",

                changedAt:
                  new Date()
              }
            ]
          });


      const populated =
        await populatePartnership(
          SchoolCompanyPartnership
            .findById(
              partnership._id
            )
        )
          .lean();


      res
        .status(201)
        .json({
          success:true,
          partnership:
            populated,
          item:
            populated
        });


    } catch (error) {

      console.error(
        "CREATE SCHOOL COMPANY PARTNERSHIP ERROR:",
        error
      );


      if (
        error?.code === 11000
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "A live partnership already exists for this school, company and partnership type."
          });

      }


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
            "Unable to create the partnership proposal."
        });

    }

  }
);


/* =========================================================
   PATCH /api/school-company-partnerships/:id
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
              "Invalid partnership id."
          });

      }


      const partnership =
        await SchoolCompanyPartnership
          .findById(
            req.params.id
          );


      if (!partnership) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Partnership not found."
          });

      }


      if (
        !canAccess(
          req,
          partnership
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to update this partnership."
          });

      }


      const role =
        getRole(req);

      const userId =
        getUserId(req);


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
                "Invalid partnership status."
            });

        }


        if (
          !canTransition(
            partnership.status,
            nextStatus
          )
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                `Partnership cannot move from ${partnership.status} to ${nextStatus}.`
            });

        }


        if (
          nextStatus !==
            partnership.status
        ) {

          if (
            !canSetStatus(
              req,
              partnership,
              nextStatus
            )
          ) {

            return res
              .status(403)
              .json({
                success:false,
                message:
                  "Your account cannot perform this partnership status change."
              });

          }


          partnership.status =
            nextStatus;


          if (
            nextStatus ===
              "rejected"
          ) {

            partnership.rejectionReason =
              safeString(
                req.body.rejectionReason ||
                req.body.statusNote,
                5000
              );

          }


          applyStatusTimestamp(
            partnership,
            nextStatus
          );


          addHistory(
            partnership,
            req,
            nextStatus,
            req.body.statusNote ||
            req.body.rejectionReason ||
            ""
          );

        }

      }


      /* =====================================================
         SHARED EDITABLE DETAILS

         Once a relationship exists, both authorized parties
         can maintain operational information.
      ===================================================== */

      const sharedStrings = [
        ["title", 300],
        ["objective", 10000],
        ["description", 15000]
      ];


      sharedStrings.forEach(
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

            partnership[field] =
              safeString(
                req.body[field],
                max
              );

          }

        }
      );


      [
        "benefits",
        "activities",
        "targetPrograms",
        "targetYearLevels",
        "targetSkills"
      ].forEach(
        field => {

          if (
            req.body[field] !==
              undefined
          ) {

            partnership[field] =
              stringArray(
                req.body[field]
              );

          }

        }
      );


      [
        "internshipSlots",
        "jobSlots",
        "expectedStudents"
      ].forEach(
        field => {

          if (
            req.body[field] !==
              undefined
          ) {

            partnership[field] =
              nullableNumber(
                req.body[field]
              );

          }

        }
      );


      [
        "proposedStartDate",
        "proposedEndDate",
        "startDate",
        "endDate"
      ].forEach(
        field => {

          if (
            req.body[field] !==
              undefined
          ) {

            partnership[field] =
              nullableDate(
                req.body[field]
              );

          }

        }
      );


      /* =====================================================
         CAPABILITIES
      ===================================================== */

      if (
        req.body.capabilities &&
        typeof req.body.capabilities ===
          "object"
      ) {

        const allowedCapabilities = [
          "internships",
          "jobs",
          "recruitment",
          "training",
          "careerEvents",
          "scholarships",
          "mentorship",
          "research"
        ];


        allowedCapabilities.forEach(
          field => {

            if (
              req.body.capabilities[field] !==
                undefined
            ) {

              partnership.capabilities[field] =
                req.body.capabilities[field] ===
                true ||
                req.body.capabilities[field] ===
                "true";

            }

          }
        );

      }


      /* =====================================================
         PRIVATE PARTY NOTES
      ===================================================== */

      if (
        role === "school" &&
        req.body.schoolNotes !==
          undefined
      ) {

        partnership.schoolNotes =
          safeString(
            req.body.schoolNotes
          );

      }


      if (
        COMPANY_ROLES.has(role) &&
        req.body.companyNotes !==
          undefined
      ) {

        partnership.companyNotes =
          safeString(
            req.body.companyNotes
          );

      }


      if (
        role === "admin"
      ) {

        if (
          req.body.schoolNotes !==
            undefined
        ) {

          partnership.schoolNotes =
            safeString(
              req.body.schoolNotes
            );

        }


        if (
          req.body.companyNotes !==
            undefined
        ) {

          partnership.companyNotes =
            safeString(
              req.body.companyNotes
            );

        }

      }


      partnership.updatedBy =
        userId;

      partnership.lastActivityAt =
        new Date();


      await partnership.save();


      const populated =
        await populatePartnership(
          SchoolCompanyPartnership
            .findById(
              partnership._id
            )
        )
          .lean();


      res.json({
        success:true,
        partnership:
          populated,
        item:
          populated
      });


    } catch (error) {

      console.error(
        "UPDATE SCHOOL COMPANY PARTNERSHIP ERROR:",
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
            "Unable to update the partnership."
        });

    }

  }
);


/* =========================================================
   DELETE /api/school-company-partnerships/:id

   Career partnership history should normally be preserved.

   Only admin can permanently remove records.
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
              "Partnership records cannot be permanently deleted. Cancel, complete or archive the partnership instead."
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
              "Invalid partnership id."
          });

      }


      const partnership =
        await SchoolCompanyPartnership
          .findByIdAndDelete(
            req.params.id
          );


      if (!partnership) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Partnership not found."
          });

      }


      res.json({
        success:true,
        message:
          "Partnership permanently deleted."
      });


    } catch (error) {

      console.error(
        "DELETE SCHOOL COMPANY PARTNERSHIP ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the partnership."
        });

    }

  }
);


module.exports =
  router;
