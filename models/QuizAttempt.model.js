import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // MCQ / true_false: array of selected option IDs
    selectedOptions: [{ type: mongoose.Schema.Types.ObjectId }],
    // short_answer: the text the student typed
    textAnswer: { type: String, default: "" },

    // Grading result (filled after auto-grade)
    isCorrect: { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0 },
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    answers: [answerSchema],

    // Results
    totalPoints: { type: Number, default: 0 },   // max possible
    earnedPoints: { type: Number, default: 0 },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },

    // Timing
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    timeTakenSeconds: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded"],
      default: "in_progress",
    },

    attemptNumber: { type: Number, default: 1 },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ quiz: 1, student: 1 });
quizAttemptSchema.index({ courseId: 1, student: 1 });

const QuizAttempt = mongoose.model("QuizAttempt", quizAttemptSchema);
export default QuizAttempt;
