const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const SCHOLARSHIP_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "review",
  "shortlisted",
  "approved",
  "awarded",
  "rejected",
  "withdrawn"
];


/* =========================================================
   DOCUMENT
========================================================= */

const documentSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 300,
        required: true
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
      },

      uploadedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );


/* =========================================================
   STATUS HISTORY
========================================================= */

const historySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: SCHOLARSHIP_APPLICATION_STATUSES,
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
        maxlength: 3000,
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
   APPLICATION
========================================================= */

const ScholarshipApplicationSchema =
  new mongoose.Schema(
    {
      scholarshipId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SchoolScholarship",
        required: true,
        index: true
      },

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
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
        enum: SCHOLARSHIP_APPLICATION_STATUSES,
        default: "draft",
        index: true
      },

      personalStatement: {
        type: String,
        trim: true,
        maxlength: 15000,
        default: ""
      },

      financialNeedStatement: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      achievements: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1500
          }
        ],
        default: []
      },

      documents: {
        type: [documentSchema],
        default: []
      },


      /* =====================================================
         ACADEMIC SNAPSHOT

         We store the submitted snapshot so a future profile
         edit does not rewrite what reviewers originally saw.
      ===================================================== */

      academicSnapshot: {
        program: {
          type: String,
          trim: true,
          maxlength: 200,
          default: ""
        },

        yearLevel: {
          type: String,
          trim: true,
          maxlength: 100,
          default: ""
        },

        gpa: {
          type: Number,
          min: 0,
          default: null
        },

        gradeAverage: {
          type: Number,
          min: 0,
          max: 100,
          default: null
        }
      },


      /* =====================================================
         REVIEW
      ===================================================== */

      reviewerNotes: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      reviewedAt: {
        type: Date,
        default: null
      },

      submittedAt: {
        type: Date,
        default: null
      },

      approvedAt: {
        type: Date,
        default: null
      },

      awardedAt: {
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
         AWARD
      ===================================================== */

      awardAmount: {
        type: Number,
        min: 0,
        default: null
      },

      awardCurrency: {
        type: String,
        trim: true,
        uppercase: true,
        default: "PHP"
      },

      awardNotes: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },


      /* =====================================================
         AUDIT
      ===================================================== */

      statusHistory: {
        type: [historySchema],
        default: []
      },

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
   ONE APPLICATION PER SCHOLARSHIP / STUDENT
========================================================= */

ScholarshipApplicationSchema.index(
  {
    scholarshipId: 1,
    studentId: 1
  },
  {
    unique: true,
    name:
      "unique_student_scholarship_application"
  }
);


ScholarshipApplicationSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


ScholarshipApplicationSchema.index({
  studentId: 1,
  status: 1,
  createdAt: -1
});


ScholarshipApplicationSchema.index({
  scholarshipId: 1,
  status: 1,
  createdAt: -1
});


module.exports =
  mongoose.models.ScholarshipApplication ||
  mongoose.model(
    "ScholarshipApplication",
    ScholarshipApplicationSchema
  );


module.exports.SCHOLARSHIP_APPLICATION_STATUSES =
  SCHOLARSHIP_APPLICATION_STATUSES;
