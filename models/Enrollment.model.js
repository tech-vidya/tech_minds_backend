import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
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

    // Payment info
    amountPaid: { type: Number, default: 0 },
    paymentId: { type: String, default: "" }, // Stripe payment intent ID
    paymentMethod: {
      type: String,
      enum: ["free", "stripe", "razorpay", "coupon"],
      default: "free",
    },

    // Progress tracking
    completedLessons: [
      {
        lesson: mongoose.Schema.Types.ObjectId,
        completedAt: { type: Date, default: Date.now },
      },
    ],
    lastAccessedLesson: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    progressPercent: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    completedAt: Date,

    // Certificate
    certificateIssued: { type: Boolean, default: false },
    certificateIssuedAt: Date,
  },
  { timestamps: true }
);

// One enrollment per student per course
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1 });
enrollmentSchema.index({ student: 1 });

const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
export default Enrollment;
