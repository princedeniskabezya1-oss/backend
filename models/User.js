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
       ROLE SYSTEM (UPDATED)
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
       PAYMENT SYSTEM READY
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
       PROFILE EXTENSIONS (GLOBAL)
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
       SCHOOL PROFILE (NEW 🔥)
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

    contactEmail: {
      type: String,
      default: null
    },

    contactPhone: {
      type: String,
      default: null
    },

    /* ============================================
       STUDENT INFO (NEW)
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
       TEACHER INFO (NEW)
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
       PRO ACCOUNT SYSTEM
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
       PROFESSIONAL PROFILE SYSTEM
    ============================================ */
    experience: [
      {
        title: { type: String },
        company: { type: String },
        startDate: { type: String },
        endDate: { type: String },
        description: { type: String }
      }
    ],

    education: [
      {
        school: { type: String },
        degree: { type: String },
        year: { type: String }
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
       SAVED JOBS SYSTEM
    ============================================ */
    savedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job"
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", UserSchema);