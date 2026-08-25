const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const SCHOLARSHIP_STATUSES = [
  "draft",
  "published",
  "open",
  "closed",
  "completed",
  "cancelled",
  "archived"
];


const SCHOLARSHIP_TYPES = [
  "academic",
  "merit",
  "need_based",
  "athletic",
  "research",
  "leadership",
  "community",
  "company_sponsored",
  "government",
  "international",
  "other"
];


const FUNDING_TYPES = [
  "full",
  "partial",
  "fixed_amount",
  "tuition_only",
  "allowance",
  "mixed"
];


const VISIBILITY_VALUES = [
  "public",
  "school",
  "partners",
  "private"
];


/* =========================================================
   SPONSOR
========================================================= */

const sponsorSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      type: {
        type: String,
        enum: [
          "school",
          "company",
          "government",
          "foundation",
          "organization",
          "individual",
          "other"
        ],
        default: "school"
      },

      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      website: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   FUNDING
========================================================= */

const fundingSchema =
  new mongoose.Schema(
    {
      type: {
        type: String,
        enum: FUNDING_TYPES,
        default: "partial"
      },

      amount: {
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

      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },

      tuitionCovered: {
        type: Boolean,
        default: false
      },

      allowanceIncluded: {
        type: Boolean,
        default: false
      },

      allowanceAmount: {
        type: Number,
        min: 0,
        default: null
      },

      allowancePeriod: {
        type: String,
        enum: [
          "monthly",
          "semester",
          "annual",
          "one_time",
          "unspecified"
        ],
        default: "unspecified"
      },

      notes: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   ELIGIBILITY
========================================================= */

const eligibilitySchema =
  new mongoose.Schema(
    {
      minimumGPA: {
        type: Number,
        min: 0,
        default: null
      },

      minimumGradeAverage: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },

      programs: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 180
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

      nationalities: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 120
          }
        ],
        default: []
      },

      residencyRequirements: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      financialNeedRequired: {
        type: Boolean,
        default: false
      },

      enrolledRequired: {
        type: Boolean,
        default: true
      },

      graduatingStudentsAllowed: {
        type: Boolean,
        default: true
      },

      otherCriteria: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1500
          }
        ],
        default: []
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   CONTACT
========================================================= */

const contactSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 180,
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
        maxlength: 100,
        default: ""
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   SCHOLARSHIP
========================================================= */

const SchoolScholarshipSchema =
  new mongoose.Schema(
    {
      /* =====================================================
         OWNERSHIP
      ===================================================== */

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      partnershipId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SchoolCompanyPartnership",
        default: null,
        index: true
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
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
        maxlength: 300
      },

      description: {
        type: String,
        trim: true,
        maxlength: 15000,
        default: ""
      },

      summary: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },

      type: {
        type: String,
        enum: SCHOLARSHIP_TYPES,
        default: "academic",
        index: true
      },

      status: {
        type: String,
        enum: SCHOLARSHIP_STATUSES,
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
         SPONSOR / FUNDING
      ===================================================== */

      sponsor: {
        type: sponsorSchema,
        default: () => ({})
      },

      funding: {
        type: fundingSchema,
        default: () => ({})
      },

      numberOfAwards: {
        type: Number,
        min: 1,
        default: null
      },

      awardsGranted: {
        type: Number,
        min: 0,
        default: 0
      },


      /* =====================================================
         ELIGIBILITY
      ===================================================== */

      eligibility: {
        type: eligibilitySchema,
        default: () => ({})
      },


      /* =====================================================
         REQUIREMENTS
      ===================================================== */

      requirements: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1500
          }
        ],
        default: []
      },

      requiredDocuments: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 300
          }
        ],
        default: []
      },

      applicationInstructions: {
        type: String,
        trim: true,
        maxlength: 8000,
        default: ""
      },

      externalApplicationUrl: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },

      allowInternalApplications: {
        type: Boolean,
        default: true
      },


      /* =====================================================
         DATES
      ===================================================== */

      applicationOpenDate: {
        type: Date,
        default: null
      },

      deadline: {
        type: Date,
        default: null,
        index: true
      },

      awardDate: {
        type: Date,
        default: null
      },

      academicYear: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      semester: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
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
        default: null
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
         ANALYTICS
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
   VALIDATION
========================================================= */

SchoolScholarshipSchema.pre(
  "validate",
  function validateScholarship(next) {

    if (
      this.applicationOpenDate &&
      this.deadline &&
      this.deadline < this.applicationOpenDate
    ) {

      return next(
        new Error(
          "Scholarship deadline cannot be before the application opening date."
        )
      );

    }


    if (
      this.awardsGranted &&
      this.numberOfAwards &&
      this.awardsGranted > this.numberOfAwards
    ) {

      return next(
        new Error(
          "Awards granted cannot exceed the number of available awards."
        )
      );

    }


    next();

  }
);


/* =========================================================
   INDEXES
========================================================= */

SchoolScholarshipSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


SchoolScholarshipSchema.index({
  schoolId: 1,
  type: 1,
  status: 1
});


SchoolScholarshipSchema.index({
  visibility: 1,
  status: 1,
  deadline: 1
});


SchoolScholarshipSchema.index({
  title: "text",
  description: "text",
  summary: "text"
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.SchoolScholarship ||
  mongoose.model(
    "SchoolScholarship",
    SchoolScholarshipSchema
  );


module.exports.SCHOLARSHIP_STATUSES =
  SCHOLARSHIP_STATUSES;


module.exports.SCHOLARSHIP_TYPES =
  SCHOLARSHIP_TYPES;
