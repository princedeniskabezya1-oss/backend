const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null
    },

    productType: {
      type: String,
      enum: ["course", "venture_contribution", "travel", "job", "other"],
      default: "other",
      index: true
    },

    productId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    productName: { type: String, trim: true, maxlength: 180, default: "" },

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: "USD"
    },

    method: {
      type: String,
      enum: ["stripe", "manual", "paypal", "card"],
      default: "paypal"
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending"
    },

    transactionId: {
      type: String
    },

    providerOrderId: { type: String, trim: true, unique: true, sparse: true },
    providerCaptureId: { type: String, trim: true, unique: true, sparse: true },
    paidAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }

  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
