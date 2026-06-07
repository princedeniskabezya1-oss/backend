const mongoose = require("mongoose");

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    role: {
      type: String,
      enum: [
        "owner",
        "admin",
        "member",
        "guest"
      ],
      default: "member"
    },

    joinedAt: {
      type: Date,
      default: Date.now
    },

    leftAt: {
      type: Date,
      default: null
    },

    isActive: {
      type: Boolean,
      default: true
    },

    muted: {
      type: Boolean,
      default: false
    },

    pinned: {
      type: Boolean,
      default: false
    },

    archived: {
      type: Boolean,
      default: false
    },

    blocked: {
      type: Boolean,
      default: false
    },

    lastReadAt: {
      type: Date,
      default: null
    },

    lastDeliveredAt: {
      type: Date,
      default: null
    },

    unreadCount: {
      type: Number,
      default: 0
    },

    customName: {
      type: String,
      trim: true,
      maxlength: 120
    },

    customPhoto: {
      type: String,
      trim: true
    }
  },
  {
    _id: false
  }
);

const meetingSettingsSchema = new Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },

    allowAudioCall: {
      type: Boolean,
      default: true
    },

    allowVideoCall: {
      type: Boolean,
      default: true
    },

    allowConference: {
      type: Boolean,
      default: true
    },

    maxParticipants: {
      type: Number,
      default: 50
    },

    requireHostApproval: {
      type: Boolean,
      default: false
    },

    allowScreenShare: {
      type: Boolean,
      default: true
    },

    allowRecording: {
      type: Boolean,
      default: false
    },

    waitingRoom: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

const lastMessageSchema = new Schema(
  {
    message: {
      type: Schema.Types.ObjectId,
      ref: "Message"
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    text: {
      type: String,
      default: ""
    },

    messageType: {
      type: String,
      default: "text"
    },

    createdAt: {
      type: Date
    }
  },
  {
    _id: false
  }
);

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "direct",
        "group",
        "team",
        "class",
        "support",
        "meeting"
      ],
      default: "direct",
      index: true
    },

    title: {
      type: String,
      trim: true,
      maxlength: 160
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },

    photo: {
      type: String,
      trim: true
    },

    participants: [participantSchema],

    participantIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true
      }
    ],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      index: true
    },

    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      index: true
    },

    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      index: true
    },

    lastMessage: lastMessageSchema,

    messageCount: {
      type: Number,
      default: 0
    },

    unreadTotal: {
      type: Number,
      default: 0
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    isLocked: {
      type: Boolean,
      default: false
    },

    lockedReason: {
      type: String,
      trim: true
    },

    allowMembersToSend: {
      type: Boolean,
      default: true
    },

    allowFiles: {
      type: Boolean,
      default: true
    },

    allowLinks: {
      type: Boolean,
      default: true
    },

    allowReactions: {
      type: Boolean,
      default: true
    },

    meetingSettings: {
      type: meetingSettingsSchema,
      default: () => ({})
    },

    startedAsMeeting: {
      type: Boolean,
      default: false
    },

    lastMeetingAt: {
      type: Date
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],

    metadata: {
      source: {
        type: String,
enum: [
  "manual",
  "job",
  "application",
  "school",
  "class",
  "support",
  "system",
  "meeting_invite"
],
        default: "manual"
      },

      clientConversationId: String,
      ipAddress: String,
      userAgent: String
    }
  },
  {
    timestamps: true
  }
);

conversationSchema.pre("save", function(next){
  this.participantIds = [
    ...new Set(
      (this.participants || [])
        .filter(p => p.user && p.isActive !== false)
        .map(p => String(p.user))
    )
  ];

  next();
});

conversationSchema.methods.hasParticipant = function(userId){
  return this.participants.some(participant =>
    String(participant.user) === String(userId) &&
    participant.isActive !== false
  );
};

conversationSchema.methods.getParticipant = function(userId){
  return this.participants.find(participant =>
    String(participant.user) === String(userId)
  );
};

conversationSchema.methods.addParticipant = function(userId, role = "member"){
  const existing = this.getParticipant(userId);

  if(existing){
    existing.isActive = true;
    existing.leftAt = null;
    existing.role = existing.role || role;
    return;
  }

  this.participants.push({
    user:userId,
    role,
    joinedAt:new Date(),
    isActive:true
  });
};

conversationSchema.methods.removeParticipant = function(userId){
  const participant = this.getParticipant(userId);

  if(participant){
    participant.isActive = false;
    participant.leftAt = new Date();
  }
};

conversationSchema.methods.markRead = function(userId){
  const participant = this.getParticipant(userId);

  if(participant){
    participant.lastReadAt = new Date();
    participant.unreadCount = 0;
  }
};

conversationSchema.methods.incrementUnreadForOthers = function(senderId){
  this.participants.forEach(participant => {
    if(
      String(participant.user) !== String(senderId) &&
      participant.isActive !== false &&
      participant.muted !== true &&
      participant.blocked !== true
    ){
      participant.unreadCount =
        Number(participant.unreadCount || 0) + 1;
    }
  });
};

conversationSchema.methods.setLastMessage = function(message){
  this.lastMessage = {
    message:message._id,
    sender:message.sender,
    text:message.deletedForEveryone
      ? "Message deleted"
      : message.text || "",
    messageType:message.messageType || "text",
    createdAt:message.createdAt || new Date()
  };

  this.messageCount =
    Number(this.messageCount || 0) + 1;
};

conversationSchema.index({ participantIds: 1, updatedAt: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });
conversationSchema.index({ createdBy: 1, updatedAt: -1 });
conversationSchema.index({ companyId: 1, updatedAt: -1 });
conversationSchema.index({ schoolId: 1, updatedAt: -1 });
conversationSchema.index({ classId: 1, updatedAt: -1 });
conversationSchema.index({ jobId: 1, updatedAt: -1 });
conversationSchema.index({ applicationId: 1, updatedAt: -1 });
conversationSchema.index({ title: "text", description: "text", tags: "text" });

module.exports = mongoose.model("Conversation", conversationSchema);
