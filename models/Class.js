const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    subject: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    classCode: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null
    },

    meetingLink: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },

    schedule: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: null
    },

    materials: {
      type: [String],
      default: []
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true
    }
  },
  {
    timestamps: true
  }
);

classSchema.index({ schoolId: 1, title: 1 });
classSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

classSchema.pre("save", function (next) {
  if (Array.isArray(this.studentIds)) {
    this.studentIds = [...new Set(this.studentIds.map(String))];
  }

  if (Array.isArray(this.materials)) {
    this.materials = this.materials.filter(Boolean);
  }

  next();
});

module.exports = mongoose.model("Class", classSchema);