import Quiz from "../models/Quiz.model.js";
import QuizAttempt from "../models/QuizAttempt.model.js";
import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { notifyQuizPassed } from "../utils/notifications.utils.js";

// ─── Helper: verify creator owns the course the quiz belongs to ───────────────
const verifyCreatorOwnership = async (courseId, userId, role) => {
  const course = await Course.findById(courseId).select("creator");
  if (!course) throw new AppError("Course not found.", 404);
  if (course.creator.toString() !== userId.toString() && role !== "admin") {
    throw new AppError("Not authorised.", 403);
  }
  return course;
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR — Quiz CRUD
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/quizzes
// @access Creator
// Body: { courseId, lessonId, title, questions[], timeLimit, passMark, maxAttempts, shuffleQuestions, showAnswersAfter }
export const createQuiz = asyncHandler(async (req, res, next) => {
  const {
    courseId, lessonId, title,
    questions, timeLimit, passMark,
    maxAttempts, shuffleQuestions, showAnswersAfter,
  } = req.body;

  await verifyCreatorOwnership(courseId, req.user._id, req.user.role);

  // Validate questions array
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return next(new AppError("At least one question is required.", 400));
  }
  for (const q of questions) {
    if (!q.questionText?.trim()) {
      return next(new AppError("Each question must have questionText.", 400));
    }
    if (q.questionType === "mcq" || q.questionType === "true_false") {
      const hasCorrect = q.options?.some((o) => o.isCorrect);
      if (!hasCorrect) {
        return next(new AppError(`Question "${q.questionText}" must have at least one correct option.`, 400));
      }
    }
    if (q.questionType === "short_answer" && (!q.correctAnswers || q.correctAnswers.length === 0)) {
      return next(new AppError(`Short answer question "${q.questionText}" must have at least one accepted answer.`, 400));
    }
  }

  const quiz = await Quiz.create({
    title,
    lesson: { lessonId, courseId },
    creator: req.user._id,
    questions: questions.map((q, i) => ({ ...q, order: i })),
    timeLimit: timeLimit || 0,
    passMark: passMark ?? 70,
    maxAttempts: maxAttempts ?? 3,
    shuffleQuestions: shuffleQuestions ?? false,
    showAnswersAfter: showAnswersAfter || "immediately",
  });

  // Link quiz to lesson inside Course document
  await Course.findOneAndUpdate(
    { _id: courseId, "sections.lessons._id": lessonId },
    { $set: { "sections.$[].lessons.$[lesson].quiz": quiz._id } },
    { arrayFilters: [{ "lesson._id": lessonId }] }
  );

  res.status(201).json({ success: true, message: "Quiz created.", quiz });
});

// @route  GET /api/quizzes/:quizId
// @access Creator (full with answers) | Student (without correct answers unless showAnswersAfter)
export const getQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));

  const isCreator =
    quiz.creator.toString() === req.user._id.toString() || req.user.role === "admin";

  if (isCreator) {
    return res.status(200).json({ success: true, quiz });
  }

  // Strip correct answer data for students
  const safeQuiz = quiz.toObject();
  safeQuiz.questions = safeQuiz.questions.map((q) => ({
    ...q,
    options: q.options.map((o) => ({ _id: o._id, text: o.text })), // hide isCorrect
    correctAnswers: [],
    explanation: "",
  }));

  res.status(200).json({ success: true, quiz: safeQuiz });
});

// @route  PUT /api/quizzes/:quizId
// @access Creator
export const updateQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));
  if (quiz.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const updatable = ["title", "timeLimit", "passMark", "maxAttempts", "shuffleQuestions", "showAnswersAfter"];
  updatable.forEach((f) => { if (req.body[f] !== undefined) quiz[f] = req.body[f]; });

  if (req.body.questions) {
    quiz.questions = req.body.questions.map((q, i) => ({ ...q, order: i }));
  }

  await quiz.save();
  res.status(200).json({ success: true, message: "Quiz updated.", quiz });
});

// @route  DELETE /api/quizzes/:quizId
// @access Creator
export const deleteQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));
  if (quiz.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  // Unlink from Course lesson
  await Course.findOneAndUpdate(
    { _id: quiz.lesson.courseId },
    { $set: { "sections.$[].lessons.$[lesson].quiz": null } },
    { arrayFilters: [{ "lesson._id": quiz.lesson.lessonId }] }
  );

  await QuizAttempt.deleteMany({ quiz: quiz._id });
  await quiz.deleteOne();

  res.status(200).json({ success: true, message: "Quiz deleted." });
});

// @route  GET /api/quizzes/lesson/:lessonId
// @access Creator — all quizzes for a lesson
export const getQuizByLesson = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findOne({ "lesson.lessonId": req.params.lessonId });
  if (!quiz) return next(new AppError("No quiz found for this lesson.", 404));
  res.status(200).json({ success: true, quiz });
});

// ─── Creator: view all attempts for a quiz ────────────────────────────────────
// @route  GET /api/quizzes/:quizId/attempts
// @access Creator
export const getQuizAttempts = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));
  if (quiz.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const attempts = await QuizAttempt.find({ quiz: quiz._id })
    .populate("student", "name email avatar")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: attempts.length, attempts });
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT — Attempt flow
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/quizzes/:quizId/start
// @access Student
export const startQuizAttempt = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));

  // Must be enrolled
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: quiz.lesson.courseId,
  });
  if (!enrollment) return next(new AppError("You are not enrolled in this course.", 403));

  // Check attempt count
  if (quiz.maxAttempts > 0) {
    const attemptCount = await QuizAttempt.countDocuments({
      quiz: quiz._id,
      student: req.user._id,
      status: { $in: ["submitted", "graded"] },
    });
    if (attemptCount >= quiz.maxAttempts) {
      return next(new AppError(`Maximum attempts (${quiz.maxAttempts}) reached.`, 400));
    }
  }

  // If there's an existing in_progress attempt, return it
  const existing = await QuizAttempt.findOne({
    quiz: quiz._id,
    student: req.user._id,
    status: "in_progress",
  });
  if (existing) {
    return res.status(200).json({ success: true, attempt: existing, resumed: true });
  }

  const attemptNumber =
    (await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id })) + 1;

  // Optionally shuffle questions
  let questions = [...quiz.questions];
  if (quiz.shuffleQuestions) {
    questions = questions.sort(() => Math.random() - 0.5);
  }

  const attempt = await QuizAttempt.create({
    quiz: quiz._id,
    student: req.user._id,
    courseId: quiz.lesson.courseId,
    lessonId: quiz.lesson.lessonId,
    attemptNumber,
    startedAt: new Date(),
  });

  // Return quiz questions without correct answers
  const safeQuestions = questions.map((q) => ({
    _id: q._id,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options.map((o) => ({ _id: o._id, text: o.text })),
    points: q.points,
    order: q.order,
  }));

  res.status(201).json({
    success: true,
    attempt,
    questions: safeQuestions,
    timeLimit: quiz.timeLimit,
  });
});

// ─── Auto-grading engine ──────────────────────────────────────────────────────
const gradeAttempt = (quiz, submittedAnswers) => {
  let totalPoints = 0;
  let earnedPoints = 0;

  const gradedAnswers = quiz.questions.map((question) => {
    totalPoints += question.points;

    const submitted = submittedAnswers.find(
      (a) => a.questionId.toString() === question._id.toString()
    );

    if (!submitted) {
      return {
        questionId: question._id,
        selectedOptions: [],
        textAnswer: "",
        isCorrect: false,
        pointsEarned: 0,
      };
    }

    let isCorrect = false;

    if (question.questionType === "mcq") {
      // All correct options must be selected, no incorrect ones
      const correctIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o._id.toString())
        .sort();
      const selectedIds = (submitted.selectedOptions || [])
        .map((id) => id.toString())
        .sort();
      isCorrect =
        correctIds.length === selectedIds.length &&
        correctIds.every((id, i) => id === selectedIds[i]);

    } else if (question.questionType === "true_false") {
      const correctId = question.options.find((o) => o.isCorrect)?._id?.toString();
      const selectedId = submitted.selectedOptions?.[0]?.toString();
      isCorrect = correctId === selectedId;

    } else if (question.questionType === "short_answer") {
      const normalised = submitted.textAnswer?.toLowerCase().trim();
      isCorrect = question.correctAnswers.some(
        (ans) => ans.toLowerCase().trim() === normalised
      );
    }

    const pts = isCorrect ? question.points : 0;
    earnedPoints += pts;

    return {
      questionId: question._id,
      selectedOptions: submitted.selectedOptions || [],
      textAnswer: submitted.textAnswer || "",
      isCorrect,
      pointsEarned: pts,
    };
  });

  const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return { gradedAnswers, totalPoints, earnedPoints, scorePercent };
};

// @route  POST /api/quizzes/:quizId/submit
// @access Student
// Body: { attemptId, answers: [{ questionId, selectedOptions?, textAnswer? }], timeTakenSeconds }
export const submitQuizAttempt = asyncHandler(async (req, res, next) => {
  const { attemptId, answers, timeTakenSeconds } = req.body;

  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return next(new AppError("Quiz not found.", 404));

  const attempt = await QuizAttempt.findOne({
    _id: attemptId,
    quiz: quiz._id,
    student: req.user._id,
    status: "in_progress",
  });
  if (!attempt) return next(new AppError("Active attempt not found.", 404));

  // Run auto-grading
  const { gradedAnswers, totalPoints, earnedPoints, scorePercent } = gradeAttempt(quiz, answers || []);
  const passed = scorePercent >= quiz.passMark;

  attempt.answers = gradedAnswers;
  attempt.totalPoints = totalPoints;
  attempt.earnedPoints = earnedPoints;
  attempt.scorePercent = scorePercent;
  attempt.passed = passed;
  attempt.submittedAt = new Date();
  attempt.timeTakenSeconds = timeTakenSeconds || 0;
  attempt.status = "graded";

  await attempt.save();

  // Fire quiz passed notification (non-blocking)
  if (passed) {
    const course = await Course.findById(attempt.courseId).select("title _id").lean();
    if (course) notifyQuizPassed(req.user, quiz.title, course, scorePercent, quiz.passMark);
  }

  // Build result payload — include explanations/correct answers based on showAnswersAfter setting
  const showAnswers =
    quiz.showAnswersAfter === "immediately" ||
    (quiz.showAnswersAfter === "after_pass" && passed);

  const resultQuestions = showAnswers
    ? quiz.questions.map((q) => {
        const gradedAnswer = gradedAnswers.find(
          (a) => a.questionId.toString() === q._id.toString()
        );
        return {
          _id: q._id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options, // includes isCorrect
          correctAnswers: q.correctAnswers,
          explanation: q.explanation,
          points: q.points,
          studentAnswer: gradedAnswer,
        };
      })
    : null;

  res.status(200).json({
    success: true,
    message: passed ? "Quiz passed! 🎉" : "Quiz submitted.",
    result: {
      attemptId: attempt._id,
      scorePercent,
      earnedPoints,
      totalPoints,
      passed,
      passMark: quiz.passMark,
      attemptNumber: attempt.attemptNumber,
      timeTakenSeconds: attempt.timeTakenSeconds,
    },
    questions: resultQuestions,
  });
});

// @route  GET /api/quizzes/:quizId/my-attempts
// @access Student
export const getMyAttempts = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.quizId).select("maxAttempts passMark title");
  if (!quiz) return next(new AppError("Quiz not found.", 404));

  const attempts = await QuizAttempt.find({
    quiz: quiz._id,
    student: req.user._id,
  }).sort({ createdAt: -1 });

  const attemptsUsed = attempts.filter((a) => a.status !== "in_progress").length;
  const bestAttempt = attempts.reduce(
    (best, a) => (!best || a.scorePercent > best.scorePercent ? a : best),
    null
  );

  res.status(200).json({
    success: true,
    quiz: { title: quiz.title, maxAttempts: quiz.maxAttempts, passMark: quiz.passMark },
    attemptsUsed,
    attemptsRemaining: quiz.maxAttempts === 0 ? "unlimited" : Math.max(0, quiz.maxAttempts - attemptsUsed),
    bestScore: bestAttempt?.scorePercent ?? null,
    hasPassed: attempts.some((a) => a.passed),
    attempts,
  });
});
