import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

// Like protect, but doesn't return 401 if no token — just continues without req.user
// Used for public endpoints that return richer data for logged-in users
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (user && user.isActive) req.user = user;
    next();
  } catch {
    // Invalid token — just continue as unauthenticated
    next();
  }
};
