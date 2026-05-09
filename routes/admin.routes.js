import express from "express";
import {
  getPlatformStats,
  getRevenueChart,
  getUsers,
  getUserDetail,
  changeUserRole,
  toggleUserActive,
  deleteUser,
  getCreatorRequests,
  approveCreator,
  rejectCreator,
  applyForCreator,
  adminGetCourses,
  adminTogglePublish,
  adminDeleteCourse,
  getOrders,
  getPendingCourses,
  approveCourse,
  rejectCourse,
} from "../controllers/admin.controller.js";
import { protect, authorizeRoles, requireVerified } from "../middleware/auth.middleware.js";

const router = express.Router();

// ─── Student: apply to become creator ────────────────────────────────────────
router.post(
  "/creator-requests/apply",
  protect,
  authorizeRoles("student"),
  requireVerified,
  applyForCreator
);

// ─── Admin only below this point ─────────────────────────────────────────────
router.use(protect, authorizeRoles("admin"));

// Dashboard
router.get("/stats", getPlatformStats);
router.get("/revenue/chart", getRevenueChart);

// Users
router.get("/users", getUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId/role", changeUserRole);
router.patch("/users/:userId/toggle-active", toggleUserActive);
router.delete("/users/:userId", deleteUser);

// Creator requests
router.get("/creator-requests", getCreatorRequests);
router.patch("/creator-requests/:userId/approve", approveCreator);
router.patch("/creator-requests/:userId/reject", rejectCreator);

// Courses
router.get("/courses", adminGetCourses);
router.patch("/courses/:courseId/toggle-publish", adminTogglePublish);
router.delete("/courses/:courseId", adminDeleteCourse);

// Orders
router.get("/orders", getOrders);

// Course approvals
router.get("/course-approvals", getPendingCourses);
router.patch("/course-approvals/:courseId/approve", approveCourse);
router.patch("/course-approvals/:courseId/reject", rejectCourse);

export default router;
