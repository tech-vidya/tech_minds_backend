// import Stripe from "stripe";
// import Course from "../models/Course.model.js";
// import Order from "../models/Order.model.js";
// import Enrollment from "../models/Enrollment.model.js";
// import Coupon from "../models/Coupon.model.js";
// import User from "../models/User.model.js";
// import { asyncHandler, AppError } from "../middleware/error.middleware.js";
// import { notifyEnrollment } from "../utils/notifications.utils.js";
// import { creditWallet } from "./wallet.controller.js";

// const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 20;

// // Lazy Stripe — only validated when checkout is actually clicked
// let _stripe = null;
// const getStripe = () => {
//   if (!_stripe) {
//     if (!process.env.STRIPE_SECRET_KEY) {
//       throw new AppError("Payment is not configured yet. Please contact support.", 503);
//     }
//     _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
//   }
//   return _stripe;
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // CHECKOUT
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  POST /api/payments/checkout/:courseId
// // @access Student
// export const createCheckoutSession = asyncHandler(async (req, res, next) => {
//   const course = await Course.findById(req.params.courseId).populate(
//     "creator",
//     "name"
//   );
//   if (!course) return next(new AppError("Course not found.", 404));
//   if (!course.isPublished) return next(new AppError("Course is not available.", 404));
//   if (course.isFree || course.price === 0) {
//     return next(new AppError("This is a free course. Use the enroll endpoint.", 400));
//   }

//   // Already enrolled?
//   const existing = await Enrollment.findOne({
//     student: req.user._id,
//     course: course._id,
//   });
//   if (existing) {
//     return next(new AppError("You are already enrolled in this course.", 400));
//   }

//   // ── Coupon discount ──────────────────────────────────────────────────────
//   let basePrice = course.discountPrice > 0 ? course.discountPrice : course.price;

//   const rawCoupon = req.body.couponCode;

// const couponCode =
//   typeof rawCoupon === "string" && rawCoupon.trim()
//     ? rawCoupon.trim().toUpperCase()
//     : null;

// let appliedCoupon = null;
// let couponDiscount = 0;

// if (couponCode) {
//   const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

//   if (coupon) {
//     // validation checks...

//     appliedCoupon = coupon;

//     if (coupon.discountType === "percentage") {
//       couponDiscount = Math.round((basePrice * coupon.discountValue) / 100);
//     } else {
//       couponDiscount = coupon.discountValue;
//     }

//     basePrice = Math.max(0, basePrice - couponDiscount);
//   }
// }

//   const amountInPaise = Math.round(basePrice * 100);

//   // Create Stripe Checkout session
//   const session = await getStripe().checkout.sessions.create({
//     payment_method_types: ["card"],
//     mode: "payment",
//     line_items: [
//       {
//         price_data: {
//           currency: "inr",
//           product_data: {
//             name: course.title,
//             description: `by ${course.creator.name}`,
//             images: course.thumbnail?.url ? [course.thumbnail.url] : [],
//           },
//           unit_amount: amountInPaise,
//         },
//         quantity: 1,
//       },
//     ],
//     metadata: {
//       courseId: course._id.toString(),
//       studentId: req.user._id.toString(),
//       creatorId: course.creator._id.toString(),
//     },
//     success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
//     cancel_url: `${process.env.CLIENT_URL}/courses/${course.slug}?payment=cancelled`,
//     customer_email: req.user.email,
//   });

//   // Create a pending order record
//   const platformFee = Math.round((amountInPaise * PLATFORM_FEE_PERCENT) / 100) / 100;
//   const creatorEarning = amountInPaise / 100 - platformFee;

//   const order = await Order.create({
//   student: req.user._id,
//   course: course._id,
//   creator: course.creator._id,
//   amount: amountInPaise,
//   currency: "inr",
//   displayAmount: amountInPaise / 100,
//   stripeSessionId: session.id,
//   status: "pending",
//   platformFeePercent: PLATFORM_FEE_PERCENT,
//   platformFee,
//   creatorEarning,
// });

//   // Record coupon usage
//   if (appliedCoupon) {
//     appliedCoupon.usageCount += 1;
//     appliedCoupon.usedBy.push({ user: req.user._id, orderId: order._id });
//     await appliedCoupon.save();
//   }

//   res.status(200).json({
//     success: true,
//     sessionId: session.id,
//     sessionUrl: session.url,
//     discount: couponDiscount > 0 ? { saved: couponDiscount, code: couponCode } : null,
//   });
// });

// // @route  GET /api/payments/verify/:sessionId
// // @access Student — called on success page to confirm and enroll
// export const verifyPayment = asyncHandler(async (req, res, next) => {
//   const session = await getStripe().checkout.sessions.retrieve(req.params.sessionId);

//   if (session.payment_status !== "paid") {
//     return next(new AppError("Payment not completed.", 400));
//   }

//   const order = await Order.findOne({ stripeSessionId: session.id });
//   if (!order) return next(new AppError("Order not found.", 404));

//   if (order.status === "completed") {
//     // Already processed — idempotent response
//     return res.status(200).json({
//       success: true,
//       message: "Already enrolled.",
//       courseId: order.course,
//     });
//   }

//   // Finalize order
//   order.status = "completed";
//   order.stripePaymentIntentId = session.payment_intent;
//   order.paidAt = new Date();
//   await order.save();

//   // Create enrollment
//   await Enrollment.findOneAndUpdate(
//     { student: order.student, course: order.course },
//     {
//       student: order.student,
//       course: order.course,
//       amountPaid: order.displayAmount,
//       paymentMethod: "stripe",
//       paymentId: session.payment_intent,
//     },
//     { upsert: true, new: true }
//   );

//   // Increment course student count
//   await Course.findByIdAndUpdate(order.course, {
//     $inc: { "stats.totalStudents": 1 },
//   });

//   // Credit creator wallet (non-blocking)
//   try {
//     if (order.creatorEarning > 0) {
//       await creditWallet(
//         order.creator,
//         order.creatorEarning,
//         `Sale: Course — Order ${order._id}`,
//         order._id
//       );
//     }
//   } catch (e) { console.error("[wallet] credit failed:", e.message); }

//   // Send enrollment confirmation email (non-blocking)
//   try {
//     const [student, course] = await Promise.all([
//       User.findById(order.student).select("name email").lean(),
//       Course.findById(order.course).populate("creator", "name email").select("title creator").lean(),
//     ]);
//     if (student && course) {
//       notifyEnrollment(student, {
//         _id: course._id,
//         title: course.title,
//         creatorEmail: course.creator?.email,
//         creatorName: course.creator?.name,
//       });
//     }
//   } catch { /* silent — don't block payment response */ }

//   res.status(200).json({
//     success: true,
//     message: "Payment verified. You are now enrolled!",
//     courseId: order.course,
//   });
// });

// // ─────────────────────────────────────────────────────────────────────────────
// // STRIPE WEBHOOK — handles async payment events
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  POST /api/payments/webhook
// // @access Stripe (raw body required — registered BEFORE express.json middleware)
// export const stripeWebhook = async (req, res) => {
//   const sig = req.headers["stripe-signature"];
//   let event;

//   try {
//     event = getStripe().webhooks.constructEvent(
//       req.body,           // raw buffer
//       sig,
//       process.env.STRIPE_WEBHOOK_SECRET
//     );
//   } catch (err) {
//     console.error("Webhook signature verification failed:", err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   try {
//     switch (event.type) {
//       case "checkout.session.completed": {
//         const session = event.data.object;
//         if (session.payment_status === "paid") {
//           const order = await Order.findOne({ stripeSessionId: session.id });
//           if (order && order.status !== "completed") {
//             order.status = "completed";
//             order.stripePaymentIntentId = session.payment_intent;
//             order.paidAt = new Date();
//             await order.save();

//             await Enrollment.findOneAndUpdate(
//               { student: order.student, course: order.course },
//               {
//                 student: order.student,
//                 course: order.course,
//                 amountPaid: order.displayAmount,
//                 paymentMethod: "stripe",
//                 paymentId: session.payment_intent,
//               },
//               { upsert: true }
//             );

//             await Course.findByIdAndUpdate(order.course, {
//               $inc: { "stats.totalStudents": 1 },
//             });
//           }
//         }
//         break;
//       }

//       case "payment_intent.payment_failed": {
//         const pi = event.data.object;
//         await Order.findOneAndUpdate(
//           { stripePaymentIntentId: pi.id },
//           { status: "failed" }
//         );
//         break;
//       }

//       case "charge.refunded": {
//         const charge = event.data.object;
//         await Order.findOneAndUpdate(
//           { stripePaymentIntentId: charge.payment_intent },
//           { status: "refunded", refundedAt: new Date() }
//         );
//         break;
//       }
//     }
//   } catch (err) {
//     console.error("Webhook handler error:", err.message);
//   }

//   res.status(200).json({ received: true });
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // STUDENT ORDER HISTORY
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  GET /api/payments/my-orders
// // @access Student
// export const getMyOrders = asyncHandler(async (req, res) => {
//   const orders = await Order.find({ student: req.user._id, status: "completed" })
//     .populate("course", "title slug thumbnail")
//     .sort({ paidAt: -1 });

//   res.status(200).json({ success: true, orders });
// });

// // ─────────────────────────────────────────────────────────────────────────────
// // CREATOR EARNINGS
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  GET /api/payments/my-earnings
// // @access Creator
// export const getMyEarnings = asyncHandler(async (req, res) => {
//   const now = new Date();
//   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

//   const [totalEarnings, thisMonthEarnings, recentOrders, earningsByCourse] =
//     await Promise.all([
//       Order.aggregate([
//         { $match: { creator: req.user._id, status: "completed" } },
//         { $group: { _id: null, total: { $sum: "$creatorEarning" } } },
//       ]),
//       Order.aggregate([
//         {
//           $match: {
//             creator: req.user._id,
//             status: "completed",
//             paidAt: { $gte: startOfMonth },
//           },
//         },
//         { $group: { _id: null, total: { $sum: "$creatorEarning" } } },
//       ]),
//       Order.find({ creator: req.user._id, status: "completed" })
//         .populate("student", "name avatar")
//         .populate("course", "title slug thumbnail")
//         .sort({ paidAt: -1 })
//         .limit(10),
//       Order.aggregate([
//         { $match: { creator: req.user._id, status: "completed" } },
//         {
//           $group: {
//             _id: "$course",
//             totalEarned: { $sum: "$creatorEarning" },
//             salesCount: { $sum: 1 },
//           },
//         },
//         {
//           $lookup: {
//             from: "courses",
//             localField: "_id",
//             foreignField: "_id",
//             as: "course",
//           },
//         },
//         { $unwind: "$course" },
//         {
//           $project: {
//             courseName: "$course.title",
//             courseSlug: "$course.slug",
//             thumbnail: "$course.thumbnail",
//             totalEarned: 1,
//             salesCount: 1,
//           },
//         },
//         { $sort: { totalEarned: -1 } },
//       ]),
//     ]);

//   res.status(200).json({
//     success: true,
//     earnings: {
//       total: totalEarnings[0]?.total || 0,
//       thisMonth: thisMonthEarnings[0]?.total || 0,
//       platformFeePercent: PLATFORM_FEE_PERCENT,
//     },
//     recentOrders,
//     earningsByCourse,
//   });
// });

// // @route  POST /api/payments/refund/:orderId
// // @access Admin
// export const refundOrder = asyncHandler(async (req, res, next) => {
//   const order = await Order.findById(req.params.orderId);
//   if (!order) return next(new AppError("Order not found.", 404));
//   if (order.status !== "completed") {
//     return next(new AppError("Only completed orders can be refunded.", 400));
//   }

//   // Issue refund via Stripe
//   await getStripe().refunds.create({ payment_intent: order.stripePaymentIntentId });

//   order.status = "refunded";
//   order.refundedAt = new Date();
//   order.refundReason = req.body.reason || "Admin refund";
//   await order.save();

//   // Remove enrollment
//   await Enrollment.findOneAndDelete({
//     student: order.student,
//     course: order.course,
//   });

//   // Decrement course student count
//   await Course.findByIdAndUpdate(order.course, {
//     $inc: { "stats.totalStudents": -1 },
//   });

//   res.status(200).json({ success: true, message: "Order refunded and enrollment removed." });
// });

import Razorpay from "razorpay";
import crypto from "crypto";
import Course from "../models/Course.model.js";
import Order from "../models/Order.model.js";
import Enrollment from "../models/Enrollment.model.js";
import Coupon from "../models/Coupon.model.js";
import User from "../models/User.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { notifyEnrollment } from "../utils/notifications.utils.js";
import { creditWallet } from "./wallet.controller.js";

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 20;

let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
      throw new AppError("Payment is not configured yet. Please contact support.", 503);
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

// POST /api/payments/checkout/:courseId
export const createCheckoutSession = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId).populate("creator", "name");
  if (!course) return next(new AppError("Course not found.", 404));
  if (!course.isPublished) return next(new AppError("Course is not available.", 404));
  if (course.isFree || course.price === 0)
    return next(new AppError("This is a free course. Use the enroll endpoint.", 400));

  const existing = await Enrollment.findOne({ student: req.user._id, course: course._id });
  if (existing) return next(new AppError("You are already enrolled in this course.", 400));

  let basePrice = course.discountPrice > 0 ? course.discountPrice : course.price;
  const rawCoupon = req.body.couponCode;
  const couponCode = typeof rawCoupon === "string" && rawCoupon.trim()
    ? rawCoupon.trim().toUpperCase() : null;

  let appliedCoupon = null;
  let couponDiscount = 0;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (coupon) {
      appliedCoupon = coupon;
      if (coupon.discountType === "percentage") {
        couponDiscount = Math.round((basePrice * coupon.discountValue) / 100);
        if (coupon.maxDiscount > 0) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
      } else {
        couponDiscount = Math.min(coupon.discountValue, basePrice);
      }
      basePrice = Math.max(0, basePrice - couponDiscount);
    }
  }

  // Razorpay expects amount in paise (smallest unit)
  const amountInPaise = Math.round(basePrice * 100);

  const razorpayOrder = await getRazorpay().orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    notes: {
      courseId: course._id.toString(),
      studentId: req.user._id.toString(),
      creatorId: course.creator._id.toString(),
    },
  });

  const platformFee = Math.round((amountInPaise * PLATFORM_FEE_PERCENT) / 100) / 100;
  const creatorEarning = amountInPaise / 100 - platformFee;

  const order = await Order.create({
    student: req.user._id,
    course: course._id,
    creator: course.creator._id,
    amount: amountInPaise,
    currency: "inr",
    displayAmount: amountInPaise / 100,
    razorpayOrderId: razorpayOrder.id,   // store Razorpay order ID
    status: "pending",
    platformFeePercent: PLATFORM_FEE_PERCENT,
    platformFee,
    creatorEarning,
  });

  if (appliedCoupon) {
    appliedCoupon.usageCount += 1;
    appliedCoupon.usedBy.push({ user: req.user._id, orderId: order._id });
    await appliedCoupon.save();
  }

  res.status(200).json({
    success: true,
    orderId: razorpayOrder.id,       // frontend opens popup with this
    amount: amountInPaise,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID,
    courseName: course.title,
    studentName: req.user.name,
    studentEmail: req.user.email,
    discount: couponDiscount > 0 ? { saved: couponDiscount, code: couponCode } : null,
  });
});

// POST /api/payments/verify
export const verifyPayment = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return next(new AppError("Missing payment details.", 400));

  // HMAC signature verification
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSig !== razorpay_signature)
    return next(new AppError("Payment verification failed. Invalid signature.", 400));

  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
  if (!order) return next(new AppError("Order not found.", 404));

  if (order.status === "completed") {
    return res.status(200).json({ success: true, message: "Already enrolled.", courseId: order.course });
  }

  order.status = "completed";
  order.razorpayPaymentId = razorpay_payment_id;
  order.paidAt = new Date();
  await order.save();

  await Enrollment.findOneAndUpdate(
    { student: order.student, course: order.course },
    { student: order.student, course: order.course, amountPaid: order.displayAmount, paymentMethod: "razorpay", paymentId: razorpay_payment_id },
    { upsert: true, new: true }
  );

  await Course.findByIdAndUpdate(order.course, { $inc: { "stats.totalStudents": 1 } });

  try {
    if (order.creatorEarning > 0)
      await creditWallet(order.creator, order.creatorEarning, `Sale: Course — Order ${order._id}`, order._id);
  } catch (e) { console.error("[wallet] credit failed:", e.message); }

  try {
    const [student, course] = await Promise.all([
      User.findById(order.student).select("name email").lean(),
      Course.findById(order.course).populate("creator", "name email").select("title creator").lean(),
    ]);
    if (student && course) notifyEnrollment(student, { _id: course._id, title: course.title, creatorEmail: course.creator?.email, creatorName: course.creator?.name });
  } catch { }

  res.status(200).json({ success: true, message: "Payment verified. You are now enrolled!", courseId: order.course });
});

// GET /api/payments/my-orders  (unchanged)
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ student: req.user._id, status: "completed" })
    .populate("course", "title slug thumbnail")
    .sort({ paidAt: -1 });
  res.status(200).json({ success: true, orders });
});

// GET /api/payments/my-earnings  (unchanged)
export const getMyEarnings = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalEarnings, thisMonthEarnings, recentOrders, earningsByCourse] = await Promise.all([
    Order.aggregate([{ $match: { creator: req.user._id, status: "completed" } }, { $group: { _id: null, total: { $sum: "$creatorEarning" } } }]),
    Order.aggregate([{ $match: { creator: req.user._id, status: "completed", paidAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: "$creatorEarning" } } }]),
    Order.find({ creator: req.user._id, status: "completed" }).populate("student", "name avatar").populate("course", "title slug thumbnail").sort({ paidAt: -1 }).limit(10),
    Order.aggregate([{ $match: { creator: req.user._id, status: "completed" } }, { $group: { _id: "$course", totalEarned: { $sum: "$creatorEarning" }, salesCount: { $sum: 1 } } }, { $lookup: { from: "courses", localField: "_id", foreignField: "_id", as: "course" } }, { $unwind: "$course" }, { $project: { courseName: "$course.title", courseSlug: "$course.slug", thumbnail: "$course.thumbnail", totalEarned: 1, salesCount: 1 } }, { $sort: { totalEarned: -1 } }]),
  ]);
  res.status(200).json({ success: true, earnings: { total: totalEarnings[0]?.total || 0, thisMonth: thisMonthEarnings[0]?.total || 0, platformFeePercent: PLATFORM_FEE_PERCENT }, recentOrders, earningsByCourse });
});

// POST /api/payments/refund/:orderId  (admin)
export const refundOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return next(new AppError("Order not found.", 404));
  if (order.status !== "completed") return next(new AppError("Only completed orders can be refunded.", 400));
  if (!order.razorpayPaymentId) return next(new AppError("No Razorpay payment ID on this order.", 400));

  await getRazorpay().payments.refund(order.razorpayPaymentId, { amount: order.amount });

  order.status = "refunded";
  order.refundedAt = new Date();
  order.refundReason = req.body.reason || "Admin refund";
  await order.save();

  await Enrollment.findOneAndDelete({ student: order.student, course: order.course });
  await Course.findByIdAndUpdate(order.course, { $inc: { "stats.totalStudents": -1 } });

  res.status(200).json({ success: true, message: "Order refunded and enrollment removed." });
});