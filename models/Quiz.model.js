import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, "Question text is required"],
    trim: true,
  },
  questionType: {
    type: String,
    enum: ["mcq", "true_false", "short_answer"],
    default: "mcq",
  },
  options: [
    {
      text: { type: String, required: true },
      isCorrect: { type: Boolean, default: false },
    },
  ],
  // For short_answer: exact match strings (lowercased)
  correctAnswers: [{ type: String, lowercase: true, trim: true }],
  explanation: { type: String, default: "" }, // shown after attempt
  points: { type: Number, default: 1 },
  order: { type: Number, default: 0 },
});

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Quiz title is required"],
      trim: true,
    },
    // Which lesson this quiz belongs to
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

    questions: [questionSchema],

    // Settings
    timeLimit: { type: Number, default: 0 }, // minutes, 0 = no limit
    passMark: { type: Number, default: 70 }, // percentage
    maxAttempts: { type: Number, default: 3 }, // 0 = unlimited
    shuffleQuestions: { type: Boolean, default: false },
    showAnswersAfter: {
      type: String,
      enum: ["immediately", "after_pass", "never"],
      default: "immediately",
    },
  },
  { timestamps: true }
);

quizSchema.index({ "lesson.courseId": 1 });

const Quiz = mongoose.model("Quiz", quizSchema);
export default Quiz;
