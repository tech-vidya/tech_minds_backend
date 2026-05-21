import mongoose from "mongoose";

// ─── Lesson schema (embedded in Section) ─────────────────────────────────────
const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Lesson title is required"],
      trim: true,
      maxlength: [150, "Title too long"],
    },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },

    // Video
    video: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
      duration: { type: Number, default: 0 }, // seconds
      isProcessing: { type: Boolean, default: false },
    },

    // Lesson notes / attachments (PDF, PPTX, DOCX)
    notes: [
      {
        title: { type: String, default: "Notes" },
        public_id: String,
        url: String,
        fileType: String, // pdf | docx | pptx
        fileSize: Number, // bytes
      },
    ],

    // Free preview (visible without enrollment)
    isFreePreview: { type: Boolean, default: false },

    // References to Quiz and Assignment (defined in their own collections)
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", default: null },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Section schema (embedded in Course) ─────────────────────────────────────
const sectionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Section title is required"],
    trim: true,
    maxlength: [150, "Title too long"],
  },
  order: { type: Number, default: 0 },
  lessons: [lessonSchema],
});

// ─── Course schema ────────────────────────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
      maxlength: [200, "Title too long"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [5000, "Description too long"],
    },
    shortDescription: {
      type: String,
      maxlength: [300, "Short description too long"],
      default: "",
    },

    // Creator
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Media
    thumbnail: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    previewVideo: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    // Pricing
    price: { type: Number, default: 0, min: 0 },
    discountPrice: { type: Number, default: 0 },
    isFree: { type: Boolean, default: false },

    // Metadata
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    language: { type: String, default: "English" },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all"],
      default: "all",
    },
    requirements: [String],
    whatYouLearn: [String],

    // Structure
    sections: [sectionSchema],

    // Publishing
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,

    // Admin approval — course must be approved before appearing in catalogue
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvalNote: { type: String, default: "" }, // rejection reason from admin
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Stats (denormalised for performance)
    stats: {
      totalStudents: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      totalLessons: { type: Number, default: 0 },
      totalDuration: { type: Number, default: 0 }, // seconds
    },
  },
  { timestamps: true }
);

// ─── Auto-generate slug from title ───────────────────────────────────────────
courseSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug =
      this.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim() +
      "-" +
      Date.now().toString(36);
  }
  next();
});

// ─── Recompute lesson / duration stats before save ───────────────────────────
courseSchema.pre("save", function (next) {
  let totalLessons = 0;
  let totalDuration = 0;
  this.sections.forEach((sec) => {
    totalLessons += sec.lessons.length;
    sec.lessons.forEach((l) => {
      totalDuration += l.video?.duration || 0;
    });
  });
  this.stats.totalLessons = totalLessons;
  this.stats.totalDuration = totalDuration;
  next();
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
courseSchema.index({ slug: 1 });
courseSchema.index({ creator: 1 });
courseSchema.index({ category: 1, isPublished: 1 });
courseSchema.index({ tags: 1 });
courseSchema.index({ title: "text", description: "text" });

const Course = mongoose.model("Course", courseSchema);
export default Course;
