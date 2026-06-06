const mongoose = require("mongoose");

const { Schema } = mongoose;

const transcriptSegmentSchema = new Schema(
  {
    speaker: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    speakerName: String,

    text: {
      type: String,
      required: true
    },

    startSeconds: {
      type: Number,
      default: 0
    },

    endSeconds: {
      type: Number,
      default: 0
    },

    confidence: {
      type: Number,
      default: 0
    }
  },
  {
    _id: false
  }
);

const actionItemSchema = new Schema(
  {
    text: String,

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },

    dueDate: Date,

    completed: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

const conferenceTranscriptSchema = new Schema(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true
    },

    recordingId: {
      type: Schema.Types.ObjectId,
      ref: "ConferenceRecording",
      index: true
    },

    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true
    },

    generatedBy: {
      type: String,
      enum: ["manual", "ai", "system"],
      default: "ai"
    },

    language: {
      type: String,
      default: "en"
    },

    fullText: {
      type: String,
      default: ""
    },

    summary: {
      type: String,
      default: ""
    },

    keyPoints: [
      {
        type: String
      }
    ],

    actionItems: [actionItemSchema],

    segments: [transcriptSegmentSchema],

    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      index: true
    },

    visibility: {
      type: String,
      enum: ["private", "participants", "company", "school"],
      default: "participants"
    }
  },
  {
    timestamps: true
  }
);

conferenceTranscriptSchema.index({
  fullText: "text",
  summary: "text",
  keyPoints: "text"
});

conferenceTranscriptSchema.index({ meetingId: 1, createdAt: -1 });

module.exports = mongoose.model(
  "ConferenceTranscript",
  conferenceTranscriptSchema
);
