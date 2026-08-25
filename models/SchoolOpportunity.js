const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const OPPORTUNITY_TYPES = [
  "internship",
  "job",
  "company_request",
  "collaboration",
  "placement",
  "project",
  "career_talk"
];


const OPPORTUNITY_STATUSES = [
  "draft",
  "pending",
  "review",
  "approved",
  "open",
  "active",
  "closed",
  "completed",
  "rejected",
  "archived"
];


const WORK_SETUPS = [
  "onsite",
  "remote",
  "hybrid",
  "flexible",
  "unspecified"
];


const VISIBILITY_VALUES = [
  "public",
  "school",
  "partners",
  "private"
];


/* =========================================================
   SUB-SCHEMAS
========================================================= */

const compensationSchema =
  new mongoose.Schema(
    {
      type: {
        type: String,
        enum: [
          "paid",
          "unpaid",
          "allowance",
          "salary",
          "stipend",
          "negotiable",
          "not_specified"
        ],
        default: "not_specified"
      },

      amount: {
        type: Number,
        min: 0,
        default: null
      },

      minAmount: {
        type: Number,
        min: 0,
        default: null
      },

      maxAmount: {
        type: Number,
        min: 0,
        default: null
      },

      currency: {
        type: String,
        trim: true,
        uppercase: true,
        default: "PHP"
      },

      period: {
        type: String,
        enum: [
          "hour",
          "day",
          "week",
          "month",
          "project",
          "one_time",
          "unspecified"
        ],
        default: "unspecified"
      },

      notes: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      }
    },
    {
      _id: false
    }
  );


const contactSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 160,
        default: ""
      },

      email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: ""
      },

      phone: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ""
      },

      website: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   OPPORTUNITY SCHEMA
========================================================= */

const opportunitySchema =
  new mongoose.Schema(
    {
      /* =====================================================
         OWNERSHIP
      ===================================================== */

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      employerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },


      /* =====================================================
         IDENTITY
      ===================================================== */

      title: {
        type: String,
        trim: true,
        required: true,
        maxlength: 220
      },

      companyName: {
        type: String,
        trim: true,
        maxlength: 220,
        default: ""
      },

      description: {
        type: String,
        trim: true,
        maxlength: 12000,
        default: ""
      },

      summary: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      },


      /* =====================================================
         CLASSIFICATION
      ===================================================== */

      type: {
        type: String,
        enum: OPPORTUNITY_TYPES,
        default: "internship",
        required: true,
        index: true
      },

      status: {
        type: String,
        enum: OPPORTUNITY_STATUSES,
        default: "draft",
        index: true
      },

      visibility: {
        type: String,
        enum: VISIBILITY_VALUES,
        default: "school",
        index: true
      },


      /* =====================================================
         LOCATION / WORK
      ===================================================== */

      location: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      workSetup: {
        type: String,
        enum: WORK_SETUPS,
        default: "unspecified"
      },

      employmentType: {
        type: String,
        enum: [
          "full_time",
          "part_time",
          "contract",
          "temporary",
          "internship",
          "project",
          "volunteer",
          "unspecified"
        ],
        default: "unspecified"
      },


      /* =====================================================
         CAPACITY / DURATION
      ===================================================== */

      slots: {
        type: Number,
        min: 1,
        default: null
      },

      filledSlots: {
        type: Number,
        min: 0,
        default: 0
      },

      durationText: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      startDate: {
        type: Date,
        default: null
      },

      endDate: {
        type: Date,
        default: null
      },

      deadline: {
        type: Date,
        default: null,
        index: true
      },


      /* =====================================================
         TARGETING
      ===================================================== */

      programs: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 160
          }
        ],
        default: []
      },

      skills: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 160
          }
        ],
        default: []
      },

      yearLevels: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 100
          }
        ],
        default: []
      },

      requirements: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1000
          }
        ],
        default: []
      },

      responsibilities: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1000
          }
        ],
        default: []
      },


      /* =====================================================
         APPLICATION
      ===================================================== */

      applicationInstructions: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      allowStudentApplications: {
        type: Boolean,
        default: true
      },

      allowSchoolRecommendations: {
        type: Boolean,
        default: true
      },

      externalApplicationUrl: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },


      /* =====================================================
         COMPENSATION
      ===================================================== */

      compensation: {
        type: compensationSchema,
        default: () => ({})
      },


      /* =====================================================
         CONTACT
      ===================================================== */

      contact: {
        type: contactSchema,
        default: () => ({})
      },


      /* =====================================================
         PUBLICATION
      ===================================================== */

      publishedAt: {
        type: Date,
        default: null,
        index: true
      },

      closedAt: {
        type: Date,
        default: null
      },

      archivedAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         COUNTERS
      ===================================================== */

      applicationCount: {
        type: Number,
        min: 0,
        default: 0
      },

      viewCount: {
        type: Number,
        min: 0,
        default: 0
      },


      /* =====================================================
         SOURCE
      ===================================================== */

      source: {
        type: String,
        enum: [
          "school",
          "employer",
          "company_request",
          "partnership",
          "admin"
        ],
        default: "school"
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    {
      timestamps: true,

      toJSON: {
        virtuals: true
      },

      toObject: {
        virtuals: true
      }
    }
  );


/* =========================================================
   VIRTUAL COMPANY ID

   Existing frontend/backend code sometimes calls this
   companyId while the canonical field is employerId.
========================================================= */

opportunitySchema.virtual("companyId")
  .get(function getCompanyId() {
    return this.employerId;
  });


/* =========================================================
   VALIDATION
========================================================= */

opportunitySchema.pre(
  "validate",
  function validateOpportunity(next) {

    if (
      !this.schoolId &&
      !this.employerId
    ) {
      return next(
        new Error(
          "An opportunity must belong to a school or company."
        )
      );
    }


    if (
      this.startDate &&
      this.endDate &&
      this.endDate < this.startDate
    ) {
      return next(
        new Error(
          "Opportunity end date cannot be before the start date."
        )
      );
    }


    if (
      this.filledSlots &&
      this.slots &&
      this.filledSlots > this.slots
    ) {
      return next(
        new Error(
          "Filled slots cannot exceed available slots."
        )
      );
    }


    next();
  }
);


/* =========================================================
   INDEXES
========================================================= */

opportunitySchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


opportunitySchema.index({
  employerId: 1,
  status: 1,
  createdAt: -1
});


opportunitySchema.index({
  type: 1,
  status: 1,
  deadline: 1
});


opportunitySchema.index({
  visibility: 1,
  status: 1,
  publishedAt: -1
});


opportunitySchema.index({
  schoolId: 1,
  type: 1,
  status: 1
});


opportunitySchema.index({
  employerId: 1,
  type: 1,
  status: 1
});


opportunitySchema.index({
  title: "text",
  companyName: "text",
  description: "text",
  location: "text"
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.SchoolOpportunity ||
  mongoose.model(
    "SchoolOpportunity",
    opportunitySchema
  );


module.exports.OPPORTUNITY_TYPES =
  OPPORTUNITY_TYPES;


module.exports.OPPORTUNITY_STATUSES =
  OPPORTUNITY_STATUSES;
