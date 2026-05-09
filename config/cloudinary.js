import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Video storage (lessons) ──────────────────────────────────────────────────
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "techvidya/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "avi", "mkv", "webm"],
    transformation: [{ quality: "auto" }],
  },
});

// ─── PDF / notes storage ───────────────────────────────────────────────────────
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "techvidya/notes",
    resource_type: "raw",
    allowed_formats: ["pdf", "doc", "docx", "ppt", "pptx"],
  },
});

// ─── Image storage (thumbnails, avatars) ──────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "techvidya/images",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1280, height: 720, crop: "limit", quality: "auto" }],
  },
});

// ─── Assignment file storage (any file type) ──────────────────────────────────
const assignmentStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: "techvidya/assignments",
    resource_type: file.mimetype.startsWith("video/") ? "video" : "raw",
    allowed_formats: ["pdf", "doc", "docx", "zip", "png", "jpg", "jpeg", "mp4"],
  }),
});

// ─── Multer upload instances ──────────────────────────────────────────────────
export const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

export const uploadPDF = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

export const uploadAssignmentFile = multer({
  storage: assignmentStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export { cloudinary };
export default cloudinary;
