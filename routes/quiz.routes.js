import express from "express";
import {
  createQuiz,
  getQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizByLesson,
  getQuizAttempts,
  startQuizAttempt,
  submitQuizAttempt,
  getMyAttempts,
} from "../controllers/quiz.controller.js";
import { protect, authorizeRoles, requireVerified } from "../middleware/auth.middleware.js";

const router = express.Router();

// ─── Creator routes ───────────────────────────────────────────────────────────
router.post(
  "/",
  protect,
  authorizeRoles("creator", "admin"),
  createQuiz
);

router.get(
  "/lesson/:lessonId",
  protect,
  authorizeRoles("creator", "admin"),
  getQuizByLesson
);

router.get(
  "/:quizId/attempts",
  protect,
  authorizeRoles("creator", "admin"),
  getQuizAttempts
);

router.put(
  "/:quizId",
  protect,
  authorizeRoles("creator", "admin"),
  updateQuiz
);

router.delete(
  "/:quizId",
  protect,
  authorizeRoles("creator", "admin"),
  deleteQuiz
);

// ─── Shared (creator sees full answers, student sees safe version) ────────────
router.get("/:quizId", protect, getQuiz);

// ─── Student routes ───────────────────────────────────────────────────────────
router.post(
  "/:quizId/start",
  protect,
  authorizeRoles("student"),
  requireVerified,
  startQuizAttempt
);

router.post(
  "/:quizId/submit",
  protect,
  authorizeRoles("student"),
  requireVerified,
  submitQuizAttempt
);

router.get(
  "/:quizId/my-attempts",
  protect,
  authorizeRoles("student"),
  getMyAttempts
);

export default router;
