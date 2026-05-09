import express from "express";
import {
  register,
  login,
  logout,
  verifyEmail,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { body } from "express-validator";
import { validate } from "../middleware/validate.middleware.js";
import { uploadImage } from "../config/cloudinary.js";

const router = express.Router();

// ─── Validation rules ─────────────────────────────────────────────────────────
const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("role")
    .optional()
    .isIn(["student", "creator"])
    .withMessage("Role must be student or creator"),
];

const loginRules = [
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

// ─── Public routes ────────────────────────────────────────────────────────────
router.post("/register", registerRules, validate, register);
router.post("/login", loginRules, validate, login);
router.get("/verify-email/:token", verifyEmail);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// ─── Private routes ───────────────────────────────────────────────────────────
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.put("/profile", protect, uploadImage.single("avatar"), updateProfile);
router.put("/change-password", protect, changePassword);

export default router;
