import mongoose from "mongoose";

const internshipSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    company: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    duration: {
      type: String,
      required: [true, "Duration is required"],
      trim: true,
    },
    stipend: {
      type: String,
      default: "Unpaid",
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    requirements: {
      type: String,
      maxlength: [1000, "Requirements cannot exceed 1000 characters"],
    },
    skills: [{ type: String, trim: true }],
    type: {
      type: String,
      enum: ["remote", "onsite", "hybrid"],
      default: "remote",
    },
    domain: {
      type: String,
      required: [true, "Domain is required"],
      trim: true,
    },
    openings: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastDate: {
      type: Date,
      required: [true, "Last date to apply is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Internship", internshipSchema);
