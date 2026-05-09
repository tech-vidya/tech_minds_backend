import express from "express";
import {
  getCourses,
  getCourseBySlug,
  getMyCoursesAsCreator,
  createCourse,
  getCourseForEdit,
  updateCourse,
  deleteCourse,
  togglePublish,
  uploadPreviewVideo,
} from "../controllers/course.controller.js";
import {
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  addLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  uploadLessonVideo,
  deleteLessonVideo,
  uploadLessonNote,
  deleteLessonNote,
} from "../controllers/lesson.controller.js";
import {
  enrollFree,
  getCourseEnrollments,
} from "../controllers/enrollment.controller.js";

import { protect, authorizeRoles, requireVerified } from "../middleware/auth.middleware.js";
import { uploadVideo, uploadPDF, uploadImage } from "../config/cloudinary.js";

const router = express.Router();

import { optionalAuth } from "../middleware/optionalAuth.middleware.js";

// ─── Creator: must be BEFORE /:slug to avoid being swallowed ─────────────────
router.get(
  "/creator/my-courses",
  protect,
  authorizeRoles("creator", "admin"),
  getMyCoursesAsCreator
);

// ─── Public ──────────────────────────────────────────────────────────────────
router.get("/", optionalAuth, getCourses);
// Authenticated user gets richer response (enrollment status, unlocked videos)
router.get("/:slug", optionalAuth, getCourseBySlug);

router.post(
  "/",
  protect,
  authorizeRoles("creator"),
  requireVerified,
  uploadImage.single("thumbnail"),
  createCourse
);

router.get(
  "/:courseId/manage",
  protect,
  authorizeRoles("creator", "admin"),
  getCourseForEdit
);

router.put(
  "/:courseId",
  protect,
  authorizeRoles("creator", "admin"),
  uploadImage.single("thumbnail"),
  updateCourse
);

router.delete(
  "/:courseId",
  protect,
  authorizeRoles("creator", "admin"),
  deleteCourse
);

router.patch(
  "/:courseId/publish",
  protect,
  authorizeRoles("creator"),
  togglePublish
);

router.post(
  "/:courseId/preview-video",
  protect,
  authorizeRoles("creator"),
  uploadVideo.single("video"),
  uploadPreviewVideo
);

// ─── Sections ─────────────────────────────────────────────────────────────────
router.post(
  "/:courseId/sections",
  protect,
  authorizeRoles("creator"),
  addSection
);
router.put(
  "/:courseId/sections/:sectionId",
  protect,
  authorizeRoles("creator"),
  updateSection
);
router.delete(
  "/:courseId/sections/:sectionId",
  protect,
  authorizeRoles("creator"),
  deleteSection
);
router.patch(
  "/:courseId/sections/reorder",
  protect,
  authorizeRoles("creator"),
  reorderSections
);

// ─── Lessons ─────────────────────────────────────────────────────────────────
router.post(
  "/:courseId/sections/:sectionId/lessons",
  protect,
  authorizeRoles("creator"),
  addLesson
);
router.put(
  "/:courseId/sections/:sectionId/lessons/:lessonId",
  protect,
  authorizeRoles("creator"),
  updateLesson
);
router.delete(
  "/:courseId/sections/:sectionId/lessons/:lessonId",
  protect,
  authorizeRoles("creator"),
  deleteLesson
);
router.patch(
  "/:courseId/sections/:sectionId/lessons/reorder",
  protect,
  authorizeRoles("creator"),
  reorderLessons
);

// ─── Lesson Video ─────────────────────────────────────────────────────────────
router.post(
  "/:courseId/sections/:sectionId/lessons/:lessonId/video",
  protect,
  authorizeRoles("creator"),
  uploadVideo.single("video"),
  uploadLessonVideo
);
router.delete(
  "/:courseId/sections/:sectionId/lessons/:lessonId/video",
  protect,
  authorizeRoles("creator"),
  deleteLessonVideo
);

// ─── Lesson Notes ─────────────────────────────────────────────────────────────
router.post(
  "/:courseId/sections/:sectionId/lessons/:lessonId/notes",
  protect,
  authorizeRoles("creator"),
  uploadPDF.single("file"),
  uploadLessonNote
);
router.delete(
  "/:courseId/sections/:sectionId/lessons/:lessonId/notes/:noteId",
  protect,
  authorizeRoles("creator"),
  deleteLessonNote
);

// ─── Enrollment ───────────────────────────────────────────────────────────────
router.post(
  "/:courseId/enroll",
  protect,
  authorizeRoles("student"),
  requireVerified,
  enrollFree
);
router.get(
  "/:courseId/enrollments",
  protect,
  authorizeRoles("creator", "admin"),
  getCourseEnrollments
);

export default router;
