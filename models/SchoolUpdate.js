const mongoose = require("mongoose");

const schoolUpdateSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
      index: true
    },

    audience: {
      type: String,
      enum: ["all", "students", "teachers", "class", "selected"],
      default: "all",
      index: true
    },

    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    teacherIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    type: {
      type: String,
      enum: [
        "announcement",
        "homework",
        "deadline",
        "schedule",
        "event",
        "resource",
        "urgent"
      ],
      default: "announcement",
      index: true
    },

    title: {
      type: String,
      trim: true,
      maxlength: 160,
      required: true
    },

    message: {
      type: String,
      trim: true,
      maxlength: 5000,
      required: true
    },

    resourceUrl: {
      type: String,
      trim: true,
      maxlength: 800,
      default: null
    },

    dueDate: {
      type: Date,
      default: null,
      index: true
    },

    pinned: {
      type: Boolean,
      default: false,
      index: true
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true
    },

    seenBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        seenAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

schoolUpdateSchema.index({ schoolId: 1, createdAt: -1 });
schoolUpdateSchema.index({ schoolId: 1, pinned: -1, createdAt: -1 });
schoolUpdateSchema.index({ classId: 1, createdAt: -1 });

module.exports = mongoose.model("SchoolUpdate", schoolUpdateSchema);
