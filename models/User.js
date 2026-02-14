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
      enum: ["talent", "employer", "admin", "agent"],
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
       PAYMENT SYSTEM READY (Stripe future use)
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
       PROFILE EXTENSIONS (Future ready)
    ============================================ */
    companyName: {
      type: String,
      default: null
    },

    profileImage: {
      type: String,
      default: null
    }

  },
  {
    timestamps: true
  }
);

/* ============================================
   INDEXES FOR PERFORMANCE
============================================ */
UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });

module.exports = mongoose.model("User", UserSchema);
