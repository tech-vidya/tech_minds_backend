import express from "express";
import {
  createAssignment,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  deleteAssignmentAttachment,
  getAssignmentByLesson,
  submitAssignment,
  gradeSubmission,
  requestResubmit,
  getAllSubmissions,
} from "../controllers/assignment.controller.js";
import { protect, authorizeRoles, requireVerified } from "../middleware/auth.middleware.js";
import { uploadAssignmentFile } from "../config/cloudinary.js";

const router = express.Router();

// ─── Creator ──────────────────────────────────────────────────────────────────

// Create assignment (up to 5 attachment files)
router.post(
  "/",
  protect,
  authorizeRoles("creator", "admin"),
  uploadAssignmentFile.array("attachments", 5),
  createAssignment
);

router.get(
  "/lesson/:lessonId",
  protect,
  getAssignmentByLesson   // auth checked inside — creator sees all, student sees own
);

router.put(
  "/:assignmentId",
  protect,
  authorizeRoles("creator", "admin"),
  uploadAssignmentFile.array("attachments", 5),
  updateAssignment
);

router.delete(
  "/:assignmentId/attachments/:attachmentId",
  protect,
  authorizeRoles("creator", "admin"),
  deleteAssignmentAttachment
);

router.delete(
  "/:assignmentId",
  protect,
  authorizeRoles("creator", "admin"),
  deleteAssignment
);

router.get(
  "/:assignmentId/submissions",
  protect,
  authorizeRoles("creator", "admin"),
  getAllSubmissions
);

router.patch(
  "/:assignmentId/submissions/:submissionId/grade",
  protect,
  authorizeRoles("creator", "admin"),
  gradeSubmission
);

router.patch(
  "/:assignmentId/submissions/:submissionId/request-resubmit",
  protect,
  authorizeRoles("creator", "admin"),
  requestResubmit
);

// ─── Shared: get assignment detail (role-sensitive response) ─────────────────
router.get("/:assignmentId", protect, getAssignment);

// ─── Student ──────────────────────────────────────────────────────────────────
router.post(
  "/:assignmentId/submit",
  protect,
  authorizeRoles("student"),
  requireVerified,
  uploadAssignmentFile.array("files", 10),
  submitAssignment
);

export default router;
