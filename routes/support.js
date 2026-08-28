const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const router = express.Router();

const auth =
  require("../middleware/auth");

const SupportTicket =
  require("../models/SupportTicket");


/* =========================================================
   CONSTANTS
========================================================= */

const VALID_CATEGORIES =
  new Set([
    /* Student / learning */
    "student-studio",
    "classes",
    "assignments",
    "portfolio",
    "ai",

    /* Employer / hiring */
    "employer-studio",
    "jobs",
    "candidates",
    "pipeline",
    "messages",

    /* School */
    "school-studio",
    "students",
    "teachers",
    "career-hub",

    /* Shared */
    "career",
    "account",
    "security",
    "technical",
    "billing",
    "other"
  ]);


const VALID_STATUSES =
  new Set([
    "open",
    "in_progress",
    "waiting_for_student",
    "waiting_for_user",
    "resolved",
    "closed"
  ]);


const VALID_PRIORITIES =
  new Set([
    "low",
    "normal",
    "high",
    "urgent"
  ]);


const VALID_ACCOUNT_ROLES =
  new Set([
    "student",
    "employer",
    "school",
    "teacher",
    "agent",
    "admin"
  ]);


/* =========================================================
   BASIC HELPERS
========================================================= */

function safeString(
  value,
  maxLength = 5000
){

  return String(
    value ||
    ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}


function isValidObjectId(
  value
){

  return Boolean(
    value &&
    mongoose.Types.ObjectId.isValid(
      String(value)
    )
  );

}


function getUserRole(
  req
){

  return String(
    req.user?.role ||
    ""
  )
    .trim()
    .toLowerCase();

}


function getSafeAccountRole(
  req
){

  const role =
    getUserRole(req);

  return VALID_ACCOUNT_ROLES.has(role)
    ? role
    : "other";

}


function isSupportAdmin(
  req
){

  return (
    getUserRole(req) ===
    "admin"
  );

}


function isTicketOwner(
  req,
  ticket
){

  if (
    !req.user?._id ||
    !ticket?.userId
  ){
    return false;
  }


  const ownerId =
    String(
      ticket.userId?._id ||
      ticket.userId ||
      ""
    );


  return (
    ownerId ===
    String(
      req.user._id
    )
  );

}


function getWaitingStatusForTicket(
  ticket
){

  return (
    String(
      ticket?.accountRole ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "student"
  )
    ? "waiting_for_student"
    : "waiting_for_user";

}


/* =========================================================
   NORMALIZE AI CONVERSATION
========================================================= */

function normalizeConversation(
  conversation
){

  if (
    !Array.isArray(
      conversation
    )
  ){
    return [];
  }


  return conversation
    .slice(-100)
    .map(message => {

      const role =
        String(
          message?.role ||
          ""
        )
          .trim()
          .toLowerCase();


      if (
        ![
          "user",
          "assistant",
          "system"
        ].includes(role)
      ){
        return null;
      }


      const content =
        safeString(
          message?.content,
          20000
        );


      if (!content){
        return null;
      }


      let createdAt =
        new Date();


      if (message?.createdAt){

        const parsedDate =
          new Date(
            message.createdAt
          );


        if (
          !Number.isNaN(
            parsedDate.getTime()
          )
        ){
          createdAt =
            parsedDate;
        }

      }


      return {
        role,
        content,
        createdAt
      };

    })
    .filter(Boolean);

}


/* =========================================================
   SAFE CLIENT METADATA

   Never store authentication tokens or arbitrary deeply
   nested browser payloads in support tickets.
========================================================= */

function normalizeClientMetadata(
  metadata
){

  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ){
    return {};
  }


  const allowedKeys =
    [
      "browser",
      "browserVersion",
      "platform",
      "device",
      "viewport",
      "language",
      "online",
      "route",
      "workspace",
      "appVersion"
    ];


  const result = {};


  allowedKeys.forEach(key => {

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          metadata,
          key
        )
    ){

      result[key] =
        safeString(
          metadata[key],
          300
        );

    }

  });


  return result;

}


/* =========================================================
   GENERATE UNIQUE TICKET NUMBER
========================================================= */

async function generateTicketNumber(){

  for (
    let attempt = 0;
    attempt < 10;
    attempt += 1
  ){

    const date =
      new Date();


    const datePart =
      [
        date.getUTCFullYear(),

        String(
          date.getUTCMonth() + 1
        ).padStart(
          2,
          "0"
        ),

        String(
          date.getUTCDate()
        ).padStart(
          2,
          "0"
        )
      ].join("");


    const randomPart =
      crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();


    const ticketNumber =
      `AIFT-${datePart}-${randomPart}`;


    const exists =
      await SupportTicket.exists({
        ticketNumber
      });


    if (!exists){
      return ticketNumber;
    }

  }


  throw new Error(
    "Unable to generate a unique support ticket number."
  );

}


/* =========================================================
   CREATE SUPPORT TICKET

   POST /api/support/tickets

   Available to every authenticated AIFT account.
========================================================= */

router.post(
  "/tickets",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const accountRole =
        getSafeAccountRole(req);


      const name =
        safeString(
          req.body.name ||
          req.user?.name,
          120
        );


      const email =
        safeString(
          req.body.email ||
          req.user?.email,
          180
        )
          .toLowerCase();


      const phone =
        safeString(
          req.body.phone,
          40
        );


      const requestedCategory =
        safeString(
          req.body.category,
          50
        )
          .toLowerCase();


      const category =
        VALID_CATEGORIES.has(
          requestedCategory
        )
          ? requestedCategory
          : "other";


      const submittedSubject =
        safeString(
          req.body.subject,
          200
        );


      const additionalInfo =
        safeString(
          req.body.additionalInfo ||
          req.body.message,
          5000
        );


      const page =
        safeString(
          req.body.page,
          100
        );


      if (!name){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Name is required."
          });

      }


      if (
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(email)
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "A valid email address is required."
          });

      }


      /*
        School relationship comes only from the
        authenticated account.

        The browser is never allowed to assign an
        arbitrary schoolId.
      */

      let schoolId =
        req.user?.schoolId ||
        req.user?.linkedSchoolId ||
        null;


      if (
        accountRole === "school"
      ){

        schoolId =
          req.user?._id ||
          null;

      }


      if (
        schoolId &&
        !isValidObjectId(
          schoolId
        )
      ){

        schoolId =
          null;

      }


      /*
        Keep existing Kabezya / Student AI support
        compatibility.
      */

      let aiConversationId =
        req.body.aiConversationId ||
        null;


      if (
        aiConversationId &&
        !isValidObjectId(
          aiConversationId
        )
      ){

        aiConversationId =
          null;

      }


      const conversation =
        normalizeConversation(
          req.body.conversation
        );


      const subjectSource =
        submittedSubject ||
        additionalInfo ||
        conversation
          .find(
            message =>
              message.role ===
              "user"
          )
          ?.content ||
        "AIFT support request";


      const subject =
        safeString(
          subjectSource,
          200
        );


      const ticketNumber =
        await generateTicketNumber();


      const clientMetadata =
        normalizeClientMetadata(
          req.body.metadata
        );


      const ticket =
        await SupportTicket.create({

          ticketNumber,

          userId:
            req.user._id,

          accountRole,

          schoolId,

          name,

          email,

          phone,

          category,

          subject,

          additionalInfo,

          page,

          aiConversationId,

          conversation,

          status:
            "open",

          priority:
            "normal",

          lastActivityAt:
            new Date(),

          metadata:{

            source:
              `${accountRole}-help-center`,

            aiFirst:
              conversation.length > 0,

            userRole:
              accountRole,

            submittedFrom:
              page || "",

            client:
              clientMetadata

          }

        });


      return res
        .status(201)
        .json({

          success:true,

          message:
            "Support request submitted successfully.",

          ticket:{
            id:
              ticket._id,

            ticketNumber:
              ticket.ticketNumber,

            accountRole:
              ticket.accountRole,

            status:
              ticket.status,

            priority:
              ticket.priority,

            category:
              ticket.category,

            subject:
              ticket.subject,

            createdAt:
              ticket.createdAt
          }

        });

    }catch(error){

      console.error(
        "POST /api/support/tickets error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Failed to submit support request."
        });

    }

  }
);


/* =========================================================
   CURRENT USER'S SUPPORT TICKETS

   GET /api/support/tickets
========================================================= */

router.get(
  "/tickets",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const tickets =
        await SupportTicket
          .find({
            userId:
              req.user._id
          })
          .select(
            "ticketNumber accountRole category subject status priority lastActivityAt createdAt updatedAt resolvedAt closedAt"
          )
          .sort({
            lastActivityAt:-1,
            createdAt:-1
          })
          .limit(100)
          .lean();


      return res.json({
        success:true,

        tickets,

        total:
          tickets.length
      });

    }catch(error){

      console.error(
        "GET /api/support/tickets error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Failed to load support requests."
        });

    }

  }
);


/* =========================================================
   GET ONE SUPPORT TICKET

   Owner:
   Can view their own ticket.

   Admin:
   Can view any ticket.

   GET /api/support/tickets/:id
========================================================= */

router.get(
  "/tickets/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const ticket =
        await SupportTicket
          .findById(
            req.params.id
          )
          .populate(
            "userId",
            "name email role profileImage"
          )
          .populate(
            "assignedTo",
            "name email role profileImage"
          )
          .populate(
            "replies.senderId",
            "name email role profileImage"
          )
          .lean();


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      if (
        !isSupportAdmin(req) &&
        !isTicketOwner(
          req,
          ticket
        )
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to view this support ticket."
          });

      }


      return res.json({
        success:true,
        ticket
      });

    }catch(error){

      console.error(
        "GET /api/support/tickets/:id error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Failed to load support ticket."
        });

    }

  }
);


/* =========================================================
   USER REPLY TO OWN SUPPORT TICKET

   POST /api/support/tickets/:id/replies
========================================================= */

router.post(
  "/tickets/:id/replies",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const message =
        safeString(
          req.body.message,
          10000
        );


      if (!message){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Please enter a message."
          });

      }


      const ticket =
        await SupportTicket.findById(
          req.params.id
        );


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      if (
        !isTicketOwner(
          req,
          ticket
        )
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to reply to this support ticket."
          });

      }


      if (
        ticket.status ===
        "closed"
      ){

        return res
          .status(409)
          .json({
            success:false,
            message:
              "This support request is closed."
          });

      }


      const accountRole =
        getSafeAccountRole(req);


      ticket.replies.push({

        senderId:
          req.user._id,

        /*
          Keep "student" for existing Student support
          compatibility.

          Other AIFT account types use the generic "user".
        */

        senderType:
          accountRole === "student"
            ? "student"
            : "user",

        senderRole:
          accountRole,

        message,

        readByStudent:
          accountRole === "student",

        readBySupport:
          false,

        createdAt:
          new Date()

      });


      /*
        A reply from the owner returns the ticket
        to the active support queue.
      */

      if (
        ticket.status ===
          "waiting_for_student" ||
        ticket.status ===
          "waiting_for_user"
      ){

        ticket.status =
          "open";

      }


      /*
        Replying to a resolved ticket reopens it.
      */

      if (
        ticket.status ===
        "resolved"
      ){

        ticket.status =
          "open";

        ticket.resolvedAt =
          null;

      }


      ticket.lastActivityAt =
        new Date();


      await ticket.save();


      const newReply =
        ticket.replies[
          ticket.replies.length - 1
        ];


      return res
        .status(201)
        .json({

          success:true,

          message:
            "Your reply was sent.",

          reply:
            newReply,

          ticket:{
            id:
              ticket._id,

            ticketNumber:
              ticket.ticketNumber,

            status:
              ticket.status,

            lastActivityAt:
              ticket.lastActivityAt
          }

        });

    }catch(error){

      console.error(
        "POST /api/support/tickets/:id/replies error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Your reply could not be sent."
        });

    }

  }
);


/* =========================================================
   ADMIN — LIST ALL SUPPORT TICKETS

   GET /api/support/admin/tickets

   Filters:
   status
   priority
   category
   accountRole
   search
   page
   limit
========================================================= */

router.get(
  "/admin/tickets",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isSupportAdmin(req)
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Admin access required."
          });

      }


      const page =
        Math.max(
          Number.parseInt(
            req.query.page,
            10
          ) || 1,
          1
        );


      const limit =
        Math.min(
          Math.max(
            Number.parseInt(
              req.query.limit,
              10
            ) || 25,
            1
          ),
          100
        );


      const filter = {};


      const requestedStatus =
        safeString(
          req.query.status,
          50
        )
          .toLowerCase();


      if (
        requestedStatus &&
        VALID_STATUSES.has(
          requestedStatus
        )
      ){

        filter.status =
          requestedStatus;

      }


      const requestedPriority =
        safeString(
          req.query.priority,
          50
        )
          .toLowerCase();


      if (
        requestedPriority &&
        VALID_PRIORITIES.has(
          requestedPriority
        )
      ){

        filter.priority =
          requestedPriority;

      }


      const requestedCategory =
        safeString(
          req.query.category,
          50
        )
          .toLowerCase();


      if (
        requestedCategory &&
        VALID_CATEGORIES.has(
          requestedCategory
        )
      ){

        filter.category =
          requestedCategory;

      }


      const requestedAccountRole =
        safeString(
          req.query.accountRole,
          50
        )
          .toLowerCase();


      if (
        requestedAccountRole &&
        (
          VALID_ACCOUNT_ROLES.has(
            requestedAccountRole
          ) ||
          requestedAccountRole ===
            "other"
        )
      ){

        filter.accountRole =
          requestedAccountRole;

      }


      const search =
        safeString(
          req.query.search,
          120
        );


      if (search){

        const escapedSearch =
          search.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );


        const searchRegex =
          new RegExp(
            escapedSearch,
            "i"
          );


        filter.$or =
          [
            {
              ticketNumber:
                searchRegex
            },
            {
              name:
                searchRegex
            },
            {
              email:
                searchRegex
            },
            {
              subject:
                searchRegex
            }
          ];

      }


      const [
        tickets,
        total
      ] =
        await Promise.all([

          SupportTicket
            .find(filter)
            .populate(
              "userId",
              "name email role profileImage"
            )
            .populate(
              "assignedTo",
              "name email role profileImage"
            )
            .sort({
              lastActivityAt:-1,
              createdAt:-1
            })
            .skip(
              (page - 1) *
              limit
            )
            .limit(limit)
            .lean(),

          SupportTicket
            .countDocuments(
              filter
            )

        ]);


      return res.json({

        success:true,

        tickets,

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

    }catch(error){

      console.error(
        "GET /api/support/admin/tickets error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Failed to load support tickets."
        });

    }

  }
);


/* =========================================================
   ADMIN — GET ONE SUPPORT TICKET

   GET /api/support/admin/tickets/:id
========================================================= */

router.get(
  "/admin/tickets/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isSupportAdmin(req)
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Admin access required."
          });

      }


      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const ticket =
        await SupportTicket
          .findById(
            req.params.id
          )
          .populate(
            "userId",
            "name email role profileImage"
          )
          .populate(
            "schoolId",
            "name email role profileImage"
          )
          .populate(
            "assignedTo",
            "name email role profileImage"
          )
          .populate(
            "replies.senderId",
            "name email role profileImage"
          )
          .lean();


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      return res.json({
        success:true,
        ticket
      });

    }catch(error){

      console.error(
        "GET /api/support/admin/tickets/:id error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Failed to load support ticket."
        });

    }

  }
);


/* =========================================================
   ADMIN / SUPPORT REPLY

   POST /api/support/admin/tickets/:id/replies
========================================================= */

router.post(
  "/admin/tickets/:id/replies",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isSupportAdmin(req)
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Admin access required."
          });

      }


      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const message =
        safeString(
          req.body.message,
          10000
        );


      if (!message){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Reply message is required."
          });

      }


      const ticket =
        await SupportTicket.findById(
          req.params.id
        );


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      if (
        ticket.status ===
        "closed"
      ){

        return res
          .status(409)
          .json({
            success:false,
            message:
              "This support ticket is closed."
          });

      }


      ticket.replies.push({

        senderId:
          req.user._id,

        senderType:
          "support",

        senderRole:
          "admin",

        message,

        readByStudent:
          false,

        readBySupport:
          true,

        createdAt:
          new Date()

      });


      /*
        First support representative to respond
        automatically owns the ticket.
      */

      if (
        !ticket.assignedTo
      ){

        ticket.assignedTo =
          req.user._id;

      }


      const requestedStatus =
        safeString(
          req.body.status,
          50
        )
          .toLowerCase();


      if (
        requestedStatus &&
        VALID_STATUSES.has(
          requestedStatus
        )
      ){

        ticket.status =
          requestedStatus;

      }else{

        ticket.status =
          getWaitingStatusForTicket(
            ticket
          );

      }


      if (
        ticket.status ===
        "resolved"
      ){

        ticket.resolvedAt =
          new Date();

      }else{

        ticket.resolvedAt =
          null;

      }


      if (
        ticket.status ===
        "closed"
      ){

        ticket.closedAt =
          new Date();

      }else{

        ticket.closedAt =
          null;

      }


      ticket.lastActivityAt =
        new Date();


      await ticket.save();


      const newReply =
        ticket.replies[
          ticket.replies.length - 1
        ];


      return res
        .status(201)
        .json({

          success:true,

          message:
            "Support reply sent.",

          reply:
            newReply,

          ticket:{
            id:
              ticket._id,

            ticketNumber:
              ticket.ticketNumber,

            status:
              ticket.status,

            assignedTo:
              ticket.assignedTo,

            lastActivityAt:
              ticket.lastActivityAt
          }

        });

    }catch(error){

      console.error(
        "POST /api/support/admin/tickets/:id/replies error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Support reply could not be sent."
        });

    }

  }
);


/* =========================================================
   ADMIN — UPDATE TICKET WORKFLOW

   PATCH /api/support/admin/tickets/:id

   Supports:
   status
   priority
   assignedTo
========================================================= */

router.patch(
  "/admin/tickets/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isSupportAdmin(req)
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Admin access required."
          });

      }


      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const ticket =
        await SupportTicket.findById(
          req.params.id
        );


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      const requestedStatus =
        safeString(
          req.body.status,
          50
        )
          .toLowerCase();


      if (requestedStatus){

        if (
          !VALID_STATUSES.has(
            requestedStatus
          )
        ){

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid support ticket status."
            });

        }


        ticket.status =
          requestedStatus;


        if (
          requestedStatus ===
          "resolved"
        ){

          ticket.resolvedAt =
            new Date();

          ticket.closedAt =
            null;

        }else if (
          requestedStatus ===
          "closed"
        ){

          ticket.closedAt =
            new Date();

        }else{

          ticket.resolvedAt =
            null;

          ticket.closedAt =
            null;

        }

      }


      const requestedPriority =
        safeString(
          req.body.priority,
          50
        )
          .toLowerCase();


      if (requestedPriority){

        if (
          !VALID_PRIORITIES.has(
            requestedPriority
          )
        ){

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid support ticket priority."
            });

        }


        ticket.priority =
          requestedPriority;

      }


      if (
        Object.prototype
          .hasOwnProperty
          .call(
            req.body,
            "assignedTo"
          )
      ){

        const assignedTo =
          req.body.assignedTo;


        if (
          assignedTo === null ||
          assignedTo === ""
        ){

          ticket.assignedTo =
            null;

        }else if (
          !isValidObjectId(
            assignedTo
          )
        ){

          return res
            .status(400)
            .json({
              success:false,
              message:
                "Invalid support representative ID."
            });

        }else{

          ticket.assignedTo =
            assignedTo;

        }

      }


      ticket.lastActivityAt =
        new Date();


      await ticket.save();


      return res.json({

        success:true,

        message:
          "Support ticket updated.",

        ticket:{
          id:
            ticket._id,

          ticketNumber:
            ticket.ticketNumber,

          status:
            ticket.status,

          priority:
            ticket.priority,

          assignedTo:
            ticket.assignedTo,

          resolvedAt:
            ticket.resolvedAt,

          closedAt:
            ticket.closedAt,

          lastActivityAt:
            ticket.lastActivityAt
        }

      });

    }catch(error){

      console.error(
        "PATCH /api/support/admin/tickets/:id error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Support ticket could not be updated."
        });

    }

  }
);


/* =========================================================
   USER — CLOSE OWN SUPPORT TICKET

   PATCH /api/support/tickets/:id/close
========================================================= */

router.patch(
  "/tickets/:id/close",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const ticket =
        await SupportTicket.findById(
          req.params.id
        );


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      if (
        !isTicketOwner(
          req,
          ticket
        )
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to close this support ticket."
          });

      }


      if (
        ticket.status ===
        "closed"
      ){

        return res.json({
          success:true,
          message:
            "This support ticket is already closed.",
          ticket:{
            id:
              ticket._id,

            ticketNumber:
              ticket.ticketNumber,

            status:
              ticket.status,

            closedAt:
              ticket.closedAt
          }
        });

      }


      ticket.status =
        "closed";

      ticket.closedAt =
        new Date();

      ticket.lastActivityAt =
        new Date();


      await ticket.save();


      return res.json({

        success:true,

        message:
          "Support ticket closed.",

        ticket:{
          id:
            ticket._id,

          ticketNumber:
            ticket.ticketNumber,

          status:
            ticket.status,

          closedAt:
            ticket.closedAt
        }

      });

    }catch(error){

      console.error(
        "PATCH /api/support/tickets/:id/close error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Support ticket could not be closed."
        });

    }

  }
);


/* =========================================================
   USER — REOPEN OWN CLOSED TICKET

   PATCH /api/support/tickets/:id/reopen
========================================================= */

router.patch(
  "/tickets/:id/reopen",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if (
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid support ticket ID."
          });

      }


      const ticket =
        await SupportTicket.findById(
          req.params.id
        );


      if (!ticket){

        return res
          .status(404)
          .json({
            success:false,
            message:
              "Support ticket not found."
          });

      }


      if (
        !isTicketOwner(
          req,
          ticket
        )
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "You are not allowed to reopen this support ticket."
          });

      }


      if (
        ticket.status !==
        "closed"
      ){

        return res
          .status(409)
          .json({
            success:false,
            message:
              "Only closed support tickets can be reopened."
          });

      }


      ticket.status =
        "open";

      ticket.closedAt =
        null;

      ticket.resolvedAt =
        null;

      ticket.lastActivityAt =
        new Date();


      await ticket.save();


      return res.json({

        success:true,

        message:
          "Support ticket reopened.",

        ticket:{
          id:
            ticket._id,

          ticketNumber:
            ticket.ticketNumber,

          status:
            ticket.status,

          lastActivityAt:
            ticket.lastActivityAt
        }

      });

    }catch(error){

      console.error(
        "PATCH /api/support/tickets/:id/reopen error:",
        error
      );


      return res
        .status(500)
        .json({
          success:false,
          message:
            "Support ticket could not be reopened."
        });

    }

  }
);


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports =
  router;
