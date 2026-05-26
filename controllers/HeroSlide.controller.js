import HeroImage from "../models/HeroSlide.model.js";
import { cloudinary } from "../config/cloudinary.js";

/* ─────────────────────────────────────────────────────────────────────────────
   PUBLIC
───────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/hero-images
 * Returns only active images, sorted by order.
 * Used by the public HeroCarousel component.
 */
export const getPublicHeroImages = async (req, res) => {
  try {
    const images = await HeroImage.find({ isActive: true }).sort({ order: 1 });
    res.json({ images });
  } catch (err) {
    console.error("getPublicHeroImages:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   ADMIN
───────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/hero-images/admin
 * Returns ALL images (active + hidden), sorted by order.
 */
export const getAllHeroImages = async (req, res) => {
  try {
    const images = await HeroImage.find().sort({ order: 1 });
    res.json({ images });
  } catch (err) {
    console.error("getAllHeroImages:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/hero-images/admin
 * Uploads a new hero image (via multer → Cloudinary).
 * Body (multipart): image (file), caption (string), order (number)
 */
export const uploadHeroImage = async (req, res) => {
  try {
    // multer + CloudinaryStorage already uploaded the file; req.file is populated
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const { caption = "", order = 0 } = req.body;

    const image = await HeroImage.create({
      url:      req.file.path,       // Cloudinary secure URL
      publicId: req.file.filename,   // Cloudinary public_id (multer-storage-cloudinary puts it here)
      caption:  caption.trim(),
      order:    Number(order),
      isActive: true,
    });

    res.status(201).json({ message: "Image uploaded successfully", image });
  } catch (err) {
    console.error("uploadHeroImage:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PATCH /api/hero-images/admin/:id
 * Update caption, order, or isActive on an existing image.
 * Body (JSON): { caption?, order?, isActive? }
 */
export const updateHeroImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { caption, order, isActive } = req.body;

    // Build update object with only the fields that were sent
    const update = {};
    if (caption  !== undefined) update.caption  = caption.trim();
    if (order    !== undefined) update.order     = Number(order);
    if (isActive !== undefined) update.isActive  = Boolean(isActive);

    const image = await HeroImage.findByIdAndUpdate(id, update, { new: true });
    if (!image) return res.status(404).json({ message: "Image not found" });

    res.json({ message: "Image updated", image });
  } catch (err) {
    console.error("updateHeroImage:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE /api/hero-images/admin/:id
 * Removes the record from MongoDB AND deletes the asset from Cloudinary.
 */
export const deleteHeroImage = async (req, res) => {
  try {
    const { id } = req.params;

    const image = await HeroImage.findById(id);
    if (!image) return res.status(404).json({ message: "Image not found" });

    // Delete from Cloudinary first so we don't orphan assets
    await cloudinary.uploader.destroy(image.publicId, { resource_type: "image" });

    await image.deleteOne();

    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("deleteHeroImage:", err);
    res.status(500).json({ message: "Server error" });
  }
};