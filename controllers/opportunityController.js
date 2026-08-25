const mongoose =
  require("mongoose");

const SchoolOpportunity =
  require("../models/SchoolOpportunity");


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


const SCHOOL_ROLES =
  new Set([
    "school"
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


/* =========================================================
   GENERIC HELPERS
========================================================= */

function isValidObjectId(
  value
) {

  return mongoose.Types.ObjectId.isValid(
    String(
      value ||
      ""
    )
  );

}


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


function safeString(
  value,
  fallback = ""
) {

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }


  return String(
    value
  )
    .trim();

}


function stringArray(
  value
) {

  if (
    Array.isArray(value)
  ) {

    return [
      ...new Set(
        value
          .map(item =>
            safeString(item)
          )
          .filter(Boolean)
      )
    ];

  }


  if (
    typeof value ===
      "string"
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


function parseNumber(
  value
) {

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


function parseDate(
  value
) {

  if (!value) {
    return null;
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return date;

}


/* =========================================================
   AUTH HELPERS
========================================================= */

function getAuthUserId(
  req
) {

  return normalizeId(
    req.user?._id ||
    req.user?.id
  );

}


function getAuthRole(
  req
) {

  return safeString(
    req.user?.role
  )
    .toLowerCase();

}


function isAdmin(
  req
) {

  return getAuthRole(req) ===
    "admin";

}


function getAuthenticatedSchoolId(
  req
) {

  const role =
    getAuthRole(req);


  if (
    SCHOOL_ROLES.has(role)
  ) {
    return getAuthUserId(req);
  }


  return normalizeId(
    req.user?.schoolId ||
    req.user?.linkedSchoolId ||
    req.user?.school
  );

}


function getAuthenticatedEmployerId(
  req
) {

  const role =
    getAuthRole(req);


  if (
    EMPLOYER_ROLES.has(role)
  ) {
    return getAuthUserId(req);
  }


  return normalizeId(
    req.user?.companyId ||
    req.user?.employerId ||
    req.user?.company
  );

}


/* =========================================================
   ACCESS CONTROL
========================================================= */

function canManageOpportunity(
  req,
  opportunity
) {

  if (
    isAdmin(req)
  ) {
    return true;
  }


  const userId =
    getAuthUserId(req);


  const role =
    getAuthRole(req);


  if (
    role === "school" &&
    sameId(
      opportunity.schoolId,
      userId
    )
  ) {
    return true;
  }


  if (
    EMPLOYER_ROLES.has(role) &&
    sameId(
      opportunity.employerId,
      userId
    )
  ) {
    return true;
  }


  return false;

}


/* =========================================================
   VISIBILITY

   Managers can see their own records regardless of status.

   Students see published/usable opportunities belonging
   to their school or public opportunities.
========================================================= */

function buildViewerAccessFilter(
  req
) {

  const role =
    getAuthRole(req);


  const userId =
    getAuthUserId(req);


  if (
    role === "admin"
  ) {
    return {};
  }


  if (
    role === "school"
  ) {

    return {
      $or: [
        {
          schoolId:
            userId
        },

        {
          visibility:
            "public",

          status: {
            $in: [
              "approved",
              "open",
              "active"
            ]
          }
        }
      ]
    };

  }


  if (
    EMPLOYER_ROLES.has(role)
  ) {

    return {
      $or: [
        {
          employerId:
            userId
        },

        {
          visibility:
            "public",

          status: {
            $in: [
              "approved",
              "open",
              "active"
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
      getAuthenticatedSchoolId(req);


    const clauses = [
      {
        visibility:
          "public",

        status: {
          $in: [
            "approved",
            "open",
            "active"
          ]
        }
      }
    ];


    if (
      schoolId &&
      isValidObjectId(
        schoolId
      )
    ) {

      clauses.push({
        schoolId,

        visibility: {
          $in: [
            "school",
            "public"
          ]
        },

        status: {
          $in: [
            "approved",
            "open",
            "active"
          ]
        }
      });

    }


    return {
      $or:
        clauses
    };

  }


  return {
    _id: null
  };

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
   VALIDATE OBJECT-ID QUERY VALUE
========================================================= */

function validateObjectIdField(
  value,
  label
) {

  if (
    value &&
    !isValidObjectId(value)
  ) {

    return `${label} is invalid`;

  }


  return null;

}


/* =========================================================
   PAYLOAD SANITIZATION
========================================================= */

function sanitizeOpportunityPayload(
  body = {},
  {
    partial = false
  } = {}
) {

  const payload = {};


  const assignString =
    (
      field,
      maxLength
    ) => {

      if (
        body[field] ===
          undefined
      ) {
        return;
      }


      payload[field] =
        safeString(
          body[field]
        )
          .slice(
            0,
            maxLength
          );

    };


  assignString(
    "title",
    220
  );

  assignString(
    "companyName",
    220
  );

  assignString(
    "summary",
    1000
  );

  assignString(
    "description",
    12000
  );

  assignString(
    "location",
    500
  );

  assignString(
    "durationText",
    250
  );

  assignString(
    "applicationInstructions",
    5000
  );

  assignString(
    "externalApplicationUrl",
    1500
  );


  [
    "type",
    "status",
    "visibility",
    "workSetup",
    "employmentType",
    "source"
  ]
    .forEach(
      field => {

        if (
          body[field] !==
            undefined
        ) {

          payload[field] =
            safeString(
              body[field]
            )
              .toLowerCase();

        }

      }
    );


  [
    "programs",
    "skills",
    "yearLevels",
    "requirements",
    "responsibilities"
  ]
    .forEach(
      field => {

        if (
          body[field] !==
            undefined
        ) {

          payload[field] =
            stringArray(
              body[field]
            );

        }

      }
    );


  [
    "startDate",
    "endDate",
    "deadline"
  ]
    .forEach(
      field => {

        if (
          body[field] !==
            undefined
        ) {

          payload[field] =
            parseDate(
              body[field]
            );

        }

      }
    );


  [
    "slots",
    "filledSlots"
  ]
    .forEach(
      field => {

        if (
          body[field] !==
            undefined
        ) {

          payload[field] =
            parseNumber(
              body[field]
            );

        }

      }
    );


  [
    "allowStudentApplications",
    "allowSchoolRecommendations"
  ]
    .forEach(
      field => {

        if (
          body[field] !==
            undefined
        ) {

          payload[field] =
            body[field] === true ||
            body[field] === "true";

        }

      }
    );


  if (
    body.compensation !==
      undefined
  ) {

    const compensation =
      body.compensation &&
      typeof body.compensation ===
        "object"
        ? body.compensation
        : {};


    payload.compensation = {

      type:
        safeString(
          compensation.type ||
          "not_specified"
        )
          .toLowerCase(),

      amount:
        parseNumber(
          compensation.amount
        ),

      minAmount:
        parseNumber(
          compensation.minAmount
        ),

      maxAmount:
        parseNumber(
          compensation.maxAmount
        ),

      currency:
        safeString(
          compensation.currency ||
          "PHP"
        )
          .toUpperCase(),

      period:
        safeString(
          compensation.period ||
          "unspecified"
        )
          .toLowerCase(),

      notes:
        safeString(
          compensation.notes
        )
          .slice(
            0,
            1000
          )

    };

  }


  if (
    body.contact !==
      undefined
  ) {

    const contact =
      body.contact &&
      typeof body.contact ===
        "object"
        ? body.contact
        : {};


    payload.contact = {

      name:
        safeString(
          contact.name
        )
          .slice(
            0,
            160
          ),

      email:
        safeString(
          contact.email
        )
          .toLowerCase()
          .slice(
            0,
            254
          ),

      phone:
        safeString(
          contact.phone
        )
          .slice(
            0,
            80
          ),

      website:
        safeString(
          contact.website
        )
          .slice(
            0,
            1000
          )

    };

  }


  if (
    !partial &&
    !payload.status
  ) {

    payload.status =
      "draft";

  }


  return payload;

}


/* =========================================================
   POPULATION
========================================================= */

function populateOpportunity(
  query
) {

  return query

    .populate(
      "schoolId",
      [
        "name",
        "schoolName",
        "profileImage",
        "schoolLogo",
        "avatar",
        "profilePicture",
        "email",
        "location",
        "address"
      ]
        .join(" ")
    )

    .populate(
      "employerId",
      [
        "name",
        "companyName",
        "profileImage",
        "avatar",
        "profilePicture",
        "logo",
        "email",
        "industry",
        "location",
        "address"
      ]
        .join(" ")
    )

    .populate(
      "createdBy",
      "name fullName role profileImage avatar"
    );

}


/* =========================================================
   GET /api/opportunities
========================================================= */

exports.getOpportunities =
  async (
    req,
    res
  ) => {

    try {

      const {
        schoolId,
        employerId,
        companyId,
        type,
        status,
        visibility,
        search
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


      const requestedFilter = {};


      if (schoolId) {

        const error =
          validateObjectIdField(
            schoolId,
            "schoolId"
          );


        if (error) {

          return res
            .status(400)
            .json({
              success:false,
              message:error
            });

        }


        requestedFilter.schoolId =
          schoolId;

      }


      const finalEmployerId =
        employerId ||
        companyId;


      if (finalEmployerId) {

        const error =
          validateObjectIdField(
            finalEmployerId,
            "employerId"
          );


        if (error) {

          return res
            .status(400)
            .json({
              success:false,
              message:error
            });

        }


        requestedFilter.employerId =
          finalEmployerId;

      }


      if (type) {

        requestedFilter.type =
          safeString(type)
            .toLowerCase();

      }


      if (status) {

        requestedFilter.status =
          safeString(status)
            .toLowerCase();

      }


      if (visibility) {

        requestedFilter.visibility =
          safeString(
            visibility
          )
            .toLowerCase();

      }


      if (search) {

        const searchValue =
          safeString(
            search
          );


        if (searchValue) {

          requestedFilter.$or = [

            {
              title:{
                $regex:
                  searchValue,
                $options:"i"
              }
            },

            {
              companyName:{
                $regex:
                  searchValue,
                $options:"i"
              }
            },

            {
              description:{
                $regex:
                  searchValue,
                $options:"i"
              }
            },

            {
              location:{
                $regex:
                  searchValue,
                $options:"i"
              }
            }

          ];

        }

      }


      const accessFilter =
        buildViewerAccessFilter(
          req
        );


      const filter = {
        $and:[
          accessFilter,
          requestedFilter
        ]
      };


      const [
        items,
        total
      ] =
        await Promise.all([

          populateOpportunity(
            SchoolOpportunity
              .find(filter)
          )
            .sort({
              createdAt:-1
            })
            .skip(skip)
            .limit(limit)
            .lean({
              virtuals:true
            }),

          SchoolOpportunity
            .countDocuments(
              filter
            )

        ]);


      res.json({

        success:true,

        items,

        opportunities:
          items,

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
        "GET OPPORTUNITIES ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to load opportunities."

        });

    }

  };


/* =========================================================
   GET /api/opportunities/:id
========================================================= */

exports.getOpportunityById =
  async (
    req,
    res
  ) => {

    try {

      const id =
        req.params.id;


      if (
        !isValidObjectId(id)
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid opportunity id."

          });

      }


      const opportunity =
        await populateOpportunity(
          SchoolOpportunity
            .findById(id)
        )
          .lean({
            virtuals:true
          });


      if (!opportunity) {

        return res
          .status(404)
          .json({

            success:false,

            message:
              "Opportunity not found."

          });

      }


      const canManage =
        canManageOpportunity(
          req,
          opportunity
        );


      if (!canManage) {

        const accessFilter =
          buildViewerAccessFilter(
            req
          );


        const visible =
          await SchoolOpportunity
            .exists({
              _id:id,
              ...accessFilter
            });


        if (!visible) {

          return res
            .status(403)
            .json({

              success:false,

              message:
                "You are not allowed to view this opportunity."

            });

        }

      }


      res.json({

        success:true,

        item:
          opportunity,

        opportunity

      });


    } catch (error) {

      console.error(
        "GET OPPORTUNITY ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to load the opportunity."

        });

    }

  };


/* =========================================================
   POST /api/opportunities
========================================================= */

exports.createOpportunity =
  async (
    req,
    res
  ) => {

    try {

      const role =
        getAuthRole(req);


      const userId =
        getAuthUserId(req);


      if (
        !MANAGER_ROLES.has(role)
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "Your account cannot create Career Hub opportunities."

          });

      }


      const payload =
        sanitizeOpportunityPayload(
          req.body
        );


      if (!payload.title) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Opportunity title is required."

          });

      }


      /*
        Ownership comes from authenticated identity.

        We do NOT trust browser-supplied schoolId/companyId
        for normal school/employer creation.
      */

      if (
        role ===
          "school"
      ) {

        payload.schoolId =
          userId;

        payload.source =
          "school";

      } else if (
        EMPLOYER_ROLES.has(
          role
        )
      ) {

        payload.employerId =
          userId;

        payload.source =
          "employer";

      } else if (
        role ===
          "admin"
      ) {

        const requestedSchoolId =
          normalizeId(
            req.body.schoolId
          );


        const requestedEmployerId =
          normalizeId(
            req.body.employerId ||
            req.body.companyId
          );


        if (
          requestedSchoolId
        ) {

          if (
            !isValidObjectId(
              requestedSchoolId
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


          payload.schoolId =
            requestedSchoolId;

        }


        if (
          requestedEmployerId
        ) {

          if (
            !isValidObjectId(
              requestedEmployerId
            )
          ) {

            return res
              .status(400)
              .json({

                success:false,

                message:
                  "employerId is invalid."

              });

          }


          payload.employerId =
            requestedEmployerId;

        }


        payload.source =
          "admin";

      }


      if (
        !payload.schoolId &&
        !payload.employerId
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "The opportunity must belong to a school or company."

          });

      }


      payload.createdBy =
        userId;


      payload.updatedBy =
        userId;


      /*
        Publishing semantics.

        Legacy frontend can still send "open" or "active".
      */

      if (
        [
          "approved",
          "open",
          "active"
        ]
          .includes(
            payload.status
          )
      ) {

        payload.publishedAt =
          new Date();

      }


      const created =
        await SchoolOpportunity
          .create(
            payload
          );


      const populated =
        await populateOpportunity(
          SchoolOpportunity
            .findById(
              created._id
            )
        )
          .lean({
            virtuals:true
          });


      res
        .status(201)
        .json({

          success:true,

          item:
            populated,

          opportunity:
            populated

        });


    } catch (error) {

      console.error(
        "CREATE OPPORTUNITY ERROR:",
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
            "Unable to create the opportunity."

        });

    }

  };


/* =========================================================
   PATCH /api/opportunities/:id
========================================================= */

exports.updateOpportunity =
  async (
    req,
    res
  ) => {

    try {

      const id =
        req.params.id;


      if (
        !isValidObjectId(id)
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid opportunity id."

          });

      }


      const opportunity =
        await SchoolOpportunity
          .findById(id);


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
        !canManageOpportunity(
          req,
          opportunity
        )
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "You are not allowed to update this opportunity."

          });

      }


      const payload =
        sanitizeOpportunityPayload(
          req.body,
          {
            partial:true
          }
        );


      /*
        Ownership fields are intentionally excluded.

        Updating content must never allow changing the owner.
      */

      delete payload.schoolId;
      delete payload.employerId;
      delete payload.createdBy;


      const previousStatus =
        opportunity.status;


      Object.entries(
        payload
      )
        .forEach(
          (
            [
              field,
              value
            ]
          ) => {

            opportunity[field] =
              value;

          }
        );


      opportunity.updatedBy =
        getAuthUserId(req);


      if (
        [
          "approved",
          "open",
          "active"
        ]
          .includes(
            opportunity.status
          ) &&
        !opportunity.publishedAt
      ) {

        opportunity.publishedAt =
          new Date();

      }


      if (
        opportunity.status ===
          "closed" &&
        previousStatus !==
          "closed"
      ) {

        opportunity.closedAt =
          new Date();

      }


      if (
        opportunity.status ===
          "archived"
      ) {

        opportunity.archivedAt =
          opportunity.archivedAt ||
          new Date();

      }


      await opportunity.save();


      const populated =
        await populateOpportunity(
          SchoolOpportunity
            .findById(
              opportunity._id
            )
        )
          .lean({
            virtuals:true
          });


      res.json({

        success:true,

        item:
          populated,

        opportunity:
          populated

      });


    } catch (error) {

      console.error(
        "UPDATE OPPORTUNITY ERROR:",
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
            "Unable to update the opportunity."

        });

    }

  };


/* =========================================================
   DELETE /api/opportunities/:id

   Hard delete is restricted to drafts.

   Anything that may already have student activity should be
   archived instead of physically deleted.
========================================================= */

exports.deleteOpportunity =
  async (
    req,
    res
  ) => {

    try {

      const id =
        req.params.id;


      if (
        !isValidObjectId(id)
      ) {

        return res
          .status(400)
          .json({

            success:false,

            message:
              "Invalid opportunity id."

          });

      }


      const opportunity =
        await SchoolOpportunity
          .findById(id);


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
        !canManageOpportunity(
          req,
          opportunity
        )
      ) {

        return res
          .status(403)
          .json({

            success:false,

            message:
              "You are not allowed to delete this opportunity."

          });

      }


      if (
        ![
          "draft",
          "rejected"
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
              "Published or active opportunities cannot be permanently deleted. Archive the opportunity instead."

          });

      }


      await opportunity
        .deleteOne();


      res.json({

        success:true,

        message:
          "Opportunity deleted successfully."

      });


    } catch (error) {

      console.error(
        "DELETE OPPORTUNITY ERROR:",
        error
      );


      res
        .status(500)
        .json({

          success:false,

          message:
            "Unable to delete the opportunity."

        });

    }

  };
