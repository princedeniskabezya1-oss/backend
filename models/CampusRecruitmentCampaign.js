const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived"
];


const CAMPAIGN_TYPES = [
  "campus_hiring",
  "graduate_recruitment",
  "internship_recruitment",
  "school_visit",
  "career_fair",
  "hiring_drive",
  "assessment_drive",
  "interview_day",
  "talent_pipeline"
];


const CAMPAIGN_MODES = [
  "online",
  "onsite",
  "hybrid"
];


/* =========================================================
   LOCATION
========================================================= */

const campaignLocationSchema =
  new mongoose.Schema(
    {
      venue: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      address: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      },

      meetingUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   METRICS

   These fields are stored as campaign-level snapshots.

   Later the Career Hub analytics service can synchronize
   them from invitations, applications, interviews and
   placements.
========================================================= */

const campaignMetricsSchema =
  new mongoose.Schema(
    {
      eligibleStudents: {
        type: Number,
        min: 0,
        default: 0
      },

      studentsInvited: {
        type: Number,
        min: 0,
        default: 0
      },

      invitationsAccepted: {
        type: Number,
        min: 0,
        default: 0
      },

      applications: {
        type: Number,
        min: 0,
        default: 0
      },

      shortlisted: {
        type: Number,
        min: 0,
        default: 0
      },

      interviews: {
        type: Number,
        min: 0,
        default: 0
      },

      offers: {
        type: Number,
        min: 0,
        default: 0
      },

      offers: {
        type: Number,
        min: 0,
        default: 0
      },

      approvedPlacements: {
        type: Number,
        min: 0,
        default: 0
      },

      activePlacements: {
        type: Number,
        min: 0,
        default: 0
      },

      completedPlacements: {
        type: Number,
        min: 0,
        default: 0
      },

      hires: {
        type: Number,
        min: 0,
        default: 0
      }
    },
    {
      _id: false
    }
  );


/* =========================================================
   STATUS HISTORY
========================================================= */

const campaignHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: CAMPAIGN_STATUSES,
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
        maxlength: 100,
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
   CAMPUS RECRUITMENT CAMPAIGN
========================================================= */

const CampusRecruitmentCampaignSchema =
  new mongoose.Schema(
    {
      /* =====================================================
         OWNERSHIP
      ===================================================== */

      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      partnershipId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SchoolCompanyPartnership",
        required: true,
        index: true
      },


      /* =====================================================
         DISPLAY SNAPSHOTS

         IDs above remain authoritative. These fields allow
         historical campaign records to preserve names.
      ===================================================== */

      companyName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      schoolName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },


      /* =====================================================
         CAMPAIGN IDENTITY
      ===================================================== */

      title: {
        type: String,
        trim: true,
        maxlength: 300,
        required: true
      },

      description: {
        type: String,
        trim: true,
        maxlength: 15000,
        default: ""
      },

      objective: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: ""
      },

      campaignType: {
        type: String,
        enum: CAMPAIGN_TYPES,
        default: "campus_hiring",
        index: true
      },

      mode: {
        type: String,
        enum: CAMPAIGN_MODES,
        default: "hybrid"
      },

      status: {
        type: String,
        enum: CAMPAIGN_STATUSES,
        default: "draft",
        index: true
      },


      /* =====================================================
         OPPORTUNITIES

         A campaign may advertise multiple existing AIFT
         jobs/internships.

         We intentionally store generic ObjectIds here instead
         of inventing a new Opportunity model because your
         existing jobs/internships remain the source of truth.
      ===================================================== */

      opportunityIds: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId
          }
        ],
        default: []
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

      targetGraduationYears: {
        type: [
          {
            type: Number,
            min: 1900,
            max: 2200
          }
        ],
        default: []
      },


      /* =====================================================
         CAPACITY
      ===================================================== */

      expectedStudents: {
        type: Number,
        min: 0,
        default: null
      },

      targetHires: {
        type: Number,
        min: 0,
        default: null
      },


      /* =====================================================
         SCHEDULE
      ===================================================== */

      startDate: {
        type: Date,
        default: null,
        index: true
      },

      endDate: {
        type: Date,
        default: null
      },

      applicationDeadline: {
        type: Date,
        default: null
      },

      location: {
        type: campaignLocationSchema,
        default: () => ({})
      },


      /* =====================================================
         CAMPAIGN SETTINGS
      ===================================================== */

      allowStudentApplications: {
        type: Boolean,
        default: true
      },

      inviteEligibleStudents: {
        type: Boolean,
        default: false
      },

      visibleToStudents: {
        type: Boolean,
        default: true
      },

      requireSchoolApproval: {
        type: Boolean,
        default: false
      },


      /* =====================================================
         METRICS
      ===================================================== */

      metrics: {
        type: campaignMetricsSchema,
        default: () => ({})
      },


      /* =====================================================
         LIFECYCLE TIMESTAMPS
      ===================================================== */

      scheduledAt: {
        type: Date,
        default: null
      },

      activatedAt: {
        type: Date,
        default: null
      },

      pausedAt: {
        type: Date,
        default: null
      },

      completedAt: {
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
         AUDIT
      ===================================================== */

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

      statusHistory: {
        type: [campaignHistorySchema],
        default: []
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

CampusRecruitmentCampaignSchema.pre(
  "validate",
  function validateCampaign(next) {

    if (
      this.startDate &&
      this.endDate &&
      this.endDate < this.startDate
    ) {
      return next(
        new Error(
          "Campaign end date cannot be before the start date."
        )
      );
    }


    if (
      this.applicationDeadline &&
      this.endDate &&
      this.applicationDeadline > this.endDate
    ) {
      return next(
        new Error(
          "Application deadline cannot be after the campaign end date."
        )
      );
    }


    next();
  }
);


/* =========================================================
   INDEXES
========================================================= */

CampusRecruitmentCampaignSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1
});


CampusRecruitmentCampaignSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


CampusRecruitmentCampaignSchema.index({
  partnershipId: 1,
  status: 1,
  createdAt: -1
});


CampusRecruitmentCampaignSchema.index({
  companyId: 1,
  schoolId: 1,
  startDate: -1
});


CampusRecruitmentCampaignSchema.index({
  status: 1,
  startDate: 1,
  endDate: 1
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.CampusRecruitmentCampaign ||
  mongoose.model(
    "CampusRecruitmentCampaign",
    CampusRecruitmentCampaignSchema
  );


module.exports.CAMPAIGN_STATUSES =
  CAMPAIGN_STATUSES;


module.exports.CAMPAIGN_TYPES =
  CAMPAIGN_TYPES;


module.exports.CAMPAIGN_MODES =
  CAMPAIGN_MODES;
