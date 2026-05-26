import mongoose from "mongoose";

const heroImageSchema = new mongoose.Schema(
  {
    url:       { type: String, required: true },
    publicId:  { type: String, required: true }, // Cloudinary public_id for deletion
    caption:   { type: String, default: "" },
    order:     { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Always return images sorted by order
heroImageSchema.index({ order: 1 });

export default mongoose.model("HeroImage", heroImageSchema);