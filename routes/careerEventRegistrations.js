const express = require("express");
const mongoose = require("mongoose");

const auth =
  require("../middleware/auth");

const CareerEvent =
  require("../models/CareerEvent");

const CareerEventRegistration =
  require("../models/CareerEventRegistration");


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


const COMPANY_ROLES =
  new Set([
    "employer",
    "company"
  ]);


const REGISTRATION_STATUSES =
  new Set([
    "registered",
    "waitlisted",
    "confirmed",
    "checked_in",
    "attended",
    "no_show",
    "cancelled"
  ]);


const ACTIVE_SEAT_STATUSES =
  [
    "registered",
    "confirmed",
    "checked_in",
    "attended"
  ];


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
  max = 5000
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


/* =========================================================
   EVENT MANAGEMENT ACCESS
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
   REGISTRATION ACCESS
========================================================= */

function canViewRegistration(
  req,
  registration,
  event = null
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
    STUDENT_ROLES.has(role) &&
    sameId(
      registration.studentId,
      userId
    )
  ) {

    return true;

  }


  if (
    event &&
    canManageEvent(
      req,
      event
    )
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   STUDENT EVENT VISIBILITY
========================================================= */

function studentCanAccessEvent(
  req,
  event
) {

  if (
    !STUDENT_ROLES.has(
      getRole(req)
    )
  ) {

    return false;

  }


  if (
    event.archived ||
    [
      "draft",
      "cancelled",
      "archived",
      "completed"
    ].includes(
      event.status
    )
  ) {

    return false;

  }


  if (
    event.visibility ===
    "public"
  ) {

    return true;

  }


  if (
    event.visibility ===
    "school"
  ) {

    return sameId(
      event.schoolId,
      getStudentSchoolId(req)
    );

  }


  /*
    "invited" will later use an invitation subsystem.
    Do not treat it as public.
  */

  return false;

}


/* =========================================================
   REGISTRATION WINDOW
========================================================= */

function registrationIsOpen(
  event
) {

  if (
    !event.registrationRequired
  ) {

    return false;

  }


  if (
    ![
      "published",
      "registration_open"
    ].includes(
      event.status
    )
  ) {

    return false;

  }


  const now =
    new Date();


  if (
    event.registrationOpenAt &&
    now <
      new Date(
        event.registrationOpenAt
      )
  ) {

    return false;

  }


  if (
    event.registrationDeadline &&
    now >
      new Date(
        event.registrationDeadline
      )
  ) {

    return false;

  }


  if (
    event.startAt &&
    now >=
      new Date(
        event.startAt
      )
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   STATUS HISTORY
========================================================= */

function addHistory(
  registration,
  req,
  status,
  note = ""
) {

  registration.statusHistory.push({
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
   POPULATION
========================================================= */

function populateRegistration(
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
        "course",
        "program",
        "yearLevel",
        "schoolId",
        "linkedSchoolId"
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

    .populate(
      "companyId",
      [
        "name",
        "companyName",
        "email",
        "logo",
        "profileImage",
        "profilePicture"
      ].join(" ")
    )

    .populate({
      path:
        "eventId",

      select:[
        "title",
        "eventType",
        "format",
        "status",
        "visibility",
        "schoolId",
        "companyId",
        "startAt",
        "endAt",
        "timezone",
        "location",
        "onlinePlatform",
        "meetingUrl",
        "registrationDeadline",
        "capacity",
        "registeredCount",
        "waitlistCount",
        "attendanceCount",
        "coverImage"
      ].join(" ")
    })

    .populate(
      "checkedInBy",
      "name fullName email role"
    )

    .populate(
      "attendanceMarkedBy",
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
   SYNCHRONIZE EVENT COUNTERS

   We calculate from registrations instead of trusting an
   increment/decrement sent by the frontend.
========================================================= */

async function syncEventCounters(
  eventId
) {

  const [
    registeredCount,
    waitlistCount,
    attendanceCount
  ] =
    await Promise.all([

      CareerEventRegistration.countDocuments({
        eventId,

        status:{
          $in:
            ACTIVE_SEAT_STATUSES
        }
      }),

      CareerEventRegistration.countDocuments({
        eventId,
        status:"waitlisted"
      }),

      CareerEventRegistration.countDocuments({
        eventId,
        status:"attended"
      })

    ]);


  await CareerEvent.updateOne(
    {
      _id:eventId
    },
    {
      $set:{
        registeredCount,
        waitlistCount,
        attendanceCount
      }
    }
  );


  return {
    registeredCount,
    waitlistCount,
    attendanceCount
  };

}


/* =========================================================
   REBUILD WAITLIST POSITIONS
========================================================= */

async function rebuildWaitlist(
  eventId
) {

  const waitlisted =
    await CareerEventRegistration
      .find({
        eventId,
        status:"waitlisted"
      })
      .sort({
        waitlistedAt:1,
        createdAt:1,
        _id:1
      });


  if (
    !waitlisted.length
  ) {

    return;

  }


  const operations =
    waitlisted.map(
      (
        registration,
        index
      ) => ({
        updateOne:{
          filter:{
            _id:
              registration._id
          },

          update:{
            $set:{
              waitlistPosition:
                index + 1
            }
          }
        }
      })
    );


  await CareerEventRegistration
    .bulkWrite(
      operations
    );

}


/* =========================================================
   GET CURRENT OCCUPIED SEATS
========================================================= */

async function getOccupiedSeats(
  eventId
) {

  return CareerEventRegistration
    .countDocuments({
      eventId,

      status:{
        $in:
          ACTIVE_SEAT_STATUSES
      }
    });

}


/* =========================================================
   PROMOTE NEXT WAITLIST REGISTRATION

   Called after a student occupying a seat cancels.
========================================================= */

async function promoteNextWaitlisted(
  event,
  req
) {

  if (
    !event.waitlistEnabled
  ) {

    return null;

  }


  if (
    !event.capacity
  ) {

    return null;

  }


  const occupiedSeats =
    await getOccupiedSeats(
      event._id
    );


  if (
    occupiedSeats >=
    event.capacity
  ) {

    return null;

  }


  const next =
    await CareerEventRegistration
      .findOne({
        eventId:
          event._id,

        status:
          "waitlisted"
      })
      .sort({
        waitlistedAt:1,
        createdAt:1,
        _id:1
      });


  if (!next) {

    return null;

  }


  next.status =
    "registered";

  next.waitlistPosition =
    null;

  next.promotedFromWaitlistAt =
    new Date();

  next.updatedBy =
    getUserId(req) ||
    null;


  addHistory(
    next,
    req,
    "registered",
    "Automatically promoted from the event waitlist."
  );


  await next.save();


  await rebuildWaitlist(
    event._id
  );


  return next;

}


/* =========================================================
   GET /api/career-event-registrations

   Students:
   Their own registrations.

   School/company:
   Registrations for events they own.

   Admin:
   May query globally.
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

      const {
        eventId,
        status
      } =
        req.query;


      const filter = {};


      /* =====================================================
         STUDENT
      ===================================================== */

      if (
        STUDENT_ROLES.has(role)
      ) {

        filter.studentId =
          userId;


        if (eventId) {

          if (
            !validId(
              eventId
            )
          ) {

            return res
              .status(400)
              .json({
                success:false,
                message:
                  "Invalid eventId."
              });

          }


          filter.eventId =
            eventId;

        }

      }


      /* =====================================================
         ORGANIZER
      ===================================================== */

      else if (
        role === "school" ||
        COMPANY_ROLES.has(role)
      ) {

        if (!eventId) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "eventId is required when loading event registrations."
            });

        }


        if (
          !validId(
            eventId
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid eventId."
            });

        }


        const event =
          await CareerEvent
            .findById(
              eventId
            )
            .lean();


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
                "You are not allowed to view registrations for this event."
            });

        }


        filter.eventId =
          eventId;

      }


      /* =====================================================
         ADMIN
      ===================================================== */

      else if (
        role === "admin"
      ) {

        if (eventId) {

          if (
            !validId(
              eventId
            )
          ) {

            return res
              .status(400)
              .json({
                success:false,
                message:
                  "Invalid eventId."
              });

          }


          filter.eventId =
            eventId;

        }


        if (
          req.query.studentId
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

      }


      else {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Your account cannot access Career Hub event registrations."
          });

      }


      /* =====================================================
         STATUS
      ===================================================== */

      if (status) {

        const normalizedStatus =
          safeString(
            status,
            100
          ).toLowerCase();


        if (
          !REGISTRATION_STATUSES.has(
            normalizedStatus
          )
        ) {

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid registration status."
            });

        }


        filter.status =
          normalizedStatus;

      }


      const registrations =
        await populateRegistration(
          CareerEventRegistration
            .find(filter)
        )
          .sort({
            waitlistPosition:1,
            registeredAt:-1,
            createdAt:-1
          })
          .lean();


      res.json({
        success:true,

        registrations,

        items:
          registrations
      });


    } catch (error) {

      console.error(
        "GET CAREER EVENT REGISTRATIONS ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load event registrations."
        });

    }

  }
);


/* =========================================================
   GET /api/career-event-registrations/:id
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
              "Invalid registration id."
          });

      }


      const registration =
        await CareerEventRegistration
          .findById(
            req.params.id
          );


      if (!registration) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Event registration not found."
          });

      }


      const event =
        await CareerEvent
          .findById(
            registration.eventId
          )
          .lean();


      if (
        !canViewRegistration(
          req,
          registration,
          event
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to view this event registration."
          });

      }


      const populated =
        await populateRegistration(
          CareerEventRegistration
            .findById(
              registration._id
            )
        )
          .lean();


      res.json({
        success:true,

        registration:
          populated,

        item:
          populated
      });


    } catch (error) {

      console.error(
        "GET CAREER EVENT REGISTRATION ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to load the event registration."
        });

    }

  }
);


/* =========================================================
   POST /api/career-event-registrations

   Student registers.

   Backend decides:
   - registered
   - waitlisted

   The frontend cannot choose this.
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
              "Only students can register for Career Hub events."
          });

      }


      const eventId =
        normalizeId(
          req.body.eventId
        );


      if (
        !validId(
          eventId
        )
      ) {

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid event is required."
          });

      }


      const event =
        await CareerEvent
          .findById(
            eventId
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
        !studentCanAccessEvent(
          req,
          event
        )
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to register for this event."
          });

      }


      if (
        !registrationIsOpen(
          event
        )
      ) {

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Registration for this event is not currently open."
          });

      }


      const existing =
        await CareerEventRegistration
          .findOne({
            eventId,
            studentId
          });


      if (existing) {

        /*
          A cancelled registration can be reactivated.
          We keep the same record so history remains intact.
        */

        if (
          existing.status !==
          "cancelled"
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                "You are already registered for this event.",
              registrationId:
                existing._id,
              status:
                existing.status
            });

        }

      }


      const occupiedSeats =
        await getOccupiedSeats(
          event._id
        );


      let nextStatus =
        "registered";


      let waitlistPosition =
        null;


      if (
        event.capacity &&
        occupiedSeats >=
          event.capacity
      ) {

        if (
          !event.waitlistEnabled
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                "This event is already full."
            });

        }


        nextStatus =
          "waitlisted";


        const currentWaitlist =
          await CareerEventRegistration
            .countDocuments({
              eventId:
                event._id,

              status:
                "waitlisted"
            });


        waitlistPosition =
          currentWaitlist + 1;

      }


      let registration;


      if (existing) {

        existing.status =
          nextStatus;

        existing.source =
          "student";

        existing.message =
          safeString(
            req.body.message,
            5000
          );

        existing.accessibilityNeeds =
          safeString(
            req.body.accessibilityNeeds,
            3000
          );

        existing.dietaryRequirements =
          safeString(
            req.body.dietaryRequirements,
            2000
          );

        existing.emergencyContactName =
          safeString(
            req.body.emergencyContactName,
            200
          );

        existing.emergencyContactPhone =
          safeString(
            req.body.emergencyContactPhone,
            100
          );

        existing.registeredAt =
          new Date();

        existing.cancelledAt =
          null;

        existing.waitlistPosition =
          waitlistPosition;

        existing.waitlistedAt =
          nextStatus ===
          "waitlisted"
            ? new Date()
            : null;

        existing.updatedBy =
          studentId;


        addHistory(
          existing,
          req,
          nextStatus,
          nextStatus ===
          "waitlisted"
            ? "Student re-registered and was added to the event waitlist."
            : "Student re-registered for the event."
        );


        await existing.save();


        registration =
          existing;

      }


      else {

        registration =
          new CareerEventRegistration({
            eventId:
              event._id,

            studentId,

            schoolId:
              validId(
                getStudentSchoolId(
                  req
                )
              )
                ? getStudentSchoolId(
                    req
                  )
                : null,

            companyId:
              event.companyId ||
              null,

            status:
              nextStatus,

            source:
              "student",

            message:
              safeString(
                req.body.message,
                5000
              ),

            accessibilityNeeds:
              safeString(
                req.body.accessibilityNeeds,
                3000
              ),

            dietaryRequirements:
              safeString(
                req.body.dietaryRequirements,
                2000
              ),

            emergencyContactName:
              safeString(
                req.body.emergencyContactName,
                200
              ),

            emergencyContactPhone:
              safeString(
                req.body.emergencyContactPhone,
                100
              ),

            registeredAt:
              new Date(),

            waitlistPosition,

            waitlistedAt:
              nextStatus ===
              "waitlisted"
                ? new Date()
                : null,

            createdBy:
              studentId,

            updatedBy:
              studentId,

            statusHistory:[
              {
                status:
                  nextStatus,

                changedBy:
                  studentId,

                changedByRole:
                  role,

                note:
                  nextStatus ===
                  "waitlisted"
                    ? "Student joined the event waitlist."
                    : "Student registered for the event.",

                changedAt:
                  new Date()
              }
            ]
          });


        await registration.save();

      }


      await syncEventCounters(
        event._id
      );


      const populated =
        await populateRegistration(
          CareerEventRegistration
            .findById(
              registration._id
            )
        )
          .lean();


      res
        .status(
          existing
            ? 200
            : 201
        )
        .json({
          success:true,

          status:
            registration.status,

          waitlistPosition:
            registration.waitlistPosition,

          registration:
            populated,

          item:
            populated
        });


    } catch (error) {

      console.error(
        "CREATE CAREER EVENT REGISTRATION ERROR:",
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
              "You already have a registration for this event."
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
            "Unable to register for the event."
        });

    }

  }
);


/* =========================================================
   PATCH /api/career-event-registrations/:id

   STUDENT:
   - update registration details
   - cancel

   ORGANIZER:
   - confirm
   - check in
   - mark attended
   - mark no-show
   - cancel registration
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
              "Invalid registration id."
          });

      }


      const registration =
        await CareerEventRegistration
          .findById(
            req.params.id
          );


      if (!registration) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Event registration not found."
          });

      }


      const event =
        await CareerEvent
          .findById(
            registration.eventId
          );


      if (!event) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "The event connected to this registration no longer exists."
          });

      }


      const role =
        getRole(req);

      const userId =
        getUserId(req);


      /* =====================================================
         STUDENT
      ===================================================== */

      if (
        STUDENT_ROLES.has(role)
      ) {

        if (
          !sameId(
            registration.studentId,
            userId
          )
        ) {

          return res
            .status(403)
            .json({
              success:false,
              message:
                "You cannot update another student's registration."
            });

        }


        if (
          [
            "attended",
            "no_show",
            "cancelled"
          ].includes(
            registration.status
          )
        ) {

          return res
            .status(409)
            .json({
              success:false,
              message:
                "This registration can no longer be edited."
            });

        }


        const editableFields = [
          [
            "message",
            5000
          ],
          [
            "accessibilityNeeds",
            3000
          ],
          [
            "dietaryRequirements",
            2000
          ],
          [
            "emergencyContactName",
            200
          ],
          [
            "emergencyContactPhone",
            100
          ]
        ];


        editableFields.forEach(
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

              registration[field] =
                safeString(
                  req.body[field],
                  max
                );

            }

          }
        );


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
            nextStatus !==
            "cancelled"
          ) {

            return res
              .status(403)
              .json({
                success:false,
                message:
                  "Students can only cancel their own event registration."
              });

          }


          const occupiedSeat =
            ACTIVE_SEAT_STATUSES.includes(
              registration.status
            );


          registration.status =
            "cancelled";

          registration.cancelledAt =
            new Date();

          registration.waitlistPosition =
            null;


          addHistory(
            registration,
            req,
            "cancelled",
            req.body.statusNote ||
            "Registration cancelled by student."
          );


          registration.updatedBy =
            userId;


          await registration.save();


          /*
            If the cancelled registration occupied a seat,
            promote the first person on the waitlist.
          */

          if (occupiedSeat) {

            await promoteNextWaitlisted(
              event,
              req
            );

          }


          await rebuildWaitlist(
            event._id
          );


          await syncEventCounters(
            event._id
          );


          const populated =
            await populateRegistration(
              CareerEventRegistration
                .findById(
                  registration._id
                )
            )
              .lean();


          return res.json({
            success:true,

            registration:
              populated,

            item:
              populated
          });

        }

      }


      /* =====================================================
         SCHOOL / COMPANY / ADMIN
      ===================================================== */

      else if (
        role === "school" ||
        COMPANY_ROLES.has(role) ||
        role === "admin"
      ) {

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
                "You are not allowed to manage registrations for this event."
            });

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


          const organizerStatuses =
            new Set([
              "confirmed",
              "checked_in",
              "attended",
              "no_show",
              "cancelled"
            ]);


          if (
            !organizerStatuses.has(
              nextStatus
            )
          ) {

            return res
              .status(400)
              .json({
                success:false,
                message:
                  "Invalid organizer registration status."
              });

          }


          const currentStatus =
            registration.status;


          /* =================================================
             CONFIRM
          ================================================= */

          if (
            nextStatus ===
            "confirmed"
          ) {

            if (
              ![
                "registered",
                "confirmed"
              ].includes(
                currentStatus
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    `A ${currentStatus} registration cannot be confirmed.`
                });

            }


            registration.status =
              "confirmed";

            registration.confirmedAt =
              registration.confirmedAt ||
              new Date();

          }


          /* =================================================
             CHECK-IN
          ================================================= */

          else if (
            nextStatus ===
            "checked_in"
          ) {

            if (
              ![
                "registered",
                "confirmed",
                "checked_in"
              ].includes(
                currentStatus
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    `A ${currentStatus} registration cannot be checked in.`
                });

            }


            registration.status =
              "checked_in";

            registration.checkedInAt =
              registration.checkedInAt ||
              new Date();

            registration.checkedInBy =
              userId;

          }


          /* =================================================
             ATTENDED
          ================================================= */

          else if (
            nextStatus ===
            "attended"
          ) {

            if (
              ![
                "registered",
                "confirmed",
                "checked_in",
                "attended"
              ].includes(
                currentStatus
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    `A ${currentStatus} registration cannot be marked attended.`
                });

            }


            registration.status =
              "attended";

            registration.attendedAt =
              registration.attendedAt ||
              new Date();

            registration.attendanceMarkedBy =
              userId;

            registration.certificateEligible =
              true;

          }


          /* =================================================
             NO SHOW
          ================================================= */

          else if (
            nextStatus ===
            "no_show"
          ) {

            if (
              ![
                "registered",
                "confirmed"
              ].includes(
                currentStatus
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    `A ${currentStatus} registration cannot be marked as a no-show.`
                });

            }


            registration.status =
              "no_show";

            registration.noShowMarkedAt =
              new Date();

            registration.attendanceMarkedBy =
              userId;

          }


          /* =================================================
             ORGANIZER CANCEL
          ================================================= */

          else if (
            nextStatus ===
            "cancelled"
          ) {

            if (
              [
                "attended",
                "no_show",
                "cancelled"
              ].includes(
                currentStatus
              )
            ) {

              return res
                .status(409)
                .json({
                  success:false,
                  message:
                    `A ${currentStatus} registration cannot be cancelled.`
                });

            }


            const occupiedSeat =
              ACTIVE_SEAT_STATUSES.includes(
                currentStatus
              );


            registration.status =
              "cancelled";

            registration.cancelledAt =
              new Date();

            registration.waitlistPosition =
              null;


            /*
              Save first so the seat is released before
              searching for a waitlisted student.
            */

            registration.updatedBy =
              userId;


            addHistory(
              registration,
              req,
              "cancelled",
              req.body.statusNote ||
              "Registration cancelled by event organizer."
            );


            await registration.save();


            if (occupiedSeat) {

              await promoteNextWaitlisted(
                event,
                req
              );

            }


            await rebuildWaitlist(
              event._id
            );


            await syncEventCounters(
              event._id
            );


            const populated =
              await populateRegistration(
                CareerEventRegistration
                  .findById(
                    registration._id
                  )
              )
                .lean();


            return res.json({
              success:true,

              registration:
                populated,

              item:
                populated
            });

          }


          addHistory(
            registration,
            req,
            registration.status,
            req.body.statusNote ||
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
              "Your account cannot update this event registration."
          });

      }


      registration.updatedBy =
        userId;


      await registration.save();


      await syncEventCounters(
        event._id
      );


      const populated =
        await populateRegistration(
          CareerEventRegistration
            .findById(
              registration._id
            )
        )
          .lean();


      res.json({
        success:true,

        registration:
          populated,

        item:
          populated
      });


    } catch (error) {

      console.error(
        "UPDATE CAREER EVENT REGISTRATION ERROR:",
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
            "Unable to update the event registration."
        });

    }

  }
);


/* =========================================================
   DELETE /api/career-event-registrations/:id

   Registrations are audit records.

   Students and organizers should CANCEL instead.

   Only admin may physically delete one.
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
              "Invalid registration id."
          });

      }


      if (
        getRole(req) !==
        "admin"
      ) {

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Event registrations cannot be permanently deleted. Cancel the registration instead."
          });

      }


      const registration =
        await CareerEventRegistration
          .findById(
            req.params.id
          );


      if (!registration) {

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Event registration not found."
          });

      }


      const eventId =
        registration.eventId;


      await registration.deleteOne();


      await rebuildWaitlist(
        eventId
      );


      await syncEventCounters(
        eventId
      );


      res.json({
        success:true,
        message:
          "Event registration permanently deleted."
      });


    } catch (error) {

      console.error(
        "DELETE CAREER EVENT REGISTRATION ERROR:",
        error
      );


      res
        .status(500)
        .json({
          success:false,
          message:
            "Unable to delete the event registration."
        });

    }

  }
);


module.exports =
  router;
