import mongoose from "mongoose";

const internshipApplicationSchema = new mongoose.Schema(
  {
    internship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Internship",
      required: true,
    },
    // Personal Info
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    college: { type: String, required: true, trim: true },
    degree: { type: String, required: true, trim: true },
    year: { type: String, required: true },
    // Application details
    whyApply: { type: String, required: true, maxlength: 1000 },
    skills: { type: String },
    linkedIn: { type: String },
    github: { type: String },
    resumeUrl: { type: String },
    status: {
      type: String,
      enum: ["pending", "reviewed", "shortlisted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("InternshipApplication", internshipApplicationSchema);
