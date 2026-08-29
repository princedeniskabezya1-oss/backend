const mongoose = require("mongoose");


const FamilyChildSchema =
  new mongoose.Schema(
    {

      /* ============================================
         FAMILY OWNER
      ============================================ */

      familyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },


      /* ============================================
         OPTIONAL LINKED AIFT STUDENT
      ============================================ */

      linkedStudentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },


      /* ============================================
         BASIC PROFILE
      ============================================ */

      firstName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
      },

      lastName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
      },

      birthDate: {
        type: Date,
        default: null
      },

      profileImage: {
        type: String,
        default: null,
        trim: true
      },

      location: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
      },


      /* ============================================
         EDUCATION
      ============================================ */

      educationLevel: {
        type: String,

        enum: [
          "",
          "elementary",
          "junior_high",
          "senior_high",
          "college",
          "graduate",
          "vocational",
          "other"
        ],

        default: ""
      },

      grade: {
        type: String,
        default: "",
        trim: true,
        maxlength: 100
      },

      currentSchool: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
      },

      track: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
      },


      /* ============================================
         GOALS & INTERESTS
      ============================================ */

      goal: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      interests: {
        type: [String],
        default: []
      },

      notes: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
      },


      /* ============================================
         FAMILY CONSENT
      ============================================ */

      consentConfirmed: {
        type: Boolean,
        default: false
      },

      consentConfirmedAt: {
        type: Date,
        default: null
      },


      /* ============================================
         ACCOUNT LINK STATUS
      ============================================ */

      linkStatus: {

        type: String,

        enum: [
          "unlinked",
          "pending",
          "linked"
        ],

        default: "unlinked",
        index: true
      },


      /* ============================================
         RECORD STATUS
      ============================================ */

      status: {

        type: String,

        enum: [
          "active",
          "archived"
        ],

        default: "active",
        index: true
      }

    },
    {
      timestamps: true
    }
  );


/* ============================================
   INDEXES
============================================ */

FamilyChildSchema.index({
  familyId: 1,
  status: 1,
  createdAt: -1
});


FamilyChildSchema.index(
  {
    familyId: 1,
    linkedStudentId: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      linkedStudentId: {
        $type: "objectId"
      }
    }
  }
);


/* ============================================
   VIRTUALS
============================================ */

FamilyChildSchema.virtual(
  "fullName"
).get(function () {

  return [
    this.firstName,
    this.lastName
  ]
    .filter(Boolean)
    .join(" ");

});


FamilyChildSchema.set(
  "toJSON",
  {
    virtuals: true
  }
);


FamilyChildSchema.set(
  "toObject",
  {
    virtuals: true
  }
);


module.exports =
  mongoose.model(
    "FamilyChild",
    FamilyChildSchema
  );
