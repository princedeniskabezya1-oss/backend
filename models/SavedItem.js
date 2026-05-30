const mongoose = require("mongoose");

const SavedItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    itemType: {
      type: String,
      enum: ["post", "job"],
      required: true,
      index: true
    },

    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

SavedItemSchema.index(
  { userId: 1, itemType: 1, itemId: 1 },
  { unique: true }
);

SavedItemSchema.index({ userId: 1, createdAt: -1 });
SavedItemSchema.index({ itemType: 1, createdAt: -1 });

module.exports = mongoose.model("SavedItem", SavedItemSchema);
