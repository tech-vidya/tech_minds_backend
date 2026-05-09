import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import { sendTokens, generateAccessToken } from "../utils/jwt.utils.js";
import {
  sendEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
} from "../utils/email.utils.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";

// ─── @route  POST /api/auth/register ─────────────────────────────────────────
// @access Public
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, role } = req.body;

  // Prevent self-registering as admin
  // Creators register as students with a pending request — approved by admin before getting creator role
  const safeRole = "student"; // Everyone starts as student
  const creatorRequestStatus = role === "creator" ? "pending" : "none";

  // Check if email exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("Email already registered.", 400));
  }

  // Create user
  const user = await User.create({ name, email, password, role: safeRole, creatorRequestStatus });

  // Generate email verification token
  const verifyToken = user.generateEmailVerifyToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${verifyToken}`;
  try {
    await sendEmail({
      to: user.email,
      subject: "Verify your Tech Vidya account",
      html: verifyEmailTemplate(user.name, verifyUrl),
    });
  } catch (err) {
    // If email fails, still create account but clear tokens
    user.emailVerifyToken = undefined;
    user.emailVerifyExpire = undefined;
    await user.save({ validateBeforeSave: false });
    console.error("Email send failed:", err.message);
  }

  res.status(201).json({
    success: true,
    message: role === "creator"
      ? "Registration successful! Your creator account is pending admin approval. Please verify your email to continue."
      : "Registration successful. Please check your email to verify your account.",
  });
});

// ─── @route  GET /api/auth/verify-email/:token ───────────────────────────────
// @access Public
export const verifyEmail = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    emailVerifyToken: hashedToken,
    emailVerifyExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired verification token.", 400));
  }

  user.isVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpire = undefined;
  await user.save({ validateBeforeSave: false });

  sendTokens(res, user, 200, "Email verified successfully!");
});

// ─── @route  POST /api/auth/login ────────────────────────────────────────────
// @access Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("Email and password are required.", 400));
  }

  // Get user with password (select: false by default)
  const user = await User.findOne({ email }).select("+password +refreshToken");
  if (!user) {
    return next(new AppError("Invalid email or password.", 401));
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new AppError("Invalid email or password.", 401));
  }

  // Check account active
  if (!user.isActive) {
    return next(new AppError("Your account has been deactivated.", 403));
  }

  // Update last login
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  sendTokens(res, user, 200, "Login successful.");
});

// ─── @route  POST /api/auth/refresh-token ────────────────────────────────────
// @access Public (uses httpOnly cookie)
export const refreshToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return next(new AppError("No refresh token found.", 401));
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return next(new AppError("Invalid or expired refresh token.", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    return next(new AppError("User not found or deactivated.", 401));
  }

  // Issue new access token only
  const newAccessToken = generateAccessToken(user._id, user.role);

  res.status(200).json({
    success: true,
    accessToken: newAccessToken,
  });
});

// ─── @route  POST /api/auth/logout ───────────────────────────────────────────
// @access Private
export const logout = asyncHandler(async (req, res, next) => {
  // Clear the httpOnly refresh token cookie
  res.cookie("refreshToken", "", {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  });

  res.status(200).json({ success: true, message: "Logged out successfully." });
});

// ─── @route  POST /api/auth/forgot-password ──────────────────────────────────
// @access Public
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    // Generic response to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
    });
  }

  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  try {
    await sendEmail({
      to: user.email,
      subject: "Tech Vidya Password Reset",
      html: resetPasswordTemplate(user.name, resetUrl),
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError("Email could not be sent.", 500));
  }

  res.status(200).json({
    success: true,
    message: "If that email exists, a reset link has been sent.",
  });
});

// ─── @route  POST /api/auth/reset-password/:token ────────────────────────────
// @access Public
export const resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired reset token.", 400));
  }

  const { password } = req.body;
  if (!password || password.length < 8) {
    return next(
      new AppError("Password must be at least 8 characters.", 400)
    );
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpire = undefined;
  await user.save();

  sendTokens(res, user, 200, "Password reset successful.");
});

// ─── @route  GET /api/auth/me ─────────────────────────────────────────────────
// @access Private
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  res.status(200).json({ success: true, user });
});

// ─── @route  PUT /api/auth/profile ───────────────────────────────────────────
// @access Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError("User not found.", 404));

  if (req.body.name) user.name = req.body.name.trim().slice(0, 50);
  if (req.body.bio !== undefined) user.bio = req.body.bio.slice(0, 500);

  // Avatar upload via Cloudinary (multer + cloudinary storage handles this)
  if (req.file) {
    if (user.avatar?.public_id) {
      await cloudinary.uploader.destroy(user.avatar.public_id).catch(() => {});
    }
    user.avatar = { public_id: req.file.public_id, url: req.file.path };
  }

  await user.save({ validateBeforeSave: false });
  res.status(200).json({ success: true, message: "Profile updated.", user });
});

// ─── @route  PUT /api/auth/change-password ───────────────────────────────────
// @access Private
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError("Both current and new password are required.", 400));
  }
  if (newPassword.length < 8) {
    return next(new AppError("New password must be at least 8 characters.", 400));
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return next(new AppError("Current password is incorrect.", 401));

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: "Password changed successfully." });
});
