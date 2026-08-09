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
    "student-studio",
    "classes",
    "assignments",
    "portfolio",
    "career",
    "ai",
    "account",
    "technical",
    "other"
  ]);


const VALID_STATUSES =
  new Set([
    "open",
    "in_progress",
    "waiting_for_student",
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


/* =========================================================
   HELPERS
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

  return (
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


function isSupportAdmin(
  req
){

  return (
    getUserRole(req) ===
    "admin"
  );

}


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


      return {
        role,
        content,

        createdAt:
          message?.createdAt
            ? new Date(
                message.createdAt
              )
            : new Date()
      };

    })
    .filter(Boolean);

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
        ).padStart(2, "0"),

        String(
          date.getUTCDate()
        ).padStart(2, "0")
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
========================================================= */

router.post(
  "/tickets",
  auth,
  async (
    req,
    res
  ) => {

    try{

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


      const additionalInfo =
        safeString(
          req.body.additionalInfo,
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


      let schoolId =
        req.user?.schoolId ||
        req.user?.linkedSchoolId ||
        null;


      /*
        Do not allow the browser to assign an
        arbitrary school to the ticket.

        Only use the authenticated user's
        existing school relationship.
      */

      if (
        schoolId &&
        !isValidObjectId(
          schoolId
        )
      ){

        schoolId =
          null;

      }


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


      const ticketNumber =
        await generateTicketNumber();


      const subjectSource =
        additionalInfo ||
        conversation
          .find(
            message =>
              message.role ===
              "user"
          )
          ?.content ||
        "Student support request";


      const subject =
        safeString(
          subjectSource,
          200
        );


      const ticket =
        await SupportTicket.create({

          ticketNumber,

          userId:
            req.user._id,

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
              "student-help-center",

            aiFirst:
              true,

            userRole:
              getUserRole(req)
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
   STUDENT'S OWN SUPPORT TICKETS

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
            "ticketNumber category subject status priority lastActivityAt createdAt updatedAt resolvedAt closedAt"
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

   Student:
   Can only view their own ticket.

   Admin:
   Can view any ticket.
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


      const ownerId =
        String(
          ticket.userId?._id ||
          ticket.userId ||
          ""
        );


      if (
        !isSupportAdmin(req) &&
        ownerId !==
          String(
            req.user._id
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
   ADMIN — LIST ALL SUPPORT TICKETS

   GET /api/support/admin/tickets
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
        );


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
        );


      if (
        requestedPriority &&
        VALID_PRIORITIES.has(
          requestedPriority
        )
      ){

        filter.priority =
          requestedPriority;

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
   STUDENT REPLY TO SUPPORT TICKET

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

      /* =====================================================
         VALIDATE TICKET ID
      ===================================================== */

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


      /* =====================================================
         VALIDATE MESSAGE
      ===================================================== */

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


      /* =====================================================
         LOAD TICKET
      ===================================================== */

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


      /* =====================================================
         SECURITY — OWNER ONLY

         A student must never be able to reply to another
         student's ticket simply by changing the ticket ID.
      ===================================================== */

      if (
        String(
          ticket.userId
        ) !==
        String(
          req.user._id
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


      /* =====================================================
         CLOSED TICKET
      ===================================================== */

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


      /* =====================================================
         ADD STUDENT REPLY
      ===================================================== */

      ticket.replies.push({

        senderId:
          req.user._id,

        senderType:
          "student",

        message,

        readByStudent:
          true,

        readBySupport:
          false,

        createdAt:
          new Date()

      });


      /*
        If support was waiting for the student,
        their reply returns the request to the
        active support queue.
      */

      if (
        ticket.status ===
        "waiting_for_student"
      ){

        ticket.status =
          "open";

      }


      /*
        If a previously resolved ticket receives
        another message, reopen it.

        This makes the support experience much
        friendlier than silently accepting a reply
        on a resolved ticket.
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

      /* =====================================================
         ADMIN ACCESS
      ===================================================== */

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


      /* =====================================================
         VALIDATE TICKET ID
      ===================================================== */

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


      /* =====================================================
         VALIDATE MESSAGE
      ===================================================== */

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


      /* =====================================================
         LOAD TICKET
      ===================================================== */

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


      /* =====================================================
         ADD SUPPORT REPLY
      ===================================================== */

      ticket.replies.push({

        senderId:
          req.user._id,

        senderType:
          "support",

        message,

        readByStudent:
          false,

        readBySupport:
          true,

        createdAt:
          new Date()

      });


      /* =====================================================
         ASSIGN TICKET

         First admin/support person who replies becomes
         the assigned support representative.
      ===================================================== */

      if (
        !ticket.assignedTo
      ){

        ticket.assignedTo =
          req.user._id;

      }


      /* =====================================================
         STATUS
      ===================================================== */

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
          "waiting_for_student";

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

module.exports =
  router;
