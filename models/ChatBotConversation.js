const mongoose = require("mongoose");

const { Schema } = mongoose;

const botMessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true
    },

    content: {
      type: String,
      required: true
    },

    createdAt: {
      type: Date,
      default: Date.now
    },

    metadata: {
      intent: String,
      confidence: Number,
      source: String,
      relatedUser: {
        type: Schema.Types.ObjectId,
        ref: "User"
      },
      relatedJob: {
        type: Schema.Types.ObjectId,
        ref: "Job"
      },
      relatedClass: {
        type: Schema.Types.ObjectId,
        ref: "Class"
      }
    }
  },
  {
    _id: false
  }
);

const chatBotConversationSchema = new Schema(
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

    botType: {
      type: String,
      enum: [
        "support",
        "career_assistant",
        "school_assistant",
        "employer_assistant",
        "meeting_assistant"
      ],
      default: "support",
      index: true
    },

    title: {
      type: String,
      trim: true,
      maxlength: 180
    },

    messages: [botMessageSchema],

    status: {
      type: String,
      enum: ["active", "resolved", "closed"],
      default: "active",
      index: true
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal"
    },

    handoffRequested: {
      type: Boolean,
      default: false
    },

    assignedAgent: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    lastMessageAt: {
      type: Date,
      default: Date.now
    },

    metadata: {
      userAgent: String,
      ipAddress: String,
      page: String
    }
  },
  {
    timestamps: true
  }
);

chatBotConversationSchema.methods.addMessage = function(role, content, metadata = {}){
  this.messages.push({
    role,
    content,
    metadata,
    createdAt: new Date()
  });

  this.lastMessageAt = new Date();
};

chatBotConversationSchema.index({ user: 1, updatedAt: -1 });
chatBotConversationSchema.index({ botType: 1, status: 1 });
chatBotConversationSchema.index({ title: "text", "messages.content": "text" });

module.exports = mongoose.model(
  "ChatBotConversation",
  chatBotConversationSchema
);
