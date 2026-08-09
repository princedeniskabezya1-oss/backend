const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    /* ============================================
       BASIC INFO
    ============================================ */
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    /* ============================================
       ROLE SYSTEM
    ============================================ */
role: {
  type: String,
  enum: ["talent", "employer", "admin", "agent", "school", "teacher", "student"],
  default: "talent",
  index: true
},

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active"
    },

    /* ============================================
       REFERRAL SYSTEM
    ============================================ */
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    totalReferrals: {
      type: Number,
      default: 0
    },

    commissionEarned: {
      type: Number,
      default: 0
    },

    /* ============================================
       PAYMENT / SUBSCRIPTION
    ============================================ */
    stripeCustomerId: {
      type: String,
      default: null
    },

    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "cancelled"],
      default: "none"
    },

    /* ============================================
       GLOBAL PROFILE
    ============================================ */
    companyName: {
      type: String,
      default: null
    },

    headline: {
      type: String,
      default: null
    },

    bio: {
      type: String,
      default: null
    },

    location: {
      type: String,
      default: null
    },

    website: {
      type: String,
      default: null
    },

    profileImage: {
      type: String,
      default: null
    },

    bannerImage: {
      type: String,
      default: null
    },

    contactEmail: {
      type: String,
      default: null
    },

    contactPhone: {
      type: String,
      default: null
    },

    industry: {
      type: String,
      default: null
    },

    companyTags: {
      type: [String],
      default: []
    },

    expectedSalary: {
      type: String,
      default: null
    },

    followers: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }],
      default: []
    },

    following: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }],
      default: []
    },

    /* ============================================
       SCHOOL PROFILE
    ============================================ */
    schoolName: {
      type: String,
      default: null
    },

    schoolLogo: {
      type: String,
      default: null
    },

    schoolBanner: {
      type: String,
      default: null
    },

    schoolDescription: {
      type: String,
      default: null
    },

    programs: {
      type: [String],
      default: []
    },

    address: {
      type: String,
      default: null
    },

    /* ============================================
       STUDENT INFO
    ============================================ */
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    course: {
      type: String,
      default: null
    },

    yearLevel: {
      type: String,
      default: null
    },

    section: {
      type: String,
      default: null
    },

    internshipReady: {
      type: Boolean,
      default: false
    },

    /* ============================================
       TEACHER / STAFF INFO
    ============================================ */
department: {
  type: String,
  default: null
},

subject: {
  type: String,
  default: null
},

teacherBio: {
  type: String,
  default: null
},

studentBio: {
  type: String,
  default: null
},

linkedSchoolId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
  index: true
},

createdBySchool: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
  index: true
},

assignedClasses: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class"
  }
],

    /* ============================================
       PRO ACCOUNT
    ============================================ */
    isPro: {
      type: Boolean,
      default: false
    },

    proSince: {
      type: Date,
      default: null
    },

    /* ============================================
       MESSAGING LIMIT SYSTEM
    ============================================ */
    dailyNewConversations: {
      type: Number,
      default: 0
    },

    lastMessageReset: {
      type: Date,
      default: null
    },

   /* ============================================
   PROFESSIONAL PROFILE
============================================ */
profession: {
  type: String,
  default: null
},

languages: {
  type: [String],
  default: []
},

certifications: [
  {
    title: { type: String, default: "" },
    issuer: { type: String, default: "AIFT" },
    year: { type: String, default: "" },
    verifiedByAIFT: { type: Boolean, default: false }
  }
],

availability: {
  type: String,
  enum: ["full-time", "part-time", "freelance", "internship", "not-specified"],
  default: "not-specified"
},

workPreference: {
  type: String,
  enum: ["remote", "onsite", "hybrid", "not-specified"],
  default: "not-specified"
},

yearsOfExperience: {
  type: Number,
  default: 0
},

aiftVerified: {
  type: Boolean,
  default: false
},

aiftCertified: {
  type: Boolean,
  default: false
},

experience: [
      {
        title: { type: String, default: "" },
        company: { type: String, default: "" },
        startDate: { type: String, default: "" },
        endDate: { type: String, default: "" },
        description: { type: String, default: "" }
      }
    ],

    education: [
      {
        school: { type: String, default: "" },
        degree: { type: String, default: "" },
        year: { type: String, default: "" }
      }
    ],

    skills: {
      type: [String],
      default: []
    },

    cvUrl: {
      type: String,
      default: null
    },

    /* ============================================
       SAVED JOBS
    ============================================ */
    savedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job"
      }
    ],

    /* ============================================
       EMPLOYER TEAM MANAGEMENT
    ============================================ */
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    teamRole: {
      type: String,
      enum: ["owner", "manager", "talent_acquisition", "recruiter", "coordinator", "viewer"],
      default: "viewer"
    },

    permissions: {
      type: [String],
      default: []
    },

    isBlockedByEmployer: {
      type: Boolean,
      default: false
    },

    createdByEmployer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

 lastLoginAt: {
  type: Date,
  default: null
},

/* ============================================
   PUBLIC PROFILE SETTINGS
============================================ */
isPublic: {
  type: Boolean,
  default: true
},

showEmail: {
  type: Boolean,
  default: false
},

showPhone: {
  type: Boolean,
  default: false
},

showCV: {
  type: Boolean,
  default: true
},

allowMessages: {
  type: Boolean,
  default: true
},

allowProfileIndexing: {
  type: Boolean,
  default: true
},

profileViews: {
  type: Number,
  default: 0
},

postImpressions: {
  type: Number,
  default: 0
},

preferredRole: {
  type: String,
  default: null
},

salaryExpectation: {
  type: String,
  default: null
},

noticePeriod: {
  type: String,
  default: null
},

workSetup: {
  type: String,
  default: null
},

preferredShift: {
  type: String,
  default: null
},

employmentType: {
  type: String,
  default: null
},

portfolio: [
  {
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    description: { type: String, default: "" }
  }
],

services: {
  type: [String],
  default: []
},

tools: {
  type: [String],
  default: []
},

industries: {
  type: [String],
  default: []
},

employerPraise: [
  {
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    approvedByAgent: {
      type: Boolean,
      default: false
    },
    approvedByEmployer: {
      type: Boolean,
      default: false
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  }
],

achievements: [
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    approvedByAgent: {
      type: Boolean,
      default: false
    },
    approvedByEmployer: {
      type: Boolean,
      default: false
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  }
],

performanceMetrics: {
  taskCompletion: {
    type: Number,
    default: 0
  },

  attendance: {
    type: Number,
    default: 0
  },

  csat: {
    type: Number,
    default: 0
  },

  responseTime: {
    type: String,
    default: ""
  }
},

/* ============================================
   STUDENT STUDIO SETTINGS
============================================ */
studentStudioSettings: {

  /* --------------------------------------------
     LEARNING PREFERENCES
  -------------------------------------------- */
  learning: {
    defaultClassView: {
      type: String,
      enum: [
        "overview",
        "lessons",
        "assignments",
        "resources"
      ],
      default: "overview"
    },

    autoOpenLastClass: {
      type: Boolean,
      default: false
    },

    rememberLastLesson: {
      type: Boolean,
      default: true
    },

    showCompletedLessons: {
      type: Boolean,
      default: true
    },

    compactClassCards: {
      type: Boolean,
      default: false
    }
  },

  /* --------------------------------------------
     NOTIFICATION PREFERENCES
  -------------------------------------------- */
  notifications: {
    assignments: {
      type: Boolean,
      default: true
    },

    assignmentDeadlines: {
      type: Boolean,
      default: true
    },

    grades: {
      type: Boolean,
      default: true
    },

    classAnnouncements: {
      type: Boolean,
      default: true
    },

    teacherMessages: {
      type: Boolean,
      default: true
    },

    classMessages: {
      type: Boolean,
      default: true
    },

    scheduleChanges: {
      type: Boolean,
      default: true
    },

    certificates: {
      type: Boolean,
      default: true
    },

    careerUpdates: {
      type: Boolean,
      default: true
    }
  },

  /* --------------------------------------------
     KABEZYA AI PREFERENCES
  -------------------------------------------- */
  kabezya: {
    enabled: {
      type: Boolean,
      default: true
    },

    explanationLevel: {
      type: String,
      enum: [
        "simple",
        "balanced",
        "advanced"
      ],
      default: "balanced"
    },

    responseLength: {
      type: String,
      enum: [
        "short",
        "balanced",
        "detailed"
      ],
      default: "balanced"
    },

    studySuggestions: {
      type: Boolean,
      default: true
    },

    quizSuggestions: {
      type: Boolean,
      default: true
    },

    grammarAssistance: {
      type: Boolean,
      default: true
    },

    summarizeLessons: {
      type: Boolean,
      default: true
    }
  },

  /* --------------------------------------------
     STUDENT PRIVACY
  -------------------------------------------- */
  privacy: {
    showLearningProgress: {
      type: Boolean,
      default: true
    },

    showCertificates: {
      type: Boolean,
      default: true
    },

    showPortfolio: {
      type: Boolean,
      default: true
    },

    showClassActivity: {
      type: Boolean,
      default: false
    },

    allowClassmateMessages: {
      type: Boolean,
      default: true
    },

    allowTeacherMessages: {
      type: Boolean,
      default: true
    }
  },

  /* --------------------------------------------
     ACCESSIBILITY
  -------------------------------------------- */
  accessibility: {
    reducedMotion: {
      type: Boolean,
      default: false
    },

    highContrast: {
      type: Boolean,
      default: false
    },

    largerText: {
      type: Boolean,
      default: false
    },

    captionsPreferred: {
      type: Boolean,
      default: false
    },

    keyboardNavigationHints: {
      type: Boolean,
      default: true
    }
  }
}
  },
  {
    timestamps: true
  }
);

UserSchema.index({ role: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ schoolId: 1 });
UserSchema.index({ createdByEmployer: 1 });
UserSchema.index({ teamRole: 1 });
UserSchema.index({ industry: 1 });
UserSchema.index({ skills: 1 });
UserSchema.index({ profession: 1 });
UserSchema.index({ languages: 1 });
UserSchema.index({ availability: 1 });
UserSchema.index({ services: 1 });
UserSchema.index({ tools: 1 });
UserSchema.index({ industries: 1 });
UserSchema.index({ workPreference: 1 });
UserSchema.index({ aiftVerified: 1 });
UserSchema.index({ aiftCertified: 1 });
UserSchema.index({ isPublic: 1 });
UserSchema.index({ profileViews: -1 });
UserSchema.index({ name: "text", headline: "text", bio: "text", companyName: "text", location: "text", profession: "text" });
UserSchema.index({ linkedSchoolId: 1 });
UserSchema.index({ createdBySchool: 1 });
UserSchema.index({ subject: 1 });

module.exports = mongoose.model("User", UserSchema);
