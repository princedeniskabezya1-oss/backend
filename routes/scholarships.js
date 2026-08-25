const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const SchoolScholarship =
  require("../models/SchoolScholarship");


const router =
  express.Router();


router.use(auth);


/* =========================================================
   CONSTANTS
========================================================= */

const SCHOOL_ROLES =
  new Set([
    "school"
  ]);


const STUDENT_ROLES =
  new Set([
    "student",
    "talent"
  ]);


const VALID_STATUSES =
  new Set([
    "draft",
    "published",
    "open",
    "closed",
    "completed",
    "cancelled",
    "archived"
  ]);


const VALID_TYPES =
  new Set([
    "academic",
    "merit",
    "need_based",
    "athletic",
    "research",
    "leadership",
    "community",
    "company_sponsored",
    "government",
    "international",
    "other"
  ]);


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


function sameId(a, b) {

  const left =
    normalizeId(a);

  const right =
    normalizeId(b);

  return Boolean(
    left &&
    right &&
    left === right
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


function getStudentSchoolId(req) {

  return normalizeId(
    req.user?.schoolId ||
    req.user?.linkedSchoolId ||
    req.user?.school
  );

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


function dateOrNull(value) {

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
   ACCESS
========================================================= */

function canManage(
  req,
  scholarship
) {

  if (
    getRole(req) === "admin"
  ) {
    return true;
  }


  return (
    getRole(req) === "school" &&
    sameId(
      scholarship.schoolId,
      getUserId(req)
    )
  );

}


function viewerFilter(req) {

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
      $or:[
        {
          schoolId:userId
        },

        {
          visibility:"public",
          status:{
            $in:[
              "published",
              "open"
            ]
          }
        }
      ]
    };

  }


  if (
    STUDENT_ROLES.has(role)
  ) {

    const schoolId =
      getStudentSchoolId(req);


    const conditions = [
      {
        visibility:"public",

        status:{
          $in:[
            "published",
            "open"
          ]
        }
      }
    ];


    if (
      schoolId &&
      validId(schoolId)
    ) {

      conditions.push({
        schoolId,

        visibility:{
          $in:[
            "school",
            "public"
          ]
        },

        status:{
          $in:[
            "published",
            "open"
          ]
        }
      });

    }


    return {
      $or:conditions
    };

  }


  return {
    _id:null
  };

}


/* =========================================================
   POPULATION
========================================================= */

function populateScholarship(query) {

  return query

    .populate(
      "schoolId",
      [
        "name",
        "schoolName",
        "email",
        "schoolLogo",
        "profileImage",
        "profilePicture",
        "location",
        "address"
      ].join(" ")
    )

    .populate(
      "partnershipId",
      [
        "title",
        "companyName",
        "type",
        "status",
        "companyId"
      ].join(" ")
    )

    .populate(
      "createdBy",
      "name fullName role email"
    );

}


/* =========================================================
   GET /api/scholarships
========================================================= */

router.get(
  "/",
  async (req, res) => {

    try {

      const requested = {};


      if (req.query.schoolId) {

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
                "schoolId is invalid."
            });

        }


        requested.schoolId =
          req.query.schoolId;

      }


      if (req.query.status) {

        const status =
          safeString(
            req.query.status,
            100
          ).toLowerCase();


        if (
          !VALID_STATUSES.has(status)
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid scholarship status."
            });

        }


        requested.status =
          status;

      }


      if (req.query.type) {

        const type =
          safeString(
            req.query.type,
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
                "Invalid scholarship type."
            });

        }


        requested.type =
          type;

      }


      if (req.query.search) {

        const search =
          safeString(
            req.query.search,
            300
          );


        requested.$or = [
          {
            title:{
              $regex:search,
              $options:"i"
            }
          },

          {
            description:{
              $regex:search,
              $options:"i"
            }
          },

          {
            summary:{
              $regex:search,
              $options:"i"
            }
          }
        ];

      }


      const filter = {
        $and:[
          viewerFilter(req),
          requested
        ]
      };


      const scholarships =
        await populateScholarship(
          SchoolScholarship.find(
            filter
          )
        )
          .sort({
            deadline:1,
            createdAt:-1
          })
          .lean();


      res.json({
        success:true,
        scholarships,
        items:scholarships
      });


    } catch (error) {

      console.error(
        "GET SCHOLARSHIPS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load scholarships."
        });

    }

  }
);


/* =========================================================
   GET /api/scholarships/:id
========================================================= */

router.get(
  "/:id",
  async (req, res) => {

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
              "Invalid scholarship id."
          });

      }


      const scholarship =
        await populateScholarship(
          SchoolScholarship
            .findById(
              req.params.id
            )
        )
          .lean();


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
        !canManage(
          req,
          scholarship
        )
      ) {

        const visible =
          await SchoolScholarship.exists({
            _id:scholarship._id,
            ...viewerFilter(req)
          });


        if (!visible) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "You are not allowed to view this scholarship."
            });

        }

      }


      res.json({
        success:true,
        scholarship,
        item:scholarship
      });


    } catch (error) {

      console.error(
        "GET SCHOLARSHIP ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the scholarship."
        });

    }

  }
);


/* =========================================================
   POST /api/scholarships
========================================================= */

router.post(
  "/",
  async (req, res) => {

    try {

      const role =
        getRole(req);

      const userId =
        getUserId(req);


      if (
        role !== "school" &&
        role !== "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot create scholarships."
          });

      }


      let schoolId =
        role === "school"
          ? userId
          : normalizeId(
              req.body.schoolId
            );


      if (
        !validId(schoolId)
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid school is required."
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
              "Scholarship title is required."
          });

      }


      const type =
        safeString(
          req.body.type ||
          "academic",
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
              "Invalid scholarship type."
          });

      }


      const sponsor =
        req.body.sponsor &&
        typeof req.body.sponsor ===
          "object"
          ? req.body.sponsor
          : {};


      const funding =
        req.body.funding &&
        typeof req.body.funding ===
          "object"
          ? req.body.funding
          : {};


      const eligibility =
        req.body.eligibility &&
        typeof req.body.eligibility ===
          "object"
          ? req.body.eligibility
          : {};


      const scholarship =
        await SchoolScholarship.create({
          schoolId,

          partnershipId:
            validId(
              req.body.partnershipId
            )
              ? req.body.partnershipId
              : null,

          createdBy:userId,
          updatedBy:userId,

          title,

          summary:
            safeString(
              req.body.summary,
              1500
            ),

          description:
            safeString(
              req.body.description
            ),

          type,

          status:"draft",

          visibility:
            safeString(
              req.body.visibility ||
              "school",
              100
            ).toLowerCase(),

          sponsor:{
            name:
              safeString(
                sponsor.name,
                250
              ),

            type:
              safeString(
                sponsor.type ||
                "school",
                100
              ).toLowerCase(),

            organizationId:
              validId(
                sponsor.organizationId
              )
                ? sponsor.organizationId
                : null,

            website:
              safeString(
                sponsor.website,
                1500
              )
          },

          funding:{
            type:
              safeString(
                funding.type ||
                "partial",
                100
              ).toLowerCase(),

            amount:
              numberOrNull(
                funding.amount
              ),

            currency:
              safeString(
                funding.currency ||
                "PHP",
                10
              ).toUpperCase(),

            percentage:
              numberOrNull(
                funding.percentage
              ),

            tuitionCovered:
              funding.tuitionCovered ===
              true,

            allowanceIncluded:
              funding.allowanceIncluded ===
              true,

            allowanceAmount:
              numberOrNull(
                funding.allowanceAmount
              ),

            allowancePeriod:
              safeString(
                funding.allowancePeriod ||
                "unspecified",
                100
              ).toLowerCase(),

            notes:
              safeString(
                funding.notes,
                3000
              )
          },

          numberOfAwards:
            numberOrNull(
              req.body.numberOfAwards
            ),

          eligibility:{
            minimumGPA:
              numberOrNull(
                eligibility.minimumGPA
              ),

            minimumGradeAverage:
              numberOrNull(
                eligibility.minimumGradeAverage
              ),

            programs:
              stringArray(
                eligibility.programs
              ),

            yearLevels:
              stringArray(
                eligibility.yearLevels
              ),

            nationalities:
              stringArray(
                eligibility.nationalities
              ),

            residencyRequirements:
              safeString(
                eligibility.residencyRequirements,
                2000
              ),

            financialNeedRequired:
              eligibility.financialNeedRequired ===
              true,

            enrolledRequired:
              eligibility.enrolledRequired !==
              false,

            graduatingStudentsAllowed:
              eligibility.graduatingStudentsAllowed !==
              false,

            otherCriteria:
              stringArray(
                eligibility.otherCriteria
              )
          },

          requirements:
            stringArray(
              req.body.requirements
            ),

          requiredDocuments:
            stringArray(
              req.body.requiredDocuments
            ),

          applicationInstructions:
            safeString(
              req.body.applicationInstructions,
              8000
            ),

          externalApplicationUrl:
            safeString(
              req.body.externalApplicationUrl,
              1500
            ),

          allowInternalApplications:
            req.body.allowInternalApplications !==
            false,

          applicationOpenDate:
            dateOrNull(
              req.body.applicationOpenDate
            ),

          deadline:
            dateOrNull(
              req.body.deadline
            ),

          awardDate:
            dateOrNull(
              req.body.awardDate
            ),

          academicYear:
            safeString(
              req.body.academicYear,
              100
            ),

          semester:
            safeString(
              req.body.semester,
              100
            )
        });


      const populated =
        await populateScholarship(
          SchoolScholarship
            .findById(
              scholarship._id
            )
        )
          .lean();


      res
        .status(201)
        .json({
          success:true,
          scholarship:populated,
          item:populated
        });


    } catch (error) {

      console.error(
        "CREATE SCHOLARSHIP ERROR:",
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
            message:error.message
          });

      }


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to create the scholarship."
        });

    }

  }
);


/* =========================================================
   PATCH /api/scholarships/:id
========================================================= */

router.patch(
  "/:id",
  async (req, res) => {

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
              "Invalid scholarship id."
          });

      }


      const scholarship =
        await SchoolScholarship
          .findById(
            req.params.id
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
        !canManage(
          req,
          scholarship
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to update this scholarship."
          });

      }


      if (
        req.body.title !==
        undefined
      ) {

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
                "Scholarship title cannot be empty."
            });

        }


        scholarship.title =
          title;

      }


      const stringFields = [
        ["summary", 1500],
        ["description", 15000],
        ["applicationInstructions", 8000],
        ["externalApplicationUrl", 1500],
        ["academicYear", 100],
        ["semester", 100]
      ];


      stringFields.forEach(
        ([field, max]) => {

          if (
            req.body[field] !==
            undefined
          ) {

            scholarship[field] =
              safeString(
                req.body[field],
                max
              );

          }

        }
      );


      if (
        req.body.type !==
        undefined
      ) {

        const type =
          safeString(
            req.body.type,
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
                "Invalid scholarship type."
            });

        }


        scholarship.type =
          type;

      }


      if (
        req.body.status !==
        undefined
      ) {

        const status =
          safeString(
            req.body.status,
            100
          ).toLowerCase();


        if (
          !VALID_STATUSES.has(status)
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid scholarship status."
            });

        }


        scholarship.status =
          status;


        if (
          [
            "published",
            "open"
          ].includes(status) &&
          !scholarship.publishedAt
        ) {

          scholarship.publishedAt =
            new Date();

        }


        if (
          status === "closed" &&
          !scholarship.closedAt
        ) {

          scholarship.closedAt =
            new Date();

        }


        if (
          status === "archived" &&
          !scholarship.archivedAt
        ) {

          scholarship.archivedAt =
            new Date();

        }

      }


      if (
        req.body.visibility !==
        undefined
      ) {

        scholarship.visibility =
          safeString(
            req.body.visibility,
            100
          ).toLowerCase();

      }


      [
        "requirements",
        "requiredDocuments"
      ].forEach(
        field => {

          if (
            req.body[field] !==
            undefined
          ) {

            scholarship[field] =
              stringArray(
                req.body[field]
              );

          }

        }
      );


      [
        "applicationOpenDate",
        "deadline",
        "awardDate"
      ].forEach(
        field => {

          if (
            req.body[field] !==
            undefined
          ) {

            scholarship[field] =
              dateOrNull(
                req.body[field]
              );

          }

        }
      );


      if (
        req.body.numberOfAwards !==
        undefined
      ) {

        scholarship.numberOfAwards =
          numberOrNull(
            req.body.numberOfAwards
          );

      }


      if (
        req.body.allowInternalApplications !==
        undefined
      ) {

        scholarship.allowInternalApplications =
          req.body.allowInternalApplications ===
          true ||
          req.body.allowInternalApplications ===
          "true";

      }


      if (
        req.body.funding &&
        typeof req.body.funding ===
        "object"
      ) {

        const funding =
          req.body.funding;


        if (
          funding.type !==
          undefined
        ) {
          scholarship.funding.type =
            safeString(
              funding.type,
              100
            ).toLowerCase();
        }


        if (
          funding.amount !==
          undefined
        ) {
          scholarship.funding.amount =
            numberOrNull(
              funding.amount
            );
        }


        if (
          funding.currency !==
          undefined
        ) {
          scholarship.funding.currency =
            safeString(
              funding.currency,
              10
            ).toUpperCase();
        }


        if (
          funding.percentage !==
          undefined
        ) {
          scholarship.funding.percentage =
            numberOrNull(
              funding.percentage
            );
        }


        if (
          funding.tuitionCovered !==
          undefined
        ) {
          scholarship.funding.tuitionCovered =
            funding.tuitionCovered ===
            true ||
            funding.tuitionCovered ===
            "true";
        }


        if (
          funding.allowanceIncluded !==
          undefined
        ) {
          scholarship.funding.allowanceIncluded =
            funding.allowanceIncluded ===
            true ||
            funding.allowanceIncluded ===
            "true";
        }


        if (
          funding.allowanceAmount !==
          undefined
        ) {
          scholarship.funding.allowanceAmount =
            numberOrNull(
              funding.allowanceAmount
            );
        }

      }


      if (
        req.body.eligibility &&
        typeof req.body.eligibility ===
        "object"
      ) {

        const eligibility =
          req.body.eligibility;


        if (
          eligibility.minimumGPA !==
          undefined
        ) {
          scholarship.eligibility.minimumGPA =
            numberOrNull(
              eligibility.minimumGPA
            );
        }


        if (
          eligibility.minimumGradeAverage !==
          undefined
        ) {
          scholarship.eligibility.minimumGradeAverage =
            numberOrNull(
              eligibility.minimumGradeAverage
            );
        }


        [
          "programs",
          "yearLevels",
          "nationalities",
          "otherCriteria"
        ].forEach(
          field => {

            if (
              eligibility[field] !==
              undefined
            ) {

              scholarship.eligibility[field] =
                stringArray(
                  eligibility[field]
                );

            }

          }
        );


        if (
          eligibility.financialNeedRequired !==
          undefined
        ) {

          scholarship.eligibility.financialNeedRequired =
            eligibility.financialNeedRequired ===
            true ||
            eligibility.financialNeedRequired ===
            "true";

        }

      }


      scholarship.updatedBy =
        getUserId(req);


      await scholarship.save();


      const populated =
        await populateScholarship(
          SchoolScholarship
            .findById(
              scholarship._id
            )
        )
          .lean();


      res.json({
        success:true,
        scholarship:populated,
        item:populated
      });


    } catch (error) {

      console.error(
        "UPDATE SCHOLARSHIP ERROR:",
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
            message:error.message
          });

      }


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to update the scholarship."
        });

    }

  }
);


/* =========================================================
   DELETE /api/scholarships/:id

   Only unused drafts should be physically deleted.
========================================================= */

router.delete(
  "/:id",
  async (req, res) => {

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
              "Invalid scholarship id."
          });

      }


      const scholarship =
        await SchoolScholarship
          .findById(
            req.params.id
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
        !canManage(
          req,
          scholarship
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to delete this scholarship."
          });

      }


      if (
        scholarship.status !==
        "draft" ||
        scholarship.applicationCount > 0
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Published scholarships or scholarships with applications cannot be permanently deleted. Archive them instead."
          });

      }


      await scholarship.deleteOne();


      res.json({
        success:true,
        message:
          "Scholarship deleted successfully."
      });


    } catch (error) {

      console.error(
        "DELETE SCHOLARSHIP ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the scholarship."
        });

    }

  }
);


module.exports =
  router;
