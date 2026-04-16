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
      enum: ["talent", "employer", "admin", "agent", "school"],
      default: "talent"
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
UserSchema.index({ name: "text", headline: "text", bio: "text", companyName: "text", location: "text" });

module.exports = mongoose.model("User", UserSchema);