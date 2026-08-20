const mongoose = require("mongoose");


const AuthSessionSchema =
  new mongoose.Schema(
    {

      /* ============================================
         ACCOUNT
      ============================================ */

      userId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true,

        index: true
      },


      /* ============================================
         SESSION IDENTIFIER

         This ID is also embedded inside the JWT.
      ============================================ */

      sessionId: {
        type: String,

        required: true,

        unique: true,

        index: true,

        trim: true
      },


      /* ============================================
         DEVICE
      ============================================ */

      deviceName: {
        type: String,

        default: "Unknown device",

        trim: true,

        maxlength: 160
      },


      deviceType: {
        type: String,

        enum: [
          "desktop",
          "mobile",
          "tablet",
          "unknown"
        ],

        default: "unknown"
      },


      browser: {
        type: String,

        default: "Unknown browser",

        trim: true,

        maxlength: 120
      },


      operatingSystem: {
        type: String,

        default: "Unknown OS",

        trim: true,

        maxlength: 120
      },


      userAgent: {
        type: String,

        default: "",

        maxlength: 1000
      },


      /* ============================================
         NETWORK INFORMATION

         Keep this operational/security-only.
         Do not expose the full value publicly.
      ============================================ */

      ipAddress: {
        type: String,

        default: null,

        trim: true,

        maxlength: 120
      },


      /* ============================================
         ACTIVITY
      ============================================ */

      createdAt: {
        type: Date,

        default: Date.now,

        index: true
      },


      lastActiveAt: {
        type: Date,

        default: Date.now,

        index: true
      },


      expiresAt: {
        type: Date,

        required: true,

        index: true
      },


      /* ============================================
         REVOCATION
      ============================================ */

      revokedAt: {
        type: Date,

        default: null,

        index: true
      },


      revokedReason: {
        type: String,

        enum: [
          null,
          "logout",
          "logout_all",
          "logout_others",
          "password_changed",
          "security_action",
          "expired",
          "admin_revoked"
        ],

        default: null
      }

    },
    {

      versionKey: false

    }
  );


/* ============================================
   USER SESSION LOOKUPS
============================================ */

AuthSessionSchema.index({
  userId: 1,
  revokedAt: 1,
  lastActiveAt: -1
});


/* ============================================
   ACTIVE SESSION LOOKUPS
============================================ */

AuthSessionSchema.index({
  sessionId: 1,
  revokedAt: 1,
  expiresAt: 1
});


/* ============================================
   AUTO-CLEAN EXPIRED SESSION RECORDS

   MongoDB removes records after expiresAt.
   Cleanup is asynchronous and may not happen
   at the exact expiration second.
============================================ */

AuthSessionSchema.index(
  {
    expiresAt: 1
  },
  {
    expireAfterSeconds: 0
  }
);


module.exports =
  mongoose.models.AuthSession ||
  mongoose.model(
    "AuthSession",
    AuthSessionSchema
  );
