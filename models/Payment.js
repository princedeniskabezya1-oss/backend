const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },

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
      enum: ["stripe", "manual", "paypal"],
      default: "manual"
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "paid"
    },

    transactionId: {
      type: String
    }

  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);

