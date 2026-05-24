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

    published: {
      type: Boolean,
      default: false,
      index: true
    },
        projectCanvas: {
      type: [
        {
          blockId: {
            type: String,
            required: true
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
        }
      ],
      default: []
    },

    projectCanvasUpdatedAt: {
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

classSchema.pre("save", function (next) {
  if (Array.isArray(this.studentIds)) {
    this.studentIds = [...new Set(this.studentIds.map(String))];
  }

  if (Array.isArray(this.materials)) {
    this.materials = this.materials.filter(Boolean);
  }

  if (Array.isArray(this.learningOutcomes)) {
    this.learningOutcomes = this.learningOutcomes.filter(Boolean);
  }

  next();
});

module.exports = mongoose.model("Class", classSchema);
