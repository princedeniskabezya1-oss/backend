const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    schoolId: {
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

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    teamMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    status: {
      type: String,
      enum: ["planning", "in_progress", "review", "completed", "featured"],
      default: "planning",
      index: true
    },

    deadline: {
      type: Date,
      default: null
    },

    attachments: {
      type: [String],
      default: []
    },

    feedback: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    featured: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

projectSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
projectSchema.index({ schoolId: 1, classId: 1, createdAt: -1 });

projectSchema.pre("save", function (next) {
  if (Array.isArray(this.teamMembers)) {
    this.teamMembers = [...new Set(this.teamMembers.map(String))];
  }

  if (Array.isArray(this.attachments)) {
    this.attachments = this.attachments.filter(Boolean);
  }

  if (this.status === "featured") {
    this.featured = true;
  }

  next();
});

module.exports = mongoose.model("Project", projectSchema);