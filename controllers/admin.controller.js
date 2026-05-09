import User from "../models/User.model.js";
import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import Order from "../models/Order.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/stats
// @access Admin
export const getPlatformStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalUsers,
    newUsersThisMonth,
    totalCourses,
    publishedCourses,
    totalEnrollments,
    enrollmentsThisMonth,
    pendingCreators,
    revenueThisMonth,
    revenueLastMonth,
    totalRevenue,
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: "admin" } }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Course.countDocuments(),
    Course.countDocuments({ isPublished: true }),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Course.countDocuments({ isPublished: true, approvalStatus: "pending" }),
    Order.aggregate([
      { $match: { status: "completed", paidAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$displayAmount" } } },
    ]),
    Order.aggregate([
      {
        $match: {
          status: "completed",
          paidAt: { $gte: startOfLastMonth, $lt: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$displayAmount" } } },
    ]),
    Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$displayAmount" } } },
    ]),
  ]);

  const thisMonthRev = revenueThisMonth[0]?.total || 0;
  const lastMonthRev = revenueLastMonth[0]?.total || 0;
  const revenueGrowth =
    lastMonthRev > 0
      ? (((thisMonthRev - lastMonthRev) / lastMonthRev) * 100).toFixed(1)
      : null;

  res.status(200).json({
    success: true,
    stats: {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth },
      courses: { total: totalCourses, published: publishedCourses },
      enrollments: { total: totalEnrollments, thisMonth: enrollmentsThisMonth },
      pendingCourseApprovals: pendingCreators,
      revenue: {
        total: totalRevenue[0]?.total || 0,
        thisMonth: thisMonthRev,
        lastMonth: lastMonthRev,
        growthPercent: revenueGrowth,
      },
    },
  });
});

// @route  GET /api/admin/revenue/chart
// @access Admin — last 12 months revenue data for chart
export const getRevenueChart = asyncHandler(async (req, res) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const data = await Order.aggregate([
    { $match: { status: "completed", paidAt: { $gte: twelveMonthsAgo } } },
    {
      $group: {
        _id: {
          year: { $year: "$paidAt" },
          month: { $month: "$paidAt" },
        },
        revenue: { $sum: "$displayAmount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // Fill in missing months with 0
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const found = data.find((r) => r._id.year === year && r._id.month === month);
    months.push({
      label: d.toLocaleString("default", { month: "short", year: "2-digit" }),
      revenue: found?.revenue || 0,
      orders: found?.orders || 0,
    });
  }

  res.status(200).json({ success: true, chart: months });
});

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/users
// @access Admin
export const getUsers = asyncHandler(async (req, res) => {
  const {
    search,
    role,
    isVerified,
    isActive,
    sort = "newest",
    page = 1,
    limit = 20,
  } = req.query;

  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (role) query.role = role;
  if (isVerified !== undefined) query.isVerified = isVerified === "true";
  if (isActive !== undefined) query.isActive = isActive === "true";

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
  };

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(query)
      .select("-password -refreshToken -emailVerifyToken -passwordResetToken")
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    users,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @route  GET /api/admin/users/:userId
// @access Admin
export const getUserDetail = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.userId).select(
    "-password -refreshToken -emailVerifyToken -passwordResetToken"
  );
  if (!user) return next(new AppError("User not found.", 404));

  const [enrollmentCount, orderCount] = await Promise.all([
    Enrollment.countDocuments({ student: user._id }),
    Order.countDocuments({ student: user._id, status: "completed" }),
  ]);

  res.status(200).json({
    success: true,
    user,
    meta: { enrollments: enrollmentCount, orders: orderCount },
  });
});

// @route  PATCH /api/admin/users/:userId/role
// @access Admin — change user role
export const changeUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  if (!["student", "creator", "admin"].includes(role)) {
    return next(new AppError("Invalid role.", 400));
  }
  // Prevent demoting yourself
  if (req.params.userId === req.user._id.toString()) {
    return next(new AppError("You cannot change your own role.", 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { role },
    { new: true }
  ).select("-password");

  if (!user) return next(new AppError("User not found.", 404));
  res.status(200).json({ success: true, message: "Role updated.", user });
});

// @route  PATCH /api/admin/users/:userId/toggle-active
// @access Admin — ban/unban user
export const toggleUserActive = asyncHandler(async (req, res, next) => {
  if (req.params.userId === req.user._id.toString()) {
    return next(new AppError("You cannot deactivate yourself.", 400));
  }

  const user = await User.findById(req.params.userId);
  if (!user) return next(new AppError("User not found.", 404));

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: user.isActive ? "User reactivated." : "User deactivated.",
    isActive: user.isActive,
  });
});

// @route  DELETE /api/admin/users/:userId
// @access Admin
export const deleteUser = asyncHandler(async (req, res, next) => {
  if (req.params.userId === req.user._id.toString()) {
    return next(new AppError("You cannot delete yourself.", 400));
  }
  const user = await User.findByIdAndDelete(req.params.userId);
  if (!user) return next(new AppError("User not found.", 404));

  res.status(200).json({ success: true, message: "User deleted." });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR APPROVALS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/creator-requests
// @access Admin
export const getCreatorRequests = asyncHandler(async (req, res) => {
  const { status = "pending" } = req.query;
  const users = await User.find({ creatorRequestStatus: status })
    .select("name email avatar createdAt creatorRequestStatus isApprovedCreator")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: users.length, users });
});

// @route  PATCH /api/admin/creator-requests/:userId/approve
// @access Admin
export const approveCreator = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.userId);
  if (!user) return next(new AppError("User not found.", 404));

  user.role = "creator";
  user.isApprovedCreator = true;
  user.creatorRequestStatus = "approved";
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: `${user.name} approved as creator.`,
  });
});

// @route  PATCH /api/admin/creator-requests/:userId/reject
// @access Admin
export const rejectCreator = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.userId);
  if (!user) return next(new AppError("User not found.", 404));

  user.creatorRequestStatus = "rejected";
  user.isApprovedCreator = false;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ success: true, message: `${user.name}'s creator request rejected.` });
});

// @route  POST /api/admin/creator-requests/apply
// @access Student — request to become creator
export const applyForCreator = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (user.role === "creator") {
    return next(new AppError("You are already a creator.", 400));
  }
  if (user.creatorRequestStatus === "pending") {
    return next(new AppError("Your request is already pending.", 400));
  }

  user.creatorRequestStatus = "pending";
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: "Creator request submitted. You will be notified once reviewed.",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COURSE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/courses
// @access Admin
export const adminGetCourses = asyncHandler(async (req, res) => {
  const { search, isPublished, page = 1, limit = 20 } = req.query;

  const query = {};
  if (search) query.$text = { $search: search };
  if (isPublished !== undefined) query.isPublished = isPublished === "true";

  const skip = (Number(page) - 1) * Number(limit);
  const [courses, total] = await Promise.all([
    Course.find(query)
      .populate("creator", "name email")
      .select("title slug isPublished stats price category createdAt creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Course.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    courses,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// @route  PATCH /api/admin/courses/:courseId/toggle-publish
// @access Admin — force publish or unpublish any course
export const adminTogglePublish = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  course.isPublished = !course.isPublished;
  if (course.isPublished) course.publishedAt = new Date();
  await course.save();

  res.status(200).json({
    success: true,
    message: course.isPublished ? "Course published." : "Course unpublished.",
    isPublished: course.isPublished,
  });
});

// @route  DELETE /api/admin/courses/:courseId
// @access Admin
export const adminDeleteCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findByIdAndDelete(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));
  res.status(200).json({ success: true, message: "Course deleted by admin." });
});

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE / ORDERS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/orders
// @access Admin
export const getOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("student", "name email")
      .populate("course", "title slug")
      .populate("creator", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    orders,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COURSE APPROVALS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/admin/course-approvals
// @access Admin — list courses pending approval
export const getPendingCourses = asyncHandler(async (req, res) => {
  const { status = "pending", page = 1, limit = 20 } = req.query;

  const query = { isPublished: true, approvalStatus: status };
  const skip = (Number(page) - 1) * Number(limit);

  const [courses, total] = await Promise.all([
    Course.find(query)
      .populate("creator", "name email avatar")
      .select("title slug thumbnail category level price isFree stats approvalStatus approvalNote publishedAt createdAt creator")
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Course.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    courses,
    pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
  });
});

// @route  PATCH /api/admin/course-approvals/:courseId/approve
// @access Admin
export const approveCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  course.approvalStatus = "approved";
  course.approvalNote = "";
  course.approvedAt = new Date();
  course.approvedBy = req.user._id;
  await course.save();

  res.status(200).json({
    success: true,
    message: `"${course.title}" approved and now live.`,
  });
});

// @route  PATCH /api/admin/course-approvals/:courseId/reject
// @access Admin
// Body: { note: "Reason for rejection" }
export const rejectCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const { note = "" } = req.body;

  course.approvalStatus = "rejected";
  course.approvalNote = note;
  // Also unpublish so creator knows to fix and resubmit
  course.isPublished = false;
  await course.save();

  res.status(200).json({
    success: true,
    message: `"${course.title}" rejected.`,
  });
});
