const mongoose = require("mongoose");

const SchoolCompanyPartnershipSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    companyName: {
      type: String,
      trim: true,
      default: ""
    },

    type: {
      type: String,
      enum: [
        "internship_partnership",
        "job_placement",
        "recruitment",
        "training",
        "collaboration"
      ],
      default: "internship_partnership"
    },

    partnershipType: {
      type: String,
      trim: true,
      default: "internship_partnership"
    },

    status: {
      type: String,
      enum: ["pending", "review", "approved", "active", "completed", "rejected"],
      default: "pending",
      index: true
    },

    requestedBy: {
      type: String,
      enum: ["school", "company", "employer", "admin"],
      default: "school"
    },

    message: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

SchoolCompanyPartnershipSchema.index(
  { schoolId: 1, companyId: 1 },
  { unique: false }
);

module.exports = mongoose.model(
  "SchoolCompanyPartnership",
  SchoolCompanyPartnershipSchema
);
