import Coupon from "../models/Coupon.model.js";
import Course from "../models/Course.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";

// POST /api/coupons/validate
export const validateCoupon = asyncHandler(async (req, res, next) => {
  const { code, courseId } = req.body;
  if (!code?.trim()) return next(new AppError("Coupon code is required.", 400));
  if (!courseId) return next(new AppError("Course ID is required.", 400));

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) return next(new AppError("Invalid or expired coupon code.", 400));

  const now = new Date();
  if (now < coupon.validFrom) return next(new AppError("Coupon is not yet active.", 400));
  if (coupon.validUntil && now > coupon.validUntil) return next(new AppError("Coupon has expired.", 400));
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit)
    return next(new AppError("Coupon usage limit reached.", 400));

  const userUses = coupon.usedBy.filter((u) => u.user.toString() === req.user._id.toString()).length;
  if (coupon.perUserLimit > 0 && userUses >= coupon.perUserLimit)
    return next(new AppError("You have already used this coupon.", 400));

  if (coupon.applicableTo === "specific_courses") {
    if (!coupon.courses.some((c) => c.toString() === courseId))
      return next(new AppError("Coupon not valid for this course.", 400));
  }

  const course = await Course.findById(courseId).select("price discountPrice isFree");
  if (!course) return next(new AppError("Course not found.", 404));

  const basePrice = course.discountPrice > 0 ? course.discountPrice : course.price;
  if (coupon.minOrderAmount > 0 && basePrice < coupon.minOrderAmount)
    return next(new AppError(`Minimum order ₹${coupon.minOrderAmount} required.`, 400));

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = Math.round((basePrice * coupon.discountValue) / 100);
    if (coupon.maxDiscount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  } else {
    discountAmount = Math.min(coupon.discountValue, basePrice);
  }

  const finalPrice = Math.max(0, basePrice - discountAmount);

  res.status(200).json({
    success: true,
    message: "Coupon applied!",
    coupon: { code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue },
    pricing: { originalPrice: basePrice, discountAmount, finalPrice },
  });
});

// GET /api/coupons
export const getCoupons = asyncHandler(async (req, res) => {
  const query = req.user.role === "admin" ? {} : { createdBy: req.user._id };
  const coupons = await Coupon.find(query).populate("courses", "title").sort({ createdAt: -1 });
  res.status(200).json({ success: true, coupons });
});

// POST /api/coupons
export const createCoupon = asyncHandler(async (req, res, next) => {
  const { code, description, discountType, discountValue, applicableTo, courses,
    minOrderAmount, maxDiscount, usageLimit, perUserLimit, validFrom, validUntil } = req.body;

  if (!code?.trim()) return next(new AppError("Code is required.", 400));
  if (!discountValue || discountValue <= 0) return next(new AppError("Discount value must be > 0.", 400));
  if (discountType === "percentage" && discountValue > 100)
    return next(new AppError("Percentage cannot exceed 100.", 400));

  const coupon = await Coupon.create({
    code: code.toUpperCase().trim(), description,
    discountType: discountType || "percentage",
    discountValue: Number(discountValue),
    applicableTo: applicableTo || "all",
    courses: applicableTo === "specific_courses" ? courses : [],
    minOrderAmount: Number(minOrderAmount) || 0,
    maxDiscount: Number(maxDiscount) || 0,
    usageLimit: Number(usageLimit) || 0,
    perUserLimit: Number(perUserLimit) || 1,
    validFrom: validFrom ? new Date(validFrom) : new Date(),
    validUntil: validUntil ? new Date(validUntil) : null,
    createdBy: req.user._id,
    createdByRole: req.user.role,
  });
  res.status(201).json({ success: true, message: "Coupon created.", coupon });
});

// PATCH /api/coupons/:id/toggle
export const toggleCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return next(new AppError("Coupon not found.", 404));
  if (req.user.role !== "admin" && coupon.createdBy.toString() !== req.user._id.toString())
    return next(new AppError("Not authorized.", 403));
  coupon.isActive = !coupon.isActive;
  await coupon.save();
  res.status(200).json({ success: true, message: coupon.isActive ? "Coupon activated." : "Coupon deactivated.", isActive: coupon.isActive });
});

// DELETE /api/coupons/:id
export const deleteCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return next(new AppError("Coupon not found.", 404));
  if (req.user.role !== "admin" && coupon.createdBy.toString() !== req.user._id.toString())
    return next(new AppError("Not authorized.", 403));
  await coupon.deleteOne();
  res.status(200).json({ success: true, message: "Coupon deleted." });
});
