const mongoose =
  require("mongoose");


/* =========================================================
   AIFT EMPLOYER — KABEZYA AI CONVERSATION

   Persistent conversation storage for the Employer
   Kabezya workspace.

   This model is intentionally separate from
   TeacherAIConversation so Employer and Teacher AI data
   remain isolated.

   Stores:
   ---------------------------------------------------------
   - authenticated Employer owner
   - conversation title
   - active Kabezya mode
   - safe Employer context snapshot
   - user and assistant messages
   - optional AI response metadata
   - recent-conversation ordering
========================================================= */


/* =========================================================
   MESSAGE SCHEMA
========================================================= */

const EmployerAIMessageSchema =
  new mongoose.Schema(
    {

      role:{
        type:String,

        enum:[
          "user",
          "assistant"
        ],

        required:true,

        trim:true
      },


      content:{
        type:String,

        required:true,

        trim:true,

        maxlength:20000
      },


      /*
       * Optional structured information returned by
       * Kabezya.
       *
       * This lets us later support:
       * - candidate analysis
       * - job analysis
       * - hiring recommendations
       * - interview plans
       * - pipeline summaries
       *
       * without putting those values inside the visible
       * chat text.
       */
      responseSnapshot:{
        type:mongoose.Schema.Types.Mixed,

        default:null
      }

    },
    {
      _id:true,

      timestamps:true
    }
  );


/* =========================================================
   EMPLOYER CONTEXT SCHEMA
========================================================= */

const EmployerKabezyaContextSchema =
  new mongoose.Schema(
    {

      workspace:{
        type:String,

        default:"employer",

        trim:true,

        maxlength:100
      },


      currentSection:{
        type:String,

        default:"kabezya",

        trim:true,

        maxlength:100
      },


      employer:{

        id:{
          type:String,

          default:"",

          trim:true,

          maxlength:200
        },


        name:{
          type:String,

          default:"",

          trim:true,

          maxlength:500
        },


        industry:{
          type:String,

          default:"",

          trim:true,

          maxlength:500
        },


        location:{
          type:String,

          default:"",

          trim:true,

          maxlength:500
        }

      },


      summary:{

        jobs:{
          type:Number,

          default:0,

          min:0
        },


        activeJobs:{
          type:Number,

          default:0,

          min:0
        },


        applications:{
          type:Number,

          default:0,

          min:0
        }

      }

    },
    {
      _id:false,

      minimize:false
    }
  );


/* =========================================================
   CONVERSATION SCHEMA
========================================================= */

const EmployerAIConversationSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         OWNER

         Always taken from req.user on the backend.
         Never trust an Employer ID sent by the browser.
      ===================================================== */

      employerId:{
        type:mongoose.Schema.Types.ObjectId,

        ref:"User",

        required:true,

        index:true
      },


      /* =====================================================
         TITLE
      ===================================================== */

      title:{
        type:String,

        default:"New conversation",

        trim:true,

        maxlength:200
      },


      /* =====================================================
         KABEZYA MODE

         Keep these values aligned with
         employerKabezyaService.js.
      ===================================================== */

      mode:{
        type:String,

        enum:[
          "assistant",
          "job-analysis",
          "candidate-analysis",
          "pipeline-insights",
          "interview-preparation",
          "hiring-communication",
          "career-hub",
          "employer-analytics"
        ],

        default:"assistant",

        index:true
      },


      /* =====================================================
         SAFE CONTEXT SNAPSHOT
      ===================================================== */

      context:{
        type:
          EmployerKabezyaContextSchema,

        default:() => ({
          workspace:
            "employer",

          currentSection:
            "kabezya",

          employer:{
            id:"",
            name:"",
            industry:"",
            location:""
          },

          summary:{
            jobs:0,
            activeJobs:0,
            applications:0
          }
        })
      },


      /* =====================================================
         CONVERSATION MESSAGES
      ===================================================== */

      messages:{
        type:[
          EmployerAIMessageSchema
        ],

        default:[]
      },


      /* =====================================================
         RECENT CONVERSATIONS ORDER

         updatedAt can change for administrative changes.
         lastMessageAt specifically tracks chat activity.
      ===================================================== */

      lastMessageAt:{
        type:Date,

        default:Date.now,

        index:true
      }

    },
    {

      timestamps:true,

      minimize:false,

      versionKey:false

    }
  );


/* =========================================================
   INDEXES
========================================================= */


/*
 * Primary Recent Conversations query:
 *
 * Employer's conversations sorted newest-first.
 */
EmployerAIConversationSchema.index(
  {
    employerId:1,
    lastMessageAt:-1
  }
);


/*
 * Useful when filtering conversations by Kabezya mode.
 */
EmployerAIConversationSchema.index(
  {
    employerId:1,
    mode:1,
    lastMessageAt:-1
  }
);


/*
 * General Employer conversation history.
 */
EmployerAIConversationSchema.index(
  {
    employerId:1,
    createdAt:-1
  }
);


/* =========================================================
   PRE-VALIDATION NORMALIZATION
========================================================= */

EmployerAIConversationSchema.pre(
  "validate",
  function(next){

    if (
      !this.title ||
      !String(
        this.title
      ).trim()
    ) {

      this.title =
        "New conversation";

    }


    this.title =
      String(
        this.title
      )
        .trim()
        .slice(
          0,
          200
        );


    if (
      !this.lastMessageAt
    ) {

      this.lastMessageAt =
        new Date();

    }


    if (
      !Array.isArray(
        this.messages
      )
    ) {

      this.messages =
        [];

    }


    /*
     * Hard safety boundary.
     *
     * The route already keeps conversations under
     * 200 messages. This provides another model-level
     * boundary if messages are ever saved elsewhere.
     */
    if (
      this.messages.length >
      200
    ) {

      this.messages =
        this.messages.slice(
          -200
        );

    }


    next();

  }
);


/* =========================================================
   JSON TRANSFORM
========================================================= */

EmployerAIConversationSchema.set(
  "toJSON",
  {

    virtuals:true,

    transform(
      doc,
      ret
    ){

      ret.id =
        String(
          ret._id
        );


      if (
        Array.isArray(
          ret.messages
        )
      ) {

        ret.messages =
          ret.messages.map(
            message => {

              if (
                message?._id
              ) {

                message.id =
                  String(
                    message._id
                  );

              }


              return message;

            }
          );

      }


      return ret;

    }

  }
);


/* =========================================================
   MODEL
========================================================= */

const EmployerAIConversation =
  mongoose.models
    .EmployerAIConversation ||
  mongoose.model(
    "EmployerAIConversation",
    EmployerAIConversationSchema
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  EmployerAIConversation;
