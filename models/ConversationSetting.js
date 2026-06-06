const mongoose = require("mongoose");

const { Schema } = mongoose;

const conversationSettingSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true
    },

    otherUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    pinned: {
      type: Boolean,
      default: false
    },

    muted: {
      type: Boolean,
      default: false
    },

    mutedUntil: Date,

    archived: {
      type: Boolean,
      default: false
    },

    blocked: {
      type: Boolean,
      default: false
    },

    favorite: {
      type: Boolean,
      default: false
    },

    customName: {
      type: String,
      trim: true,
      maxlength: 120
    },

    customColor: {
      type: String,
      trim: true
    },

    lastOpenedAt: Date,

    notificationLevel: {
      type: String,
      enum: ["all", "mentions", "none"],
      default: "all"
    }
  },
  {
    timestamps: true
  }
);

conversationSettingSchema.index(
  {
    user: 1,
    conversationId: 1
  },
  {
    unique: true,
    sparse: true
  }
);

conversationSettingSchema.index(
  {
    user: 1,
    otherUser: 1
  },
  {
    unique: true,
    sparse: true
  }
);

module.exports = mongoose.model(
  "ConversationSetting",
  conversationSettingSchema
);
