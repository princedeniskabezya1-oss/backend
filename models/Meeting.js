const mongoose = require("mongoose");

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    role: {
      type: String,
      enum: [
        "host",
        "cohost",
        "participant",
        "viewer"
      ],
      default: "participant"
    },

    joinedAt: Date,
    leftAt: Date,

    attendanceDuration: {
      type: Number,
      default: 0
    },

    audioEnabled: {
      type: Boolean,
      default: true
    },

    videoEnabled: {
      type: Boolean,
      default: true
    },

    screenSharing: {
      type: Boolean,
      default: false
    },

    handRaised: {
      type: Boolean,
      default: false
    },

    removedByHost: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

const recordingSchema = new Schema(
  {
    recordingUrl: String,
    durationSeconds: Number,
    fileSize: Number,
    startedAt: Date,
    endedAt: Date
  },
  {
    _id: false
  }
);

const meetingSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000
    },

    host: {
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

    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class"
    },

    meetingCode: {
      type: String,
      unique: true,
      index: true
    },

    joinUrl: String,

    meetingType: {
      type: String,
      enum: [
        "instant",
        "scheduled",
        "class",
        "interview",
        "training",
        "conference"
      ],
      default: "instant"
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "waiting",
        "live",
        "ended",
        "cancelled"
      ],
      default: "scheduled",
      index: true
    },

    participants: [participantSchema],

    invitedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    waitingRoomUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    startTime: Date,

    endTime: Date,

    actualStartedAt: Date,

    actualEndedAt: Date,

    durationSeconds: {
      type: Number,
      default: 0
    },

    maxParticipants: {
      type: Number,
      default: 100
    },

    passwordProtected: {
      type: Boolean,
      default: false
    },

password: String,

accessMode: {
  type: String,
  enum: [
    "open",
    "restricted",
    "waiting_room",
    "invite_only",
    "domain_only"
  ],
  default: "open",
  index: true
},

allowGuests: {
  type: Boolean,
  default: false
},

requireHostApproval: {
  type: Boolean,
  default: false
},

lockMeeting: {
  type: Boolean,
  default: false
},

allowJoinBeforeHost: {
  type: Boolean,
  default: true
},

hostControls: {
  muteParticipantsOnEntry: {
    type: Boolean,
    default: false
  },

  allowParticipantsToUnmute: {
    type: Boolean,
    default: true
  },

  allowParticipantsToShareScreen: {
    type: Boolean,
    default: true
  },

  allowParticipantsToChat: {
    type: Boolean,
    default: true
  },

  allowParticipantsToInvite: {
    type: Boolean,
    default: false
  }
},

waitingRoomEnabled: {
  type: Boolean,
  default: false
},

    recordingEnabled: {
      type: Boolean,
      default: false
    },

    recordings: [recordingSchema],

    allowScreenShare: {
      type: Boolean,
      default: true
    },

    allowChat: {
      type: Boolean,
      default: true
    },

    allowFileSharing: {
      type: Boolean,
      default: true
    },

    allowRaiseHand: {
      type: Boolean,
      default: true
    },

    allowParticipantVideo: {
      type: Boolean,
      default: true
    },

    allowParticipantAudio: {
      type: Boolean,
      default: true
    },

    transcriptEnabled: {
      type: Boolean,
      default: false
    },

    transcriptUrl: String,

    analytics: {
      totalParticipants: {
        type: Number,
        default: 0
      },

      peakParticipants: {
        type: Number,
        default: 0
      },

      averageAttendanceMinutes: {
        type: Number,
        default: 0
      }
    }
  },
  {
    timestamps: true
  }
);

meetingSchema.index({
  host: 1,
  createdAt: -1
});

meetingSchema.index({
  conversationId: 1
});

meetingSchema.index({
  meetingCode: 1
});

meetingSchema.index({
  status: 1,
  startTime: 1
});

module.exports = mongoose.model(
  "Meeting",
  meetingSchema
);
