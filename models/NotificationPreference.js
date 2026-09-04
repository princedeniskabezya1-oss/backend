const mongoose = require("mongoose");

const { Schema } = mongoose;

const notificationPreferenceSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },

    messages: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      desktop: { type: Boolean, default: true }
    },

    calls: {
      push: { type: Boolean, default: true },
      emailMissed: { type: Boolean, default: true },
      sound: { type: Boolean, default: true }
    },

    meetings: {
      reminders: { type: Boolean, default: true },
      reminderMinutesBefore: { type: Number, default: 10 },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },

    jobs: {
      applications: { type: Boolean, default: true },
      interviews: { type: Boolean, default: true },
      offers: { type: Boolean, default: true },
      recommendations: { type: Boolean, default: true }
    },

    school: {
      classUpdates: { type: Boolean, default: true },
      assignments: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      announcements: { type: Boolean, default: true }
    },

    notificationFeed: {
      mutedTypes: [{ type: String, trim: true }],
      typeWeights: { type: Map, of: Number, default: {} },
      feedbackUpdatedAt: Date
    },

    navigationViews: {
      jobsViewedAt: { type: Date, default: null },
      networkViewedAt: { type: Date, default: null }
    },

    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" },
      end: { type: String, default: "07:00" },
      timezone: { type: String, default: "Asia/Manila" }
    },

    mutedConversations: [
      {
        conversationId: {
          type: Schema.Types.ObjectId,
          ref: "Conversation"
        },
        mutedUntil: Date
      }
    ],

    blockedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema
);
