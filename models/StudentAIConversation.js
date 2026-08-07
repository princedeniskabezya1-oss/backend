const mongoose =
  require("mongoose");


/* =========================================================
   MESSAGE SCHEMA
========================================================= */

const StudentAIMessageSchema =
  new mongoose.Schema(
    {
      role:{
        type:String,
        enum:[
          "user",
          "assistant",
          "system"
        ],
        required:true
      },

      content:{
        type:String,
        required:true,
        trim:true,
        maxlength:20000
      },

      mode:{
        type:String,
        enum:[
          "ask",
          "explain",
          "summary",
          "quiz",
          "grammar",
          "plan"
        ],
        default:"ask"
      },

      classId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Class",
        default:null
      },

      sourceType:{
        type:String,
        enum:[
          "general",
          "lesson",
          "assignment",
          "resource"
        ],
        default:"general"
      },

      sourceId:{
        type:
          mongoose.Schema.Types.ObjectId,
        default:null
      },

      model:{
        type:String,
        trim:true,
        default:""
      },

      inputTokens:{
        type:Number,
        min:0,
        default:0
      },

      outputTokens:{
        type:Number,
        min:0,
        default:0
      },

      totalTokens:{
        type:Number,
        min:0,
        default:0
      },

      responseTimeMs:{
        type:Number,
        min:0,
        default:0
      },

      error:{
        type:Boolean,
        default:false
      },

      createdAt:{
        type:Date,
        default:Date.now
      }
    },
    {
      _id:true
    }
  );


/* =========================================================
   CONVERSATION SCHEMA
========================================================= */

const StudentAIConversationSchema =
  new mongoose.Schema(
    {
      studentId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
      },

      schoolId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null,
        index:true
      },

      title:{
        type:String,
        trim:true,
        maxlength:180,
        default:"AI Learning Session"
      },

      mode:{
        type:String,
        enum:[
          "ask",
          "explain",
          "summary",
          "quiz",
          "grammar",
          "plan"
        ],
        default:"ask"
      },

      classId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Class",
        default:null,
        index:true
      },

      sourceType:{
        type:String,
        enum:[
          "general",
          "lesson",
          "assignment",
          "resource"
        ],
        default:"general"
      },

      sourceId:{
        type:
          mongoose.Schema.Types.ObjectId,
        default:null
      },

      messages:[
        StudentAIMessageSchema
      ],

      status:{
        type:String,
        enum:[
          "active",
          "archived"
        ],
        default:"active",
        index:true
      },

      lastMessageAt:{
        type:Date,
        default:Date.now,
        index:true
      },

      messageCount:{
        type:Number,
        min:0,
        default:0
      },

      totalInputTokens:{
        type:Number,
        min:0,
        default:0
      },

      totalOutputTokens:{
        type:Number,
        min:0,
        default:0
      },

      totalTokens:{
        type:Number,
        min:0,
        default:0
      },

      metadata:{
        type:
          mongoose.Schema.Types.Mixed,
        default:{}
      }
    },
    {
      timestamps:true
    }
  );


/* =========================================================
   INDEXES
========================================================= */

StudentAIConversationSchema.index(
  {
    studentId:1,
    lastMessageAt:-1
  }
);


StudentAIConversationSchema.index(
  {
    studentId:1,
    status:1,
    updatedAt:-1
  }
);


StudentAIConversationSchema.index(
  {
    schoolId:1,
    studentId:1,
    createdAt:-1
  }
);


/* =========================================================
   MESSAGE COUNTERS
========================================================= */

StudentAIConversationSchema.pre(
  "save",
  function(next){

    const messages =
      Array.isArray(
        this.messages
      )
        ? this.messages
        : [];


    this.messageCount =
      messages.length;


    if (
      messages.length
    ){

      const lastMessage =
        messages[
          messages.length - 1
        ];


      this.lastMessageAt =
        lastMessage.createdAt ||
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
            message.inputTokens ||
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
            message.outputTokens ||
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


module.exports =
  mongoose.model(
    "StudentAIConversation",
    StudentAIConversationSchema
  );
