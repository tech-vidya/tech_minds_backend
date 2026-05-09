import express from "express";
import { validateCoupon, getCoupons, createCoupon, toggleCoupon, deleteCoupon } from "../controllers/coupon.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/validate", protect, authorizeRoles("student"), validateCoupon);
router.get("/", protect, authorizeRoles("creator", "admin"), getCoupons);
router.post("/", protect, authorizeRoles("creator", "admin"), createCoupon);
router.patch("/:id/toggle", protect, authorizeRoles("creator", "admin"), toggleCoupon);
router.delete("/:id", protect, authorizeRoles("creator", "admin"), deleteCoupon);

export default router;
