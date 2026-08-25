const mongoose = require("mongoose");


/* =========================================================
   CONSTANTS
========================================================= */

const REGISTRATION_STATUSES = [
  "registered",
  "waitlisted",
  "confirmed",
  "checked_in",
  "attended",
  "no_show",
  "cancelled"
];


const REGISTRATION_SOURCES = [
  "student",
  "school",
  "company",
  "admin"
];


/* =========================================================
   STATUS HISTORY
========================================================= */

const RegistrationHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: REGISTRATION_STATUSES,
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
   REGISTRATION SCHEMA
========================================================= */

const CareerEventRegistrationSchema =
  new mongoose.Schema(
    {
      /* =====================================================
         RELATIONSHIPS
      ===================================================== */

      eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CareerEvent",
        required: true,
        index: true
      },

      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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


      /* =====================================================
         STATUS
      ===================================================== */

      status: {
        type: String,
        enum: REGISTRATION_STATUSES,
        default: "registered",
        required: true,
        index: true
      },

      source: {
        type: String,
        enum: REGISTRATION_SOURCES,
        default: "student",
        index: true
      },


      /* =====================================================
         REGISTRATION DETAILS
      ===================================================== */

      message: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      accessibilityNeeds: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },

      dietaryRequirements: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      emergencyContactName: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      emergencyContactPhone: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },


      /* =====================================================
         CHECK-IN / ATTENDANCE
      ===================================================== */

      registeredAt: {
        type: Date,
        default: Date.now
      },

      confirmedAt: {
        type: Date,
        default: null
      },

      checkedInAt: {
        type: Date,
        default: null
      },

      attendedAt: {
        type: Date,
        default: null
      },

      cancelledAt: {
        type: Date,
        default: null
      },

      noShowMarkedAt: {
        type: Date,
        default: null
      },

      checkedInBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      attendanceMarkedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },


      /* =====================================================
         WAITLIST
      ===================================================== */

      waitlistPosition: {
        type: Number,
        min: 1,
        default: null,
        index: true
      },

      waitlistedAt: {
        type: Date,
        default: null
      },

      promotedFromWaitlistAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         CERTIFICATE / COMPLETION
      ===================================================== */

      certificateEligible: {
        type: Boolean,
        default: false
      },

      certificateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Certificate",
        default: null
      },


      /* =====================================================
         AUDIT
      ===================================================== */

      statusHistory: {
        type: [RegistrationHistorySchema],
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
   ONE REGISTRATION PER STUDENT / EVENT
========================================================= */

CareerEventRegistrationSchema.index(
  {
    eventId: 1,
    studentId: 1
  },
  {
    unique: true,
    name: "unique_student_career_event_registration"
  }
);


/* =========================================================
   QUERY INDEXES
========================================================= */

CareerEventRegistrationSchema.index({
  eventId: 1,
  status: 1,
  createdAt: -1
});


CareerEventRegistrationSchema.index({
  studentId: 1,
  status: 1,
  createdAt: -1
});


CareerEventRegistrationSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});


CareerEventRegistrationSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1
});


CareerEventRegistrationSchema.index({
  eventId: 1,
  waitlistPosition: 1
});


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  mongoose.models.CareerEventRegistration ||
  mongoose.model(
    "CareerEventRegistration",
    CareerEventRegistrationSchema
  );


module.exports.REGISTRATION_STATUSES =
  REGISTRATION_STATUSES;


module.exports.REGISTRATION_SOURCES =
  REGISTRATION_SOURCES;
