const mongoose =
  require(
    "mongoose"
  );


/* =========================================================
   CONSTANTS
========================================================= */

const TEACHER_AI_MODES = [
  "assistant",
  "class-analysis",
  "student-analysis",
  "submission-review",
  "generate-quiz",
  "generate-assignment",
  "feedback",
  "lesson-plan"
];


/* =========================================================
   MESSAGE SCHEMA

   responseSnapshot preserves structured Kabezya responses
   such as:
   - integrity inspection
   - suggested feedback
   - quiz generation
   - assignment generation
   - lesson plans

   content remains the readable text representation.
========================================================= */

const TeacherAIMessageSchema =
  new mongoose.Schema(
    {

      role:{
        type:
          String,

        enum:[
          "user",
          "assistant",
          "system"
        ],

        required:
          true
      },


      content:{
        type:
          String,

        default:
          "",

        maxlength:
          30000
      },


      mode:{
        type:
          String,

        enum:
          TEACHER_AI_MODES,

        default:
          "assistant"
      },


      /* =====================================================
         MESSAGE CONTEXT SNAPSHOT
      ===================================================== */

      classId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Class",

        default:
          null
      },


      studentId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null
      },


      assignmentId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Assignment",

        default:
          null
      },


      submissionId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Submission",

        default:
          null
      },


      quizId:{
        type:
          mongoose.Schema.Types.ObjectId,

        default:
          null
      },


      /* =====================================================
         STRUCTURED AI RESPONSE

         This allows the frontend to reopen the chat later
         without losing Work Inspector / quiz / assignment /
         lesson-plan structures.
      ===================================================== */

      responseSnapshot:{
        type:
          mongoose.Schema.Types.Mixed,

        default:
          null
      },


      /* =====================================================
         PROVIDER METADATA
      ===================================================== */

      model:{
        type:
          String,

        trim:
          true,

        default:
          ""
      },


      inputTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      outputTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      totalTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      responseTimeMs:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      /* =====================================================
         EDIT HISTORY

         User messages may be edited.

         ChatGPT-style behavior will truncate all messages
         AFTER the edited message and regenerate from there.
      ===================================================== */

      edited:{
        type:
          Boolean,

        default:
          false
      },


      editedAt:{
        type:
          Date,

        default:
          null
      },


      originalContent:{
        type:
          String,

        default:
          "",

        maxlength:
          30000
      },


      error:{
        type:
          Boolean,

        default:
          false
      },


      createdAt:{
        type:
          Date,

        default:
          Date.now
      }

    },
    {
      _id:
        true
    }
  );


/* =========================================================
   CONVERSATION SCHEMA
========================================================= */

const TeacherAIConversationSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         OWNER
      ===================================================== */

      teacherId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true
      },


      schoolId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true
      },


      /* =====================================================
         TITLE

         Initially generated from the first user message.

         Example:
           "Planning tomorrow's class"
           "Review John's submission"
           "Create quiz for Business Meeting"
      ===================================================== */

      title:{
        type:
          String,

        trim:
          true,

        maxlength:
          180,

        default:
          "New conversation"
      },


      /* =====================================================
         ACTIVE MODE
      ===================================================== */

      mode:{
        type:
          String,

        enum:
          TEACHER_AI_MODES,

        default:
          "assistant",

        index:
          true
      },


      /* =====================================================
         ACTIVE CONTEXT
      ===================================================== */

      classId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Class",

        default:
          null,

        index:
          true
      },


      studentId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true
      },


      assignmentId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Assignment",

        default:
          null
      },


      submissionId:{
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Submission",

        default:
          null
      },


      quizId:{
        type:
          mongoose.Schema.Types.ObjectId,

        default:
          null
      },


      /* =====================================================
         MESSAGES
      ===================================================== */

      messages:{
        type:[
          TeacherAIMessageSchema
        ],

        default:[]
      },


      /* =====================================================
         STATUS
      ===================================================== */

      status:{
        type:
          String,

        enum:[
          "active",
          "archived"
        ],

        default:
          "active",

        index:
          true
      },


      /* =====================================================
         CONVERSATION METADATA
      ===================================================== */

      lastMessageAt:{
        type:
          Date,

        default:
          Date.now,

        index:
          true
      },


      messageCount:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      totalInputTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      totalOutputTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      totalTokens:{
        type:
          Number,

        min:
          0,

        default:
          0
      },


      metadata:{
        type:
          mongoose.Schema.Types.Mixed,

        default:{}
      }

    },
    {
      timestamps:
        true
    }
  );


/* =========================================================
   INDEXES

   Recent conversations:
     teacherId + status + lastMessageAt

   School audit/support:
     schoolId + teacherId + lastMessageAt
========================================================= */

TeacherAIConversationSchema.index(
  {
    teacherId:
      1,

    status:
      1,

    lastMessageAt:
      -1
  }
);


TeacherAIConversationSchema.index(
  {
    schoolId:
      1,

    teacherId:
      1,

    lastMessageAt:
      -1
  }
);


TeacherAIConversationSchema.index(
  {
    teacherId:
      1,

    updatedAt:
      -1
  }
);


/* =========================================================
   MESSAGE / TOKEN COUNTERS
========================================================= */

TeacherAIConversationSchema.pre(
  "save",
  function(
    next
  ){

    const messages =
      Array.isArray(
        this.messages
      )
        ? this.messages
        : [];


    this.messageCount =
      messages.length;


    if(
      messages.length
    ){

      const lastMessage =
        messages[
          messages.length -
          1
        ];


      this.lastMessageAt =
        lastMessage?.createdAt ||
        new Date();

    }


    this.totalInputTokens =
      messages.reduce(
        (
          total,
          message
        ) =>
          total +
          Number(
            message?.inputTokens ||
            0
          ),
        0
      );


    this.totalOutputTokens =
      messages.reduce(
        (
          total,
          message
        ) =>
          total +
          Number(
            message?.outputTokens ||
            0
          ),
        0
      );


    this.totalTokens =
      this.totalInputTokens +
      this.totalOutputTokens;


    next();

  }
);


/* =========================================================
   PUBLIC METHOD:
   BUILD CHAT TITLE FROM FIRST USER MESSAGE
========================================================= */

TeacherAIConversationSchema.methods
  .ensureTitle =
  function(){

    const currentTitle =
      String(
        this.title ||
        ""
      )
        .trim();


    if(
      currentTitle &&
      currentTitle !==
        "New conversation"
    ){

      return currentTitle;

    }


    const firstUserMessage =
      Array.isArray(
        this.messages
      )
        ? this.messages.find(
            message =>
              message?.role ===
                "user" &&
              String(
                message?.content ||
                ""
              )
                .trim()
          )
        : null;


    if(
      !firstUserMessage
    ){

      this.title =
        "New conversation";


      return this.title;

    }


    const source =
      String(
        firstUserMessage.content ||
        ""
      )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    if(
      !source
    ){

      this.title =
        "New conversation";


      return this.title;

    }


    this.title =
      source.length >
        72
        ? `${source.slice(
            0,
            69
          )}...`
        : source;


    return this.title;

  };


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "TeacherAIConversation",
    TeacherAIConversationSchema
  );
