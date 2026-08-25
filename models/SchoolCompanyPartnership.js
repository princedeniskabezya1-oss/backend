const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const PARTNERSHIP_TYPES = [
  "internship_partnership",
  "job_placement",
  "recruitment",
  "training",
  "collaboration",
  "career_event",
  "scholarship",
  "research",
  "mentorship",
  "industry_linkage"
];


const PARTNERSHIP_STATUSES = [
  "draft",
  "pending",
  "review",
  "approved",
  "active",
  "paused",
  "completed",
  "rejected",
  "cancelled",
  "expired",
  "archived"
];


const REQUESTED_BY_VALUES = [
  "school",
  "company",
  "employer",
  "admin"
];


/* =========================================================
   CONTACT PERSON
========================================================= */

const contactPersonSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 180,
        default: ""
      },

      title: {
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
   DOCUMENT / ATTACHMENT
========================================================= */

const partnershipDocumentSchema =
  new mongoose.Schema(
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

      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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

const partnershipHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: PARTNERSHIP_STATUSES,
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
   PARTNERSHIP SCHEMA
========================================================= */

const SchoolCompanyPartnershipSchema =
  new mongoose.Schema(
    {
      /* =====================================================
         PARTIES
      ===================================================== */

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      schoolName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      companyName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },


      /* =====================================================
         PARTNERSHIP IDENTITY
      ===================================================== */

      title: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      type: {
        type: String,
        enum: PARTNERSHIP_TYPES,
        default: "internship_partnership",
        index: true
      },

      /*
        Keep partnershipType for compatibility with your
        existing frontend/backend.
      */

      partnershipType: {
        type: String,
        enum: PARTNERSHIP_TYPES,
        default: "internship_partnership"
      },

      status: {
        type: String,
        enum: PARTNERSHIP_STATUSES,
        default: "pending",
        index: true
      },

      requestedBy: {
        type: String,
        enum: REQUESTED_BY_VALUES,
        required: true
      },


      /* =====================================================
         PROPOSAL
      ===================================================== */

      message: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      objective: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      description: {
        type: String,
        trim: true,
        maxlength: 15000,
        default: ""
      },

      benefits: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1500
          }
        ],
        default: []
      },

      activities: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 1500
          }
        ],
        default: []
      },


      /* =====================================================
         CAREER HUB CAPABILITIES

         These tell AIFT what this partnership is authorized
         or intended to support.
      ===================================================== */

      capabilities: {
        internships: {
          type: Boolean,
          default: false
        },

        jobs: {
          type: Boolean,
          default: false
        },

        recruitment: {
          type: Boolean,
          default: false
        },

        training: {
          type: Boolean,
          default: false
        },

        careerEvents: {
          type: Boolean,
          default: false
        },

        scholarships: {
          type: Boolean,
          default: false
        },

        mentorship: {
          type: Boolean,
          default: false
        },

        research: {
          type: Boolean,
          default: false
        }
      },


      /* =====================================================
         TARGETING
      ===================================================== */

      targetPrograms: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 180
          }
        ],
        default: []
      },

      targetYearLevels: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 100
          }
        ],
        default: []
      },

      targetSkills: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 180
          }
        ],
        default: []
      },


      /* =====================================================
         CAPACITY
      ===================================================== */

      internshipSlots: {
        type: Number,
        min: 0,
        default: null
      },

      jobSlots: {
        type: Number,
        min: 0,
        default: null
      },

      expectedStudents: {
        type: Number,
        min: 0,
        default: null
      },


      /* =====================================================
         DATES
      ===================================================== */

      proposedStartDate: {
        type: Date,
        default: null
      },

      proposedEndDate: {
        type: Date,
        default: null
      },

      startDate: {
        type: Date,
        default: null
      },

      endDate: {
        type: Date,
        default: null
      },

      approvedAt: {
        type: Date,
        default: null
      },

      activatedAt: {
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

      cancelledAt: {
        type: Date,
        default: null
      },

      archivedAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         CONTACTS
      ===================================================== */

      schoolContact: {
        type: contactPersonSchema,
        default: () => ({})
      },

      companyContact: {
        type: contactPersonSchema,
        default: () => ({})
      },


      /* =====================================================
         DOCUMENTS

         Later our existing upload infrastructure can attach
         MOA/MOU/proposals here.
      ===================================================== */

      documents: {
        type: [partnershipDocumentSchema],
        default: []
      },


      /* =====================================================
         INTERNAL NOTES
      ===================================================== */

      schoolNotes: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      companyNotes: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      rejectionReason: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },


      /* =====================================================
         METRICS

         These can later be synchronized from actual
         applications, placements and events.
      ===================================================== */

      metrics: {
        opportunitiesCreated: {
          type: Number,
          min: 0,
          default: 0
        },

        studentsApplied: {
          type: Number,
          min: 0,
          default: 0
        },

        studentsPlaced: {
          type: Number,
          min: 0,
          default: 0
        },

        studentsHired: {
          type: Number,
          min: 0,
          default: 0
        },

        eventsCompleted: {
          type: Number,
          min: 0,
          default: 0
        }
      },


      /* =====================================================
         HISTORY / AUDIT
      ===================================================== */

      statusHistory: {
        type: [partnershipHistorySchema],
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
      },

      lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true
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

SchoolCompanyPartnershipSchema.pre(
  "validate",
  function validatePartnership(next) {

    if (
      this.proposedStartDate &&
      this.proposedEndDate &&
      this.proposedEndDate <
        this.proposedStartDate
    ) {

      return next(
        new Error(
          "Proposed end date cannot be before the proposed start date."
        )
      );

    }


    if (
      this.startDate &&
      this.endDate &&
      this.endDate <
        this.startDate
    ) {

      return next(
        new Error(
          "Partnership end date cannot be before the start date."
        )
      );

    }


    next();

  }
);


/* =========================================================
   INDEXES
========================================================= */

SchoolCompanyPartnershipSchema.index({
  schoolId: 1,
  companyId: 1,
  status: 1
});


SchoolCompanyPartnershipSchema.index({
  schoolId: 1,
  createdAt: -1
});


SchoolCompanyPartnershipSchema.index({
  companyId: 1,
  createdAt: -1
});


SchoolCompanyPartnershipSchema.index({
  schoolId: 1,
  type: 1,
  status: 1
});


SchoolCompanyPartnershipSchema.index({
  companyId: 1,
  type: 1,
  status: 1
});


/*
  Prevent multiple simultaneous live partnership records
  between the same school/company/type.

  Historical completed/rejected/cancelled records remain.
*/

SchoolCompanyPartnershipSchema.index(
  {
    schoolId: 1,
    companyId: 1,
    type: 1
  },
  {
    unique: true,

    partialFilterExpression: {
      status: {
        $in: [
          "draft",
          "pending",
          "review",
          "approved",
          "active",
          "paused"
        ]
      }
    },

    name:
      "unique_live_school_company_partnership"
  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.SchoolCompanyPartnership ||
  mongoose.model(
    "SchoolCompanyPartnership",
    SchoolCompanyPartnershipSchema
  );


module.exports.PARTNERSHIP_TYPES =
  PARTNERSHIP_TYPES;


module.exports.PARTNERSHIP_STATUSES =
  PARTNERSHIP_STATUSES;
