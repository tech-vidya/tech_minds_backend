import Razorpay from "razorpay";
import crypto from "crypto";
import CertificateOrder from "../models/CertificateOrder.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { sendEmail } from "../utils/email.utils.js";

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new AppError("Payment gateway not configured. Please contact support.", 503);
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Certificate pricing (in INR)
const CERTIFICATE_PRICES = {
  completion: 299,
  excellence: 499,
  participation: 199,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET RAZORPAY KEY (public)
// @route  GET /api/certificates/key
// ─────────────────────────────────────────────────────────────────────────────
export const getRazorpayKey = asyncHandler(async (req, res) => {
  res.json({ success: true, key: process.env.RAZORPAY_KEY_ID });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ORDER
// @route  POST /api/certificates/create-order
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
export const createCertificateOrder = asyncHandler(async (req, res, next) => {
  const {
    name, email, phone,
    courseName, courseType, completionDate, certificateType,
  } = req.body;

  if (!name || !email || !phone || !courseName || !courseType || !completionDate || !certificateType) {
    return next(new AppError("All required fields must be provided.", 400));
  }

  const amount = CERTIFICATE_PRICES[certificateType] || 299;

  const razorpay = getRazorpay();
  const razorpayOrder = await razorpay.orders.create({
    amount: amount * 100, // paise
    currency: "INR",
    receipt: `cert_${Date.now()}`,
    notes: { name, email, courseName, certificateType },
  });

  // Save pending order
  const certOrder = await CertificateOrder.create({
    name, email, phone,
    courseName, courseType, completionDate, certificateType,
    amount,
    razorpayOrderId: razorpayOrder.id,
    paymentStatus: "pending",
  });

  res.status(201).json({
    success: true,
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    certOrderId: certOrder._id,
    key: process.env.RAZORPAY_KEY_ID,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAYMENT
// @route  POST /api/certificates/verify-payment
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
export const verifyCertificatePayment = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, certOrderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !certOrderId) {
    return next(new AppError("Invalid payment verification data.", 400));
  }

  // Verify signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSig !== razorpay_signature) {
    await CertificateOrder.findByIdAndUpdate(certOrderId, { paymentStatus: "failed" });
    return next(new AppError("Payment verification failed. Invalid signature.", 400));
  }

  // Generate certificate number
  const certNumber = `TV-CERT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Update order
  const certOrder = await CertificateOrder.findByIdAndUpdate(
    certOrderId,
    {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentStatus: "paid",
      certificateStatus: "processing",
      certificateNumber: certNumber,
    },
    { new: true }
  );

  if (!certOrder) return next(new AppError("Certificate order not found.", 404));

  // Notify admin
  try {
    await sendEmail({
      to: process.env.SMTP_USER,
      subject: `🏆 New Certificate Purchase — ${certOrder.name} | ₹${certOrder.amount}`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Tech Vidya — Certificate Payment Received 🎓</p>
        </td></tr>
        <tr><td style="padding:32px">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 24px">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#166534;text-transform:uppercase">Amount Received</p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#15803d">₹${certOrder.amount}</p>
          </div>
          <table width="100%" style="border-collapse:collapse;font-size:14px">
            <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;width:40%;border-bottom:1px solid #e2e8f0">Student Name</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.name}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Email</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.email}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Phone</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.phone}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Course Name</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.courseName}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Certificate Type</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.certificateType}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Completion Date</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certOrder.completionDate}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Certificate No.</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${certNumber}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Razorpay Order ID</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${razorpay_order_id}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b">Payment ID</td><td style="padding:10px 14px;color:#475569">${razorpay_payment_id}</td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:#64748b">⚠️ Please issue the certificate and send it to the student at <strong>${certOrder.email}</strong></p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya Admin Panel</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    // Confirmation to student
    await sendEmail({
      to: certOrder.email,
      subject: `🎓 Payment Confirmed — Your Certificate is Being Processed`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Tech Vidya</p>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">Payment Successful! 🎉</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6">Hi ${certOrder.name}, your payment of <strong>₹${certOrder.amount}</strong> has been received and your certificate is now being processed.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:0 0 20px">
            <p style="margin:0 0 6px;font-size:13px;color:#64748b">Certificate Details</p>
            <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1e293b">${certOrder.courseName}</p>
            <p style="margin:0;font-size:13px;color:#64748b">${certOrder.certificateType.charAt(0).toUpperCase() + certOrder.certificateType.slice(1)} Certificate · ₹${certOrder.amount}</p>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin:0 0 20px">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1d4ed8">Certificate Number</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#1e40af;letter-spacing:1px">${certNumber}</p>
          </div>
          <p style="margin:0;font-size:14px;color:#475569;line-height:1.6">You will receive your certificate via email within <strong>1-2 business days</strong>. Keep your certificate number for reference.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error("Email error after payment:", err.message);
  }

  res.json({
    success: true,
    message: "Payment verified! Your certificate is being processed.",
    certificateNumber: certNumber,
    certOrder,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Get all certificate orders
// @route  GET /api/certificates/admin/orders
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCertificateOrders = asyncHandler(async (req, res) => {
  const orders = await CertificateOrder.find().sort({ createdAt: -1 });
  res.json({ success: true, count: orders.length, orders });
});

// @route  PATCH /api/certificates/admin/orders/:id/status
export const updateCertificateStatus = asyncHandler(async (req, res, next) => {
  const { certificateStatus, certificateUrl } = req.body;
  const order = await CertificateOrder.findByIdAndUpdate(
    req.params.id,
    { certificateStatus, ...(certificateUrl && { certificateUrl }) },
    { new: true }
  );
  if (!order) return next(new AppError("Order not found.", 404));
  res.json({ success: true, order });
});
