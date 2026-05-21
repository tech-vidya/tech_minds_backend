import Course from "../models/Course.model.js";
import Enrollment from "../models/Enrollment.model.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { cloudinary } from "../config/cloudinary.js";
import streamifier from "streamifier";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses
// @access Public — browse published courses with search/filter/pagination
export const getCourses = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    level,
    language,
    minPrice,
    maxPrice,
    free,
    sort = "newest",
    page = 1,
    limit = 12,
  } = req.query;

  const query = { isPublished: true, approvalStatus: "approved" };

  // Full-text search on title + description
  if (search) {
    query.$text = { $search: search };
  }

  if (category) query.category = { $regex: category, $options: "i" };
  if (level) query.level = level;
  if (language) query.language = { $regex: language, $options: "i" };
  if (free === "true") query.isFree = true;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    "price-low": { price: 1 },
    "price-high": { price: -1 },
    popular: { "stats.totalStudents": -1 },
    rating: { "stats.avgRating": -1 },
  };

  const skip = (Number(page) - 1) * Number(limit);
  const [courses, total] = await Promise.all([
    Course.find(query)
      .populate("creator", "name avatar")
      .select("-sections")
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip(skip)
      .limit(Number(limit)),
    Course.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    courses,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      limit: Number(limit),
    },
  });
});

// @route  GET /api/courses/:slug
// @access Public — full course detail (sections shown but lesson videos hidden unless enrolled)
export const getCourseBySlug = asyncHandler(async (req, res, next) => {
  const param = req.params.slug;

  // Accept either a slug (string) or a MongoDB ObjectId
  const isObjectId = /^[a-f\d]{24}$/i.test(param);
  const query = isObjectId
    ? { _id: param }
    : { slug: param, isPublished: true, approvalStatus: "approved" };

  // Creators/admins can view unpublished courses via _id
  if (
    isObjectId &&
    req.user &&
    (req.user.role === "creator" || req.user.role === "admin")
  ) {
    delete query.isPublished;
  }

  const course = await Course.findOne(query).populate(
    "creator",
    "name avatar bio",
  );

  if (!course) return next(new AppError("Course not found.", 404));

  // Check if requesting user is enrolled
  let isEnrolled = false;
  let enrollment = null;
  if (req.user) {
    enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
    });
    isEnrolled = !!enrollment;
  }

  // Strip video URLs from non-free lessons unless enrolled or creator/admin
  const isOwner =
    req.user &&
    (course.creator._id.toString() === req.user._id.toString() ||
      req.user.role === "admin");

  const courseObj = course.toObject();
  if (!isEnrolled && !isOwner) {
    courseObj.sections = courseObj.sections.map((sec) => ({
      ...sec,
      lessons: sec.lessons.map((lesson) => ({
        ...lesson,
        video: lesson.isFreePreview
          ? lesson.video
          : { url: "", duration: lesson.video.duration },
        notes: [],
      })),
    }));
  }
  if (isEnrolled || isOwner) {
    courseObj.sections = courseObj.sections.map((sec) => ({
      ...sec,

      lessons: sec.lessons.map((lesson) => {
        let signedUrl = "";

        if (lesson.video?.public_id) {
          signedUrl = cloudinary.url(lesson.video.public_id, {
            resource_type: "video",

            type: "authenticated",

            secure: true,

            sign_url: true,

            streaming_profile: "full_hd",

            format: "m3u8",

            expires_at: Math.floor(Date.now() / 1000) + 300,
          });
        }

        return {
          ...lesson,

          video: {
            ...lesson.video,

            url: signedUrl,
          },
        };
      }),
    }));
  }
  res.status(200).json({
    success: true,
    course: courseObj,
    isEnrolled,
    progress: enrollment
      ? {
          completedLessons: enrollment.completedLessons.length,
          progressPercent: enrollment.progressPercent,
          lastAccessedLesson: enrollment.lastAccessedLesson,
        }
      : null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @route  GET /api/courses/creator/my-courses
// @access Creator
export const getMyCoursesAsCreator = asyncHandler(async (req, res) => {
  const courses = await Course.find({ creator: req.user._id })
    .select(
      "title slug thumbnail isPublished stats.totalStudents stats.avgRating price createdAt",
    )
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, courses });
});

// @route  POST /api/courses
// @access Creator
export const createCourse = asyncHandler(async (req, res, next) => {
  const {
    title,
    description,
    shortDescription,
    category,
    tags,
    language,
    level,
    price,
    discountPrice,
    isFree,
    requirements,
    whatYouLearn,
  } = req.body;

  const course = await Course.create({
    title,
    description,
    shortDescription,
    category,
    tags: tags ? JSON.parse(tags) : [],
    language,
    level,
    price: isFree === "true" ? 0 : Number(price) || 0,
    discountPrice: Number(discountPrice) || 0,
    isFree: isFree === "true",
    requirements: requirements ? JSON.parse(requirements) : [],
    whatYouLearn: whatYouLearn ? JSON.parse(whatYouLearn) : [],
    creator: req.user._id,
    // Thumbnail from multer upload
    thumbnail: req.file
      ? {
          public_id: req.file.public_id || req.file.filename,

          url: req.file.path || req.file.secure_url,
        }
      : {
          public_id: "",
          url: "",
        },
  });

  res.status(201).json({
    success: true,
    message: "Course created.",
    course,
  });
});

// @route  GET /api/courses/:courseId/manage
// @access Creator (own course) | Admin
export const getCourseForEdit = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised to edit this course.", 403));
  }

  res.status(200).json({ success: true, course });
});

// @route  PUT /api/courses/:courseId
// @access Creator (own course) | Admin
export const updateCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  const fields = [
    "title",
    "description",
    "shortDescription",
    "category",
    "language",
    "level",
    "price",
    "discountPrice",
    "isFree",
  ];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) course[f] = req.body[f];
  });

  if (req.body.tags) course.tags = JSON.parse(req.body.tags);
  if (req.body.requirements)
    course.requirements = JSON.parse(req.body.requirements);
  if (req.body.whatYouLearn)
    course.whatYouLearn = JSON.parse(req.body.whatYouLearn);

  // New thumbnail uploaded
  if (req.file) {
    if (course.thumbnail && course.thumbnail.public_id) {
      await cloudinary.uploader.destroy(course.thumbnail.public_id);
    }
    course.thumbnail = {
      public_id: req.file.public_id || req.file.filename,

      url: req.file.path || req.file.secure_url,
    };
  }

  await course.save();
  res.status(200).json({ success: true, message: "Course updated.", course });
});

// @route  DELETE /api/courses/:courseId
// @access Creator (own course) | Admin
export const deleteCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  const isOwner = course.creator.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    return next(new AppError("Not authorised.", 403));
  }

  // Clean up Cloudinary assets
  const destroyPromises = [];
  if (course.thumbnail.public_id) {
    destroyPromises.push(
      cloudinary.uploader.destroy(course.thumbnail.public_id),
    );
  }
  if (course.previewVideo.public_id) {
    destroyPromises.push(
      cloudinary.uploader.destroy(course.previewVideo.public_id, {
        resource_type: "video",
      }),
    );
  }
  course.sections.forEach((sec) => {
    sec.lessons.forEach((lesson) => {
      if (lesson.video?.public_id) {
        destroyPromises.push(
          cloudinary.uploader.destroy(lesson.video.public_id, {
            resource_type: "video",
          }),
        );
      }
      lesson.notes.forEach((note) => {
        if (note.public_id) {
          destroyPromises.push(
            cloudinary.uploader.destroy(note.public_id, {
              resource_type: "raw",
            }),
          );
        }
      });
    });
  });

  await Promise.allSettled(destroyPromises);
  await course.deleteOne();

  res.status(200).json({ success: true, message: "Course deleted." });
});

// @route  PATCH /api/courses/:courseId/publish
// @access Creator (own course)
export const togglePublish = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) return next(new AppError("Course not found.", 404));

  if (course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised.", 403));
  }

  // Must have at least 1 section with 1 lesson to publish
  const hasContent = course.sections.some((s) => s.lessons.length > 0);
  if (!course.isPublished && !hasContent) {
    return next(
      new AppError("Add at least one lesson before publishing.", 400),
    );
  }

  course.isPublished = !course.isPublished;
  if (course.isPublished) {
    course.publishedAt = new Date();
    // Reset to pending so admin reviews again on each publish
    course.approvalStatus = "pending";
    course.approvalNote = "";
  }
  await course.save();

  res.status(200).json({
    success: true,
    message: course.isPublished
      ? "Course submitted for admin approval."
      : "Course unpublished.",
    isPublished: course.isPublished,
    approvalStatus: course.approvalStatus,
  });
});

// @route  POST /api/courses/:courseId/preview-video
// @access Creator
// export const uploadPreviewVideo = asyncHandler(async (req, res, next) => {
//     console.log("FILE DATA:", req.file);
//   const course = await Course.findById(req.params.courseId);
//   if (!course) return next(new AppError("Course not found.", 404));

//   if (course.creator.toString() !== req.user._id.toString()) {
//     return next(new AppError("Not authorised.", 403));
//   }
//   if (!req.file) return next(new AppError("No video file uploaded.", 400));

//   // Delete old preview
//   if (course.previewVideo.public_id) {
//     await cloudinary.uploader.destroy(course.previewVideo.public_id, {
//       resource_type: "video",
//     });
//   }

//   course.previewVideo = {
//   public_id: req.file.filename,
//   url: req.file.path,
//   duration: req.file.duration || 0,
// };
//   await course.save();

//   res.status(200).json({
//     success: true,
//     message: "Preview video uploaded.",
//     previewVideo: course.previewVideo,
//   });
// });
export const uploadPreviewVideo = asyncHandler(async (req, res, next) => {

   console.log(JSON.stringify(req.file, null, 2));

  const course = await Course.findById(req.params.courseId);

  if (!course) {
    return next(new AppError("Course not found.", 404));
  }

  if (course.creator.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorised.", 403));
  }

  if (!req.file) {
    return next(new AppError("No video file uploaded.", 400));
  }

  course.previewVideo = {
  public_id: req.file.public_id || req.file.filename, // ← both exist, public_id is preferred
  url:       req.file.path,
  duration:  req.file.duration || 0,
};
console.log("req.file keys:", Object.keys(req.file));
console.log("public_id:", req.file.public_id);
console.log("filename:", req.file.filename);
console.log("path:", req.file.path);

  console.log("SAVED VIDEO =", course.previewVideo);

  await course.save();

  res.status(200).json({
    success: true,
    message: "Preview video uploaded.",
    previewVideo: course.previewVideo,
  });
});