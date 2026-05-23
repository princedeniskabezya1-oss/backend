const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    type: {
      type: String,
      enum: ["link", "file", "video", "document", "other"],
      default: "link",
    },
  },
  { _id: true }
);

const classLessonSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },

    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassModule",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    summary: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      default: "",
    },

    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    coverUrl: {
      type: String,
      default: "",
      trim: true,
    },

    resources: {
      type: [resourceSchema],
      default: [],
    },

    order: {
      type: Number,
      default: 0,
      index: true,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },

    previewEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClassLesson", classLessonSchema);
