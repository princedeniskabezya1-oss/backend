const mongoose = require("mongoose");

const FAMILY_SAVED_TYPES = [
  "scholarship",
  "opportunity"
];

const FamilySavedDiscoverySchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    itemType: {
      type: String,
      enum: FAMILY_SAVED_TYPES,
      required: true,
      index: true
    },

    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

FamilySavedDiscoverySchema.index(
  {
    familyId: 1,
    itemType: 1,
    itemId: 1
  },
  {
    unique: true,
    name: "unique_family_saved_discovery"
  }
);

FamilySavedDiscoverySchema.index({
  familyId: 1,
  createdAt: -1
});

module.exports =
  mongoose.models.FamilySavedDiscovery ||
  mongoose.model(
    "FamilySavedDiscovery",
    FamilySavedDiscoverySchema
  );

module.exports.FAMILY_SAVED_TYPES =
  FAMILY_SAVED_TYPES;
