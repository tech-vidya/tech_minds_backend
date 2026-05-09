import express from "express";
import {
  getMyEnrollments,
  getEnrollment,
  markLessonComplete,
  updateLastAccessed,
  issueCertificate,
  getCourseStudents,
} from "../controllers/enrollment.controller.js";

import {
  protect,
  authorizeRoles,
  requireVerified,
} from "../middleware/auth.middleware.js";

const router = express.Router();

// ───────── STUDENT ROUTES ─────────
router.get(
  "/my",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getMyEnrollments
);

router.get(
  "/:courseId",
  protect,
  authorizeRoles("student"),
  requireVerified,
  getEnrollment
);

router.patch(
  "/:courseId/complete-lesson",
  protect,
  authorizeRoles("student"),
  requireVerified,
  markLessonComplete
);

router.patch(
  "/:courseId/last-accessed",
  protect,
  authorizeRoles("student"),
  requireVerified,
  updateLastAccessed
);

// ───────── CREATOR / ADMIN ROUTES ─────────
router.get(
  "/:courseId/students",
  protect,
  authorizeRoles("creator", "admin"),
  getCourseStudents
);

router.post(
  "/:courseId/issue-certificate",
  protect,
  authorizeRoles("creator", "admin"),
  issueCertificate
);
router.get("/my-certificates", protect, authorizeRoles("student"), async (req, res) => {
  try {
    const enrollments = await Enrollment.find({
      student: req.user._id,       // ← scoped to THIS student only
      certificateIssued: true,     // ← only issued certificates
    })
      .populate({
        path: "course",
        select: "title creator stats thumbnail slug",
        populate: {
          path: "creator",
          select: "name avatar",
        },
      })
      .sort({ certificateIssuedAt: -1 }) // newest first
      .lean();
 
    res.json({ enrollments });
  } catch (err) {
    console.error("my-certificates error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;