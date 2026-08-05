const mongoose = require("mongoose");

const submissionAttachmentSchema =
  new mongoose.Schema(
    {
      url: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1200
      },

      secureUrl: {
        type: String,
        trim: true,
        maxlength: 1200,
        default: ""
      },

      publicId: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      originalName: {
        type: String,
        trim: true,
        maxlength: 255,
        default: "Attachment"
      },

      mimeType: {
        type: String,
        trim: true,
        maxlength: 150,
        default:
          "application/octet-stream"
      },

      attachmentType: {
        type: String,
        enum: [
          "image",
          "video",
          "audio",
          "pdf",
          "document",
          "presentation",
          "spreadsheet",
          "text",
          "file"
        ],
        default: "file"
      },

      resourceType: {
        type: String,
        enum: [
          "image",
          "video",
          "raw"
        ],
        default: "raw"
      },

      size: {
        type: Number,
        min: 0,
        default: 0
      },

      format: {
        type: String,
        trim: true,
        default: ""
      },

      width: {
        type: Number,
        default: null
      },

      height: {
        type: Number,
        default: null
      },

      duration: {
        type: Number,
        default: null
      },

      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      uploadedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

const submissionRevisionSchema =
  new mongoose.Schema(
    {
      revisionNumber: {
        type: Number,
        required: true,
        min: 1
      },

      attemptNumber: {
        type: Number,
        required: true,
        min: 1
      },

      text: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

fileUrl: {
  type: String,
  trim: true,
  maxlength: 1200,
  default: null
},

attachments: {
  type: [submissionAttachmentSchema],
  default: []
},

      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "returned",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted"
      },

      grade: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null
      },

      feedback: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

      rubricScores: {
        type: [
          {
            rubricId: {
              type: mongoose.Schema.Types.ObjectId,
              default: null
            },

            title: {
              type: String,
              trim: true,
              default: ""
            },

            maxPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            earnedPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            feedback: {
              type: String,
              trim: true,
              default: ""
            }
          }
        ],
        default: []
      },

      totalPoints: {
        type: Number,
        min: 0,
        default: 0
      },

      earnedPoints: {
        type: Number,
        min: 0,
        default: 0
      },

      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },

      passed: {
        type: Boolean,
        default: false
      },

      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      changedByRole: {
        type: String,
        trim: true,
        default: ""
      },

      action: {
        type: String,
        enum: [
          "submitted",
          "updated",
          "returned",
          "resubmitted",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted"
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );


const submissionSchema =
  new mongoose.Schema(
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

      assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Assignment",
        required: true,
        index: true
      },

      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      text: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

fileUrl: {
  type: String,
  trim: true,
  maxlength: 1200,
  default: null
},

attachments: {
  type: [submissionAttachmentSchema],
  default: [],
  validate: {
    validator(value) {
      return (
        Array.isArray(value) &&
        value.length <= 20
      );
    },

    message:
      "A submission may contain no more than 20 attachments."
  }
},

      grade: {
        type: String,
        trim: true,
        maxlength: 50,
        default: null
      },

      feedback: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: null
      },

      /* =====================================================
         RUBRIC GRADING
      ===================================================== */

      rubricScores: {
        type: [
          {
            rubricId: {
              type: mongoose.Schema.Types.ObjectId,
              default: null
            },

            title: {
              type: String,
              trim: true,
              maxlength: 250,
              default: ""
            },

            description: {
              type: String,
              trim: true,
              maxlength: 2000,
              default: ""
            },

            maxPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            earnedPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            feedback: {
              type: String,
              trim: true,
              maxlength: 3000,
              default: ""
            },

            order: {
              type: Number,
              min: 0,
              default: 0
            }
          }
        ],
        default: []
      },

      totalPoints: {
        type: Number,
        min: 0,
        default: 0
      },

      earnedPoints: {
        type: Number,
        min: 0,
        default: 0
      },

      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },

      passed: {
        type: Boolean,
        default: false,
        index: true
      },

      gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "returned",
          "reviewed",
          "graded",
          "locked"
        ],
        default: "submitted",
        index: true
      },

      submittedAt: {
        type: Date,
        default: Date.now,
        index: true
      },

      lastEditedAt: {
        type: Date,
        default: Date.now
      },

      reviewedAt: {
        type: Date,
        default: null
      },

      returnedAt: {
        type: Date,
        default: null
      },

      returnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      returnedReason: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: ""
      },

      gradedAt: {
        type: Date,
        default: null,
        index: true
      },

      /* =====================================================
         GRADING HISTORY
      ===================================================== */

      gradingHistory: {
        type: [
          {
            gradedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null
            },

            gradedAt: {
              type: Date,
              default: Date.now
            },

            gradingType: {
              type: String,
              enum: [
                "points",
                "rubric",
                "pass_fail"
              ],
              default: "points"
            },

            grade: {
              type: String,
              trim: true,
              maxlength: 50,
              default: null
            },

            earnedPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            totalPoints: {
              type: Number,
              min: 0,
              default: 0
            },

            percentage: {
              type: Number,
              min: 0,
              max: 100,
              default: 0
            },

            passed: {
              type: Boolean,
              default: false
            },

            feedback: {
              type: String,
              trim: true,
              maxlength: 5000,
              default: ""
            },

            rubricScores: {
              type: [
                {
                  rubricId: {
                    type: mongoose.Schema.Types.ObjectId,
                    default: null
                  },

                  title: {
                    type: String,
                    trim: true,
                    maxlength: 250,
                    default: ""
                  },

                  maxPoints: {
                    type: Number,
                    min: 0,
                    default: 0
                  },

                  earnedPoints: {
                    type: Number,
                    min: 0,
                    default: 0
                  },

                  feedback: {
                    type: String,
                    trim: true,
                    maxlength: 3000,
                    default: ""
                  },

                  order: {
                    type: Number,
                    min: 0,
                    default: 0
                  }
                }
              ],
              default: []
            }
          }
        ],
        default: []
      },

      lockedAt: {
        type: Date,
        default: null
      },

      locked: {
        type: Boolean,
        default: false,
        index: true
      },

      attemptNumber: {
        type: Number,
        default: 1,
        min: 1
      },

      revisionNumber: {
        type: Number,
        default: 1,
        min: 1
      },

      submissionHistory: {
        type: [submissionRevisionSchema],
        default: []
      }
    },
    {
      timestamps: true
    }
  );


submissionSchema.index(
  {
    assignmentId: 1,
    studentId: 1
  },
  {
    unique: true
  }
);

submissionSchema.index({
  schoolId: 1,
  createdAt: -1
});

submissionSchema.index({
  teacherId: 1,
  createdAt: -1
});

submissionSchema.index({
  schoolId: 1,
  status: 1,
  submittedAt: -1
});

submissionSchema.index({
  studentId: 1,
  status: 1,
  submittedAt: -1
});

submissionSchema.index({
  assignmentId: 1,
  status: 1
});
submissionSchema.index({
  assignmentId: 1,
  percentage: -1
});

submissionSchema.index({
  teacherId: 1,
  gradedAt: -1
});

submissionSchema.index({
  schoolId: 1,
  passed: 1,
  gradedAt: -1
});

submissionSchema.index({
  studentId: 1,
  percentage: -1
});

module.exports =
  mongoose.model(
    "Submission",
    submissionSchema
  );
