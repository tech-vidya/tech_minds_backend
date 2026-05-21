import mongoose from "mongoose";

const certificateOrderSchema = new mongoose.Schema(
  {
    // Student info
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    // Certificate details
    courseName: { type: String, required: true, trim: true },
    courseType: {
      type: String,
      enum: ["web-development", "data-science", "machine-learning", "digital-marketing", "ui-ux", "cybersecurity", "cloud-computing", "mobile-development", "other"],
      required: true,
    },
    completionDate: { type: String, required: true },
    certificateType: {
      type: String,
      enum: ["completion", "excellence", "participation"],
      default: "completion",
    },
    // Payment
    amount: { type: Number, required: true },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    // Certificate issuance
    certificateStatus: {
      type: String,
      enum: ["pending", "processing", "issued"],
      default: "pending",
    },
    certificateUrl: { type: String },
    certificateNumber: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

export default mongoose.model("CertificateOrder", certificateOrderSchema);
