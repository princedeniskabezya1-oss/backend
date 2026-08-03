const mongoose = require("mongoose");

const contentBlockSchema = new mongoose.Schema(
  {
    blockId: {
      type: String,
      required: true,
      trim: true
    },

    scope: {
      type: String,
      enum: ["welcome", "outcomes", "curriculum", "lesson", "quiz"],
      required: true,
      index: true
    },

    ownerId: {
      type: String,
      default: "main",
      index: true
    },

    type: {
      type: String,
      enum: ["visual", "text"],
      default: "visual"
    },

    content: {
      type: String,
      default: ""
    },

    order: {
      type: Number,
      default: 0
    },

    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const projectCanvasBlockSchema = new mongoose.Schema(
  {
    blockId: {
      type: String,
      required: true,
      trim: true
    },

    type: {
      type: String,
      enum: [
        "heading",
        "text",
        "image",
        "note",
        "checklist",
        "resource",
        "divider",
        "callout"
      ],
      default: "text"
    },

    content: {
      type: String,
      default: ""
    },

    imageUrl: {
      type: String,
      default: ""
    },

    resourceUrl: {
      type: String,
      default: ""
    },

    checklistItems: {
      type: [String],
      default: []
    },

    textColor: {
      type: String,
      default: "#111827"
    },

    backgroundColor: {
      type: String,
      default: "#ffffff"
    },

    align: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left"
    },

    order: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

/* =========================================================
   CLASS SETTINGS SCHEMAS
========================================================= */

const classAppearanceSettingsSchema =
  new mongoose.Schema(
    {
      accentColor: {
        type: String,
        trim: true,
        default: "#1a73e8",
        match: /^#[0-9a-fA-F]{6}$/
      },

      theme: {
        type: String,
        enum: [
          "light",
          "dark",
          "system"
        ],
        default: "light"
      },

      thumbnailImage: {
        type: String,
        trim: true,
        maxlength: 800,
        default: null
      },

      logoImage: {
        type: String,
        trim: true,
        maxlength: 800,
        default: null
      },

      showInstructor: {
        type: Boolean,
        default: true
      },

      showProgress: {
        type: Boolean,
        default: true
      }
    },
    {
      _id: false
    }
  );


const classEnrollmentSettingsSchema =
  new mongoose.Schema(
    {
      accessType: {
        type: String,
        enum: [
          "public",
          "private",
          "invite_only",
          "hidden"
        ],
        default: "private"
      },

      allowJoinCode: {
        type: Boolean,
        default: true
      },

      autoApprove: {
        type: Boolean,
        default: false
      },

      maximumStudents: {
        type: Number,
        min: 0,
        max: 100000,
        default: 0
      },

      waitingListEnabled: {
        type: Boolean,
        default: false
      },

      enrollmentOpensAt: {
        type: Date,
        default: null
      },

      enrollmentClosesAt: {
        type: Date,
        default: null
      }
    },
    {
      _id: false
    }
  );


const classLearningSettingsSchema =
  new mongoose.Schema(
    {
      sequentialLessons: {
        type: Boolean,
        default: false
      },

      allowLessonSkipping: {
        type: Boolean,
        default: true
      },

      allowReplay: {
        type: Boolean,
        default: true
      },

      autoCompleteLessons: {
        type: Boolean,
        default: false
      },

      allowDownloads: {
        type: Boolean,
        default: true
      },

      discussionsEnabled: {
        type: Boolean,
        default: true
      },

      notesEnabled: {
        type: Boolean,
        default: true
      },

      bookmarksEnabled: {
        type: Boolean,
        default: true
      },

      certificatesEnabled: {
        type: Boolean,
        default: false
      },

      gamificationEnabled: {
        type: Boolean,
        default: false
      },

      completionRule: {
        type: String,
        enum: [
          "all_lessons",
          "required_lessons",
          "manual",
          "percentage"
        ],
        default: "all_lessons"
      },

      completionPercentage: {
        type: Number,
        min: 1,
        max: 100,
        default: 100
      }
    },
    {
      _id: false
    }
  );


const classAssessmentSettingsSchema =
  new mongoose.Schema(
    {
      assignmentsEnabled: {
        type: Boolean,
        default: true
      },

      quizzesEnabled: {
        type: Boolean,
        default: true
      },

      allowLateSubmissions: {
        type: Boolean,
        default: true
      },

      defaultQuizAttempts: {
        type: Number,
        min: 1,
        max: 100,
        default: 1
      },

      defaultPassingScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 70
      },

      randomizeQuestions: {
        type: Boolean,
        default: false
      },

      shuffleAnswers: {
        type: Boolean,
        default: false
      },

      showCorrectAnswers: {
        type: Boolean,
        default: true
      },

      releaseGradesAutomatically: {
        type: Boolean,
        default: true
      },

      peerReviewEnabled: {
        type: Boolean,
        default: false
      }
    },
    {
      _id: false
    }
  );


const classPublishingSettingsSchema =
  new mongoose.Schema(
    {
      visibility: {
        type: String,
        enum: [
          "public",
          "private",
          "unlisted"
        ],
        default: "private"
      },

      scheduledPublishAt: {
        type: Date,
        default: null
      },

      scheduledArchiveAt: {
        type: Date,
        default: null
      },

      slug: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 160,
        default: null
      },

      metaTitle: {
        type: String,
        trim: true,
        maxlength: 160,
        default: null
      },

      metaDescription: {
        type: String,
        trim: true,
        maxlength: 320,
        default: null
      }
    },
    {
      _id: false
    }
  );


const classNotificationSettingsSchema =
  new mongoose.Schema(
    {
      notifyStudentsNewLesson: {
        type: Boolean,
        default: true
      },

      notifyStudentsNewAssignment: {
        type: Boolean,
        default: true
      },

      notifyStudentsBeforeDueDate: {
        type: Boolean,
        default: true
      },

      dueDateReminderHours: {
        type: Number,
        min: 1,
        max: 720,
        default: 24
      },

      notifyTeacherSubmission: {
        type: Boolean,
        default: true
      },

      notifyTeacherQuizCompletion: {
        type: Boolean,
        default: true
      },

      inactivityRemindersEnabled: {
        type: Boolean,
        default: false
      },

      inactivityReminderDays: {
        type: Number,
        min: 1,
        max: 365,
        default: 7
      }
    },
    {
      _id: false
    }
  );

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

subtitle: {
  type: String,
  trim: true,
  maxlength: 220,
  default: null
},

category: {
  type: String,
  trim: true,
  maxlength: 120,
  default: null
},

estimatedDurationMinutes: {
  type: Number,
  min: 0,
  max: 1000000,
  default: 0
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

    coverImage: {
      type: String,
      trim: true,
      maxlength: 800,
      default: null
    },

    bannerImage: {
      type: String,
      trim: true,
      maxlength: 800,
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

    welcomeContent: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: null
    },

    learningOutcomes: {
      type: [String],
      default: []
    },

    level: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null
    },

    language: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null
    },

materials: {
  type: [String],
  default: []
},

appearanceSettings: {
  type: classAppearanceSettingsSchema,
  default: () => ({})
},

enrollmentSettings: {
  type: classEnrollmentSettingsSchema,
  default: () => ({})
},

learningSettings: {
  type: classLearningSettingsSchema,
  default: () => ({})
},

assessmentSettings: {
  type: classAssessmentSettingsSchema,
  default: () => ({})
},

publishingSettings: {
  type: classPublishingSettingsSchema,
  default: () => ({})
},

notificationSettings: {
  type: classNotificationSettingsSchema,
  default: () => ({})
},

published: {
      type: Boolean,
      default: false,
      index: true
    },

    projectCanvas: {
      type: [projectCanvasBlockSchema],
      default: []
    },

    projectCanvasUpdatedAt: {
      type: Date,
      default: null
    },

    contentBlocks: {
      type: [contentBlockSchema],
      default: []
    },

    contentBlocksUpdatedAt: {
      type: Date,
      default: null
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
classSchema.index({ schoolId: 1, published: 1, createdAt: -1 });
classSchema.index({ "contentBlocks.scope": 1, "contentBlocks.ownerId": 1 });

classSchema.pre("save", function (next) {
  const enrollmentOpensAt =
    this.enrollmentSettings?.enrollmentOpensAt;

  const enrollmentClosesAt =
    this.enrollmentSettings?.enrollmentClosesAt;

  if (
    enrollmentOpensAt &&
    enrollmentClosesAt &&
    enrollmentClosesAt <= enrollmentOpensAt
  ) {
    return next(
      new Error(
        "Enrollment closing time must be after the opening time."
      )
    );
  }

  const scheduledPublishAt =
    this.publishingSettings?.scheduledPublishAt;

  const scheduledArchiveAt =
    this.publishingSettings?.scheduledArchiveAt;

  if (
    scheduledPublishAt &&
    scheduledArchiveAt &&
    scheduledArchiveAt <= scheduledPublishAt
  ) {
    return next(
      new Error(
        "Scheduled archive time must be after the publication time."
      )
    );
  }

  if (Array.isArray(this.studentIds)) {
    this.studentIds = [...new Set(this.studentIds.map(String))];
  }

  if (Array.isArray(this.materials)) {
    this.materials = this.materials.filter(Boolean);
  }

  if (Array.isArray(this.learningOutcomes)) {
    this.learningOutcomes = this.learningOutcomes.filter(Boolean);
  }

  if (Array.isArray(this.contentBlocks)) {
    this.contentBlocks = this.contentBlocks.map((block, index) => ({
      blockId: block.blockId,
      scope: block.scope,
      ownerId: block.ownerId || "main",
      type: block.type || "visual",
      content: block.content || "",
      order: Number.isFinite(Number(block.order)) ? Number(block.order) : index,
      updatedAt: block.updatedAt || new Date()
    }));
  }

  next();
});

module.exports = mongoose.model("Class", classSchema);
