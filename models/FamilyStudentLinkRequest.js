const mongoose = require("mongoose");

const FamilyStudentLinkRequestSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    familyChildId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyChild",
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    studentIdentityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentIdentity",
      required: true
    },
    relationshipType: {
      type: String,
      enum: ["parent", "guardian", "sibling", "family_member", "other"],
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled", "revoked", "expired"],
      default: "pending",
      index: true
    },
    respondedAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

FamilyStudentLinkRequestSchema.index({ studentId: 1, status: 1, createdAt: -1 });
FamilyStudentLinkRequestSchema.index({ familyId: 1, familyChildId: 1, status: 1 });

module.exports = mongoose.model("FamilyStudentLinkRequest", FamilyStudentLinkRequestSchema);
