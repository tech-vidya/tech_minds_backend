import mongoose from "mongoose";

// ─── Submission sub-schema ────────────────────────────────────────────────────
const submissionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Files the student uploaded
    files: [
      {
        originalName: String,
        public_id: String,
        url: String,
        fileType: String,
        fileSize: Number,
      },
    ],
    // Text answer (optional)
    textAnswer: { type: String, default: "" },

    // Grading
    status: {
      type: String,
      enum: ["submitted", "graded", "resubmit_requested"],
      default: "submitted",
    },
    grade: { type: Number, default: null }, // null = not graded yet
    feedback: { type: String, default: "" },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    gradedAt: Date,

    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ─── Assignment schema ────────────────────────────────────────────────────────
const assignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Assignment title is required"],
      trim: true,
      maxlength: [200, "Title too long"],
    },
    description: {
      type: String,
      required: [true, "Assignment description is required"],
      maxlength: [5000, "Description too long"],
    },

    // Which lesson this belongs to
    lesson: {
      lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
      courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
      },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Files the creator attaches (reference material, templates, etc.)
    attachments: [
      {
        title: { type: String, default: "Attachment" },
        public_id: String,
        url: String,
        fileType: String,
        fileSize: Number,
      },
    ],

    // Settings
    maxMarks: { type: Number, default: 100 },
    dueDate: { type: Date, default: null }, // null = no deadline
    allowLateSubmission: { type: Boolean, default: true },
    maxFileSize: { type: Number, default: 50 }, // MB
    allowedFileTypes: {
      type: [String],
      default: ["pdf", "doc", "docx", "zip", "png", "jpg", "jpeg"],
    },

    // All student submissions
    submissions: [submissionSchema],
  },
  { timestamps: true }
);

assignmentSchema.index({ "lesson.courseId": 1 });
assignmentSchema.index({ creator: 1 });

const Assignment = mongoose.model("Assignment", assignmentSchema);
export default Assignment;
