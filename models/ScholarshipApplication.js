const mongoose = require("mongoose");

const SCHOLARSHIP_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "review",
  "shortlisted",
  "approved",
  "awarded",
  "rejected",
  "withdrawn"
];

const documentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 300,
      required: true
    },

    url: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: true
    },

    publicId: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    mimeType: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    size: {
      type: Number,
      min: 0,
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

const historySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: SCHOLARSHIP_APPLICATION_STATUSES,
      required: true
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

    note: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: ""
    },

    changedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const ScholarshipApplicationSchema = new mongoose.Schema(
  {
    scholarshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolScholarship",
      required: true,
      index: true
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /*
      Family accounts submit through the same scholarship
      application collection only when the selected child is
      linked to a real AIFT Student account. This keeps school
      review, student ownership, award history and duplicate
      protection on one authoritative record.
    */
    familyChildId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyChild",
      default: null,
      index: true
    },

    submittedByFamilyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    status: {
      type: String,
      enum: SCHOLARSHIP_APPLICATION_STATUSES,
      default: "draft",
      index: true
    },

    personalStatement: {
      type: String,
      trim: true,
      maxlength: 15000,
      default: ""
    },

    financialNeedStatement: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: ""
    },

    achievements: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 1500
        }
      ],
      default: []
    },

    documents: {
      type: [documentSchema],
      default: []
    },

    academicSnapshot: {
      program: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      yearLevel: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      gpa: {
        type: Number,
        min: 0,
        default: null
      },

      gradeAverage: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      }
    },

    reviewerNotes: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: ""
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    submittedAt: {
      type: Date,
      default: null
    },

    approvedAt: {
      type: Date,
      default: null
    },

    awardedAt: {
      type: Date,
      default: null
    },

    rejectedAt: {
      type: Date,
      default: null
    },

    withdrawnAt: {
      type: Date,
      default: null
    },

    awardAmount: {
      type: Number,
      min: 0,
      default: null
    },

    awardCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "PHP"
    },

    awardNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ""
    },

    statusHistory: {
      type: [historySchema],
      default: []
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

ScholarshipApplicationSchema.index(
  {
    scholarshipId: 1,
    studentId: 1
  },
  {
    unique: true,
    name: "unique_student_scholarship_application"
  }
);

ScholarshipApplicationSchema.index({
  schoolId: 1,
  status: 1,
  createdAt: -1
});

ScholarshipApplicationSchema.index({
  studentId: 1,
  status: 1,
  createdAt: -1
});

ScholarshipApplicationSchema.index({
  scholarshipId: 1,
  status: 1,
  createdAt: -1
});

ScholarshipApplicationSchema.index({
  submittedByFamilyId: 1,
  status: 1,
  createdAt: -1
});

ScholarshipApplicationSchema.index({
  familyChildId: 1,
  createdAt: -1
});

module.exports =
  mongoose.models.ScholarshipApplication ||
  mongoose.model(
    "ScholarshipApplication",
    ScholarshipApplicationSchema
  );

module.exports.SCHOLARSHIP_APPLICATION_STATUSES =
  SCHOLARSHIP_APPLICATION_STATUSES;
