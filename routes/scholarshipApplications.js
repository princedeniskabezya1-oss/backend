const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const ScholarshipApplication =
  require("../models/ScholarshipApplication");

const SchoolScholarship =
  require("../models/SchoolScholarship");


const router =
  express.Router();


router.use(auth);


/* =========================================================
   CONSTANTS
========================================================= */

const STUDENT_ROLES =
  new Set([
    "student",
    "talent"
  ]);


const APPLICATION_STATUSES =
  new Set([
    "draft",
    "submitted",
    "review",
    "shortlisted",
    "approved",
    "awarded",
    "rejected",
    "withdrawn"
  ]);


const ACTIVE_SCHOLARSHIP_STATUSES =
  new Set([
    "published",
    "open"
  ]);


/* =========================================================
   BASIC HELPERS
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


function validId(value) {

  return mongoose.Types.ObjectId.isValid(
    normalizeId(value)
  );

}


function safeString(
  value,
  max = 15000
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


function numberOrNull(value) {

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


/* =========================================================
   STUDENT SCHOOL
========================================================= */

function getStudentSchoolId(req) {

  return normalizeId(
    req.user?.schoolId ||
    req.user?.linkedSchoolId ||
    req.user?.school
  );

}


/* =========================================================
   SCHOLARSHIP ACCESS
========================================================= */

function studentCanAccessScholarship(
  req,
  scholarship
) {

  if (
    !ACTIVE_SCHOLARSHIP_STATUSES.has(
      scholarship.status
    )
  ) {

    return false;

  }


  if (
    scholarship.visibility ===
    "public"
  ) {

    return true;

  }


  if (
    scholarship.visibility ===
    "school"
  ) {

    return sameId(
      scholarship.schoolId,
      getStudentSchoolId(req)
    );

  }


  return false;

}


/* =========================================================
   APPLICATION ACCESS
========================================================= */

function canViewApplication(
  req,
  application
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
    STUDENT_ROLES.has(role)
  ) {

    return sameId(
      application.studentId,
      userId
    );

  }


  if (
    role === "school"
  ) {

    return sameId(
      application.schoolId,
      userId
    );

  }


  return false;

}


function canReviewApplication(
  req,
  application
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


  return (
    role === "school" &&
    sameId(
      application.schoolId,
      userId
    )
  );

}


/* =========================================================
   POPULATION
========================================================= */

function populateApplication(query) {

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
        "course",
        "program",
        "yearLevel"
      ].join(" ")
    )

    .populate(
      "schoolId",
      [
        "name",
        "schoolName",
        "email",
        "schoolLogo",
        "profileImage",
        "profilePicture"
      ].join(" ")
    )

    .populate({
      path:
        "scholarshipId",

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

    .populate(
      "reviewedBy",
      "name fullName email role"
    )

    .populate(
      "createdBy",
      "name fullName email role"
    )

    .populate(
      "updatedBy",
      "name fullName email role"
    );

}


/* =========================================================
   STATUS HISTORY
========================================================= */

function addHistory(
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
   APPLICATION STATUS TRANSITIONS
========================================================= */

const STATUS_TRANSITIONS = {

  draft:
    new Set([
      "submitted",
      "withdrawn"
    ]),

  submitted:
    new Set([
      "review",
      "shortlisted",
      "approved",
      "rejected",
      "withdrawn"
    ]),

  review:
    new Set([
      "shortlisted",
      "approved",
      "rejected",
      "withdrawn"
    ]),

  shortlisted:
    new Set([
      "approved",
      "rejected",
      "withdrawn"
    ]),

  approved:
    new Set([
      "awarded",
      "rejected",
      "withdrawn"
    ]),

  awarded:
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
   SCHOLARSHIP DATE VALIDATION
========================================================= */

function scholarshipIsOpen(
  scholarship
) {

  if (
    !ACTIVE_SCHOLARSHIP_STATUSES.has(
      scholarship.status
    )
  ) {

    return false;

  }


  const now =
    new Date();


  if (
    scholarship.applicationOpenDate &&
    now <
      new Date(
        scholarship.applicationOpenDate
      )
  ) {

    return false;

  }


  if (
    scholarship.deadline &&
    now >
      new Date(
        scholarship.deadline
      )
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   REQUIRED DOCUMENT VALIDATION
========================================================= */

function missingRequiredDocuments(
  scholarship,
  application
) {

  const required =
    Array.isArray(
      scholarship.requiredDocuments
    )
      ? scholarship.requiredDocuments
      : [];


  if (
    required.length === 0
  ) {

    return [];

  }


  const uploaded =
    Array.isArray(
      application.documents
    )
      ? application.documents
      : [];


  const uploadedNames =
    new Set(
      uploaded
        .map(document =>
          safeString(
            document.name,
            300
          ).toLowerCase()
        )
        .filter(Boolean)
    );


  return required.filter(
    requirement =>
      !uploadedNames.has(
        safeString(
          requirement,
          300
        ).toLowerCase()
      )
  );

}


/* =========================================================
   LIST FILTER

   GET /api/scholarship-applications
========================================================= */

router.get(
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


      const filter = {};


      /* =====================================================
         SECURITY SCOPE
      ===================================================== */

      if (
        role === "admin"
      ) {

        // Admin may use query filters below.

      }


      else if (
        STUDENT_ROLES.has(role)
      ) {

        filter.studentId =
          userId;

      }


      else if (
        role === "school"
      ) {

        filter.schoolId =
          userId;

      }


      else {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot access scholarship applications."
          });

      }


      /* =====================================================
         FILTERS
      ===================================================== */

      if (
        req.query.scholarshipId
      ) {

        if (
          !validId(
            req.query.scholarshipId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid scholarshipId."
            });

        }


        filter.scholarshipId =
          req.query.scholarshipId;

      }


      if (
        req.query.studentId &&
        role === "admin"
      ) {

        if (
          !validId(
            req.query.studentId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid studentId."
            });

        }


        filter.studentId =
          req.query.studentId;

      }


      if (
        req.query.schoolId &&
        role === "admin"
      ) {

        if (
          !validId(
            req.query.schoolId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid schoolId."
            });

        }


        filter.schoolId =
          req.query.schoolId;

      }


      if (
        req.query.status
      ) {

        const status =
          safeString(
            req.query.status,
            100
          ).toLowerCase();


        if (
          !APPLICATION_STATUSES.has(
            status
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


        filter.status =
          status;

      }


      const applications =
        await populateApplication(
          ScholarshipApplication
            .find(filter)
        )
          .sort({
            submittedAt:-1,
            createdAt:-1
          })
          .lean();


      res.json({
        success:true,
        applications,
        items:applications
      });


    } catch (error) {

      console.error(
        "GET SCHOLARSHIP APPLICATIONS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load scholarship applications."
        });

    }

  }
);


/* =========================================================
   GET /api/scholarship-applications/:id
========================================================= */

router.get(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !validId(
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
          ScholarshipApplication
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
              "Scholarship application not found."
          });

      }


      if (
        !canViewApplication(
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
        item:application
      });


    } catch (error) {

      console.error(
        "GET SCHOLARSHIP APPLICATION ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the scholarship application."
        });

    }

  }
);


/* =========================================================
   POST /api/scholarship-applications

   Student creates application.

   status:
   - draft
   - submitted
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

      const studentId =
        getUserId(req);


      if (
        !STUDENT_ROLES.has(role)
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Only students can apply for scholarships."
          });

      }


      const scholarshipId =
        normalizeId(
          req.body.scholarshipId
        );


      if (
        !validId(
          scholarshipId
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid scholarship is required."
          });

      }


      const scholarship =
        await SchoolScholarship
          .findById(
            scholarshipId
          );


      if (!scholarship) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Scholarship not found."
          });

      }


      if (
        !scholarship.allowInternalApplications
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "This scholarship does not accept applications through AIFT."
          });

      }


      if (
        !studentCanAccessScholarship(
          req,
          scholarship
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not eligible to access this scholarship."
          });

      }


      if (
        !scholarshipIsOpen(
          scholarship
        )
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Applications for this scholarship are not currently open."
          });

      }


      const existing =
        await ScholarshipApplication
          .findOne({
            scholarshipId,
            studentId
          });


      if (existing) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "You already have an application for this scholarship.",
            applicationId:
              existing._id,
            status:
              existing.status
          });

      }


      const requestedStatus =
        safeString(
          req.body.status ||
          "submitted",
          100
        ).toLowerCase();


      const initialStatus =
        requestedStatus ===
        "draft"
          ? "draft"
          : "submitted";


      const academicSnapshot =
        req.body.academicSnapshot &&
        typeof req.body.academicSnapshot ===
          "object"
          ? req.body.academicSnapshot
          : {};


      const documents =
        Array.isArray(
          req.body.documents
        )
          ? req.body.documents
              .filter(
                document =>
                  document &&
                  document.url
              )
              .map(
                document => ({
                  name:
                    safeString(
                      document.name,
                      300
                    ),

                  url:
                    safeString(
                      document.url,
                      2000
                    ),

                  publicId:
                    safeString(
                      document.publicId,
                      1000
                    ),

                  mimeType:
                    safeString(
                      document.mimeType,
                      200
                    ),

                  size:
                    numberOrNull(
                      document.size
                    ),

                  uploadedAt:
                    new Date()
                })
              )
          : [];


      const application =
        new ScholarshipApplication({
          scholarshipId,

          schoolId:
            scholarship.schoolId,

          studentId,

          status:
            initialStatus,

          personalStatement:
            safeString(
              req.body.personalStatement
            ),

          financialNeedStatement:
            safeString(
              req.body.financialNeedStatement,
              10000
            ),

          achievements:
            stringArray(
              req.body.achievements
            ),

          documents,

          academicSnapshot:{
            program:
              safeString(
                academicSnapshot.program,
                200
              ),

            yearLevel:
              safeString(
                academicSnapshot.yearLevel,
                100
              ),

            gpa:
              numberOrNull(
                academicSnapshot.gpa
              ),

            gradeAverage:
              numberOrNull(
                academicSnapshot.gradeAverage
              )
          },

          submittedAt:
            initialStatus ===
            "submitted"
              ? new Date()
              : null,

          createdBy:
            studentId,

          updatedBy:
            studentId,

          statusHistory:[
            {
              status:
                initialStatus,

              changedBy:
                studentId,

              changedByRole:
                role,

              note:
                initialStatus ===
                "submitted"
                  ? "Scholarship application submitted."
                  : "Scholarship application draft created.",

              changedAt:
                new Date()
            }
          ]
        });


      /* =====================================================
         REQUIRED DOCUMENTS BEFORE DIRECT SUBMISSION
      ===================================================== */

      if (
        initialStatus ===
        "submitted"
      ) {

        const missing =
          missingRequiredDocuments(
            scholarship,
            application
          );


        if (
          missing.length
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Required scholarship documents are missing.",
              missingDocuments:
                missing
            });

        }

      }


      await application.save();


      if (
        initialStatus ===
        "submitted"
      ) {

        await SchoolScholarship
          .updateOne(
            {
              _id:
                scholarship._id
            },
            {
              $inc:{
                applicationCount:1
              }
            }
          );

      }


      const populated =
        await populateApplication(
          ScholarshipApplication
            .findById(
              application._id
            )
        )
          .lean();


      res
        .status(201)
        .json({
          success:true,
          application:
            populated,
          item:
            populated
        });


    } catch (error) {

      console.error(
        "CREATE SCHOLARSHIP APPLICATION ERROR:",
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
              "You already have an application for this scholarship."
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
            "Unable to create the scholarship application."
        });

    }

  }
);


/* =========================================================
   PATCH /api/scholarship-applications/:id

   STUDENT:
   - edit draft
   - submit draft
   - withdraw active application

   SCHOOL:
   - review
   - shortlist
   - approve
   - reject
   - award
========================================================= */

router.patch(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !validId(
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
        await ScholarshipApplication
          .findById(
            req.params.id
          );


      if (!application) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Scholarship application not found."
          });

      }


      if (
        !canViewApplication(
          req,
          application
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to update this application."
          });

      }


      const scholarship =
        await SchoolScholarship
          .findById(
            application.scholarshipId
          );


      if (!scholarship) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "The scholarship connected to this application no longer exists."
          });

      }


      const role =
        getRole(req);

      const userId =
        getUserId(req);


      /* =====================================================
         STUDENT EDITING
      ===================================================== */

      if (
        STUDENT_ROLES.has(role)
      ) {

        if (
          !sameId(
            application.studentId,
            userId
          )
        ) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "You cannot edit another student's scholarship application."
            });

        }


        /*
          Application content can only be edited while draft.
        */

        if (
          application.status ===
          "draft"
        ) {

          if (
            req.body.personalStatement !==
            undefined
          ) {

            application.personalStatement =
              safeString(
                req.body.personalStatement
              );

          }


          if (
            req.body.financialNeedStatement !==
            undefined
          ) {

            application.financialNeedStatement =
              safeString(
                req.body.financialNeedStatement,
                10000
              );

          }


          if (
            req.body.achievements !==
            undefined
          ) {

            application.achievements =
              stringArray(
                req.body.achievements
              );

          }


          if (
            req.body.academicSnapshot &&
            typeof req.body.academicSnapshot ===
            "object"
          ) {

            const snapshot =
              req.body.academicSnapshot;


            if (
              snapshot.program !==
              undefined
            ) {

              application.academicSnapshot.program =
                safeString(
                  snapshot.program,
                  200
                );

            }


            if (
              snapshot.yearLevel !==
              undefined
            ) {

              application.academicSnapshot.yearLevel =
                safeString(
                  snapshot.yearLevel,
                  100
                );

            }


            if (
              snapshot.gpa !==
              undefined
            ) {

              application.academicSnapshot.gpa =
                numberOrNull(
                  snapshot.gpa
                );

            }


            if (
              snapshot.gradeAverage !==
              undefined
            ) {

              application.academicSnapshot.gradeAverage =
                numberOrNull(
                  snapshot.gradeAverage
                );

            }

          }


          if (
            req.body.documents !==
            undefined
          ) {

            if (
              !Array.isArray(
                req.body.documents
              )
            ) {

              return res
                .status(400)
                .json({
                  success:false,
                  message:
                    "documents must be an array."
                });

            }


            application.documents =
              req.body.documents
                .filter(
                  document =>
                    document &&
                    document.url
                )
                .map(
                  document => ({
                    name:
                      safeString(
                        document.name,
                        300
                      ),

                    url:
                      safeString(
                        document.url,
                        2000
                      ),

                    publicId:
                      safeString(
                        document.publicId,
                        1000
                      ),

                    mimeType:
                      safeString(
                        document.mimeType,
                        200
                      ),

                    size:
                      numberOrNull(
                        document.size
                      )
                  })
                );

          }

        }


        /* ===================================================
           STUDENT STATUS ACTION
        =================================================== */

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
            !APPLICATION_STATUSES.has(
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


          /*
            Student can only:
            draft -> submitted
            or active application -> withdrawn
          */

          if (
            nextStatus !==
            "submitted" &&
            nextStatus !==
            "withdrawn"
          ) {

            return res
              .status(403)
              .json({
                success:false,
                message:
                  "Students cannot perform this application status change."
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
            nextStatus ===
            "submitted"
          ) {

            if (
              !scholarshipIsOpen(
                scholarship
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    "Applications for this scholarship are no longer open."
                });

            }


            const missing =
              missingRequiredDocuments(
                scholarship,
                application
              );


            if (
              missing.length
            ) {

              return res
                .status(400)
                .json({
                  success:false,
                  message:
                    "Required scholarship documents are missing.",
                  missingDocuments:
                    missing
                });

            }


            application.status =
              "submitted";

            application.submittedAt =
              new Date();


            addHistory(
              application,
              req,
              "submitted",
              "Scholarship application submitted."
            );


            await SchoolScholarship
              .updateOne(
                {
                  _id:
                    scholarship._id
                },
                {
                  $inc:{
                    applicationCount:1
                  }
                }
              );

          }


          else if (
            nextStatus ===
            "withdrawn"
          ) {

            application.status =
              "withdrawn";

            application.withdrawnAt =
              new Date();


            addHistory(
              application,
              req,
              "withdrawn",
              req.body.statusNote ||
              "Application withdrawn by student."
            );

          }

        }

      }


      /* =====================================================
         SCHOOL / ADMIN REVIEW
      ===================================================== */

      else if (
        role === "school" ||
        role === "admin"
      ) {

        if (
          !canReviewApplication(
            req,
            application
          )
        ) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "You are not allowed to review this application."
            });

        }


        if (
          req.body.reviewerNotes !==
          undefined
        ) {

          application.reviewerNotes =
            safeString(
              req.body.reviewerNotes,
              10000
            );

        }


        if (
          req.body.status !==
          undefined
        ) {

          const nextStatus =
            safeString(
              req.body.status,
              100
            ).toLowerCase();


          const schoolStatuses =
            new Set([
              "review",
              "shortlisted",
              "approved",
              "awarded",
              "rejected"
            ]);


          if (
            !schoolStatuses.has(
              nextStatus
            )
          ) {

            return res
              .status(403)
              .json({
                success:false,
                message:
                  "The school cannot perform this application status change."
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


          /* =================================================
             AWARD LIMIT
          ================================================= */

          if (
            nextStatus ===
            "awarded" &&
            scholarship.numberOfAwards !==
            null &&
            scholarship.numberOfAwards !==
            undefined
          ) {

            if (
              scholarship.awardsGranted >=
              scholarship.numberOfAwards
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    "All available scholarship awards have already been granted."
                });

            }

          }


          application.status =
            nextStatus;

          application.reviewedBy =
            userId;

          application.reviewedAt =
            new Date();


          if (
            nextStatus ===
            "approved"
          ) {

            application.approvedAt =
              new Date();

          }


          if (
            nextStatus ===
            "rejected"
          ) {

            application.rejectedAt =
              new Date();

          }


          if (
            nextStatus ===
            "awarded"
          ) {

            application.awardedAt =
              new Date();


            application.awardAmount =
              numberOrNull(
                req.body.awardAmount
              ) ??
              scholarship.funding?.amount ??
              null;


            application.awardCurrency =
              safeString(
                req.body.awardCurrency ||
                scholarship.funding?.currency ||
                "PHP",
                10
              ).toUpperCase();


            application.awardNotes =
              safeString(
                req.body.awardNotes,
                5000
              );


            await SchoolScholarship
              .updateOne(
                {
                  _id:
                    scholarship._id
                },
                {
                  $inc:{
                    awardsGranted:1
                  }
                }
              );

          }


          addHistory(
            application,
            req,
            nextStatus,
            req.body.statusNote ||
            req.body.reviewerNotes ||
            ""
          );

        }

      }


      else {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot update scholarship applications."
          });

      }


      application.updatedBy =
        userId;


      await application.save();


      const populated =
        await populateApplication(
          ScholarshipApplication
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
        "UPDATE SCHOLARSHIP APPLICATION ERROR:",
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
            "Unable to update the scholarship application."
        });

    }

  }
);


/* =========================================================
   DELETE /api/scholarship-applications/:id

   Only student-owned drafts may be physically deleted.

   Historical submitted applications remain for audit.
========================================================= */

router.delete(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      if (
        !validId(
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
        await ScholarshipApplication
          .findById(
            req.params.id
          );


      if (!application) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Scholarship application not found."
          });

      }


      const role =
        getRole(req);

      const userId =
        getUserId(req);


      if (
        role === "admin"
      ) {

        await application.deleteOne();


        return res.json({
          success:true,
          message:
            "Scholarship application permanently deleted."
        });

      }


      if (
        !STUDENT_ROLES.has(role) ||
        !sameId(
          application.studentId,
          userId
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to delete this application."
          });

      }


      if (
        application.status !==
        "draft"
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Submitted scholarship applications cannot be permanently deleted. Withdraw the application instead."
          });

      }


      await application.deleteOne();


      res.json({
        success:true,
        message:
          "Scholarship application draft deleted."
      });


    } catch (error) {

      console.error(
        "DELETE SCHOLARSHIP APPLICATION ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the scholarship application."
        });

    }

  }
);


module.exports =
  router;
