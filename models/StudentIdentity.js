const mongoose = require("mongoose");

const StudentIdentitySchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    aiftStudentId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    verificationSource: {
      type: String,
      enum: ["created_by_school", "school_linked", "admin_verified"],
      required: true
    },
    verifiedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    }
  },
  { timestamps: true }
);

StudentIdentitySchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("StudentIdentity", StudentIdentitySchema);
