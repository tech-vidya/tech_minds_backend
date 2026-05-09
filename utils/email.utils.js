import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === "465",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || "Tech Vidya"}" <${process.env.FROM_EMAIL}>`,
    to, subject, html,
  });
};

// ─── Shared layout wrapper ────────────────────────────────────────────────────
const wrap = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px">Tech Vidya</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">${content}</td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
            © ${new Date().getFullYear()} Tech Vidya. You're receiving this because you have an account with us.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (text, url) =>
  `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px;margin:20px 0">${text}</a>`;

const h1 = (text) => `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">${text}</h1>`;
const p  = (text) => `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6">${text}</p>`;
const small = (text) => `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8">${text}</p>`;

// ─── Auth templates ───────────────────────────────────────────────────────────
export const verifyEmailTemplate = (name, verifyUrl) => wrap(`
  ${h1(`Welcome, ${name}! 👋`)}
  ${p("Thanks for signing up. Please verify your email address to activate your account.")}
  ${btn("Verify Email Address", verifyUrl)}
  ${small("This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.")}
`);

export const resetPasswordTemplate = (name, resetUrl) => wrap(`
  ${h1("Password Reset Request")}
  ${p(`Hi ${name}, we received a request to reset your password.`)}
  ${btn("Reset My Password", resetUrl)}
  ${small("This link expires in 30 minutes. If you didn't request a reset, please ignore this email.")}
`);

// ─── Enrollment confirmation ──────────────────────────────────────────────────
export const enrollmentConfirmationTemplate = (studentName, courseTitle, courseUrl) => wrap(`
  ${h1("You're enrolled! 🎉")}
  ${p(`Hi ${studentName}, you've successfully enrolled in:`)}
  <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:0 0 20px">
    <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b">${courseTitle}</p>
  </div>
  ${p("Start learning right now — your progress is saved automatically.")}
  ${btn("Start Learning", courseUrl)}
  ${small("Happy learning! The Tech Vidya team.")}
`);

// ─── Assignment graded notification ──────────────────────────────────────────
export const assignmentGradedTemplate = (studentName, courseTitle, lessonTitle, grade, maxMarks, feedback, courseUrl) => wrap(`
  ${h1("Your assignment has been graded 📝")}
  ${p(`Hi ${studentName}, your submission for <strong>${lessonTitle}</strong> in <em>${courseTitle}</em> has been graded.`)}
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:13px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Your Grade</p>
    <p style="margin:0;font-size:28px;font-weight:700;color:#15803d">${grade} <span style="font-size:16px;color:#166534">/ ${maxMarks}</span></p>
    ${feedback ? `<p style="margin:12px 0 0;font-size:14px;color:#166534"><strong>Feedback:</strong> ${feedback}</p>` : ""}
  </div>
  ${btn("View Submission", courseUrl)}
`);

// ─── Quiz passed notification ─────────────────────────────────────────────────
export const quizPassedTemplate = (studentName, quizTitle, courseTitle, scorePercent, passMark, courseUrl) => wrap(`
  ${h1("Quiz passed! 🏆")}
  ${p(`Congratulations ${studentName}! You passed the quiz <strong>${quizTitle}</strong> in <em>${courseTitle}</em>.`)}
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:13px;color:#1d4ed8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Your Score</p>
    <p style="margin:0;font-size:28px;font-weight:700;color:#1d4ed8">${scorePercent}%</p>
    <p style="margin:8px 0 0;font-size:13px;color:#1e40af">Pass mark was ${passMark}%</p>
  </div>
  ${btn("Continue Learning", courseUrl)}
`);

// ─── Course completed + certificate ──────────────────────────────────────────
export const courseCompletedTemplate = (studentName, courseTitle, certUrl) => wrap(`
  ${h1("Course complete! 🎓")}
  ${p(`Congratulations ${studentName}! You've completed <strong>${courseTitle}</strong>.`)}
  ${p("Your certificate of completion has been issued and is ready to download.")}
  ${btn("View & Download Certificate", certUrl)}
  ${small("Share your achievement with the world!")}
`);

// ─── Creator: new enrollment ──────────────────────────────────────────────────
export const creatorNewEnrollmentTemplate = (creatorName, studentName, courseTitle, dashboardUrl) => wrap(`
  ${h1("New student enrolled 🎉")}
  ${p(`Hi ${creatorName}, <strong>${studentName}</strong> just enrolled in your course:`)}
  <div style="background:#f1f5f9;border-radius:10px;padding:14px 18px;margin:0 0 20px">
    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b">${courseTitle}</p>
  </div>
  ${btn("View Dashboard", dashboardUrl)}
`);

// ─── Creator: new assignment submission ──────────────────────────────────────
export const creatorSubmissionTemplate = (creatorName, studentName, assignmentTitle, courseTitle, submissionsUrl) => wrap(`
  ${h1("New assignment submission 📬")}
  ${p(`Hi ${creatorName}, <strong>${studentName}</strong> has submitted their assignment:`)}
  <div style="background:#f1f5f9;border-radius:10px;padding:14px 18px;margin:0 0 20px">
    <p style="margin:0 0 4px;font-size:13px;color:#64748b">${courseTitle}</p>
    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b">${assignmentTitle}</p>
  </div>
  ${btn("Review Submission", submissionsUrl)}
`);
