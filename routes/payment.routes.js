import express from "express";
import {
  createCheckoutSession,
  verifyPayment,
  // stripeWebhook,
  getMyOrders,
  getMyEarnings,
  refundOrder,
} from "../controllers/payment.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

// ─── Stripe webhook — raw body, NO JSON parsing ───────────────────────────────
// Must be registered BEFORE express.json() in server.js — handled via rawBody middleware
// router.post(
//   "/webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook
// );

// ─── Student ──────────────────────────────────────────────────────────────────
router.post(
  "/checkout/:courseId",
  protect,
  authorizeRoles("student"),
  createCheckoutSession
);

router.post(
  "/verify",
  protect,
  authorizeRoles("student"),
  verifyPayment
);

router.get(
  "/my-orders",
  protect,
  authorizeRoles("student"),
  getMyOrders
);

// ─── Creator ──────────────────────────────────────────────────────────────────
router.get(
  "/my-earnings",
  protect,
  authorizeRoles("creator"),
  getMyEarnings
);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.post(
  "/refund/:orderId",
  protect,
  authorizeRoles("admin"),
  refundOrder
);

export default router;
