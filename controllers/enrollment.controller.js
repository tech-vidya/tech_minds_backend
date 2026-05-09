import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { notifyEnrollment, notifyCourseCompleted } from "../utils/notifications.utils.js";

// @route  POST /api/courses/:courseId/enroll
// @access Student (free courses only — paid handled by Stripe)
export const enrollFree = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId).populate("creator", "name email");
  if (!course) return next(new AppError("Course not found.", 404));
  if (!course.isPublished) return next(new AppError("Course is not available.", 404));

  if (!course.isFree && course.price > 0) {
    return next(new AppError("This is a paid course. Use the checkout flow to enroll.", 400));
  }

  const existing = await Enrollment.findOne({ student: req.user._id, course: course._id });
  if (existing) {
    return res.status(200).json({ success: true, message: "Already enrolled.", enrollment: existing });
  }

  const enrollment = await Enrollment.create({
    student: req.user._id,
    course: course._id,
    amountPaid: 0,
    paymentMethod: "free",
  });

  await Course.findByIdAndUpdate(course._id, { $inc: { "stats.totalStudents": 1 } });

  // Fire notification - pass creator info separately so notification util can use it
  const courseForNotify = {
    _id: course._id,
    title: course.title,
    creatorEmail: course.creator?.email,
    creatorName: course.creator?.name,
  };
  notifyEnrollment(req.user, courseForNotify);

  res.status(201).json({ success: true, message: "Enrolled successfully.", enrollment });
});

// @route  GET /api/enrollments/my
// @access Student
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ student: req.user._id })
    .populate({
      path: "course",
      select: "title slug thumbnail creator stats.totalLessons stats.totalDuration category level isFree price",
      populate: { path: "creator", select: "name avatar" },
    })
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, enrollments });
});

// @route  GET /api/enrollments/:courseId
// @access Student
export const getEnrollment = asyncHandler(async (req, res, next) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
  });
  if (!enrollment) return next(new AppError("Not enrolled in this course.", 404));
  res.status(200).json({ success: true, enrollment });
});

// @route  PATCH /api/enrollments/:courseId/complete-lesson
// @access Student
export const markLessonComplete = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.body;
  if (!lessonId) return next(new AppError("lessonId is required.", 400));

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
  });
  if (!enrollment) return next(new AppError("Not enrolled in this course.", 404));

  const alreadyDone = enrollment.completedLessons.some(
    (cl) => cl.lesson.toString() === lessonId.toString()
  );

  if (!alreadyDone) {
    enrollment.completedLessons.push({ lesson: lessonId });
    enrollment.lastAccessedLesson = lessonId;

    const course = await Course.findById(req.params.courseId).select("sections title");
    const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);
    enrollment.progressPercent = totalLessons > 0
      ? Math.round((enrollment.completedLessons.length / totalLessons) * 100)
      : 0;

    // Course completed
    if (enrollment.progressPercent === 100 && !enrollment.isCompleted) {
      enrollment.isCompleted = true;
      enrollment.completedAt = new Date();
      enrollment.certificateIssued = true;
      enrollment.certificateIssuedAt = new Date();

      // Fire completion notification (non-blocking)
      notifyCourseCompleted(req.user, { _id: course._id, title: course.title });
    }

    await enrollment.save();
  }

  res.status(200).json({
    success: true,
    message: alreadyDone ? "Already completed." : "Lesson marked complete.",
    progressPercent: enrollment.progressPercent,
    isCompleted: enrollment.isCompleted,
    certificateIssued: enrollment.certificateIssued,
  });
});

// @route  PATCH /api/enrollments/:courseId/last-accessed
// @access Student
export const updateLastAccessed = asyncHandler(async (req, res, next) => {
  const { lessonId } = req.body;
  if (!lessonId) return next(new AppError("lessonId is required.", 400));

  const enrollment = await Enrollment.findOneAndUpdate(
    { student: req.user._id, course: req.params.courseId },
    { lastAccessedLesson: lessonId },
    { new: true }
  );
  if (!enrollment) return next(new AppError("Not enrolled.", 404));
  res.status(200).json({ success: true });
});

// @route  GET /api/courses/:courseId/enrollments
// @access Creator
export const getCourseEnrollments = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (course.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const enrollments = await Enrollment.find({ course: course._id })
    .populate("student", "name email avatar")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: enrollments.length, enrollments });
});

// @route  POST /api/enrollments/:courseId/issue-certificate
// @access Creator (for their own course) | Admin
export const issueCertificate = asyncHandler(async (req, res, next) => {
  const { studentId } = req.body;
  if (!studentId) return next(new AppError("studentId is required.", 400));

  // Verify requester owns the course or is admin
  const Course = (await import("../models/Course.model.js")).default;
  const course = await Course.findById(req.params.courseId).select("creator title");
  if (!course) return next(new AppError("Course not found.", 404));
  if (req.user.role !== "admin" && course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorized to issue certificates for this course.", 403));
  }
  console.log("USER:", req.user._id, req.user.role);
console.log("COURSE CREATOR:", course.creator.toString());

  const enrollment = await Enrollment.findOne({
    student: studentId,
    course: req.params.courseId,
  });
  if (!enrollment) return next(new AppError("Enrollment not found.", 404));

  enrollment.certificateIssued = true;
  enrollment.certificateIssuedAt = enrollment.certificateIssuedAt || new Date();
  enrollment.isCompleted = true;
  enrollment.completedAt = enrollment.completedAt || new Date();
  await enrollment.save();

  res.status(200).json({
    success: true,
    message: "Certificate issued successfully.",
    certificateIssuedAt: enrollment.certificateIssuedAt,
  });
});

// @route  GET /api/enrollments/:courseId/students
// @access Creator (own course) | Admin — list students for certificate management
export const getCourseStudents = asyncHandler(async (req, res, next) => {
  const Course = (await import("../models/Course.model.js")).default;
  const course = await Course.findById(req.params.courseId).select("creator title");
  if (!course) return next(new AppError("Course not found.", 404));
  if (req.user.role !== "admin" && course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorized.", 403));
  }

  const enrollments = await Enrollment.find({ course: req.params.courseId })
    .populate("student", "name email avatar")
    .select("student progressPercent isCompleted certificateIssued certificateIssuedAt completedAt createdAt")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: enrollments.length, enrollments });
});
