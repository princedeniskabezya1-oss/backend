const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
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

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    instructions: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: null
    },

    dueDate: {
      type: Date,
      default: null,
      index: true
    },

    attachmentUrl: {
      type: String,
      trim: true,
      maxlength: 800,
      default: null
    },

status: {
  type: String,
  enum: [
    "draft",
    "published",
    "archived"
  ],
  default: "published",
  index: true
},

/* =====================================================
   GRADING
===================================================== */

gradingType: {
  type: String,
  enum: [
    "points",
    "rubric",
    "pass_fail"
  ],
  default: "points"
},

totalPoints: {
  type: Number,
  default: 100,
  min: 0
},

passingScore: {
  type: Number,
  default: 60,
  min: 0
},

allowResubmission: {
  type: Boolean,
  default: true
},

maxAttempts: {
  type: Number,
  default: 999,
  min: 1
},

showRubricBeforeSubmission: {
  type: Boolean,
  default: true
},

showScoreImmediately: {
  type: Boolean,
  default: true
},

/* =====================================================
   RUBRIC
===================================================== */

rubric: [
  {
    title: {
      type: String,
      trim: true,
      default: ""
    },

    description: {
      type: String,
      trim: true,
      default: ""
    },

    points: {
      type: Number,
      default: 0,
      min: 0
    },

    order: {
      type: Number,
      default: 0
    }
  }
]
  },
  { timestamps: true }
);

assignmentSchema.index({ schoolId: 1, createdAt: -1 });
assignmentSchema.index({ classId: 1, dueDate: 1 });
assignmentSchema.index({ teacherId: 1, dueDate: 1 });

assignmentSchema.index({
  gradingType:1
});

assignmentSchema.index({
  status:1,
  gradingType:1
});

module.exports = mongoose.model("Assignment", assignmentSchema);
