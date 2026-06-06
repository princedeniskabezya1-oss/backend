const mongoose = require("mongoose");

const { Schema } = mongoose;

const messageTemplateSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    category: {
      type: String,
      enum: [
        "general",
        "recruiting",
        "interview",
        "follow_up",
        "offer",
        "rejection",
        "student",
        "teacher",
        "school",
        "support",
        "meeting"
      ],
      default: "general",
      index: true
    },

    body: {
      type: String,
      required: true,
      maxlength: 10000
    },

    variables: [
      {
        key: String,
        label: String,
        fallback: String
      }
    ],

    visibility: {
      type: String,
      enum: ["private", "team", "company", "school"],
      default: "private"
    },

    usageCount: {
      type: Number,
      default: 0
    },

    lastUsedAt: Date,

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

messageTemplateSchema.index({
  owner: 1,
  category: 1,
  updatedAt: -1
});

messageTemplateSchema.index({
  title: "text",
  body: "text"
});

module.exports = mongoose.model(
  "MessageTemplate",
  messageTemplateSchema
);
