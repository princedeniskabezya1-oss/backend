const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const InternshipApplication =
  require("../models/InternshipApplication");

const SchoolOpportunity =
  require("../models/SchoolOpportunity");

const User =
  require("../models/User");

const { queueInternshipApplication } =
  require("../services/aiftReviewWorkflow");


const router =
  express.Router();


/* =========================================================
   CONSTANTS
========================================================= */

const MANAGER_ROLES =
  new Set([
    "school",
    "employer",
    "company",
    "admin"
  ]);


const EMPLOYER_ROLES =
  new Set([
    "employer",
    "company"
  ]);


const STUDENT_ROLES =
  new Set([
    "student",
    "talent"
  ]);


const VALID_STATUSES =
  new Set([
    "pending",
    "review",
    "shortlisted",
    "interview",
    "approved",
    "active",
    "completed",
    "rejected",
    "withdrawn"
  ]);


/* =========================================================
   AUTHENTICATION
========================================================= */

router.use(auth);


/* =========================================================
   HELPERS
========================================================= */

function normalizeId(
  value
) {

  if (
    value &&
    typeof value ===
      "object"
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


function isValidObjectId(
  value
) {

  return mongoose.Types.ObjectId.isValid(
    normalizeId(value)
  );

}


function safeString(
  value,
  maxLength = 5000
) {

  return String(
    value ??
    ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}


function getUserId(
  req
) {

  return normalizeId(
    req.user?._id ||
    req.user?.id
  );

}


function getUserRole(
  req
) {

  return safeString(
    req.user?.role,
    100
  )
    .toLowerCase();

}


function getStudentSchoolId(
  user
) {

  return normalizeId(
    user?.schoolId ||
    user?.linkedSchoolId ||
    user?.school
  );

}


function getCompanyId(
  user
) {

  return normalizeId(
    user?.companyId ||
    user?.employerId ||
    user?.company
  );

}


/* =========================================================
   PAGINATION
========================================================= */

function parsePagination(
  query = {}
) {

  const page =
    Math.max(
      parseInt(
        query.page,
        10
      ) ||
      1,
      1
    );


  const limit =
    Math.min(
      Math.max(
        parseInt(
          query.limit,
          10
        ) ||
        50,
        1
      ),
      100
    );


  return {
    page,
    limit,
    skip:
      (
        page -
        1
      ) *
      limit
  };

}


/* =========================================================
   POPULATION
========================================================= */

function populateApplication(
  query
) {

  return query

    .populate(
      "studentId",
      [
        "name",
        "fullName",
        "email",
        "avatar",
        "profileImage",
        "profilePicture",
        "role",
        "jobTitle",
        "course",
        "program",
        "yearLevel",
        "schoolId",
        "linkedSchoolId"
      ]
        .join(" ")
    )

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
      ]
        .join(" ")
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
      ]
        .join(" ")
    )

    .populate(
      "opportunityId",
      [
        "title",
        "type",
        "status",
        "companyName",
        "employerId",
        "schoolId",
        "workSetup",
        "location",
        "deadline",
        "description",
        "summary",
        "slots",
        "filledSlots",
        "visibility"
      ]
        .join(" ")
    )

    .populate(
      "recommendedBy",
      "name fullName role email"
    )

    .populate(
      "reviewedBy",
      "name fullName role email"
    );

}


/* =========================================================
   MANAGER ACCESS
========================================================= */

function canManageApplication(
  req,
  application
) {

  const userId =
    getUserId(req);


  const role =
    getUserRole(req);


  if (
    role === "admin"
  ) {
    return true;
  }


  if (
    role === "school" &&
    sameId(
      application.schoolId,
      userId
    )
  ) {
    return true;
  }


  if (
    EMPLOYER_ROLES.has(role) &&
    sameId(
      application.companyId,
      userId
    )
  ) {
    return true;
  }


  return false;

}


/* =========================================================
   STUDENT OWNERSHIP
========================================================= */

function ownsApplication(
  req,
  application
) {

  return (
    STUDENT_ROLES.has(
      getUserRole(req)
    ) &&
    sameId(
      application.studentId,
      getUserId(req)
    )
  );

}


/* =========================================================
   STATUS HISTORY
========================================================= */

function addStatusHistory(
  application,
  req,
  status,
  note = ""
) {

  application.statusHistory.push({
    status,

    changedBy:
      getUserId(req) ||
      null,

    changedByRole:
      getUserRole(req),

    note:
      safeString(
        note,
        2000
      ),

    changedAt:
      new Date()
  });

}


/* =========================================================
   STATUS TIMESTAMPS
========================================================= */

function applyStatusTimestamp(
  application,
  status
) {

  const now =
    new Date();


  switch (status) {

    case "review":

      application.reviewedAt =
        application.reviewedAt ||
        now;

      break;


    case "interview":

      application.reviewedAt =
        application.reviewedAt ||
        now;

      break;


    case "approved":

      application.approvedAt =
        application.approvedAt ||
        now;

      break;


    case "active":

      application.startedAt =
        application.startedAt ||
        now;

      break;


    case "completed":

      application.completedAt =
        application.completedAt ||
        now;

      break;


    case "rejected":

      application.rejectedAt =
        application.rejectedAt ||
        now;

      break;


    case "withdrawn":

      application.withdrawnAt =
        application.withdrawnAt ||
        now;

      break;

  }

}


/* =========================================================
   ALLOWED STATUS TRANSITIONS
========================================================= */

const STATUS_TRANSITIONS = {

  pending:
    new Set([
      "review",
      "shortlisted",
      "interview",
      "approved",
      "rejected",
      "withdrawn"
    ]),

  review:
    new Set([
      "shortlisted",
      "interview",
      "approved",
      "rejected",
      "withdrawn"
    ]),

  shortlisted:
    new Set([
      "review",
      "interview",
      "approved",
      "rejected",
      "withdrawn"
    ]),

  interview:
    new Set([
      "approved",
      "rejected",
      "withdrawn"
    ]),

  approved:
    new Set([
      "active",
      "rejected",
      "withdrawn"
    ]),

  active:
    new Set([
      "completed"
    ]),

  completed:
    new Set([]),

  rejected:
    new Set([]),

  withdrawn:
    new Set([])

};


function canTransition(
  currentStatus,
  nextStatus
) {

  if (
    currentStatus ===
    nextStatus
  ) {
    return true;
  }


  return Boolean(
    STATUS_TRANSITIONS[
      currentStatus
    ]?.has(
      nextStatus
    )
  );

}


/* =========================================================
   BUILD LIST ACCESS FILTER
========================================================= */

function buildAccessFilter(
  req
) {

  const role =
    getUserRole(req);


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
    EMPLOYER_ROLES.has(role)
  ) {

    return {
      companyId:
        userId
    };

  }


  if (
    STUDENT_ROLES.has(role)
  ) {

    return {
      studentId:
        userId
    };

  }


  return {
    _id:null
  };

}


/* =========================================================
   GET /api/internship-applications

   SECURITY:
   Query parameters can narrow records the authenticated user
   can already access. They cannot expand access.
========================================================= */

router.get(
  "/",
  async (
    req,
    res
  ) => {

    try {

      const {
        opportunityId,
        schoolId,
        companyId,
        studentId,
        status
      } =
        req.query;


      const {
        page,
        limit,
        skip
      } =
        parsePagination(
          req.query
        );


      const accessFilter =
        buildAccessFilter(
          req
        );


      const requestedFilter = {};


      const idFilters = [
        [
          "opportunityId",
          opportunityId
        ],

        [
          "schoolId",
          schoolId
        ],

        [
          "companyId",
          companyId
        ],

        [
          "studentId",
          studentId
        ]
      ];


      for (
        const [
          field,
          value
        ]
        of idFilters
      ) {

        if (!value) {
          continue;
        }


        if (
          !isValidObjectId(
            value
          )
        ) {

          return res
            .status(400)
            .json({

              success:false,

              message:
                `${field} is invalid.`

            });

        }


        requestedFilter[field] =
          value;

      }


      if (status) {

        const normalizedStatus =
          safeString(
            status,
            100
          )
            .toLowerCase();


        if (
          !VALID_STATUSES.has(
            normalizedStatus
          )
        ) {

          return res
            .status(400)
            .json({

              success:false,

              message:
                "Invalid application status."

            });

        }


        requestedFilter.status =
          normalizedStatus;

      }


      const filter = {
        $and:[
          accessFilter,
          requestedFilter
        ]
      };


      const [
        applications,
        total
      ] =
        await Promise.all([

          populateApplication(
            InternshipApplication
              .find(filter)
          )
            .sort({
              createdAt:-1
            })
            .skip(skip)
            .limit(limit)
            .lean(),

          InternshipApplication
            .countDocuments(
              filter
            )

        ]);


      res.json({

        success:true,

        applications,

        items:
          applications,

        pagination:{
          page,
          limit,
          total,
          pages:
            Math.ceil(
              total /
              limit
            )
        }

      });


    } catch (error) {

      console.error(
        "GET INTERNSHIP APPLICATIONS ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to load internship applications."

        });

    }

  }
);


/* =========================================================
   GET /api/internship-applications/:id
========================================================= */

router.get(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid application id."

          });

      }


      const application =
        await populateApplication(
          InternshipApplication
            .findById(
              req.params.id
            )
        )
          .lean();


      if (!application) {

        return res
          .status(404)
          .json({

            success:false,

            message:
              "Application not found."

          });

      }


      if (
        !canManageApplication(
          req,
          application
        ) &&
        !ownsApplication(
          req,
          application
        )
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "You are not allowed to view this application."

          });

      }


      res.json({

        success:true,

        application,

        item:
          application

      });


    } catch (error) {

      console.error(
        "GET INTERNSHIP APPLICATION ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to load the application."

        });

    }

  }
);


/* =========================================================
   POST /api/internship-applications

   Supports:

   Student self-application
   School recommendation
   Admin placement

   Browser cannot assign itself arbitrary ownership.
========================================================= */

router.post(
  "/",
  async (
    req,
    res
  ) => {

    try {

      const role =
        getUserRole(req);


      const userId =
        getUserId(req);


      const opportunityId =
        normalizeId(
          req.body.opportunityId
        );


      if (
        !isValidObjectId(
          opportunityId
        )
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "A valid opportunity is required."

          });

      }


      const opportunity =
        await SchoolOpportunity
          .findById(
            opportunityId
          )
          .lean();


      if (!opportunity) {

        return res
          .status(404)
          .json({

            success:false,

            message:
              "Opportunity not found."

          });

      }


      if (
        ![
          "internship",
          "job",
          "placement",
          "project"
        ]
          .includes(
            opportunity.type
          )
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "This opportunity does not accept career applications."

          });

      }


      if (
        ![
          "approved",
          "open",
          "active"
        ]
          .includes(
            opportunity.status
          )
      ) {

        return res
          .status(409)
          .json({

            success:false,

            message:
              "This opportunity is not currently accepting applications."

          });

      }


      if (
        opportunity.deadline &&
        new Date(
          opportunity.deadline
        ) <
        new Date()
      ) {

        return res
          .status(409)
          .json({

            success:false,

            message:
              "The application deadline has passed."

          });

      }


      let studentId = null;

      let schoolId =
        normalizeId(
          opportunity.schoolId
        ) ||
        null;

      let source =
        "student";

      let recommendedBy =
        null;


      /* =====================================================
         STUDENT SELF-APPLICATION
      ===================================================== */

      if (
        STUDENT_ROLES.has(
          role
        )
      ) {

        if (
          opportunity.allowStudentApplications ===
          false
        ) {

          return res
            .status(403)
            .json({

              success:false,

              message:
                "This opportunity does not accept direct student applications."

            });

        }


        studentId =
          userId;


        schoolId =
          getStudentSchoolId(
            req.user
          ) ||
          schoolId ||
          null;


        source =
          "student";

      }


      /* =====================================================
         SCHOOL RECOMMENDATION
      ===================================================== */

      else if (
        role ===
        "school"
      ) {

        if (
          opportunity.allowSchoolRecommendations ===
          false
        ) {

          return res
            .status(403)
            .json({

              success:false,

              message:
                "This opportunity does not accept school recommendations."

            });

        }


        studentId =
          normalizeId(
            req.body.studentId
          );


        if (
          !isValidObjectId(
            studentId
          )
        ) {

          return res
            .status(400)
            .json({

              success:false,

              message:
                "A valid student is required."

            });

        }


        const student =
          await User
            .findById(
              studentId
            )
            .select(
              "_id role schoolId linkedSchoolId"
            )
            .lean();


        if (!student) {

          return res
            .status(404)
            .json({

              success:false,

              message:
                "Student not found."

            });

        }


        const studentRole =
          safeString(
            student.role,
            100
          )
            .toLowerCase();


        if (
          !STUDENT_ROLES.has(
            studentRole
          )
        ) {

          return res
            .status(400)
            .json({

              success:false,

              message:
                "The selected account is not a student."

            });

        }


        const studentSchoolId =
          getStudentSchoolId(
            student
          );


        if (
          !sameId(
            studentSchoolId,
            userId
          )
        ) {

          return res
            .status(403)
            .json({

              success:false,

              message:
                "You can only recommend students connected to your school."

            });

        }


        schoolId =
          userId;


        source =
          "school_recommendation";


        recommendedBy =
          userId;

      }


      /* =====================================================
         ADMIN
      ===================================================== */

      else if (
        role ===
        "admin"
      ) {

        studentId =
          normalizeId(
            req.body.studentId
          );


        if (
          !isValidObjectId(
            studentId
          )
        ) {

          return res
            .status(400)
            .json({

              success:false,

              message:
                "A valid student is required."

            });

        }


        const student =
          await User
            .findById(
              studentId
            )
            .select(
              "_id role schoolId linkedSchoolId"
            )
            .lean();


        if (!student) {

          return res
            .status(404)
            .json({

              success:false,

              message:
                "Student not found."

            });

        }


        schoolId =
          getStudentSchoolId(
            student
          ) ||
          schoolId ||
          null;


        source =
          "admin";

      }


      else {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "Your account cannot submit this application."

          });

      }


      const existing =
        await InternshipApplication
          .findOne({

            opportunityId,

            studentId

          })
          .lean();


      if (existing) {

        return res
          .status(409)
          .json({

            success:false,

            message:
              "This student already has an application for this opportunity.",

            applicationId:
              existing._id,

            status:
              existing.status

          });

      }


      const companyId =
        normalizeId(
          opportunity.employerId
        ) ||
        null;


      const now =
        new Date();


      const application =
        await InternshipApplication
          .create({

            opportunityId,

            studentId,

            schoolId:
              schoolId ||
              null,

            companyId:
              companyId ||
              null,

            status:
              "pending",

            source,

            message:
              safeString(
                req.body.message
              ),

            coverLetter:
              safeString(
                req.body.coverLetter,
                10000
              ),

            resumeUrl:
              safeString(
                req.body.resumeUrl,
                2000
              ),

            portfolioUrl:
              safeString(
                req.body.portfolioUrl,
                2000
              ),

            recommendationMessage:
              safeString(
                req.body.recommendationMessage
              ),

            recommendedBy,

            createdBy:
              userId,

            updatedBy:
              userId,

            statusHistory:[
              {
                status:
                  "pending",

                changedBy:
                  userId,

                changedByRole:
                  role,

                note:
                  source ===
                  "school_recommendation"
                    ? "Student recommended by school."
                    : "Application submitted.",

                changedAt:
                  now
              }
            ]

          });


      /*
        Keep opportunity application count synchronized.

        $inc is atomic.
      */

      await SchoolOpportunity
        .updateOne(
          {
            _id:
              opportunityId
          },
          {
            $inc:{
              applicationCount:1
            }
          }
        );


      const populated =
        await populateApplication(
          InternshipApplication
            .findById(
              application._id
            )
        )
          .lean();


      const reviewCase = await queueInternshipApplication({
        application,
        opportunity,
        actor:req.user
      });

      res
        .status(202)
        .json({
          success:true,
          application:populated,
          item:populated,
          reviewCase,
          reviewStatus:reviewCase.status,
          message:"Application submitted for AIFT review before receiving-party processing."
        });


    } catch (error) {

      console.error(
        "CREATE INTERNSHIP APPLICATION ERROR:",
        error
      );


      if (
        error?.code ===
          11000
      ) {

        return res
          .status(409)
          .json({

            success:false,

            message:
              "This student already has an application for this opportunity."

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
            "Unable to submit the internship application."

        });

    }

  }
);


/* =========================================================
   PATCH /api/internship-applications/:id

   Managers:
   - status
   - internal notes
   - interview information

   Students:
   - may withdraw their own application
   - may update submission information while still pending
========================================================= */

router.patch(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid application id."

          });

      }


      const application =
        await InternshipApplication
          .findById(
            req.params.id
          );


      if (!application) {

        return res
          .status(404)
          .json({

            success:false,

            message:
              "Application not found."

          });

      }


      const manager =
        canManageApplication(
          req,
          application
        );


      const owner =
        ownsApplication(
          req,
          application
        );


      if (
        !manager &&
        !owner
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "You are not allowed to update this application."

          });

      }


      const userId =
        getUserId(req);


      /* =====================================================
         STUDENT UPDATE
      ===================================================== */

      if (
        owner &&
        !manager
      ) {

        if (
          req.body.status !==
            undefined
        ) {

          const requestedStatus =
            safeString(
              req.body.status,
              100
            )
              .toLowerCase();


          if (
            requestedStatus !==
              "withdrawn"
          ) {

            return res
              .status(403)
              .json({

                success:false,

                message:
                  "Students may only withdraw their own application status."

              });

          }


          if (
            !canTransition(
              application.status,
              "withdrawn"
            )
          ) {

            return res
              .status(409)
              .json({

                success:false,

                message:
                  `Application cannot move from ${application.status} to withdrawn.`

              });

          }


          application.status =
            "withdrawn";


          applyStatusTimestamp(
            application,
            "withdrawn"
          );


          addStatusHistory(
            application,
            req,
            "withdrawn",
            "Application withdrawn by student."
          );

        }


        /*
          Student may update their materials only before
          manager processing reaches later stages.
        */

        if (
          [
            "pending",
            "review"
          ]
            .includes(
              application.status
            )
        ) {

          if (
            req.body.message !==
              undefined
          ) {

            application.message =
              safeString(
                req.body.message
              );

          }


          if (
            req.body.coverLetter !==
              undefined
          ) {

            application.coverLetter =
              safeString(
                req.body.coverLetter,
                10000
              );

          }


          if (
            req.body.resumeUrl !==
              undefined
          ) {

            application.resumeUrl =
              safeString(
                req.body.resumeUrl,
                2000
              );

          }


          if (
            req.body.portfolioUrl !==
              undefined
          ) {

            application.portfolioUrl =
              safeString(
                req.body.portfolioUrl,
                2000
              );

          }

        }

      }


      /* =====================================================
         MANAGER UPDATE
      ===================================================== */

      if (manager) {

        if (
          req.body.status !==
            undefined
        ) {

          const nextStatus =
            safeString(
              req.body.status,
              100
            )
              .toLowerCase();


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
                  "Invalid application status."

              });

          }


          if (
            nextStatus ===
              "withdrawn"
          ) {

            return res
              .status(403)
              .json({

                success:false,

                message:
                  "Only the student can withdraw an application."

              });

          }


          if (
            !canTransition(
              application.status,
              nextStatus
            )
          ) {

            return res
              .status(409)
              .json({

                success:false,

                message:
                  `Application cannot move from ${application.status} to ${nextStatus}.`

              });

          }


          if (
            nextStatus !==
              application.status
          ) {

            application.status =
              nextStatus;


            application.reviewedBy =
              userId;


            application.reviewedAt =
              application.reviewedAt ||
              new Date();


            applyStatusTimestamp(
              application,
              nextStatus
            );


            addStatusHistory(
              application,
              req,
              nextStatus,
              req.body.statusNote ||
              ""
            );

          }

        }


        if (
          req.body.notes !==
            undefined
        ) {

          application.notes =
            safeString(
              req.body.notes
            );

        }


        if (
          req.body.interviewAt !==
            undefined
        ) {

          if (
            req.body.interviewAt
          ) {

            const interviewDate =
              new Date(
                req.body.interviewAt
              );


            if (
              Number.isNaN(
                interviewDate.getTime()
              )
            ) {

              return res
                .status(400)
                .json({

                  success:false,

                  message:
                    "Interview date is invalid."

                });

            }


            application.interviewAt =
              interviewDate;

          } else {

            application.interviewAt =
              null;

          }

        }


        if (
          req.body.interviewLocation !==
            undefined
        ) {

          application.interviewLocation =
            safeString(
              req.body.interviewLocation,
              1000
            );

        }


        if (
          req.body.interviewNotes !==
            undefined
        ) {

          application.interviewNotes =
            safeString(
              req.body.interviewNotes
            );

        }

      }


      application.updatedBy =
        userId;


      await application.save();


      const populated =
        await populateApplication(
          InternshipApplication
            .findById(
              application._id
            )
        )
          .lean();


      res.json({

        success:true,

        application:
          populated,

        item:
          populated

      });


    } catch (error) {

      console.error(
        "UPDATE INTERNSHIP APPLICATION ERROR:",
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
            "Unable to update the internship application."

        });

    }

  }
);


/* =========================================================
   DELETE /api/internship-applications/:id

   Applications are important career records.

   We do NOT allow normal users to erase them.

   Student withdrawal is PATCH status=withdrawn.

   Only admin can permanently delete a record.
========================================================= */

router.delete(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        getUserRole(req) !==
          "admin"
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "Career applications cannot be permanently deleted. Students may withdraw an application instead."

          });

      }


      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid application id."

          });

      }


      const application =
        await InternshipApplication
          .findById(
            req.params.id
          );


      if (!application) {

        return res
          .status(404)
          .json({

            success:false,

            message:
              "Application not found."

          });

      }


      const opportunityId =
        application.opportunityId;


      await application
        .deleteOne();


      await SchoolOpportunity
        .updateOne(
          {
            _id:
              opportunityId,

            applicationCount:{
              $gt:0
            }
          },
          {
            $inc:{
              applicationCount:-1
            }
          }
        );


      res.json({

        success:true,

        message:
          "Application permanently deleted."

      });


    } catch (error) {

      console.error(
        "DELETE INTERNSHIP APPLICATION ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to delete the internship application."

        });

    }

  }
);


module.exports =
  router;
