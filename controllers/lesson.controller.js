import Course from "../models/Course.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";

// ─── Helper: find course and verify creator ownership ─────────────────────────
const findCourseForCreator = async (courseId, userId, role) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found.", 404);
  if (course.creator.toString() !== userId.toString() && role !== "admin") {
    throw new AppError("Not authorised to edit this course.", 403);
  }
  return course;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/courses/:courseId/sections
// @access Creator
export const addSection = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);
  const { title } = req.body;
  if (!title?.trim()) return next(new AppError("Section title is required.", 400));

  course.sections.push({ title: title.trim(), order: course.sections.length });
  await course.save();

  const newSection = course.sections[course.sections.length - 1];
  res.status(201).json({ success: true, message: "Section added.", section: newSection });
});

// @route  PUT /api/courses/:courseId/sections/:sectionId
// @access Creator
export const updateSection = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  if (req.body.title) section.title = req.body.title.trim();
  await course.save();

  res.status(200).json({ success: true, message: "Section updated.", section });
});

// @route  DELETE /api/courses/:courseId/sections/:sectionId
// @access Creator
export const deleteSection = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  // Clean up all lesson videos/notes in this section from Cloudinary
  const destroys = [];
  section.lessons.forEach((lesson) => {
    if (lesson.video?.public_id) {
      destroys.push(
        cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: "video" })
      );
    }
    lesson.notes.forEach((note) => {
      if (note.public_id) {
        destroys.push(cloudinary.uploader.destroy(note.public_id, { resource_type: "raw" }));
      }
    });
  });
  await Promise.allSettled(destroys);

  section.deleteOne();
  await course.save();

  res.status(200).json({ success: true, message: "Section deleted." });
});

// @route  PATCH /api/courses/:courseId/sections/reorder
// @access Creator
// Body: { order: ["sectionId1", "sectionId2", ...] }
export const reorderSections = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);
  const { order } = req.body; // array of section IDs in new order

  if (!Array.isArray(order)) return next(new AppError("order must be an array.", 400));

  order.forEach((sectionId, idx) => {
    const section = course.sections.id(sectionId);
    if (section) section.order = idx;
  });
  course.sections.sort((a, b) => a.order - b.order);
  await course.save();

  res.status(200).json({ success: true, message: "Sections reordered.", sections: course.sections });
});

// ─────────────────────────────────────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/courses/:courseId/sections/:sectionId/lessons
// @access Creator
export const addLesson = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const { title, description, isFreePreview } = req.body;
  if (!title?.trim()) return next(new AppError("Lesson title is required.", 400));

  section.lessons.push({
    title: title.trim(),
    description: description || "",
    isFreePreview: isFreePreview === "true",
    order: section.lessons.length,
  });
  await course.save();

  const newLesson = section.lessons[section.lessons.length - 1];
  res.status(201).json({ success: true, message: "Lesson added.", lesson: newLesson });
});

// @route  PUT /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
// @access Creator
export const updateLesson = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  const { title, description, isFreePreview } = req.body;
  if (title !== undefined) lesson.title = title.trim();
  if (description !== undefined) lesson.description = description;
  if (isFreePreview !== undefined) lesson.isFreePreview = isFreePreview === "true";

  await course.save();
  res.status(200).json({ success: true, message: "Lesson updated.", lesson });
});

// @route  DELETE /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
// @access Creator
export const deleteLesson = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  // Remove video from Cloudinary
  if (lesson.video?.public_id) {
    await cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: "video" });
  }
  // Remove notes from Cloudinary
  await Promise.allSettled(
    lesson.notes
      .filter((n) => n.public_id)
      .map((n) => cloudinary.uploader.destroy(n.public_id, { resource_type: "raw" }))
  );

  lesson.deleteOne();
  await course.save();

  res.status(200).json({ success: true, message: "Lesson deleted." });
});

// @route  PATCH /api/courses/:courseId/sections/:sectionId/lessons/reorder
// @access Creator
export const reorderLessons = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const { order } = req.body;
  if (!Array.isArray(order)) return next(new AppError("order must be an array.", 400));

  order.forEach((lessonId, idx) => {
    const lesson = section.lessons.id(lessonId);
    if (lesson) lesson.order = idx;
  });
  section.lessons.sort((a, b) => a.order - b.order);
  await course.save();

  res.status(200).json({ success: true, message: "Lessons reordered." });
});

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/video
// @access Creator
// Multer middleware (uploadVideo.single("video")) applied in route
export const uploadLessonVideo = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (!req.file) return next(new AppError("No video file uploaded.", 400));

  // Delete old video if exists
  if (lesson.video?.public_id) {
    await cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: "video" });
  }

  // Cloudinary returns duration in req.file for videos
  lesson.video = {
  public_id: req.file.filename,
  url: req.file.path,
  duration: Math.round(req.file.duration || 0),
  isProcessing: false,
};

  await course.save();
  res.status(200).json({
    success: true,
    message: "Video uploaded.",
    video: lesson.video,
  });
  console.log("VIDEO FILE:", req.file);
});

// @route  DELETE /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/video
// @access Creator
export const deleteLessonVideo = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (lesson.video?.public_id) {
    await cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: "video" });
  }
  lesson.video = { public_id: "", url: "", duration: 0, isProcessing: false };
  await course.save();

  res.status(200).json({ success: true, message: "Video removed." });
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTES UPLOAD (PDF / DOCX / PPTX)
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/notes
// @access Creator
export const uploadLessonNote = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  if (!req.file) return next(new AppError("No file uploaded.", 400));

  const ext = req.file.originalname.split(".").pop().toLowerCase();
  lesson.notes.push({
    title: req.body.title || req.file.originalname,
    public_id: req.file.public_id,
    url: req.file.path,
    fileType: ext,
    fileSize: req.file.size,
  });

  await course.save();
  const newNote = lesson.notes[lesson.notes.length - 1];

  res.status(201).json({ success: true, message: "Note uploaded.", note: newNote });
});

// @route  DELETE /api/courses/:courseId/sections/:sectionId/lessons/:lessonId/notes/:noteId
// @access Creator
export const deleteLessonNote = asyncHandler(async (req, res, next) => {
  const course = await findCourseForCreator(req.params.courseId, req.user._id, req.user.role);

  const section = course.sections.id(req.params.sectionId);
  if (!section) return next(new AppError("Section not found.", 404));

  const lesson = section.lessons.id(req.params.lessonId);
  if (!lesson) return next(new AppError("Lesson not found.", 404));

  const note = lesson.notes.id(req.params.noteId);
  if (!note) return next(new AppError("Note not found.", 404));

  if (note.public_id) {
    await cloudinary.uploader.destroy(note.public_id, { resource_type: "raw" });
  }
  note.deleteOne();
  await course.save();

  res.status(200).json({ success: true, message: "Note deleted." });
});
