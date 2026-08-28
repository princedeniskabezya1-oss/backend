const mongoose = require("mongoose");


/* =========================================================
   SUPPORT CONVERSATION MESSAGE
========================================================= */

const SupportConversationMessageSchema =
  new mongoose.Schema(
    {
      role: {
        type: String,
        enum: [
          "user",
          "assistant",
          "system"
        ],
        required: true
      },

      content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20000
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   HUMAN SUPPORT REPLY

   senderType keeps the existing "student" value for
   backwards compatibility with tickets already stored
   in MongoDB.

   New non-admin replies use "user".
========================================================= */

const SupportReplySchema =
  new mongoose.Schema(
    {
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },

      senderType: {
        type: String,
        enum: [
          "student",
          "user",
          "support"
        ],
        required: true
      },

      senderRole: {
        type: String,
        enum: [
          "student",
          "employer",
          "school",
          "teacher",
          "agent",
          "admin",
          "other"
        ],
        default: "other"
      },

      message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 10000
      },

      /*
        These two legacy fields are intentionally preserved
        so existing Student Help Center tickets remain valid.
      */

      readByStudent: {
        type: Boolean,
        default: false
      },

      readBySupport: {
        type: Boolean,
        default: false
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );


/* =========================================================
   SUPPORT TICKET
========================================================= */

const SupportTicketSchema =
  new mongoose.Schema(
    {
      ticketNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
        uppercase: true
      },


      /* =====================================================
         OWNER
      ===================================================== */

      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      accountRole: {
        type: String,
        enum: [
          "student",
          "employer",
          "school",
          "teacher",
          "agent",
          "admin",
          "other"
        ],
        default: "other",
        index: true
      },

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },


      /* =====================================================
         CONTACT INFORMATION
      ===================================================== */

      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 180
      },

      phone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: ""
      },


      /* =====================================================
         ISSUE CATEGORY

         Shared by Student, Employer, School, Teacher,
         Agent and future AIFT workspaces.
      ===================================================== */

      category: {
        type: String,

        enum: [
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
        ],

        default: "other",

        index: true
      },

      subject: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      additionalInfo: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      page: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },


      /* =====================================================
         KABEZYA / AI SUPPORT CONTEXT
      ===================================================== */

      aiConversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StudentAIConversation",
        default: null
      },

      conversation: {
        type: [
          SupportConversationMessageSchema
        ],
        default: []
      },


      /* =====================================================
         HUMAN SUPPORT CONVERSATION
      ===================================================== */

      replies: {
        type: [
          SupportReplySchema
        ],
        default: []
      },


      /* =====================================================
         SUPPORT WORKFLOW
      ===================================================== */

      status: {
        type: String,

        enum: [
          "open",
          "in_progress",
          "waiting_for_student",
          "waiting_for_user",
          "resolved",
          "closed"
        ],

        default: "open",

        index: true
      },

      priority: {
        type: String,

        enum: [
          "low",
          "normal",
          "high",
          "urgent"
        ],

        default: "normal",

        index: true
      },

      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true
      },

      resolvedAt: {
        type: Date,
        default: null
      },

      closedAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         SAFE CLIENT / WORKSPACE METADATA
      ===================================================== */

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    {
      timestamps: true
    }
  );


/* =========================================================
   INDEXES
========================================================= */

SupportTicketSchema.index({
  userId: 1,
  createdAt: -1
});


SupportTicketSchema.index({
  userId: 1,
  status: 1,
  lastActivityAt: -1
});


SupportTicketSchema.index({
  accountRole: 1,
  createdAt: -1
});


SupportTicketSchema.index({
  accountRole: 1,
  status: 1,
  lastActivityAt: -1
});


SupportTicketSchema.index({
  schoolId: 1,
  createdAt: -1
});


SupportTicketSchema.index({
  status: 1,
  priority: 1,
  createdAt: -1
});


SupportTicketSchema.index({
  assignedTo: 1,
  status: 1,
  lastActivityAt: -1
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "SupportTicket",
    SupportTicketSchema
  );
