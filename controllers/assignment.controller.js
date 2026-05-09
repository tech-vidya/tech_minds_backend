import Assignment from "../models/Assignment.model.js";
import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";
import { notifyAssignmentGraded, notifyAssignmentSubmitted } from "../utils/notifications.utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR — Assignment CRUD
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/assignments
// @access Creator
// Supports: multipart/form-data with optional file attachments
export const createAssignment = asyncHandler(async (req, res, next) => {
  const {
    courseId, lessonId, title, description,
    maxMarks, dueDate, allowLateSubmission,
    maxFileSize, allowedFileTypes,
  } = req.body;

  // Verify creator owns this course
  const course = await Course.findById(courseId).select("creator");
  if (!course) return next(new AppError("Course not found.", 404));
  if (course.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  // Build attachments array from uploaded files
  const attachments = (req.files || []).map((file) => ({
    title: file.originalname,
    public_id: file.public_id,
    url: file.path,
    fileType: file.originalname.split(".").pop().toLowerCase(),
    fileSize: file.size,
  }));

  const assignment = await Assignment.create({
    title,
    description,
    lesson: { lessonId, courseId },
    creator: req.user._id,
    attachments,
    maxMarks: Number(maxMarks) || 100,
    dueDate: dueDate || null,
    allowLateSubmission: allowLateSubmission !== "false",
    maxFileSize: Number(maxFileSize) || 50,
    allowedFileTypes: allowedFileTypes
      ? JSON.parse(allowedFileTypes)
      : ["pdf", "doc", "docx", "zip", "png", "jpg", "jpeg"],
  });

  // Link assignment to lesson inside Course document
  await Course.findOneAndUpdate(
    { _id: courseId, "sections.lessons._id": lessonId },
    { $set: { "sections.$[].lessons.$[lesson].assignment": assignment._id } },
    { arrayFilters: [{ "lesson._id": lessonId }] }
  );

  res.status(201).json({ success: true, message: "Assignment created.", assignment });
});

// @route  GET /api/assignments/:assignmentId
// @access Creator (full) | Student (no submission details of others)
export const getAssignment = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId).populate(
    "creator",
    "name avatar"
  );
  if (!assignment) return next(new AppError("Assignment not found.", 404));

  const isCreator =
    assignment.creator._id.toString() === req.user._id.toString() ||
    req.user.role === "admin";

  if (isCreator) {
    return res.status(200).json({ success: true, assignment });
  }

  // For students: return assignment info + only their own submission
  const mySubmission = assignment.submissions.find(
    (s) => s.student.toString() === req.user._id.toString()
  );

  const safeAssignment = {
    _id: assignment._id,
    title: assignment.title,
    description: assignment.description,
    attachments: assignment.attachments,
    maxMarks: assignment.maxMarks,
    dueDate: assignment.dueDate,
    allowLateSubmission: assignment.allowLateSubmission,
    allowedFileTypes: assignment.allowedFileTypes,
    maxFileSize: assignment.maxFileSize,
    creator: assignment.creator,
    mySubmission: mySubmission || null,
  };

  res.status(200).json({ success: true, assignment: safeAssignment });
});

// @route  PUT /api/assignments/:assignmentId
// @access Creator
export const updateAssignment = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));
  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const updatable = ["title", "description", "maxMarks", "dueDate", "allowLateSubmission", "maxFileSize"];
  updatable.forEach((f) => { if (req.body[f] !== undefined) assignment[f] = req.body[f]; });

  if (req.body.allowedFileTypes) {
    assignment.allowedFileTypes = JSON.parse(req.body.allowedFileTypes);
  }

  // New attachment files
  if (req.files?.length) {
    const newAttachments = req.files.map((file) => ({
      title: file.originalname,
      public_id: file.public_id,
      url: file.path,
      fileType: file.originalname.split(".").pop().toLowerCase(),
      fileSize: file.size,
    }));
    assignment.attachments.push(...newAttachments);
  }

  await assignment.save();
  res.status(200).json({ success: true, message: "Assignment updated.", assignment });
});

// @route  DELETE /api/assignments/:assignmentId/attachments/:attachmentId
// @access Creator — remove a specific creator attachment
export const deleteAssignmentAttachment = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));
  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const attachment = assignment.attachments.id(req.params.attachmentId);
  if (!attachment) return next(new AppError("Attachment not found.", 404));

  if (attachment.public_id) {
    await cloudinary.uploader.destroy(attachment.public_id, { resource_type: "raw" });
  }
  attachment.deleteOne();
  await assignment.save();

  res.status(200).json({ success: true, message: "Attachment removed." });
});

// @route  DELETE /api/assignments/:assignmentId
// @access Creator
export const deleteAssignment = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));
  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  // Cleanup Cloudinary files
  const destroys = [];
  assignment.attachments.forEach((a) => {
    if (a.public_id) destroys.push(cloudinary.uploader.destroy(a.public_id, { resource_type: "raw" }));
  });
  assignment.submissions.forEach((s) => {
    s.files.forEach((f) => {
      if (f.public_id) destroys.push(cloudinary.uploader.destroy(f.public_id, { resource_type: "raw" }));
    });
  });
  await Promise.allSettled(destroys);

  // Unlink from course lesson
  await Course.findOneAndUpdate(
    { _id: assignment.lesson.courseId },
    { $set: { "sections.$[].lessons.$[lesson].assignment": null } },
    { arrayFilters: [{ "lesson._id": assignment.lesson.lessonId }] }
  );

  await assignment.deleteOne();
  res.status(200).json({ success: true, message: "Assignment deleted." });
});

// @route  GET /api/assignments/lesson/:lessonId
// @access Creator | Student (enrolled)
export const getAssignmentByLesson = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findOne({
    "lesson.lessonId": req.params.lessonId,
  });
  if (!assignment) return next(new AppError("No assignment found for this lesson.", 404));

  // Reuse getAssignment logic
  req.params.assignmentId = assignment._id.toString();
  return getAssignment(req, res, next);
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT — Submit
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/assignments/:assignmentId/submit
// @access Student
// Supports: multipart/form-data — files[] + optional textAnswer
export const submitAssignment = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));

  // Must be enrolled
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: assignment.lesson.courseId,
  });
  if (!enrollment) return next(new AppError("You are not enrolled in this course.", 403));

  // Due date check
  if (assignment.dueDate && !assignment.allowLateSubmission) {
    if (new Date() > new Date(assignment.dueDate)) {
      return next(new AppError("The deadline for this assignment has passed.", 400));
    }
  }

  // Check for existing submission
  const existingIndex = assignment.submissions.findIndex(
    (s) => s.student.toString() === req.user._id.toString()
  );

  const files = (req.files || []).map((file) => ({
    originalName: file.originalname,
    public_id: file.public_id,
    url: file.path,
    fileType: file.originalname.split(".").pop().toLowerCase(),
    fileSize: file.size,
  }));

  if (existingIndex !== -1) {
    // Re-submission: delete old files from Cloudinary
    const old = assignment.submissions[existingIndex];
    await Promise.allSettled(
      old.files
        .filter((f) => f.public_id)
        .map((f) => cloudinary.uploader.destroy(f.public_id, { resource_type: "raw" }))
    );

    // Update existing submission
    assignment.submissions[existingIndex].files = files;
    assignment.submissions[existingIndex].textAnswer = req.body.textAnswer || "";
    assignment.submissions[existingIndex].status = "submitted";
    assignment.submissions[existingIndex].submittedAt = new Date();
    // Reset grade on resubmission
    assignment.submissions[existingIndex].grade = null;
    assignment.submissions[existingIndex].feedback = "";
    assignment.submissions[existingIndex].gradedAt = undefined;
  } else {
    // New submission
    assignment.submissions.push({
      student: req.user._id,
      files,
      textAnswer: req.body.textAnswer || "",
      status: "submitted",
      submittedAt: new Date(),
    });
  }

  await assignment.save();
  const submission = assignment.submissions.find(
    (s) => s.student.toString() === req.user._id.toString()
  );

  // Notify creator of new submission (non-blocking)
  try {
    const course = await Course.findById(assignment.lesson.courseId).select("title creator").lean();
    if (course) {
      const creator = await User.findById(course.creator).select("name email").lean();
      if (creator) notifyAssignmentSubmitted(creator, req.user, assignment.title, course.title);
    }
  } catch { /* silent */ }

  res.status(200).json({
    success: true,
    message: existingIndex !== -1 ? "Assignment resubmitted." : "Assignment submitted.",
    submission,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR — Grade submission
// ─────────────────────────────────────────────────────────────────────────────

// @route  PATCH /api/assignments/:assignmentId/submissions/:submissionId/grade
// @access Creator
// Body: { grade: number, feedback: string }
export const gradeSubmission = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));

  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const submission = assignment.submissions.id(req.params.submissionId);
  if (!submission) return next(new AppError("Submission not found.", 404));

  const { grade, feedback } = req.body;

  if (grade === undefined || grade === null) {
    return next(new AppError("Grade is required.", 400));
  }
  if (grade < 0 || grade > assignment.maxMarks) {
    return next(
      new AppError(`Grade must be between 0 and ${assignment.maxMarks}.`, 400)
    );
  }

  submission.grade = Number(grade);
  submission.feedback = feedback || "";
  submission.status = "graded";
  submission.gradedBy = req.user._id;
  submission.gradedAt = new Date();

  await assignment.save();

  // Notify student their assignment was graded (non-blocking)
  try {
    const student = await User.findById(submission.student).select("name email").lean();
    const course = await Course.findById(assignment.lesson.courseId).select("title _id").lean();
    if (student && course) {
      notifyAssignmentGraded(
        student, course, assignment.title,
        submission.grade, assignment.maxMarks, submission.feedback
      );
    }
  } catch { /* silent */ }

  res.status(200).json({
    success: true,
    message: "Submission graded.",
    submission,
  });
});

// @route  PATCH /api/assignments/:assignmentId/submissions/:submissionId/request-resubmit
// @access Creator — ask student to resubmit
export const requestResubmit = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return next(new AppError("Assignment not found.", 404));
  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const submission = assignment.submissions.id(req.params.submissionId);
  if (!submission) return next(new AppError("Submission not found.", 404));

  submission.status = "resubmit_requested";
  submission.feedback = req.body.feedback || "Please resubmit with corrections.";
  await assignment.save();

  res.status(200).json({ success: true, message: "Resubmission requested.", submission });
});

// @route  GET /api/assignments/:assignmentId/submissions
// @access Creator — all submissions with student info
export const getAllSubmissions = asyncHandler(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.assignmentId).populate(
    "submissions.student",
    "name email avatar"
  );
  if (!assignment) return next(new AppError("Assignment not found.", 404));
  if (assignment.creator.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const stats = {
    total: assignment.submissions.length,
    submitted: assignment.submissions.filter((s) => s.status === "submitted").length,
    graded: assignment.submissions.filter((s) => s.status === "graded").length,
    resubmitRequested: assignment.submissions.filter((s) => s.status === "resubmit_requested").length,
    avgGrade:
      assignment.submissions.filter((s) => s.grade !== null).length > 0
        ? Math.round(
            assignment.submissions
              .filter((s) => s.grade !== null)
              .reduce((sum, s) => sum + s.grade, 0) /
              assignment.submissions.filter((s) => s.grade !== null).length
          )
        : null,
  };

  res.status(200).json({
    success: true,
    assignment: {
      _id: assignment._id,
      title: assignment.title,
      maxMarks: assignment.maxMarks,
      dueDate: assignment.dueDate,
    },
    stats,
    submissions: assignment.submissions,
  });
});
