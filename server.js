import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import connectDB from "./config/db.js";
import { errorHandler } from "./middleware/error.middleware.js";

import authRoutes       from "./routes/auth.routes.js";
import courseRoutes     from "./routes/course.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import quizRoutes       from "./routes/quiz.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import adminRoutes      from "./routes/admin.routes.js";
import walletRoutes     from "./routes/wallet.routes.js";
import couponRoutes     from "./routes/coupon.routes.js";
import paymentRoutes    from "./routes/payment.routes.js";

connectDB();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// server.js
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stripe webhook needs raw body — mount BEFORE express.json()
// ✅ FIRST parse JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// THEN routes
app.use("/api/payments", paymentRoutes);


if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

app.use("/api/auth",        authLimiter, authRoutes);
app.use("/api/courses",     courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/quizzes",     quizRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/admin",       adminRoutes);
app.use("/api/wallet",      walletRoutes);
app.use("/api/coupons",     couponRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Tech Vidya API running",
    phase: "Phase 4 complete",
    timestamp: new Date().toISOString(),
  });
});

app.use("*", (req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Tech Vidya running in ${process.env.NODE_ENV} mode on port ${PORT}`));

export default app;
