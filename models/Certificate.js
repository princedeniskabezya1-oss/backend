const mongoose = require("mongoose");


const certificateSkillSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
      }
    },
    {
      _id: false
    }
  );


const certificateSchema =
  new mongoose.Schema(
    {
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

      teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        default: null,
        index: true
      },

      programId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
      },

      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 250
      },

      description: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },

      programName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      className: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      studentName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      schoolName: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ""
      },

      certificateNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        maxlength: 120,
        index: true
      },

      verificationCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        maxlength: 120,
        index: true
      },

      status: {
        type: String,
        enum: [
          "pending",
          "verified",
          "expired",
          "revoked"
        ],
        default: "pending",
        index: true
      },

      grade: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ""
      },

      score: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },

      hours: {
        type: Number,
        min: 0,
        default: 0
      },

      skills: {
        type: [certificateSkillSchema],
        default: []
      },

      issuedAt: {
        type: Date,
        default: null,
        index: true
      },

      completedAt: {
        type: Date,
        default: null
      },

      expiresAt: {
        type: Date,
        default: null,
        index: true
      },

      revokedAt: {
        type: Date,
        default: null
      },

      revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      revokedReason: {
        type: String,
        trim: true,
        maxlength: 3000,
        default: ""
      },

      pdfUrl: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },

      previewUrl: {
        type: String,
        trim: true,
        maxlength: 1500,
        default: ""
      },

      templateId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
      },

      issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      verifiedAt: {
        type: Date,
        default: null
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },
    {
      timestamps: true
    }
  );


certificateSchema.index({
  studentId: 1,
  issuedAt: -1
});


certificateSchema.index({
  schoolId: 1,
  status: 1,
  issuedAt: -1
});


certificateSchema.index({
  classId: 1,
  studentId: 1
});


certificateSchema.index({
  verificationCode: 1,
  status: 1
});


certificateSchema.pre(
  "validate",
  function(next){

    if (
      this.status === "verified" &&
      !this.issuedAt
    ){
      this.issuedAt =
        new Date();
    }

    if (
      this.status === "verified" &&
      !this.verifiedAt
    ){
      this.verifiedAt =
        new Date();
    }

    if (
      this.status === "revoked" &&
      !this.revokedAt
    ){
      this.revokedAt =
        new Date();
    }

    next();

  }
);


module.exports =
  mongoose.model(
    "Certificate",
    certificateSchema
  );
