import Internship from "../models/Internship.model.js";
import InternshipApplication from "../models/InternshipApplication.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { sendEmail } from "../utils/email.utils.js";
import { appendApplicationToSheet, updateApplicationStatusInSheet } from "../utils/sheets.utils.js";
import { generateOfferLetter } from "../utils/generateOfferLetter.js";
import User from "../models/User.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/internships
export const getAllInternships = asyncHandler(async (req, res) => {
  const { domain, type, search } = req.query;
  const filter = { isActive: true };
  if (domain) filter.domain = { $regex: domain, $options: "i" };
  if (type)   filter.type   = type;
  if (search) {
    filter.$or = [
      { title:       { $regex: search, $options: "i" } },
      { company:     { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { skills:      { $elemMatch: { $regex: search, $options: "i" } } },
    ];
  }
  const internships = await Internship.find(filter)
    .populate("postedBy", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: internships.length, internships });
});

// @route  GET /api/internships/:id
export const getInternshipById = asyncHandler(async (req, res, next) => {
  const internship = await Internship.findById(req.params.id).populate("postedBy", "name");
  if (!internship) return next(new AppError("Internship not found.", 404));
  res.json({ success: true, internship });
});

// ─────────────────────────────────────────────────────────────────────────────
// APPLY (Public) — status auto-set to "shortlisted"
// ─────────────────────────────────────────────────────────────────────────────

// @route  POST /api/internships/:id/apply
export const applyForInternship = asyncHandler(async (req, res, next) => {
  const internship = await Internship.findById(req.params.id);
  if (!internship || !internship.isActive)
    return next(new AppError("Internship not found or no longer active.", 404));

  if (internship.lastDate && new Date(internship.lastDate) < new Date())
    return next(new AppError("The application deadline has passed.", 400));

  const {
    name, email, phone, college, degree, year,
    whyApply, skills, linkedIn, github,
  } = req.body;

  // ── Create application with status = "shortlisted" automatically ──────────
  const application = await InternshipApplication.create({
    internship: internship._id,
    name, email, phone, college, degree, year,
    whyApply, skills, linkedIn, github,
    status: "shortlisted",                 // ← Auto-shortlisted
  });

  // ── Google Sheets ──────────────────────────────────────────────────────────
  try {
    await appendApplicationToSheet(application, internship);
  } catch (sheetErr) {
    console.error("Sheet append failed:", sheetErr.message);
  }

  // ── Generate offer letter PDF ──────────────────────────────────────────────
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateOfferLetter({
      name,
      position: internship.title,
      company:  internship.company,
      role:     internship.domain,
      duration: internship.duration,
      startDate: new Date(internship.lastDate).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      }),
      date: new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      }),
      id: `TV-${application._id.toString().slice(-6).toUpperCase()}`,
    });
  } catch (pdfErr) {
    console.error("Offer letter generation failed:", pdfErr.message);
  }

  // ── Emails ─────────────────────────────────────────────────────────────────
  try {
    const adminEmail = process.env.SMTP_USER;

    // Admin notification
    await sendEmail({
      to: adminEmail,
      subject: `📩 New Application (Auto-Shortlisted) — ${internship.title} @ ${internship.company}`,
      html: buildAdminEmail({ name, email, phone, college, degree, year, skills, linkedIn, github, whyApply, internship, application }),
    });

    // Applicant confirmation — shortlisted message
    const emailOpts = {
      to: email,
      subject: `🎉 You're Shortlisted — ${internship.title} at ${internship.company}`,
      html: buildApplicantEmail({ name, internship, application }),
    };
    if (pdfBuffer) {
      emailOpts.attachments = [{
        filename: "Offer_Letter.pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      }];
    }
    await sendEmail(emailOpts);
  } catch (emailErr) {
    console.error("Email notification failed:", emailErr.message);
  }

  res.status(201).json({
    success: true,
    message: "Application submitted! You have been automatically shortlisted. Check your email.",
    applicationId: application._id,
    status: "shortlisted",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────────────────────

export const createInternship = asyncHandler(async (req, res) => {
  const {
    title, company, location, duration, stipend,
    description, requirements, skills, type,
    domain, openings, lastDate,
  } = req.body;

  const skillsArr = Array.isArray(skills)
    ? skills
    : typeof skills === "string" && skills.trim()
    ? skills.split(",").map((s) => s.trim())
    : [];

  const internship = await Internship.create({
    title, company, location, duration, stipend,
    description, requirements, skills: skillsArr,
    type, domain, openings, lastDate,
    postedBy: req.user._id,
  });

  res.status(201).json({ success: true, internship });
});

export const updateInternship = asyncHandler(async (req, res, next) => {
  const internship = await Internship.findById(req.params.id);
  if (!internship) return next(new AppError("Internship not found.", 404));
  const updated = await Internship.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });
  res.json({ success: true, internship: updated });
});

export const deleteInternship = asyncHandler(async (req, res, next) => {
  const internship = await Internship.findById(req.params.id);
  if (!internship) return next(new AppError("Internship not found.", 404));
  await internship.deleteOne();
  res.json({ success: true, message: "Internship deleted." });
});

export const getAllInternshipsAdmin = asyncHandler(async (req, res) => {
  const internships = await Internship.find()
    .populate("postedBy", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: internships.length, internships });
});

export const getApplicationsForInternship = asyncHandler(async (req, res) => {
  const applications = await InternshipApplication.find({ internship: req.params.id })
    .sort({ createdAt: -1 });
  res.json({ success: true, count: applications.length, applications });
});

export const getAllApplications = asyncHandler(async (req, res) => {
  const applications = await InternshipApplication.find()
    .populate("internship", "title company")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: applications.length, applications });
});

// @route  PUT /api/internships/applications/:appId/status
export const updateApplicationStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ["pending", "reviewed", "shortlisted", "rejected"];
  if (!validStatuses.includes(status))
    return next(new AppError("Invalid status value.", 400));

  const application = await InternshipApplication.findById(req.params.appId)
    .populate("internship", "title company location");
  if (!application) return next(new AppError("Application not found.", 404));

  const oldStatus = application.status;
  application.status = status;
  await application.save();

  try {
    await updateApplicationStatusInSheet(application._id.toString(), status);
  } catch (e) {
    console.error("Sheet update failed:", e.message);
  }

  if (oldStatus !== status && status !== "pending") {
    const cfg = STATUS_EMAIL_CONFIG(application)[status];
    if (cfg) {
      try {
        await sendEmail({
          to: application.email,
          subject: `${cfg.emoji} Application Update — ${application.internship.title}`,
          html: buildStatusEmail({ application, cfg, status }),
        });
      } catch (e) {
        console.error("Status email failed:", e.message);
      }
    }
  }

  res.json({ success: true, application });
});
// @route  POST /api/internships/apply-static
// @access Public
export const applyStatic = asyncHandler(async (req, res, next) => {
  const { internship: internshipData, ...applicantData } = req.body;
  // applicantData now contains: name, email, phone, college, degree, year, whyApply, skills, linkedIn, github

  let internship = await Internship.findOne({
    title: internshipData.title,
    company: internshipData.company,
  });

  if (!internship) {
    const adminUser = await User.findOne({ role: "admin" });
    if (!adminUser) return next(new AppError("No admin user found.", 500));

    internship = await Internship.create({
  ...internshipData,
  type: internshipData.type?.toLowerCase() || "remote",  // normalize + fallback
  isActive: true,
  postedBy: adminUser._id,
});
  }

  // Delegate to the real apply handler
  req.params.id = internship._id.toString();
  req.body = applicantData;
  return applyForInternship(req, res, next);
});
// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_EMAIL_CONFIG = (application) => ({
  reviewed: {
    emoji: "👀", heading: "Your Application is Being Reviewed",
    color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", text: "#92400e",
    message: `Your application for <strong>${application.internship.title}</strong> at <strong>${application.internship.company}</strong> is under review. We'll be in touch soon.`,
  },
  shortlisted: {
    emoji: "🎉", heading: "Congratulations — You're Shortlisted!",
    color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", text: "#166534",
    message: `Fantastic! You've been <strong>shortlisted</strong> for <strong>${application.internship.title}</strong> at <strong>${application.internship.company}</strong>. Our team will reach out shortly.`,
  },
  rejected: {
    emoji: "📋", heading: "Application Status Update",
    color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", text: "#374151",
    message: `Thank you for applying to <strong>${application.internship.title}</strong> at <strong>${application.internship.company}</strong>. After careful review, we won't be moving forward at this time. We encourage you to apply to future opportunities.`,
  },
});

function buildAdminEmail({ name, email, phone, college, degree, year, skills, linkedIn, github, whyApply, internship, application }) {
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">🎓 New Shortlisted Application — Tech Vidya</p>
      </td></tr>
      <tr><td style="padding:28px 32px">
        <h2 style="margin:0 0 4px;font-size:18px;color:#1e293b">${internship.title}</h2>
        <p style="margin:0 0 20px;color:#64748b;font-size:14px">${internship.company} · ${internship.location}</p>
        <table width="100%" style="border-collapse:collapse;font-size:14px">
          ${[["Full Name",name],["Email",email],["Phone",phone],["College",college],["Degree / Year",`${degree} — ${year}`],skills?["Skills",skills]:[],linkedIn?["LinkedIn",`<a href="${linkedIn}">${linkedIn}</a>`]:[],github?["GitHub",`<a href="${github}">${github}</a>`]:[]].filter(r=>r.length).map((r,i)=>`<tr style="${i%2===0?"background:#f8fafc":""}"><td style="padding:9px 14px;font-weight:600;color:#1e293b;width:38%;border-bottom:1px solid #e2e8f0">${r[0]}</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${r[1]}</td></tr>`).join("")}
        </table>
        <div style="margin-top:20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase">Motivation</p>
          <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.6">${whyApply}</p>
        </div>
        <div style="margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px">
          <p style="margin:0;font-size:13px;color:#166534">✅ Status: <strong>Auto-Shortlisted</strong> · Application ID: ${application._id}</p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function buildApplicantEmail({ name, internship, application }) {
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">Tech Vidya</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1e293b">🎉 You're Shortlisted, ${name}!</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">
          Congratulations! Your application for <strong>${internship.title}</strong> at <strong>${internship.company}</strong> has been received and you've been <strong style="color:#10b981">automatically shortlisted</strong>.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">
            ✅ Our team will review your profile and reach out within <strong>2–3 business days</strong> with next steps. Please keep an eye on this email address.
          </p>
        </div>
        <table width="100%" style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr style="background:#f8fafc"><td style="padding:9px 14px;font-weight:600;color:#1e293b;width:38%;border-bottom:1px solid #e2e8f0">Position</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${internship.title}</td></tr>
          <tr><td style="padding:9px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Company</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${internship.company}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:9px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Status</td><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0"><span style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">Shortlisted ✅</span></td></tr>
          <tr><td style="padding:9px 14px;font-weight:600;color:#1e293b">Application Ref</td><td style="padding:9px 14px;color:#94a3b8;font-size:12px">${application._id}</td></tr>
        </table>
        <p style="font-size:13px;color:#94a3b8">If you have questions, reply to this email. Good luck!</p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function buildStatusEmail({ application, cfg, status }) {
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px">
        <p style="margin:0;font-size:20px;font-weight:700;color:#fff">Tech Vidya</p>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1e293b">${cfg.emoji} ${cfg.heading}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#475569">Hi ${application.name},</p>
        <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;padding:18px 22px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:${cfg.text};line-height:1.7">${cfg.message}</p>
        </div>
        <table width="100%" style="border-collapse:collapse;font-size:14px">
          <tr style="background:#f8fafc"><td style="padding:9px 14px;font-weight:600;color:#1e293b;width:38%;border-bottom:1px solid #e2e8f0">Position</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${application.internship.title}</td></tr>
          <tr><td style="padding:9px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Company</td><td style="padding:9px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${application.internship.company}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:9px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Status</td><td style="padding:9px 14px;border-bottom:1px solid #e2e8f0"><span style="background:${cfg.bg};color:${cfg.text};border:1px solid ${cfg.border};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;text-transform:capitalize">${status}</span></td></tr>
          <tr><td style="padding:9px 14px;font-weight:600;color:#1e293b">Ref ID</td><td style="padding:9px 14px;color:#94a3b8;font-size:12px">${application._id}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:13px;color:#94a3b8">Reply to this email for any queries.</p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}
// import Internship from "../models/Internship.model.js";
// import InternshipApplication from "../models/InternshipApplication.model.js";
// import { asyncHandler, AppError } from "../middleware/error.middleware.js";
// import { sendEmail } from "../utils/email.utils.js";
// import { appendApplicationToSheet, updateApplicationStatusInSheet } from "../utils/sheets.utils.js";
// import { generateOfferLetter } from "../utils/generateOfferLetter.js";

// // ─────────────────────────────────────────────────────────────────────────────
// // PUBLIC
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  GET /api/internships
// // @access Public
// export const getAllInternships = asyncHandler(async (req, res) => {
//   const { domain, type, search } = req.query;
//   const filter = { isActive: true };
//   if (domain) filter.domain = { $regex: domain, $options: "i" };
//   if (type) filter.type = type;
//   if (search) {
//     filter.$or = [
//       { title: { $regex: search, $options: "i" } },
//       { company: { $regex: search, $options: "i" } },
//       { description: { $regex: search, $options: "i" } },
//     ];
//   }
//   const internships = await Internship.find(filter)
//     .populate("postedBy", "name")
//     .sort({ createdAt: -1 });
//   res.json({ success: true, count: internships.length, internships });
// });

// // @route  GET /api/internships/:id
// // @access Public
// export const getInternshipById = asyncHandler(async (req, res, next) => {
//   const internship = await Internship.findById(req.params.id).populate("postedBy", "name");
//   if (!internship) return next(new AppError("Internship not found.", 404));
//   res.json({ success: true, internship });
// });

// // ─────────────────────────────────────────────────────────────────────────────
// // ADMIN
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  POST /api/internships
// // @access Admin
// export const createInternship = asyncHandler(async (req, res) => {
//   const {
//     title, company, location, duration, stipend,
//     description, requirements, skills, type,
//     domain, openings, lastDate,
//   } = req.body;

//   const skillsArr = Array.isArray(skills)
//     ? skills
//     : typeof skills === "string" && skills.trim()
//     ? skills.split(",").map((s) => s.trim())
//     : [];

//   const internship = await Internship.create({
//     title, company, location, duration, stipend,
//     description, requirements, skills: skillsArr,
//     type, domain, openings, lastDate,
//     postedBy: req.user._id,
//   });

//   res.status(201).json({ success: true, internship });
// });

// // @route  PUT /api/internships/:id
// // @access Admin
// export const updateInternship = asyncHandler(async (req, res, next) => {
//   const internship = await Internship.findById(req.params.id);
//   if (!internship) return next(new AppError("Internship not found.", 404));

//   const updated = await Internship.findByIdAndUpdate(req.params.id, req.body, {
//     new: true, runValidators: true,
//   });
//   res.json({ success: true, internship: updated });
// });

// // @route  DELETE /api/internships/:id
// // @access Admin
// export const deleteInternship = asyncHandler(async (req, res, next) => {
//   const internship = await Internship.findById(req.params.id);
//   if (!internship) return next(new AppError("Internship not found.", 404));
//   await internship.deleteOne();
//   res.json({ success: true, message: "Internship deleted." });
// });

// // @route  GET /api/internships/admin/all
// // @access Admin
// export const getAllInternshipsAdmin = asyncHandler(async (req, res) => {
//   const internships = await Internship.find()
//     .populate("postedBy", "name")
//     .sort({ createdAt: -1 });
//   res.json({ success: true, count: internships.length, internships });
// });

// // @route  GET /api/internships/:id/applications
// // @access Admin
// export const getApplicationsForInternship = asyncHandler(async (req, res) => {
//   const applications = await InternshipApplication.find({
//     internship: req.params.id,
//   }).sort({ createdAt: -1 });
//   res.json({ success: true, count: applications.length, applications });
// });

// // @route  GET /api/internships/admin/applications
// // @access Admin
// export const getAllApplications = asyncHandler(async (req, res) => {
//   const applications = await InternshipApplication.find()
//     .populate("internship", "title company")
//     .sort({ createdAt: -1 });
//   res.json({ success: true, count: applications.length, applications });
// });

// // ─────────────────────────────────────────────────────────────────────────────
// // APPLY (Public)
// // ─────────────────────────────────────────────────────────────────────────────

// // @route  POST /api/internships/:id/apply
// // @access Public
// export const applyForInternship = asyncHandler(async (req, res, next) => {
//   const internship = await Internship.findById(req.params.id);
//   if (!internship || !internship.isActive) {
//     return next(new AppError("Internship not found or no longer active.", 404));
//   }

//   // Check if past deadline
//   if (internship.lastDate && new Date(internship.lastDate) < new Date()) {
//     return next(new AppError("The application deadline for this internship has passed.", 400));
//   }

//   const {
//     name, email, phone, college, degree, year,
//     whyApply, skills, linkedIn, github,
//   } = req.body;

//   const application = await InternshipApplication.create({
//     internship: internship._id,
//     name, email, phone, college, degree, year,
//     whyApply, skills, linkedIn, github,
//   });
//   const pdfBuffer = await generateOfferLetter({
//   name,
//   position: internship.title,
//   company: internship.company,
//   role: internship.domain,
//   duration: internship.duration,
//   startDate: new Date(internship.lastDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
//   date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
//   id: `TV-${application._id.toString().slice(-6).toUpperCase()}`,
// });
//   await appendApplicationToSheet(application, internship);

//   // ── Notify admin by email ──────────────────────────────────────────────────
//   try {
//     const adminEmail = process.env.SMTP_USER;
//     await sendEmail({
//       to: adminEmail,
//       subject: `📩 New Internship Application — ${internship.title} at ${internship.company}`,
//       html: `
// <!DOCTYPE html>
// <html>
// <head><meta charset="UTF-8"></head>
// <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
//   <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
//     <tr><td align="center">
//       <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
//         <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
//           <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Tech Vidya — New Internship Application</p>
//         </td></tr>
//         <tr><td style="padding:32px">
//           <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1e293b">${internship.title}</h2>
//           <p style="margin:0 0 24px;color:#64748b;font-size:14px">${internship.company} · ${internship.location}</p>

//           <table width="100%" style="border-collapse:collapse;font-size:14px">
//             <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;width:40%;border-bottom:1px solid #e2e8f0">Full Name</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${name}</td></tr>
//             <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Email</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${email}</td></tr>
//             <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Phone</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${phone}</td></tr>
//             <tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">College</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${college}</td></tr>
//             <tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Degree / Year</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${degree} — Year ${year}</td></tr>
//             ${skills ? `<tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">Skills</td><td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">${skills}</td></tr>` : ""}
//             ${linkedIn ? `<tr style="background:#f8fafc"><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">LinkedIn</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><a href="${linkedIn}" style="color:#4f46e5">${linkedIn}</a></td></tr>` : ""}
//             ${github ? `<tr><td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">GitHub</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><a href="${github}" style="color:#4f46e5">${github}</a></td></tr>` : ""}
//           </table>

//           <div style="margin-top:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px">
//             <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em">Why they want to join</p>
//             <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.6">${whyApply}</p>
//           </div>

//           <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Application ID: ${application._id} · Submitted: ${new Date().toLocaleString("en-IN")}</p>
//         </td></tr>
//         <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
//           <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. Admin notification.</p>
//         </td></tr>
//       </table>
//     </td></tr>
//   </table>
// </body>
// </html>`,
//     });

//     // ── Confirmation to applicant ──────────────────────────────────────────
//     await sendEmail({
//       to: email,
//       subject: `✅ Application Received — ${internship.title} at ${internship.company}`,
//       html: `
// <!DOCTYPE html>
// <html>
// <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
//   <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
//     <tr><td align="center">
//       <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
//         <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
//           <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Tech Vidya</p>
//         </td></tr>
//         <tr><td style="padding:32px">
//           <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">Application Received! 🎉</h1>
//           <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">Hi ${name}, thank you for applying for the <strong>${internship.title}</strong> internship at <strong>${internship.company}</strong>.</p>
//           <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 20px">
//             <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">Our team will review your application and get back to you within 3–5 business days. You'll receive an email update about your application status.</p>
//           </div>
//           <p style="margin:0;font-size:13px;color:#94a3b8">Application Ref: ${application._id}</p>
//         </td></tr>
//         <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
//           <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">© ${new Date().getFullYear()} Tech Vidya. All rights reserved.</p>
//         </td></tr>
//       </table>
//     </td></tr>
//   </table>
// </body>
// </html>`,
// attachments: [
//     {
//       filename: "Offer_Letter.pdf",
//       content: pdfBuffer,
//       contentType: "application/pdf",
//     }
//   ]
//     });
//   } catch (emailErr) {
//     console.error("Email notification failed:", emailErr.message);
//     // Don't fail the request if email fails
//   }

//   res.status(201).json({
//     success: true,
//     message: "Application submitted successfully! Check your email for confirmation.",
//     applicationId: application._id,
//   });
// });
// // @route  PUT /api/internships/applications/:appId/status
// // @access Admin
// export const updateApplicationStatus = asyncHandler(async (req, res, next) => {
//   const { status } = req.body;

//   const validStatuses = ["pending", "reviewed", "shortlisted", "rejected"];
//   if (!validStatuses.includes(status)) {
//     return next(new AppError("Invalid status value.", 400));
//   }

//   const application = await InternshipApplication.findById(req.params.appId)
//     .populate("internship", "title company location");

//   if (!application) return next(new AppError("Application not found.", 404));

//   const oldStatus = application.status;
//   application.status = status;
//   await application.save();

//   await updateApplicationStatusInSheet(application._id.toString(), status);

//   // Send email to applicant only if status actually changed
//   if (oldStatus !== status) {
//     const statusConfig = {
//       reviewed: {
//         emoji: "👀",
//         heading: "Your Application is Being Reviewed",
//         color: "#f59e0b",
//         bgColor: "#fffbeb",
//         borderColor: "#fde68a",
//         textColor: "#92400e",
//         message: `Great news! Your application for <strong>${application.internship.title}</strong> at <strong>${application.internship.company}</strong> is currently being reviewed by our team. We'll be in touch soon with further updates.`,
//       },
//       shortlisted: {
//         emoji: "🎉",
//         heading: "Congratulations — You've Been Shortlisted!",
//         color: "#10b981",
//         bgColor: "#f0fdf4",
//         borderColor: "#bbf7d0",
//         textColor: "#166534",
//         message: `Fantastic news! You have been <strong>shortlisted</strong> for the <strong>${application.internship.title}</strong> internship at <strong>${application.internship.company}</strong>. Our team will reach out to you shortly with next steps regarding the selection process.`,
//       },
//       rejected: {
//         emoji: "📋",
//         heading: "Application Status Update",
//         color: "#6b7280",
//         bgColor: "#f9fafb",
//         borderColor: "#e5e7eb",
//         textColor: "#374151",
//         message: `Thank you for your interest in the <strong>${application.internship.title}</strong> position at <strong>${application.internship.company}</strong>. After careful consideration, we regret to inform you that we will not be moving forward with your application at this time. We encourage you to apply for future opportunities.`,
//       },
//       pending: null, // No email for reverting to pending
//     };

//     const config = statusConfig[status];

//     if (config) {
//       try {
//         await sendEmail({
//           to: application.email,
//           subject: `${config.emoji} Application Update — ${application.internship.title} at ${application.internship.company}`,
//           html: `
// <!DOCTYPE html>
// <html>
// <body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
//   <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
//     <tr><td align="center">
//       <table width="600" cellpadding="0" cellspacing="0"
//         style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        
//         <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
//           <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Tech Vidya</p>
//         </td></tr>

//         <tr><td style="padding:32px">
//           <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">
//             ${config.emoji} ${config.heading}
//           </h1>
//           <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
//             Hi ${application.name},
//           </p>

//           <div style="background:${config.bgColor};border:1px solid ${config.borderColor};border-radius:10px;padding:20px 24px;margin:0 0 24px">
//             <p style="margin:0;font-size:14px;color:${config.textColor};line-height:1.7">
//               ${config.message}
//             </p>
//           </div>

//           <table width="100%" style="border-collapse:collapse;font-size:14px;margin-bottom:24px">
//             <tr style="background:#f8fafc">
//               <td style="padding:10px 14px;font-weight:600;color:#1e293b;width:40%;border-bottom:1px solid #e2e8f0">
//                 Position
//               </td>
//               <td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">
//                 ${application.internship.title}
//               </td>
//             </tr>
//             <tr>
//               <td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">
//                 Company
//               </td>
//               <td style="padding:10px 14px;color:#475569;border-bottom:1px solid #e2e8f0">
//                 ${application.internship.company}
//               </td>
//             </tr>
//             <tr style="background:#f8fafc">
//               <td style="padding:10px 14px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">
//                 Status
//               </td>
//               <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">
//                 <span style="background:${config.bgColor};color:${config.textColor};
//                   border:1px solid ${config.borderColor};padding:2px 10px;
//                   border-radius:999px;font-size:12px;font-weight:600;text-transform:capitalize">
//                   ${status}
//                 </span>
//               </td>
//             </tr>
//             <tr>
//               <td style="padding:10px 14px;font-weight:600;color:#1e293b">
//                 Application Ref
//               </td>
//               <td style="padding:10px 14px;color:#94a3b8;font-size:12px">
//                 ${application._id}
//               </td>
//             </tr>
//           </table>

//           <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
//             If you have any questions, feel free to reply to this email.
//           </p>
//         </td></tr>

//         <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
//           <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
//             © ${new Date().getFullYear()} Tech Vidya. All rights reserved.
//           </p>
//         </td></tr>
//       </table>
//     </td></tr>
//   </table>
// </body>
// </html>`,
//         });
//       } catch (emailErr) {
//         console.error("Status email failed:", emailErr.message);
//       }
//     }
//   }

//   res.json({ success: true, application });
// });