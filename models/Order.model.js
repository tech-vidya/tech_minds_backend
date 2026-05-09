import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Pricing snapshot at time of purchase
    amount: { type: Number, required: true },          // in smallest currency unit (paise/cents)
    currency: { type: String, default: "inr" },
    displayAmount: { type: Number, required: true },   // human-readable (₹499)

    // Stripe
    // stripePaymentIntentId: { type: String, unique: true, sparse: true },
    // stripeSessionId: { type: String },

    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String, sparse: true },

    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paidAt: Date,
    refundedAt: Date,
    refundReason: { type: String, default: "" },

    // Platform fee (percentage kept by platform)
    platformFeePercent: { type: Number, default: 20 },
    platformFee: { type: Number, default: 0 },
    creatorEarning: { type: Number, default: 0 },
  },
  { timestamps: true }
);

orderSchema.index({ student: 1 });
orderSchema.index({ course: 1 });
orderSchema.index({ creator: 1 });
orderSchema.index({ stripePaymentIntentId: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
