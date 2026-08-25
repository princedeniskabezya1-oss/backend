const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const CareerEvent =
  require("../models/CareerEvent");

const User =
  require("../models/User");

const router =
  express.Router();


/* =========================================================
   AUTH
========================================================= */

router.use(auth);


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


const STUDENT_ROLES =
  new Set([
    "student",
    "talent"
  ]);


const EVENT_TYPES =
  new Set([
    "career_fair",
    "recruitment",
    "seminar",
    "webinar",
    "workshop",
    "networking",
    "company_talk",
    "orientation",
    "mentorship",
    "competition",
    "hackathon",
    "portfolio_review",
    "mock_interview",
    "job_fair",
    "internship_fair",
    "other"
  ]);


const EVENT_FORMATS =
  new Set([
    "physical",
    "online",
    "hybrid"
  ]);


const EVENT_VISIBILITIES =
  new Set([
    "public",
    "school",
    "invited"
  ]);


const EVENT_STATUSES =
  new Set([
    "draft",
    "published",
    "registration_open",
    "registration_closed",
    "ongoing",
    "completed",
    "cancelled",
    "archived"
  ]);


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


function validObjectId(
  value
) {

  return mongoose.Types.ObjectId.isValid(
    normalizeId(value)
  );

}


function safeString(
  value,
  max = 20000
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


function getUserId(
  req
) {

  return normalizeId(
    req.user?._id ||
    req.user?.id
  );

}


function getRole(
  req
) {

  return safeString(
    req.user?.role,
    100
  )
    .toLowerCase();

}


function getStudentSchoolId(
  req
) {

  return normalizeId(
    req.user?.schoolId ||
    req.user?.linkedSchoolId ||
    req.user?.school
  );

}


function stringArray(
  value,
  maxItemLength = 300
) {

  if (
    Array.isArray(value)
  ) {

    return [
      ...new Set(
        value
          .map(item =>
            safeString(
              item,
              maxItemLength
            )
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


function numberOrNull(
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


function dateOrNull(
  value
) {

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
   SLUG
========================================================= */

function slugify(
  value
) {

  return safeString(
    value,
    300
  )
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      180
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
        30,
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

function populateEvent(
  query
) {

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
      ]
        .join(" ")
    )

    .populate(
      "companyId",
      [
        "name",
        "companyName",
        "email",
        "logo",
        "profileImage",
        "profilePicture",
        "industry",
        "location",
        "address"
      ]
        .join(" ")
    )

    .populate(
      "createdBy",
      "name fullName role email profileImage avatar"
    )

    .populate(
      "updatedBy",
      "name fullName role email"
    );

}


/* =========================================================
   OWNER ACCESS
========================================================= */

function canManageEvent(
  req,
  event
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
      event.schoolId,
      userId
    )
  ) {

    return true;

  }


  if (
    COMPANY_ROLES.has(role) &&
    sameId(
      event.companyId,
      userId
    )
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   EVENT VISIBILITY
========================================================= */

function buildViewerFilter(
  req
) {

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
          schoolId:
            userId
        },

        {
          visibility:
            "public",

          status:{
            $in:[
              "published",
              "registration_open",
              "registration_closed",
              "ongoing"
            ]
          },

          archived:false
        }
      ]
    };

  }


  if (
    COMPANY_ROLES.has(role)
  ) {

    return {
      $or:[
        {
          companyId:
            userId
        },

        {
          visibility:
            "public",

          status:{
            $in:[
              "published",
              "registration_open",
              "registration_closed",
              "ongoing"
            ]
          },

          archived:false
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
        visibility:
          "public",

        status:{
          $in:[
            "published",
            "registration_open",
            "registration_closed",
            "ongoing"
          ]
        },

        archived:false
      }
    ];


    if (
      schoolId &&
      validObjectId(
        schoolId
      )
    ) {

      conditions.push({
        schoolId,

        visibility:
          "school",

        status:{
          $in:[
            "published",
            "registration_open",
            "registration_closed",
            "ongoing"
          ]
        },

        archived:false
      });

    }


    return {
      $or:
        conditions
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
      "published",
      "registration_open",
      "cancelled",
      "archived"
    ]),

  published:
    new Set([
      "registration_open",
      "registration_closed",
      "ongoing",
      "cancelled",
      "archived"
    ]),

  registration_open:
    new Set([
      "registration_closed",
      "ongoing",
      "cancelled",
      "archived"
    ]),

  registration_closed:
    new Set([
      "registration_open",
      "ongoing",
      "cancelled",
      "archived"
    ]),

  ongoing:
    new Set([
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
   VALIDATE BASIC EVENT DATES
========================================================= */

function validateDates({
  startAt,
  endAt,
  registrationOpenAt,
  registrationDeadline
}) {

  if (
    !startAt ||
    !endAt
  ) {

    return "Event start and end time are required.";

  }


  if (
    endAt <=
    startAt
  ) {

    return "Event end time must be after the start time.";

  }


  if (
    registrationOpenAt &&
    registrationDeadline &&
    registrationDeadline <
      registrationOpenAt
  ) {

    return "Registration deadline cannot be before registration opens.";

  }


  if (
    registrationDeadline &&
    registrationDeadline >
      startAt
  ) {

    return "Registration deadline cannot be after the event starts.";

  }


  return null;

}


/* =========================================================
   BUILD LOCATION
========================================================= */

function buildLocation(
  source = {}
) {

  return {
    venueName:
      safeString(
        source.venueName,
        300
      ),

    address:
      safeString(
        source.address,
        1000
      ),

    city:
      safeString(
        source.city,
        200
      ),

    province:
      safeString(
        source.province,
        200
      ),

    country:
      safeString(
        source.country ||
        "Philippines",
        200
      ),

    room:
      safeString(
        source.room,
        200
      ),

    latitude:
      numberOrNull(
        source.latitude
      ),

    longitude:
      numberOrNull(
        source.longitude
      )
  };

}


/* =========================================================
   NORMALIZE SPEAKERS
========================================================= */

function buildSpeakers(
  speakers
) {

  if (
    !Array.isArray(
      speakers
    )
  ) {

    return [];

  }


  return speakers

    .filter(
      speaker =>
        speaker &&
        safeString(
          speaker.name,
          300
        )
    )

    .slice(
      0,
      100
    )

    .map(
      speaker => ({
        name:
          safeString(
            speaker.name,
            300
          ),

        title:
          safeString(
            speaker.title,
            300
          ),

        organization:
          safeString(
            speaker.organization,
            300
          ),

        bio:
          safeString(
            speaker.bio,
            5000
          ),

        avatar:
          safeString(
            speaker.avatar,
            2000
          ),

        profileUrl:
          safeString(
            speaker.profileUrl,
            2000
          )
      })
    );

}


/* =========================================================
   NORMALIZE AGENDA
========================================================= */

function buildAgenda(
  agenda
) {

  if (
    !Array.isArray(
      agenda
    )
  ) {

    return [];

  }


  return agenda

    .filter(
      item =>
        item &&
        safeString(
          item.title,
          300
        )
    )

    .slice(
      0,
      200
    )

    .map(
      item => ({
        title:
          safeString(
            item.title,
            300
          ),

        description:
          safeString(
            item.description,
            3000
          ),

        startTime:
          dateOrNull(
            item.startTime
          ),

        endTime:
          dateOrNull(
            item.endTime
          ),

        speaker:
          safeString(
            item.speaker,
            300
          )
      })
    );

}


/* =========================================================
   GET /api/career-events
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
        eventType,
        format,
        status,
        visibility,
        search,
        upcoming,
        featured
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


        requestedFilter.schoolId =
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


        requestedFilter.companyId =
          companyId;

      }


      if (eventType) {

        const normalizedType =
          safeString(
            eventType,
            100
          )
            .toLowerCase();


        if (
          !EVENT_TYPES.has(
            normalizedType
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event type."
            });

        }


        requestedFilter.eventType =
          normalizedType;

      }


      if (format) {

        const normalizedFormat =
          safeString(
            format,
            100
          )
            .toLowerCase();


        if (
          !EVENT_FORMATS.has(
            normalizedFormat
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event format."
            });

        }


        requestedFilter.format =
          normalizedFormat;

      }


      if (status) {

        const normalizedStatus =
          safeString(
            status,
            100
          )
            .toLowerCase();


        if (
          !EVENT_STATUSES.has(
            normalizedStatus
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event status."
            });

        }


        requestedFilter.status =
          normalizedStatus;

      }


      if (visibility) {

        const normalizedVisibility =
          safeString(
            visibility,
            100
          )
            .toLowerCase();


        if (
          !EVENT_VISIBILITIES.has(
            normalizedVisibility
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event visibility."
            });

        }


        requestedFilter.visibility =
          normalizedVisibility;

      }


      if (
        String(upcoming) ===
          "true"
      ) {

        requestedFilter.startAt = {
          $gte:
            new Date()
        };

      }


      if (
        String(featured) ===
          "true"
      ) {

        requestedFilter.featured =
          true;

      }


      if (search) {

        const searchValue =
          safeString(
            search,
            300
          );


        requestedFilter.$or = [
          {
            title:{
              $regex:
                searchValue,
              $options:"i"
            }
          },

          {
            shortDescription:{
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
            tags:{
              $regex:
                searchValue,
              $options:"i"
            }
          }
        ];

      }


      const filter = {
        $and:[
          buildViewerFilter(
            req
          ),
          requestedFilter
        ]
      };


      const [
        events,
        total
      ] =
        await Promise.all([

          populateEvent(
            CareerEvent
              .find(filter)
          )
            .sort({
              featured:-1,
              startAt:1,
              createdAt:-1
            })
            .skip(skip)
            .limit(limit)
            .lean({
              virtuals:true
            }),

          CareerEvent
            .countDocuments(
              filter
            )

        ]);


      res.json({
        success:true,

        events,

        items:
          events,

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
        "GET CAREER EVENTS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load career events."
        });

    }

  }
);


/* =========================================================
   GET /api/career-events/:id
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
              "Invalid event id."
          });

      }


      const event =
        await populateEvent(
          CareerEvent
            .findById(
              req.params.id
            )
        )
          .lean({
            virtuals:true
          });


      if (!event) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Career event not found."
          });

      }


      if (
        !canManageEvent(
          req,
          event
        )
      ) {

        const visible =
          await CareerEvent
            .exists({
              _id:
                event._id,
              ...buildViewerFilter(
                req
              )
            });


        if (!visible) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "You are not allowed to view this event."
            });

        }

      }


      res.json({
        success:true,

        event,

        item:
          event
      });


    } catch (error) {

      console.error(
        "GET CAREER EVENT ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the career event."
        });

    }

  }
);


/* =========================================================
   POST /api/career-events

   Schools and companies can create events.
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
        role !==
          "school" &&
        !COMPANY_ROLES.has(
          role
        ) &&
        role !==
          "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot create Career Hub events."
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
              "Event title is required."
          });

      }


      const startAt =
        dateOrNull(
          req.body.startAt
        );


      const endAt =
        dateOrNull(
          req.body.endAt
        );


      const registrationOpenAt =
        dateOrNull(
          req.body.registrationOpenAt
        );


      const registrationDeadline =
        dateOrNull(
          req.body.registrationDeadline
        );


      const dateError =
        validateDates({
          startAt,
          endAt,
          registrationOpenAt,
          registrationDeadline
        });


      if (dateError) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              dateError
          });

      }


      const eventType =
        safeString(
          req.body.eventType ||
          "career_fair",
          100
        )
          .toLowerCase();


      if (
        !EVENT_TYPES.has(
          eventType
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid event type."
          });

      }


      const format =
        safeString(
          req.body.format ||
          "physical",
          100
        )
          .toLowerCase();


      if (
        !EVENT_FORMATS.has(
          format
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid event format."
          });

      }


      const visibility =
        safeString(
          req.body.visibility ||
          "public",
          100
        )
          .toLowerCase();


      if (
        !EVENT_VISIBILITIES.has(
          visibility
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid event visibility."
          });

      }


      let schoolId = null;
      let companyId = null;


      if (
        role ===
          "school"
      ) {

        schoolId =
          userId;

      }


      else if (
        COMPANY_ROLES.has(
          role
        )
      ) {

        companyId =
          userId;

      }


      else if (
        role ===
          "admin"
      ) {

        if (
          req.body.schoolId
        ) {

          if (
            !validObjectId(
              req.body.schoolId
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


          schoolId =
            req.body.schoolId;

        }


        if (
          req.body.companyId
        ) {

          if (
            !validObjectId(
              req.body.companyId
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


          companyId =
            req.body.companyId;

        }

      }


      if (
        !schoolId &&
        !companyId
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "The event must belong to a school or company."
          });

      }


      const capacity =
        numberOrNull(
          req.body.capacity
        );


      if (
        capacity !== null &&
        capacity < 1
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Event capacity must be at least 1."
          });

      }


      let initialStatus =
        "draft";


      if (
        req.body.status
      ) {

        const requestedStatus =
          safeString(
            req.body.status,
            100
          )
            .toLowerCase();


        if (
          !EVENT_STATUSES.has(
            requestedStatus
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event status."
            });

        }


        /*
          New events may start as draft, published or
          registration_open.
        */

        if (
          ![
            "draft",
            "published",
            "registration_open"
          ]
            .includes(
              requestedStatus
            )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "New events can only start as draft, published or registration_open."
            });

        }


        initialStatus =
          requestedStatus;

      }


      const event =
        await CareerEvent
          .create({
            schoolId:
              schoolId ||
              null,

            companyId:
              companyId ||
              null,

            createdBy:
              userId,

            updatedBy:
              userId,

            title,

            slug:
              slugify(
                title
              ),

            shortDescription:
              safeString(
                req.body.shortDescription,
                1000
              ),

            description:
              safeString(
                req.body.description,
                20000
              ),

            eventType,

            format,

            location:
              buildLocation(
                req.body.location ||
                {}
              ),

            onlinePlatform:
              safeString(
                req.body.onlinePlatform,
                200
              ),

            meetingUrl:
              safeString(
                req.body.meetingUrl,
                2000
              ),

            meetingInstructions:
              safeString(
                req.body.meetingInstructions,
                3000
              ),

            startAt,

            endAt,

            timezone:
              safeString(
                req.body.timezone ||
                "Asia/Manila",
                100
              ),

            registrationOpenAt,

            registrationDeadline,

            registrationRequired:
              req.body.registrationRequired !==
              false,

            capacity,

            waitlistEnabled:
              req.body.waitlistEnabled !==
              false,

            audience:
              stringArray(
                req.body.audience,
                100
              ),

            programs:
              stringArray(
                req.body.programs,
                180
              ),

            yearLevels:
              stringArray(
                req.body.yearLevels,
                100
              ),

            skills:
              stringArray(
                req.body.skills,
                180
              ),

            industries:
              stringArray(
                req.body.industries,
                180
              ),

            visibility,

            coverImage:
              safeString(
                req.body.coverImage,
                2000
              ),

            coverImagePublicId:
              safeString(
                req.body.coverImagePublicId,
                1000
              ),

            speakers:
              buildSpeakers(
                req.body.speakers
              ),

            agenda:
              buildAgenda(
                req.body.agenda
              ),

            organizerName:
              safeString(
                req.body.organizerName,
                300
              ),

            organizerEmail:
              safeString(
                req.body.organizerEmail,
                320
              )
                .toLowerCase(),

            organizerPhone:
              safeString(
                req.body.organizerPhone,
                100
              ),

            status:
              initialStatus,

            publishedAt:
              [
                "published",
                "registration_open"
              ]
                .includes(
                  initialStatus
                )
                ? new Date()
                : null,

            featured:
              role === "admin" &&
              (
                req.body.featured === true ||
                req.body.featured === "true"
              ),

            tags:
              stringArray(
                req.body.tags,
                150
              )
          });


      const populated =
        await populateEvent(
          CareerEvent
            .findById(
              event._id
            )
        )
          .lean({
            virtuals:true
          });


      res
        .status(201)
        .json({
          success:true,

          event:
            populated,

          item:
            populated
        });


    } catch (error) {

      console.error(
        "CREATE CAREER EVENT ERROR:",
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
            "Unable to create the career event."
        });

    }

  }
);


/* =========================================================
   PATCH /api/career-events/:id
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
              "Invalid event id."
          });

      }


      const event =
        await CareerEvent
          .findById(
            req.params.id
          );


      if (!event) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Career event not found."
          });

      }


      if (
        !canManageEvent(
          req,
          event
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to update this event."
          });

      }


      const role =
        getRole(req);


      /* =====================================================
         BASIC FIELDS
      ===================================================== */

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
                "Event title cannot be empty."
            });

        }


        event.title =
          title;


        event.slug =
          slugify(
            title
          );

      }


      const stringFields = [
        [
          "shortDescription",
          1000
        ],
        [
          "description",
          20000
        ],
        [
          "onlinePlatform",
          200
        ],
        [
          "meetingUrl",
          2000
        ],
        [
          "meetingInstructions",
          3000
        ],
        [
          "timezone",
          100
        ],
        [
          "organizerName",
          300
        ],
        [
          "organizerEmail",
          320
        ],
        [
          "organizerPhone",
          100
        ],
        [
          "coverImage",
          2000
        ],
        [
          "coverImagePublicId",
          1000
        ]
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

            event[field] =
              safeString(
                req.body[field],
                max
              );

          }

        }
      );


      /* =====================================================
         TYPE / FORMAT / VISIBILITY
      ===================================================== */

      if (
        req.body.eventType !==
          undefined
      ) {

        const nextType =
          safeString(
            req.body.eventType,
            100
          )
            .toLowerCase();


        if (
          !EVENT_TYPES.has(
            nextType
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event type."
            });

        }


        event.eventType =
          nextType;

      }


      if (
        req.body.format !==
          undefined
      ) {

        const nextFormat =
          safeString(
            req.body.format,
            100
          )
            .toLowerCase();


        if (
          !EVENT_FORMATS.has(
            nextFormat
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event format."
            });

        }


        event.format =
          nextFormat;

      }


      if (
        req.body.visibility !==
          undefined
      ) {

        const nextVisibility =
          safeString(
            req.body.visibility,
            100
          )
            .toLowerCase();


        if (
          !EVENT_VISIBILITIES.has(
            nextVisibility
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event visibility."
            });

        }


        event.visibility =
          nextVisibility;

      }


      /* =====================================================
         DATES
      ===================================================== */

      const nextStartAt =
        req.body.startAt !==
        undefined
          ? dateOrNull(
              req.body.startAt
            )
          : event.startAt;


      const nextEndAt =
        req.body.endAt !==
        undefined
          ? dateOrNull(
              req.body.endAt
            )
          : event.endAt;


      const nextRegistrationOpenAt =
        req.body.registrationOpenAt !==
        undefined
          ? dateOrNull(
              req.body.registrationOpenAt
            )
          : event.registrationOpenAt;


      const nextRegistrationDeadline =
        req.body.registrationDeadline !==
        undefined
          ? dateOrNull(
              req.body.registrationDeadline
            )
          : event.registrationDeadline;


      const dateError =
        validateDates({
          startAt:
            nextStartAt,

          endAt:
            nextEndAt,

          registrationOpenAt:
            nextRegistrationOpenAt,

          registrationDeadline:
            nextRegistrationDeadline
        });


      if (dateError) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              dateError
          });

      }


      event.startAt =
        nextStartAt;

      event.endAt =
        nextEndAt;

      event.registrationOpenAt =
        nextRegistrationOpenAt;

      event.registrationDeadline =
        nextRegistrationDeadline;


      /* =====================================================
         REGISTRATION SETTINGS
      ===================================================== */

      if (
        req.body.registrationRequired !==
          undefined
      ) {

        event.registrationRequired =
          req.body.registrationRequired ===
          true ||
          req.body.registrationRequired ===
          "true";

      }


      if (
        req.body.waitlistEnabled !==
          undefined
      ) {

        event.waitlistEnabled =
          req.body.waitlistEnabled ===
          true ||
          req.body.waitlistEnabled ===
          "true";

      }


      if (
        req.body.capacity !==
          undefined
      ) {

        const capacity =
          numberOrNull(
            req.body.capacity
          );


        if (
          capacity !== null &&
          capacity < 1
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Event capacity must be at least 1."
            });

        }


        if (
          capacity !== null &&
          capacity <
            event.registeredCount
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                "Event capacity cannot be lower than the current registration count."
            });

        }


        event.capacity =
          capacity;

      }


      /* =====================================================
         LOCATION
      ===================================================== */

      if (
        req.body.location &&
        typeof req.body.location ===
          "object"
      ) {

        const location =
          req.body.location;


        [
          [
            "venueName",
            300
          ],
          [
            "address",
            1000
          ],
          [
            "city",
            200
          ],
          [
            "province",
            200
          ],
          [
            "country",
            200
          ],
          [
            "room",
            200
          ]
        ]
          .forEach(
            (
              [
                field,
                max
              ]
            ) => {

              if (
                location[field] !==
                  undefined
              ) {

                event.location[field] =
                  safeString(
                    location[field],
                    max
                  );

              }

            }
          );


        if (
          location.latitude !==
          undefined
        ) {

          event.location.latitude =
            numberOrNull(
              location.latitude
            );

        }


        if (
          location.longitude !==
          undefined
        ) {

          event.location.longitude =
            numberOrNull(
              location.longitude
            );

        }

      }


      /* =====================================================
         TARGETING
      ===================================================== */

      [
        [
          "audience",
          100
        ],
        [
          "programs",
          180
        ],
        [
          "yearLevels",
          100
        ],
        [
          "skills",
          180
        ],
        [
          "industries",
          180
        ],
        [
          "tags",
          150
        ]
      ]
        .forEach(
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

              event[field] =
                stringArray(
                  req.body[field],
                  max
                );

            }

          }
        );


      /* =====================================================
         SPEAKERS / AGENDA
      ===================================================== */

      if (
        req.body.speakers !==
          undefined
      ) {

        event.speakers =
          buildSpeakers(
            req.body.speakers
          );

      }


      if (
        req.body.agenda !==
          undefined
      ) {

        event.agenda =
          buildAgenda(
            req.body.agenda
          );

      }


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
          )
            .toLowerCase();


        if (
          !EVENT_STATUSES.has(
            nextStatus
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid event status."
            });

        }


        if (
          !canTransition(
            event.status,
            nextStatus
          )
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                `Event cannot move from ${event.status} to ${nextStatus}.`
            });

        }


        if (
          nextStatus !==
            event.status
        ) {

          event.status =
            nextStatus;


          if (
            [
              "published",
              "registration_open"
            ]
              .includes(
                nextStatus
              ) &&
            !event.publishedAt
          ) {

            event.publishedAt =
              new Date();

          }


          if (
            nextStatus ===
              "cancelled"
          ) {

            event.cancelledAt =
              new Date();


            event.cancellationReason =
              safeString(
                req.body.cancellationReason,
                3000
              );

          }


          if (
            nextStatus ===
              "completed"
          ) {

            event.completedAt =
              new Date();

          }


          if (
            nextStatus ===
              "archived"
          ) {

            event.archived =
              true;


            event.archivedAt =
              new Date();

          }

        }

      }


      /* =====================================================
         FEATURED

         Admin-only because featured placement can eventually
         become a monetized/promoted AIFT surface.
      ===================================================== */

      if (
        req.body.featured !==
          undefined
      ) {

        if (
          role !==
            "admin"
        ) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "Only an administrator can feature Career Hub events."
            });

        }


        event.featured =
          req.body.featured ===
          true ||
          req.body.featured ===
          "true";

      }


      event.updatedBy =
        getUserId(req);


      await event.save();


      const populated =
        await populateEvent(
          CareerEvent
            .findById(
              event._id
            )
        )
          .lean({
            virtuals:true
          });


      res.json({
        success:true,

        event:
          populated,

        item:
          populated
      });


    } catch (error) {

      console.error(
        "UPDATE CAREER EVENT ERROR:",
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
            "Unable to update the career event."
        });

    }

  }
);


/* =========================================================
   DELETE /api/career-events/:id

   Only unused drafts may be permanently deleted.

   Published events become part of Career Hub history.
========================================================= */

router.delete(
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
              "Invalid event id."
          });

      }


      const event =
        await CareerEvent
          .findById(
            req.params.id
          );


      if (!event) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Career event not found."
          });

      }


      if (
        !canManageEvent(
          req,
          event
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to delete this event."
          });

      }


      if (
        event.status !==
          "draft" ||
        event.registeredCount >
          0 ||
        event.waitlistCount >
          0
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Published events or events with registrations cannot be permanently deleted. Cancel or archive the event instead."
          });

      }


      await event.deleteOne();


      res.json({
        success:true,
        message:
          "Career event deleted successfully."
      });


    } catch (error) {

      console.error(
        "DELETE CAREER EVENT ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the career event."
        });

    }

  }
);


module.exports =
  router;
