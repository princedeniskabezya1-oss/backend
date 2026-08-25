const mongoose = require("mongoose");


/* =========================================================
   SUB-SCHEMAS
========================================================= */

const EventLocationSchema =
  new mongoose.Schema(
    {
      venueName: {
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

      city: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      province: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      country: {
        type: String,
        trim: true,
        maxlength: 200,
        default: "Philippines"
      },

      room: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      latitude: {
        type: Number,
        default: null
      },

      longitude: {
        type: Number,
        default: null
      }
    },
    {
      _id: false
    }
  );


const EventSpeakerSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
        maxlength: 300,
        required: true
      },

      title: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      organization: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      bio: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      avatar: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      profileUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      }
    },
    {
      _id: true
    }
  );


const EventAgendaItemSchema =
  new mongoose.Schema(
    {
      title: {
        type: String,
        trim: true,
        maxlength: 300,
        required: true
      },

      description: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },

      startTime: {
        type: Date,
        default: null
      },

      endTime: {
        type: Date,
        default: null
      },

      speaker: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      }
    },
    {
      _id: true
    }
  );


/* =========================================================
   MAIN CAREER EVENT SCHEMA
========================================================= */

const CareerEventSchema =
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

      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },


      /* =====================================================
         BASIC INFORMATION
      ===================================================== */

      title: {
        type: String,
        trim: true,
        required: true,
        maxlength: 300,
        index: true
      },

      slug: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 400,
        default: "",
        index: true
      },

      shortDescription: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
      },

      description: {
        type: String,
        trim: true,
        maxlength: 20000,
        default: ""
      },

      eventType: {
        type: String,

        enum: [
          "career_fair",
          "recruitment",
          "seminar",
          "webinar",
          "workshop",
          "networking",
          "company_talk",
          "orientation",
          "mentorship",
          "competition",
          "hackathon",
          "portfolio_review",
          "mock_interview",
          "job_fair",
          "internship_fair",
          "other"
        ],

        default: "career_fair",

        index: true
      },


      /* =====================================================
         EVENT DELIVERY
      ===================================================== */

      format: {
        type: String,

        enum: [
          "physical",
          "online",
          "hybrid"
        ],

        default: "physical",

        index: true
      },

      location: {
        type: EventLocationSchema,
        default: () => ({})
      },

      onlinePlatform: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      meetingUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      meetingInstructions: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },


      /* =====================================================
         DATE / TIME
      ===================================================== */

      startAt: {
        type: Date,
        required: true,
        index: true
      },

      endAt: {
        type: Date,
        required: true,
        index: true
      },

      timezone: {
        type: String,
        trim: true,
        maxlength: 100,
        default: "Asia/Manila"
      },

      registrationOpenAt: {
        type: Date,
        default: null
      },

      registrationDeadline: {
        type: Date,
        default: null,
        index: true
      },


      /* =====================================================
         REGISTRATION
      ===================================================== */

      registrationRequired: {
        type: Boolean,
        default: true
      },

      capacity: {
        type: Number,
        min: 1,
        default: null
      },

      registeredCount: {
        type: Number,
        min: 0,
        default: 0
      },

      waitlistEnabled: {
        type: Boolean,
        default: true
      },

      waitlistCount: {
        type: Number,
        min: 0,
        default: 0
      },

      attendanceCount: {
        type: Number,
        min: 0,
        default: 0
      },


      /* =====================================================
         AUDIENCE
      ===================================================== */

      audience: {
        type: [
          {
            type: String,

            enum: [
              "students",
              "graduates",
              "alumni",
              "job_seekers",
              "teachers",
              "employers",
              "public"
            ]
          }
        ],

        default: [
          "students"
        ]
      },

      programs: {
        type: [String],
        default: []
      },

      yearLevels: {
        type: [String],
        default: []
      },

      skills: {
        type: [String],
        default: []
      },

      industries: {
        type: [String],
        default: []
      },


      /* =====================================================
         VISIBILITY
      ===================================================== */

      visibility: {
        type: String,

        enum: [
          "public",
          "school",
          "invited"
        ],

        default: "public",

        index: true
      },


      /* =====================================================
         EVENT MEDIA
      ===================================================== */

      coverImage: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      coverImagePublicId: {
        type: String,
        trim: true,
        maxlength: 1000,
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
         EVENT CONTENT
      ===================================================== */

      speakers: {
        type: [EventSpeakerSchema],
        default: []
      },

      agenda: {
        type: [EventAgendaItemSchema],
        default: []
      },

      organizerName: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      organizerEmail: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 320,
        default: ""
      },

      organizerPhone: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },


      /* =====================================================
         STATUS
      ===================================================== */

      status: {
        type: String,

        enum: [
          "draft",
          "published",
          "registration_open",
          "registration_closed",
          "ongoing",
          "completed",
          "cancelled",
          "archived"
        ],

        default: "draft",

        index: true
      },

      publishedAt: {
        type: Date,
        default: null
      },

      cancelledAt: {
        type: Date,
        default: null
      },

      cancellationReason: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },

      completedAt: {
        type: Date,
        default: null
      },


      /* =====================================================
         FEATURE / DISCOVERY
      ===================================================== */

      featured: {
        type: Boolean,
        default: false,
        index: true
      },

      tags: {
        type: [String],
        default: []
      },


      /* =====================================================
         ANALYTICS
      ===================================================== */

      viewsCount: {
        type: Number,
        min: 0,
        default: 0
      },

      sharesCount: {
        type: Number,
        min: 0,
        default: 0
      },

      savesCount: {
        type: Number,
        min: 0,
        default: 0
      },


      /* =====================================================
         SOFT DELETE
      ===================================================== */

      archived: {
        type: Boolean,
        default: false,
        index: true
      },

      archivedAt: {
        type: Date,
        default: null
      }
    },
    {
      timestamps: true
    }
  );


/* =========================================================
   VALIDATION
========================================================= */

CareerEventSchema.pre(
  "validate",
  function(next) {

    if (
      this.startAt &&
      this.endAt &&
      this.endAt <= this.startAt
    ) {

      return next(
        new Error(
          "Event end time must be after the start time."
        )
      );

    }


    if (
      this.registrationOpenAt &&
      this.registrationDeadline &&
      this.registrationDeadline <
        this.registrationOpenAt
    ) {

      return next(
        new Error(
          "Registration deadline cannot be before registration opens."
        )
      );

    }


    if (
      this.registrationDeadline &&
      this.startAt &&
      this.registrationDeadline >
        this.startAt
    ) {

      return next(
        new Error(
          "Registration deadline cannot be after the event starts."
        )
      );

    }


    next();

  }
);


/* =========================================================
   INDEXES
========================================================= */

CareerEventSchema.index({
  schoolId: 1,
  status: 1,
  startAt: 1
});


CareerEventSchema.index({
  companyId: 1,
  status: 1,
  startAt: 1
});


CareerEventSchema.index({
  visibility: 1,
  status: 1,
  startAt: 1
});


CareerEventSchema.index({
  eventType: 1,
  startAt: 1
});


CareerEventSchema.index({
  featured: 1,
  startAt: 1
});


CareerEventSchema.index({
  archived: 1,
  startAt: 1
});


CareerEventSchema.index({
  title: "text",
  shortDescription: "text",
  description: "text",
  tags: "text",
  industries: "text",
  skills: "text"
});


/* =========================================================
   VIRTUALS
========================================================= */

CareerEventSchema.virtual(
  "remainingCapacity"
).get(
  function() {

    if (
      !this.capacity
    ) {

      return null;

    }


    return Math.max(
      this.capacity -
        this.registeredCount,
      0
    );

  }
);


CareerEventSchema.virtual(
  "isFull"
).get(
  function() {

    if (
      !this.capacity
    ) {

      return false;

    }


    return (
      this.registeredCount >=
      this.capacity
    );

  }
);


/* =========================================================
   JSON SETTINGS
========================================================= */

CareerEventSchema.set(
  "toJSON",
  {
    virtuals: true
  }
);


CareerEventSchema.set(
  "toObject",
  {
    virtuals: true
  }
);


module.exports =
  mongoose.model(
    "CareerEvent",
    CareerEventSchema
  );
