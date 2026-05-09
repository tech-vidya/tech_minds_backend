import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

// ─── Protect: verify access token, attach user to req ────────────────────────
export const protect = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Access token expired. Please refresh.",
          code: "TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    // 3. Fetch user (confirm still exists and is active)
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    // 4. Attach to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── Authorize: restrict to specific roles ────────────────────────────────────
// Usage: authorizeRoles("admin")  or  authorizeRoles("creator", "admin")
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this resource.`,
        allowedRoles: roles,
      });
    }
    next();
  };
};

// ─── Verify email required ────────────────────────────────────────────────────
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Please verify your email before accessing this resource.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  next();
};

// ─── Creator must be approved by admin ───────────────────────────────────────
export const requireApprovedCreator = (req, res, next) => {
  if (req.user.role === "creator" && !req.user.isApprovedCreator) {
    return res.status(403).json({
      success: false,
      message: "Your creator account is pending admin approval.",
      code: "CREATOR_NOT_APPROVED",
    });
  }
  next();
};
