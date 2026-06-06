const mongoose = require("mongoose");

const { Schema } = mongoose;

const conferenceRecordingSchema = new Schema(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true
    },

    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true
    },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200
    },

    recordingUrl: {
      type: String,
      required: true,
      trim: true
    },

    thumbnailUrl: String,

    publicId: String,

    provider: {
      type: String,
      enum: ["cloudinary", "s3", "local", "external"],
      default: "cloudinary"
    },

    mimeType: String,

    fileSize: {
      type: Number,
      default: 0
    },

    durationSeconds: {
      type: Number,
      default: 0
    },

    startedAt: Date,
    endedAt: Date,

    visibility: {
      type: String,
      enum: ["private", "participants", "company", "school", "public"],
      default: "participants"
    },

    allowedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    downloadEnabled: {
      type: Boolean,
      default: false
    },

    transcriptId: {
      type: Schema.Types.ObjectId,
      ref: "ConferenceTranscript"
    },

    status: {
      type: String,
      enum: ["processing", "ready", "failed", "deleted"],
      default: "processing",
      index: true
    },

    metadata: {
      resolution: String,
      format: String,
      bitrate: Number,
      storagePath: String
    }
  },
  {
    timestamps: true
  }
);

conferenceRecordingSchema.index({ meetingId: 1, createdAt: -1 });
conferenceRecordingSchema.index({ owner: 1, createdAt: -1 });
conferenceRecordingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "ConferenceRecording",
  conferenceRecordingSchema
);
