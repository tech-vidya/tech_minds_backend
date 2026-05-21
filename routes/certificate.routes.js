import express from "express";
import {
  getRazorpayKey,
  createCertificateOrder,
  verifyCertificatePayment,
  getAllCertificateOrders,
  updateCertificateStatus,
} from "../controllers/certificate.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.get("/key", getRazorpayKey);
router.post("/create-order", createCertificateOrder);
router.post("/verify-payment", verifyCertificatePayment);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/orders", protect, authorizeRoles("admin"), getAllCertificateOrders);
router.patch("/admin/orders/:id/status", protect, authorizeRoles("admin"), updateCertificateStatus);

export default router;
