import express from "express";
import {
  getAllInternships,
  getInternshipById,
  createInternship,
  updateInternship,
  deleteInternship,
  getAllInternshipsAdmin,
  getApplicationsForInternship,
  getAllApplications,
  applyForInternship,
} from "../controllers/internship.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import { updateApplicationStatus } from "../controllers/internship.controller.js";

const router = express.Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.get("/", getAllInternships);
router.get("/:id", getInternshipById);
router.post("/:id/apply", applyForInternship);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/all", protect, authorizeRoles("admin"), getAllInternshipsAdmin);
router.get("/admin/applications", protect, authorizeRoles("admin"), getAllApplications);
router.get("/:id/applications", protect, authorizeRoles("admin"), getApplicationsForInternship);
router.post("/", protect, authorizeRoles("admin"), createInternship);
router.put("/:id", protect, authorizeRoles("admin"), updateInternship);
router.delete("/:id", protect, authorizeRoles("admin"), deleteInternship);


// Add this with the other admin routes
router.put(
  "/applications/:appId/status",
  protect,
  authorizeRoles("admin"),
  updateApplicationStatus
);

export default router;
