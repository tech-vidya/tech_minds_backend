import {
  sendEmail,
  enrollmentConfirmationTemplate,
  assignmentGradedTemplate,
  quizPassedTemplate,
  courseCompletedTemplate,
  creatorNewEnrollmentTemplate,
  creatorSubmissionTemplate,
} from "./email.utils.js";

// All functions fire-and-forget — never await these in controllers
// Errors are caught and logged silently so they never break the main response

export const notifyEnrollment = (student, course) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `You're enrolled in "${course.title}" 🎉`,
    html: enrollmentConfirmationTemplate(student.name, course.title, courseUrl),
  }).catch((e) => console.error("[email] enrollment:", e.message));

  // Notify creator
  if (course.creatorEmail && course.creatorName) {
    const dashUrl = `${process.env.CLIENT_URL}/creator/dashboard`;
    sendEmail({
      to: course.creatorEmail,
      subject: `New student enrolled in "${course.title}"`,
      html: creatorNewEnrollmentTemplate(course.creatorName, student.name, course.title, dashUrl),
    }).catch((e) => console.error("[email] creator enrollment:", e.message));
  }
};

export const notifyAssignmentGraded = (student, course, lessonTitle, grade, maxMarks, feedback) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Your assignment has been graded — ${grade}/${maxMarks}`,
    html: assignmentGradedTemplate(
      student.name, course.title, lessonTitle, grade, maxMarks, feedback, courseUrl
    ),
  }).catch((e) => console.error("[email] assignment graded:", e.message));
};

export const notifyAssignmentSubmitted = (creator, student, assignmentTitle, courseTitle) => {
  const submissionsUrl = `${process.env.CLIENT_URL}/creator/submissions`;
  sendEmail({
    to: creator.email,
    subject: `New submission: "${assignmentTitle}"`,
    html: creatorSubmissionTemplate(
      creator.name, student.name, assignmentTitle, courseTitle, submissionsUrl
    ),
  }).catch((e) => console.error("[email] submission notify:", e.message));
};

export const notifyQuizPassed = (student, quizTitle, course, scorePercent, passMark) => {
  const courseUrl = `${process.env.CLIENT_URL}/student/learn/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `You passed the quiz: ${quizTitle} 🏆`,
    html: quizPassedTemplate(
      student.name, quizTitle, course.title, scorePercent, passMark, courseUrl
    ),
  }).catch((e) => console.error("[email] quiz passed:", e.message));
};

export const notifyCourseCompleted = (student, course) => {
  const certUrl = `${process.env.CLIENT_URL}/student/certificate/${course._id}`;
  sendEmail({
    to: student.email,
    subject: `Course completed! Your certificate is ready 🎓`,
    html: courseCompletedTemplate(student.name, course.title, certUrl),
  }).catch((e) => console.error("[email] course completed:", e.message));
};
