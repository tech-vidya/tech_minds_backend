import express from "express";
import { uploadImage } from "../config/cloudinary.js";
import {
  getPublicHeroImages,
  getAllHeroImages,
  uploadHeroImage,
  updateHeroImage,
  deleteHeroImage,
} from "../controllers/HeroSlide.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js"; // ← your existing auth middleware

const router = express.Router();

/* ── Public ── */
router.get("/", getPublicHeroImages);

/* ── Admin (auth-gated) ── */
router.get(   "/admin",     protect, authorizeRoles("admin"), getAllHeroImages);
router.post(  "/admin",     protect, authorizeRoles("admin"), uploadImage.single("image"), uploadHeroImage);
router.patch( "/admin/:id", protect, authorizeRoles("admin"), updateHeroImage);
router.delete("/admin/:id", protect, authorizeRoles("admin"), deleteHeroImage);

export default router;