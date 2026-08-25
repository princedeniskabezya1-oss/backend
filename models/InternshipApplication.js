const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const APPLICATION_STATUSES = [
  "pending",
  "review",
  "shortlisted",
  "interview",
  "approved",
  "active",
  "completed",
  "rejected",
  "withdrawn"
];


const APPLICATION_SOURCES = [
  "student",
  "school_recommendation",
  "school_placement",
  "employer_invitation",
  "admin"
];


/* =========================================================
   STATUS HISTORY
========================================================= */

const statusHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: APPLICATION_STATUSES,
        required: true
      },

      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      changedByRole: {
        type: String,
        trim: true,
        default: ""
      },

      note: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      changedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   INTERNSHIP APPLICATION
========================================================= */

const InternshipApplicationSchema =
  new mongoose.Schema(
    {
      /* =====================================================
         RELATIONSHIPS
      ===================================================== */

      opportunityId: {
        type: mongoose.Schema.Types.ObjectId,

        /*
          IMPORTANT:

          The actual opportunity model is registered as
          "SchoolOpportunity", not "Opportunity".
        */

        ref: "SchoolOpportunity",

        required: true,
        index: true
      },

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },


      /* =====================================================
         APPLICATION
      ===================================================== */

      status: {
        type: String,
        enum: APPLICATION_STATUSES,
        default: "pending",
        required: true,
        index: true
      },

      source: {
        type: String,
        enum: APPLICATION_SOURCES,
        default: "student",
        index: true
      },

      message: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      notes: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },


      /* =====================================================
         STUDENT SUBMISSION CONTENT
      ===================================================== */

      resumeUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      portfolioUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      coverLetter: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      attachments: {
        type: [
          {
            name: {
              type: String,
              trim: true,
              maxlength: 300,
              default: ""
            },

            url: {
              type: String,
              trim: true,
              maxlength: 2000,
              required: true
            },

            publicId: {
              type: String,
              trim: true,
              maxlength: 1000,
              default: ""
            },

            mimeType: {
              type: String,
              trim: true,
              maxlength: 200,
              default: ""
            },

            size: {
              type: Number,
              min: 0,
              default: null
            }
          }
        ],
        default: []
      },


      /* =====================================================
         SCHOOL RECOMMENDATION
      ===================================================== */

      recommendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      recommendationMessage: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },


      /* =====================================================
         REVIEW
      ===================================================== */

      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      reviewedAt: {
        type: Date,
        default: null
      },

      interviewAt: {
        type: Date,
        default: null
      },

      interviewLocation: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      },

      interviewNotes: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },


      /* =====================================================
         PLACEMENT LIFECYCLE
      ===================================================== */

      approvedAt: {
        type: Date,
        default: null
      },

      startedAt: {
        type: Date,
        default: null
      },

      completedAt: {
        type: Date,
        default: null
      },

      rejectedAt: {
        type: Date,
        default: null
      },

      withdrawnAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         HISTORY
      ===================================================== */

      statusHistory: {
        type: [statusHistorySchema],
        default: []
      },


      /* =====================================================
         AUDIT
      ===================================================== */

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    },
    {
      timestamps: true
    }
  );


/* =========================================================
   DUPLICATE PROTECTION

   One application record per student/opportunity.

   A withdrawn or rejected student should not silently create
   another document. A future re-application feature should
   deliberately reopen/update the existing application.
========================================================= */

InternshipApplicationSchema.index(
  {
    opportunityId: 1,
    studentId: 1
  },
  {
    unique: true,
    name: "unique_student_opportunity_application"
  }
);


/* =========================================================
   QUERY INDEXES
========================================================= */

InternshipApplicationSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


InternshipApplicationSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1
});


InternshipApplicationSchema.index({
  studentId: 1,
  status: 1,
  createdAt: -1
});


InternshipApplicationSchema.index({
  opportunityId: 1,
  status: 1,
  createdAt: -1
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.InternshipApplication ||
  mongoose.model(
    "InternshipApplication",
    InternshipApplicationSchema
  );


module.exports.APPLICATION_STATUSES =
  APPLICATION_STATUSES;


module.exports.APPLICATION_SOURCES =
  APPLICATION_SOURCES;
