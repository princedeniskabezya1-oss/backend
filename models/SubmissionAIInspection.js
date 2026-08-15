const mongoose =
  require("mongoose");


/* =========================================================
   SUBMISSION AI INSPECTION

   Stores evidence-oriented Kabezya reviews of student work.

   IMPORTANT:
   ---------------------------------------------------------
   This model does NOT represent a disciplinary decision.

   Kabezya may:
   - identify similarities
   - identify writing inconsistencies
   - identify source/citation concerns
   - summarize evidence
   - recommend teacher review

   Kabezya must NOT automatically determine that a student
   cheated, plagiarized, passed, failed, or deserves a
   disciplinary action.
========================================================= */


/* =========================================================
   MATCHED PASSAGE SCHEMA
========================================================= */

const MatchedPassageSchema =
  new mongoose.Schema(
    {
      sourceType:{
        type:String,
        enum:[
          "submission",
          "lesson",
          "assignment",
          "resource",
          "web",
          "unknown"
        ],
        default:"unknown"
      },

      sourceId:{
        type:
          mongoose.Schema.Types.ObjectId,
        default:null
      },

      /*
        For internal submission matches, keep the student ID
        server-side for authorization/audit purposes.

        The frontend does not automatically need to receive it.
      */

      sourceStudentId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null
      },

      sourceTitle:{
        type:String,
        trim:true,
        maxlength:500,
        default:""
      },

      sourceUrl:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      submittedText:{
        type:String,
        trim:true,
        maxlength:5000,
        default:""
      },

      matchedText:{
        type:String,
        trim:true,
        maxlength:5000,
        default:""
      },

      similarity:{
        type:Number,
        min:0,
        max:1,
        default:0
      },

      similarityPercent:{
        type:Number,
        min:0,
        max:100,
        default:0
      },

      evidenceType:{
        type:String,
        enum:[
          "exact",
          "near_exact",
          "phrase_overlap",
          "semantic_similarity",
          "citation",
          "other"
        ],
        default:"other"
      },

      verified:{
        type:Boolean,
        default:false
      }
    },
    {
      _id:true
    }
  );


/* =========================================================
   WRITING OBSERVATION SCHEMA
========================================================= */

const WritingObservationSchema =
  new mongoose.Schema(
    {
      type:{
        type:String,
        enum:[
          "vocabulary_shift",
          "tone_shift",
          "grammar_shift",
          "complexity_shift",
          "formatting_shift",
          "citation_shift",
          "other"
        ],
        default:"other"
      },

      severity:{
        type:String,
        enum:[
          "low",
          "medium",
          "high"
        ],
        default:"low"
      },

      title:{
        type:String,
        trim:true,
        maxlength:300,
        default:""
      },

      explanation:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      excerpt:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      }
    },
    {
      _id:true
    }
  );


/* =========================================================
   CITATION REVIEW SCHEMA
========================================================= */

const CitationReviewSchema =
  new mongoose.Schema(
    {
      citation:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      status:{
        type:String,
        enum:[
          "verified",
          "unverified",
          "unsupported",
          "not_checked"
        ],
        default:"not_checked"
      },

      explanation:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      },

      sourceUrl:{
        type:String,
        trim:true,
        maxlength:3000,
        default:""
      }
    },
    {
      _id:true
    }
  );


/* =========================================================
   WRITING CONSISTENCY SCHEMA
========================================================= */

const WritingConsistencySchema =
  new mongoose.Schema(
    {
      status:{
        type:String,
        enum:[
          "consistent",
          "minor_variation",
          "review",
          "insufficient_evidence"
        ],
        default:"insufficient_evidence"
      },

      /*
        This is NOT an "AI-generated probability."

        It is only an internal indicator describing the
        strength of detected writing-style variation.
      */

      variationScore:{
        type:Number,
        min:0,
        max:100,
        default:0
      },

      observations:{
        type:[
          WritingObservationSchema
        ],
        default:[]
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   INTERNAL SIMILARITY SCHEMA
========================================================= */

const InternalSimilaritySchema =
  new mongoose.Schema(
    {
      checked:{
        type:Boolean,
        default:false
      },

      comparedSubmissionCount:{
        type:Number,
        min:0,
        default:0
      },

      highestSimilarity:{
        type:Number,
        min:0,
        max:100,
        default:0
      },

      matches:{
        type:[
          MatchedPassageSchema
        ],
        default:[]
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   COURSE MATERIAL SIMILARITY
========================================================= */

const CourseMaterialSimilaritySchema =
  new mongoose.Schema(
    {
      checked:{
        type:Boolean,
        default:false
      },

      highestSimilarity:{
        type:Number,
        min:0,
        max:100,
        default:0
      },

      matches:{
        type:[
          MatchedPassageSchema
        ],
        default:[]
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   PUBLIC WEB REVIEW
========================================================= */

const WebReviewSchema =
  new mongoose.Schema(
    {
      /*
        Never set checked=true unless a real web/originality
        provider actually performed the lookup.
      */

      checked:{
        type:Boolean,
        default:false
      },

      provider:{
        type:String,
        trim:true,
        maxlength:200,
        default:""
      },

      checkedAt:{
        type:Date,
        default:null
      },

      matches:{
        type:[
          MatchedPassageSchema
        ],
        default:[]
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   AI ANALYSIS
========================================================= */

const AIAnalysisSchema =
  new mongoose.Schema(
    {
      summary:{
        type:String,
        trim:true,
        maxlength:12000,
        default:""
      },

      strengths:{
        type:[String],
        default:[]
      },

      concerns:{
        type:[String],
        default:[]
      },

      recommendedTeacherActions:{
        type:[String],
        default:[]
      },

      suggestedFeedback:{
        type:String,
        trim:true,
        maxlength:10000,
        default:""
      },

      /*
        Optional academic suggestion only.

        This must never automatically update Submission.grade.
      */

      suggestedScore:{
        type:Number,
        default:null
      },

      model:{
        type:String,
        trim:true,
        maxlength:200,
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
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   TEACHER REVIEW
========================================================= */

const TeacherReviewSchema =
  new mongoose.Schema(
    {
      reviewed:{
        type:Boolean,
        default:false
      },

      reviewedAt:{
        type:Date,
        default:null
      },

      reviewedBy:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        default:null
      },

      decision:{
        type:String,
        enum:[
          "pending",
          "no_concern",
          "needs_discussion",
          "confirmed_issue",
          "dismissed"
        ],
        default:"pending"
      },

      notes:{
        type:String,
        trim:true,
        maxlength:10000,
        default:""
      }
    },
    {
      _id:false
    }
  );


/* =========================================================
   MAIN INSPECTION SCHEMA
========================================================= */

const SubmissionAIInspectionSchema =
  new mongoose.Schema(
    {
      schoolId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
      },

      teacherId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
      },

      studentId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        index:true
      },

      classId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Class",
        default:null,
        index:true
      },

      assignmentId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Assignment",
        required:true,
        index:true
      },

      submissionId:{
        type:
          mongoose.Schema.Types.ObjectId,
        ref:"Submission",
        required:true,
        index:true
      },

      /*
        Snapshot information allows an inspection to remain
        understandable even if the assignment later changes.
      */

      submissionSnapshot:{
        title:{
          type:String,
          trim:true,
          maxlength:500,
          default:""
        },

        submittedText:{
          type:String,
          default:"",
          maxlength:50000
        },

        submittedAt:{
          type:Date,
          default:null
        }
      },

      status:{
        type:String,
        enum:[
          "processing",
          "clear",
          "review",
          "high_concern",
          "failed"
        ],
        default:"processing",
        index:true
      },

      /*
        Evidence-oriented risk indicator.

        This is NOT a plagiarism percentage and must not be
        displayed as one.
      */

      reviewScore:{
        type:Number,
        min:0,
        max:100,
        default:0
      },

      internalSimilarity:{
        type:
          InternalSimilaritySchema,
        default:() => ({})
      },

      courseMaterialSimilarity:{
        type:
          CourseMaterialSimilaritySchema,
        default:() => ({})
      },

      webReview:{
        type:
          WebReviewSchema,
        default:() => ({})
      },

      writingConsistency:{
        type:
          WritingConsistencySchema,
        default:() => ({})
      },

      citationReview:{
        type:[
          CitationReviewSchema
        ],
        default:[]
      },

      aiAnalysis:{
        type:
          AIAnalysisSchema,
        default:() => ({})
      },

      teacherReview:{
        type:
          TeacherReviewSchema,
        default:() => ({})
      },

      error:{
        occurred:{
          type:Boolean,
          default:false
        },

        message:{
          type:String,
          trim:true,
          maxlength:2000,
          default:""
        }
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

/*
  Most recent inspections for one submission.
*/

SubmissionAIInspectionSchema.index(
  {
    submissionId:1,
    createdAt:-1
  }
);


/*
  Teacher inspection history.
*/

SubmissionAIInspectionSchema.index(
  {
    teacherId:1,
    createdAt:-1
  }
);


/*
  School integrity review history.
*/

SubmissionAIInspectionSchema.index(
  {
    schoolId:1,
    status:1,
    createdAt:-1
  }
);


/*
  Student inspection history.

  Useful for authorized teacher/school review, but this should
  NOT become an automatic disciplinary profile.
*/

SubmissionAIInspectionSchema.index(
  {
    schoolId:1,
    studentId:1,
    createdAt:-1
  }
);


/*
  Assignment inspection reporting.
*/

SubmissionAIInspectionSchema.index(
  {
    assignmentId:1,
    classId:1,
    createdAt:-1
  }
);


/* =========================================================
   SAFE STATUS HELPER
========================================================= */

SubmissionAIInspectionSchema.methods
  .markFailed =
  function(
    message = ""
  ){

    this.status =
      "failed";


    this.error = {
      occurred:true,

      message:
        String(
          message ||
          "Inspection failed."
        )
          .trim()
          .slice(
            0,
            2000
          )
    };


    return this;

  };


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "SubmissionAIInspection",
    SubmissionAIInspectionSchema
  );
