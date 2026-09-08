const express = require("express");
const router = express.Router();

const ClassModule = require("../models/ClassModule");
const ClassLesson = require("../models/ClassLesson");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const LessonProgress = require("../models/LessonProgress");
const Attendance = require("../models/Attendance");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");

const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

const auth = require("../middleware/auth");
const Class = require("../models/Class");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Certificate = require("../models/Certificate");

/* ============================================
   CLASS ACCESS HELPERS
============================================ */

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    instructor: "teacher",
    faculty: "teacher",
    learner: "student",
    administrator: "admin"
  };

  return aliases[role] || role;
}

function normalizeObjectId(value) {
  if (!value) {
    return "";
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return String(value._id);
  }

  return String(value);
}

function isLearningLearnerRole(value) {
  return ["student", "talent", "employer", "agent", "family", "teacher"]
    .includes(normalizeRole(value));
}

function getUserSchoolIds(user) {
  if (!user) {
    return [];
  }

  const role =
    normalizeRole(user.role);

  const candidates = [
    user.schoolId,
    user.linkedSchoolId
  ];

  /*
    A school account itself is the owning school record.
  */
  if (role === "school") {
    candidates.push(user._id);
  }

  return [
    ...new Set(
      candidates
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
}

function getUserSchoolId(user) {
  return (
    getUserSchoolIds(user)[0] ||
    null
  );
}

function canManageSchool(
  user,
  schoolId
) {
  if (
    !user ||
    !schoolId
  ) {
    return false;
  }

  const role =
    normalizeRole(
      user.role
    );

  /*
    ADMIN

    Platform administrators may manage
    school-owned class resources.
  */
  if (role === "admin") {
    return true;
  }

  /*
    SCHOOL OWNER

    Only the owning school account receives
    school-level management permission.

    Teachers are intentionally NOT included
    here. Teacher instructional permissions
    are handled separately.
  */
  if (role !== "school") {
    return false;
  }

  const normalizedSchoolId =
    normalizeObjectId(
      schoolId
    );

  return getUserSchoolIds(user)
    .includes(
      normalizedSchoolId
    );
}

function learningCoursePayload(body = {}) {
  const duration = Number(body.estimatedDurationMinutes || 0);
  const price = Number(body.price || body.amount || 0);
  const accessType = String(body.pricingAccessType || "free").toLowerCase() === "paid"
    ? "paid"
    : "free";

  return {
    title: String(body.title || "").trim(),
    subtitle: String(body.subtitle || "").trim() || null,
    subject: String(body.subject || "").trim() || null,
    category: String(body.category || body.subject || "").trim() || null,
    description: String(body.description || "").trim() || null,
    level: String(body.level || "").trim() || null,
    language: String(body.language || "").trim() || null,
    schedule: String(body.schedule || "").trim() || null,
    coverImage: String(body.coverImage || "").trim() || null,
    estimatedDurationMinutes:
      Number.isFinite(duration) && duration >= 0
        ? Math.min(duration, 1000000)
        : 0,
    learningOutcomes: normalizeArray(body.learningOutcomes),
    enrollmentSettings: {
      accessType: "public",
      autoApprove: Boolean(body.autoApprove),
      maximumStudents: Math.max(0, Number(body.maximumStudents || 0) || 0)
    },
    publishingSettings: {
      visibility: "public"
    },
    learningSettings: {
      certificatesEnabled: Boolean(body.certificatesEnabled)
    },
    pricingSettings: {
      accessType,
      amount:
        accessType === "paid" && Number.isFinite(price) && price > 0
          ? Math.min(price, 100000000)
          : 0,
      currency: String(body.currency || "PHP").trim().toUpperCase().slice(0, 3) || "PHP"
    }
  };
}

async function notifyLearningUser(req, userId, payload = {}) {
  if (!userId) return null;

  const notification = await Notification.create({
    user: userId,
    type: "class_update",
    sender: req.user?._id,
    title: payload.title,
    text: payload.text,
    link: payload.link || "/learning-courses.html",
    entityType: "class",
    entityId: payload.classId,
    priority: payload.priority || "normal",
    actionState: payload.actionState,
    groupKey: payload.groupKey,
    metadata: payload.metadata
  });

  const io = req.app.get("io");
  io?.to(String(userId)).emit("newNotification", notification);
  io?.to(String(userId)).emit("navigationCountsUpdated", {
    category: "notifications"
  });

  return notification;
}


/* ============================================
   ASSIGNED CLASS INSTRUCTION PERMISSION
============================================ */

function canManageAssignedClass(
  user,
  classDoc
) {
  if (
    !user ||
    !classDoc
  ) {
    return false;
  }

  const role =
    normalizeRole(
      user.role
    );

  const userId =
    normalizeObjectId(
      user._id
    );

  const classSchoolId =
    normalizeObjectId(
      classDoc.schoolId
    );

  const classTeacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  /*
    ADMIN

    Administrators retain full instructional
    access across classes.
  */
  if (role === "admin") {
    return true;
  }


  /*
    SCHOOL

    The owning school can manage the complete
    instructional content of its class.
  */
  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(
        classSchoolId
      );
  }


  /*
    TEACHER

    A teacher receives instructional access
    ONLY when explicitly assigned to this class.

    Being linked to the same school is not enough.
  */
  if (role === "teacher") {
    return (
      Boolean(userId) &&
      Boolean(classTeacherId) &&
      userId === classTeacherId
    );
  }


  return false;
}

function canViewClassBuilder(
  user,
  classDoc
) {

  if (
    !user ||
    !classDoc
  ) {
    return false;
  }


  const role =
    normalizeRole(
      user.role
    );


  const userId =
    normalizeObjectId(
      user._id
    );


  const classSchoolId =
    normalizeObjectId(
      classDoc.schoolId
    );


  const classTeacherId =
    normalizeObjectId(
      classDoc.teacherId
    );


  /* =====================================================
     ADMIN

     Platform administrators may inspect any Class Builder.
  ===================================================== */

  if (
    role ===
    "admin"
  ) {
    return true;
  }


  /* =====================================================
     SCHOOL

     Only the owning School account may open its Builder.
  ===================================================== */

  if (
    role ===
    "school"
  ) {

    return getUserSchoolIds(
      user
    ).includes(
      classSchoolId
    );

  }


  /* =====================================================
     TEACHER

     Teachers only receive Builder access when they are
     explicitly assigned as this class's teacher.

     Same-school membership alone is NEVER enough.
  ===================================================== */

  if (
    role ===
    "teacher"
  ) {

    return (
      Boolean(userId) &&
      Boolean(classTeacherId) &&
      userId ===
        classTeacherId
    );

  }


  /* =====================================================
     STUDENT / OTHER ROLES

     Students do not use the authoring Class Builder.

     Student classroom/progress routes must be used instead.
  ===================================================== */

  return false;

}

/* =========================================================
   CLASS BUILDER PERMISSION MATRIX

   These permissions are returned to Class Builder so the
   frontend can hide School-only controls.

   IMPORTANT:
   Backend mutation routes must still enforce permission.
========================================================= */

function getClassBuilderPermissions(
  user,
  classDoc
) {

  const role =
    normalizeRole(
      user?.role
    );


  const instructionalAccess =
    canManageAssignedClass(
      user,
      classDoc
    );


  const schoolManagement =
    canManageSchool(
      user,
      classDoc?.schoolId
    );


  const isAdmin =
    role ===
    "admin";


  const isSchool =
    role ===
    "school";


  const isTeacher =
    role ===
    "teacher";


  return {

    role,

    /* =====================================================
       BUILDER
    ===================================================== */

    canViewBuilder:
      canViewClassBuilder(
        user,
        classDoc
      ),


    /* =====================================================
       INSTRUCTIONAL CONTENT

       School/admin/assigned teacher
    ===================================================== */

    canManageInstruction:
      instructionalAccess,

    canManageModules:
      instructionalAccess,

    canManageLessons:
      instructionalAccess,

    canManageAssignments:
      instructionalAccess,

    canManageQuizzes:
      instructionalAccess,

    canManagePresentations:
      instructionalAccess,

    canManageMedia:
      instructionalAccess,

    canManageProjectCanvas:
      instructionalAccess,

    canManageContentBlocks:
      instructionalAccess,


    /* =====================================================
       TEACHING DATA

       Assigned teacher needs these for teaching/grading.
    ===================================================== */

    canViewStudents:
      instructionalAccess,

    canViewSubmissions:
      instructionalAccess,

    canViewAttendance:
      instructionalAccess,

    canViewProgress:
      instructionalAccess,

    canViewAnalytics:
      instructionalAccess,

    canGradeStudents:
      instructionalAccess,

    canManageAttendance:
      instructionalAccess,


    /* =====================================================
       SCHOOL-LEVEL CLASS ADMINISTRATION

       Assigned teachers are intentionally excluded.
    ===================================================== */

    canEditClassIdentity:
      schoolManagement,

    canAssignTeacher:
      schoolManagement,

    canManageEnrollment:
      schoolManagement,

    canManagePublishing:
      schoolManagement,

    canPublishClass:
      schoolManagement,

    canArchiveClass:
      schoolManagement,

    canDeleteClass:
      schoolManagement,

    canManageAppearance:
      schoolManagement,

    canManageNotificationSettings:
      schoolManagement,

    canManageAdvancedSettings:
      schoolManagement,

    canTransferOwnership:
      isAdmin ||
      isSchool,


    /* =====================================================
       ROLE FLAGS
    ===================================================== */

    isAdmin,

    isSchool,

    isTeacher

  };

}




function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (err) {
      return value
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

/* ============================================
   CLASS SETTINGS NORMALIZATION
============================================ */

function normalizeSettingsObject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (
    value === "true" ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === "false" ||
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
}

function normalizeString(
  value,
  {
    fallback = null,
    maximumLength = null,
    lowercase = false
  } = {}
) {
  if (typeof value !== "string") {
    return fallback;
  }

  let normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  if (lowercase) {
    normalized =
      normalized.toLowerCase();
  }

  if (
    Number.isFinite(
      Number(maximumLength)
    ) &&
    Number(maximumLength) > 0
  ) {
    normalized =
      normalized.slice(
        0,
        Number(maximumLength)
      );
  }

  return normalized;
}

function normalizeNumber(
  value,
  {
    fallback = 0,
    minimum = Number.NEGATIVE_INFINITY,
    maximum = Number.POSITIVE_INFINITY,
    integer = false
  } = {}
) {
  const parsed =
    Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized =
    integer
      ? Math.round(parsed)
      : parsed;

  return Math.min(
    maximum,
    Math.max(
      minimum,
      normalized
    )
  );
}

function normalizeDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    const error =
      new Error(
        "One of the supplied dates is invalid."
      );

    error.statusCode = 400;

    throw error;
  }

  return date;
}

function normalizeEnum(
  value,
  allowedValues,
  fallback
) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  return allowedValues.includes(
    normalized
  )
    ? normalized
    : fallback;
}

function normalizeHexColor(
  value,
  fallback = "#1a73e8"
) {
  const normalized =
    String(value || "")
      .trim();

  return /^#[0-9a-fA-F]{6}$/.test(
    normalized
  )
    ? normalized
    : fallback;
}

function normalizeNullableObjectId(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return value;
}

/* ============================================
   CLASS SETTINGS SANITIZERS
============================================ */

function sanitizeAppearanceSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  return {
    accentColor:
      normalizeHexColor(
        input.accentColor,
        current.accentColor ||
          "#1a73e8"
      ),

    theme:
      normalizeEnum(
        input.theme,
        [
          "light",
          "dark",
          "system"
        ],
        current.theme ||
          "light"
      ),

thumbnailImage:
  input.thumbnailImage !==
  undefined
    ? normalizeString(
        input.thumbnailImage,
        {
          fallback:null,
          maximumLength:800
        }
      )
    : current.thumbnailImage ||
      null,

logoImage:
  input.logoImage !==
  undefined
    ? normalizeString(
        input.logoImage,
        {
          fallback:null,
          maximumLength:800
        }
      )
    : current.logoImage ||
      null,

    showInstructor:
      normalizeBoolean(
        input.showInstructor,
        current.showInstructor ??
          true
      ),

    showProgress:
      normalizeBoolean(
        input.showProgress,
        current.showProgress ??
          true
      )
  };
}

function sanitizeEnrollmentSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  const enrollmentOpensAt =
    input.enrollmentOpensAt !==
    undefined
      ? normalizeDate(
          input.enrollmentOpensAt
        )
      : current.enrollmentOpensAt ||
        null;

  const enrollmentClosesAt =
    input.enrollmentClosesAt !==
    undefined
      ? normalizeDate(
          input.enrollmentClosesAt
        )
      : current.enrollmentClosesAt ||
        null;

  if (
    enrollmentOpensAt &&
    enrollmentClosesAt &&
    enrollmentClosesAt <=
      enrollmentOpensAt
  ) {
    const error =
      new Error(
        "Enrollment closing time must be after the opening time."
      );

    error.statusCode = 400;

    throw error;
  }

  return {
    accessType:
      normalizeEnum(
        input.accessType,
        [
          "public",
          "private",
          "invite_only",
          "hidden"
        ],
        current.accessType ||
          "private"
      ),

    allowJoinCode:
      normalizeBoolean(
        input.allowJoinCode,
        current.allowJoinCode ??
          true
      ),

    autoApprove:
      normalizeBoolean(
        input.autoApprove,
        current.autoApprove ??
          false
      ),

    maximumStudents:
      normalizeNumber(
        input.maximumStudents,
        {
          fallback:
            current.maximumStudents ||
            0,

          minimum:
            0,

          maximum:
            100000,

          integer:
            true
        }
      ),

    waitingListEnabled:
      normalizeBoolean(
        input.waitingListEnabled,
        current.waitingListEnabled ??
          false
      ),

    enrollmentOpensAt,

    enrollmentClosesAt
  };
}

function sanitizeLearningSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  return {
    sequentialLessons:
      normalizeBoolean(
        input.sequentialLessons,
        current.sequentialLessons ??
          false
      ),

    allowLessonSkipping:
      normalizeBoolean(
        input.allowLessonSkipping,
        current.allowLessonSkipping ??
          true
      ),

    allowReplay:
      normalizeBoolean(
        input.allowReplay,
        current.allowReplay ??
          true
      ),

    autoCompleteLessons:
      normalizeBoolean(
        input.autoCompleteLessons,
        current.autoCompleteLessons ??
          false
      ),

    allowDownloads:
      normalizeBoolean(
        input.allowDownloads,
        current.allowDownloads ??
          true
      ),

    discussionsEnabled:
      normalizeBoolean(
        input.discussionsEnabled,
        current.discussionsEnabled ??
          true
      ),

    notesEnabled:
      normalizeBoolean(
        input.notesEnabled,
        current.notesEnabled ??
          true
      ),

    bookmarksEnabled:
      normalizeBoolean(
        input.bookmarksEnabled,
        current.bookmarksEnabled ??
          true
      ),

    certificatesEnabled:
      normalizeBoolean(
        input.certificatesEnabled,
        current.certificatesEnabled ??
          false
      ),

    gamificationEnabled:
      normalizeBoolean(
        input.gamificationEnabled,
        current.gamificationEnabled ??
          false
      ),

    completionRule:
      normalizeEnum(
        input.completionRule,
        [
          "all_lessons",
          "required_lessons",
          "manual",
          "percentage"
        ],
        current.completionRule ||
          "all_lessons"
      ),

    completionPercentage:
      normalizeNumber(
        input.completionPercentage,
        {
          fallback:
            current.completionPercentage ||
            100,

          minimum:
            1,

          maximum:
            100,

          integer:
            true
        }
      )
  };
}

function sanitizeAssessmentSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  return {
    assignmentsEnabled:
      normalizeBoolean(
        input.assignmentsEnabled,
        current.assignmentsEnabled ??
          true
      ),

    quizzesEnabled:
      normalizeBoolean(
        input.quizzesEnabled,
        current.quizzesEnabled ??
          true
      ),

    allowLateSubmissions:
      normalizeBoolean(
        input.allowLateSubmissions,
        current.allowLateSubmissions ??
          true
      ),

    defaultQuizAttempts:
      normalizeNumber(
        input.defaultQuizAttempts,
        {
          fallback:
            current.defaultQuizAttempts ||
            1,

          minimum:
            1,

          maximum:
            100,

          integer:
            true
        }
      ),

    defaultPassingScore:
      normalizeNumber(
        input.defaultPassingScore,
        {
          fallback:
            current.defaultPassingScore ??
            70,

          minimum:
            0,

          maximum:
            100,

          integer:
            true
        }
      ),

    randomizeQuestions:
      normalizeBoolean(
        input.randomizeQuestions,
        current.randomizeQuestions ??
          false
      ),

    shuffleAnswers:
      normalizeBoolean(
        input.shuffleAnswers,
        current.shuffleAnswers ??
          false
      ),

    showCorrectAnswers:
      normalizeBoolean(
        input.showCorrectAnswers,
        current.showCorrectAnswers ??
          true
      ),

    releaseGradesAutomatically:
      normalizeBoolean(
        input.releaseGradesAutomatically,
        current.releaseGradesAutomatically ??
          true
      ),

    peerReviewEnabled:
      normalizeBoolean(
        input.peerReviewEnabled,
        current.peerReviewEnabled ??
          false
      )
  };
}

function sanitizePublishingSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  const scheduledPublishAt =
    input.scheduledPublishAt !==
    undefined
      ? normalizeDate(
          input.scheduledPublishAt
        )
      : current.scheduledPublishAt ||
        null;

  const scheduledArchiveAt =
    input.scheduledArchiveAt !==
    undefined
      ? normalizeDate(
          input.scheduledArchiveAt
        )
      : current.scheduledArchiveAt ||
        null;

  if (
    scheduledPublishAt &&
    scheduledArchiveAt &&
    scheduledArchiveAt <=
      scheduledPublishAt
  ) {
    const error =
      new Error(
        "Scheduled archive time must be after the publication time."
      );

    error.statusCode = 400;

    throw error;
  }

  const rawSlug =
    input.slug !== undefined
      ? normalizeString(
          input.slug,
          {
            fallback:null,
            maximumLength:160,
            lowercase:true
          }
        )
      : current.slug ||
        null;

  const slug =
    rawSlug
      ? rawSlug
          .replace(
            /[^a-z0-9]+/g,
            "-"
          )
          .replace(
            /^-+|-+$/g,
            ""
          )
      : null;

  return {
    visibility:
      normalizeEnum(
        input.visibility,
        [
          "public",
          "private",
          "unlisted"
        ],
        current.visibility ||
          "private"
      ),

    scheduledPublishAt,

    scheduledArchiveAt,

    slug,

    metaTitle:
      normalizeString(
        input.metaTitle,
        {
          fallback:
            input.metaTitle === ""
              ? null
              : current.metaTitle ||
                null,

          maximumLength:
            160
        }
      ),

    metaDescription:
      normalizeString(
        input.metaDescription,
        {
          fallback:
            input.metaDescription === ""
              ? null
              : current.metaDescription ||
                null,

          maximumLength:
            320
        }
      )
  };
}

function sanitizeNotificationSettings(
  value,
  current = {}
) {
  const input =
    normalizeSettingsObject(
      value
    );

  return {
    notifyStudentsNewLesson:
      normalizeBoolean(
        input.notifyStudentsNewLesson,
        current.notifyStudentsNewLesson ??
          true
      ),

    notifyStudentsNewAssignment:
      normalizeBoolean(
        input.notifyStudentsNewAssignment,
        current.notifyStudentsNewAssignment ??
          true
      ),

    notifyStudentsBeforeDueDate:
      normalizeBoolean(
        input.notifyStudentsBeforeDueDate,
        current.notifyStudentsBeforeDueDate ??
          true
      ),

    dueDateReminderHours:
      normalizeNumber(
        input.dueDateReminderHours,
        {
          fallback:
            current.dueDateReminderHours ||
            24,

          minimum:
            1,

          maximum:
            720,

          integer:
            true
        }
      ),

    notifyTeacherSubmission:
      normalizeBoolean(
        input.notifyTeacherSubmission,
        current.notifyTeacherSubmission ??
          true
      ),

    notifyTeacherQuizCompletion:
      normalizeBoolean(
        input.notifyTeacherQuizCompletion,
        current.notifyTeacherQuizCompletion ??
          true
      ),

    inactivityRemindersEnabled:
      normalizeBoolean(
        input.inactivityRemindersEnabled,
        current.inactivityRemindersEnabled ??
          false
      ),

    inactivityReminderDays:
      normalizeNumber(
        input.inactivityReminderDays,
        {
          fallback:
            current.inactivityReminderDays ||
            7,

          minimum:
            1,

          maximum:
            365,

          integer:
            true
        }
      )
  };
}

function uploadClassCover(file) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "aift_classes",
          resource_type: "auto"
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      )
      .end(file.buffer);
  });
}

function uploadLearningPdf(file, teacherId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `aift_learning/course-submissions/${teacherId}`,
          resource_type: "raw",
          use_filename: true,
          unique_filename: true
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          });
        }
      )
      .end(file.buffer);
  });
}

function uploadLearningAsset(file, teacherId, kind) {
  const resourceType = kind === "video" ? "video" : "image";
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `aift_learning/course-submissions/${teacherId}/${kind}`,
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            resourceType,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            width: result.width || null,
            height: result.height || null,
            duration: result.duration || null
          });
        }
      )
      .end(file.buffer);
  });
}

function learningExternalUrl(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 1500) {
    const error = new Error(`${label} must be 1,500 characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    const error = new Error(`Enter a valid ${label.toLowerCase()}.`);
    error.statusCode = 400;
    throw error;
  }
}

function learningCurriculumPayload(body = {}, course = {}) {
  let input = null;
  const raw = String(body.curriculum || "").trim();

  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      const error = new Error("The course curriculum is not valid.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (!Array.isArray(input)) {
    input = [{
      title: body.moduleTitle || "Getting started",
      lessons: [{
        title: body.lessonTitle || course.title || "Course material",
        content: body.lessonContent || course.description || "",
        videoUrl: body.videoUrl || "",
        resourceUrl: body.resourceUrl || "",
        durationMinutes: course.estimatedDurationMinutes || 0
      }]
    }];
  }

  if (!input.length || input.length > 8) {
    const error = new Error("Add between 1 and 8 course modules.");
    error.statusCode = 400;
    throw error;
  }

  let lessonCount = 0;
  const modules = input.map((module, moduleIndex) => {
    const title = String(module?.title || "").trim().slice(0, 160);
    const lessons = Array.isArray(module?.lessons) ? module.lessons : [];
    if (!title || !lessons.length) {
      const error = new Error("Every module needs a title and at least one Lesson.");
      error.statusCode = 400;
      throw error;
    }

    lessonCount += lessons.length;
    return {
      title,
      order: moduleIndex,
      lessons: lessons.map((lesson, lessonIndex) => {
        const lessonTitle = String(lesson?.title || "").trim().slice(0, 160);
        const content = String(lesson?.content || "").trim();
        if (!lessonTitle) {
          const error = new Error("Every Lesson needs a title.");
          error.statusCode = 400;
          throw error;
        }
        if (content.length > 12000) {
          const error = new Error("Each Lesson can contain up to 12,000 characters.");
          error.statusCode = 400;
          throw error;
        }
        const duration = Number(lesson?.durationMinutes || 0);
        return {
          title: lessonTitle,
          content,
          videoUrl: learningExternalUrl(lesson?.videoUrl, "Lesson video link"),
          resourceUrl: learningExternalUrl(lesson?.resourceUrl, "Lesson resource link"),
          durationMinutes: Number.isFinite(duration) && duration >= 0
            ? Math.min(duration, 100000)
            : 0,
          order: lessonIndex
        };
      })
    };
  });

  if (lessonCount > 40) {
    const error = new Error("A course submission can contain up to 40 Lessons.");
    error.statusCode = 400;
    throw error;
  }

  return modules;
}

/* ============================================
   GET CLASSES
   GET /api/classes

   ACCESS MODEL

   ADMIN
     May query across schools.

   SCHOOL
     Only classes owned by that School.

   TEACHER
     Only classes explicitly assigned to that teacher.

   STUDENT
     Only classes where that student is enrolled.
============================================ */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const user =
        req.user;


      const role =
        normalizeRole(
          user.role
        );


      const query = {};


      /* =================================================
         ADMIN
      ================================================= */

      if (
        role ===
        "admin"
      ) {

        if (
          req.query.schoolId
        ) {

          query.schoolId =
            req.query.schoolId;

        }


        if (
          req.query.teacherId
        ) {

          query.teacherId =
            req.query.teacherId;

        }

      }


      /* =================================================
         SCHOOL
      ================================================= */

      else if (
        role ===
        "school"
      ) {

        query.schoolId =
          user._id;


        /*
          School accounts may optionally filter their own
          classes by teacher.
        */

        if (
          req.query.teacherId
        ) {

          query.teacherId =
            req.query.teacherId;

        }

      }


      /* =================================================
         TEACHER
      ================================================= */

      else if (
        role ===
        "teacher"
      ) {

        /*
          IMPORTANT:

          Do not use schoolId here.

          A teacher connected to School A must NOT receive
          every class belonging to School A.
        */

        query.teacherId =
          user._id;

      }


      /* =================================================
         STUDENT
      ================================================= */

      else if (
        role ===
        "student"
      ) {

        /*
          Students only receive classes in which they are
          explicitly enrolled.
        */

        query.studentIds =
          user._id;

      }


      /* =================================================
         UNKNOWN ROLE
      ================================================= */

      else {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to view classes"
          });

      }


      /* =================================================
         OPTIONAL STATUS FILTER
      ================================================= */

      if (
        req.query.status
      ) {

        query.status =
          req.query.status;

      }


      const classes =
        await Class.find(
          query
        )
          .populate(
            "schoolId",
            "name schoolName profileImage schoolLogo"
          )
          .populate(
            "teacherId",
            "name email profileImage subject department"
          )
          .populate(
            "studentIds",
            "name email profileImage course"
          )
          .sort({
            createdAt:
              -1
          });


      return res.json(
        classes
      );

    } catch (
      err
    ) {

      console.error(
        "GET /api/classes error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load classes"
        });

    }

  }
);

/* ============================================
   TEACHER COURSE PUBLICATION REQUESTS
============================================ */

router.get("/publication-requests/mine", auth, async (req, res) => {
  try {
    if (normalizeRole(req.user?.role) !== "teacher") {
      return res.status(403).json({
        message: "Teacher access only."
      });
    }

    const requests = await Class.find({
      teacherId: req.user._id,
      publicationSource: "teacher_request"
    })
      .select("title subject category level language coverImage estimatedDurationMinutes publicationSubmissionType publicationDocument publicationRequestStatus publicationRequestMessage publicationReviewNote publicationRequestedAt publicationReviewedAt published createdAt updatedAt")
      .sort({ publicationRequestedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ requests, count: requests.length });
  } catch (err) {
    console.error("GET TEACHER COURSE REQUESTS ERROR:", err);
    return res.status(500).json({
      message: "AIFT could not load your course submissions."
    });
  }
});

router.post("/publication-requests", auth, upload.fields([
  { name: "courseFile", maxCount: 1 },
  { name: "coverImageFile", maxCount: 1 },
  { name: "lessonVideoFile", maxCount: 1 }
]), async (req, res) => {
  let uploadedDocument = null;
  let uploadedCover = null;
  let uploadedVideo = null;
  let createdCourseId = null;
  try {
    if (normalizeRole(req.user?.role) !== "teacher") {
      return res.status(403).json({
        message: "Only teacher accounts can submit courses for review."
      });
    }

    const schoolId = getUserSchoolId(req.user);
    const payload = learningCoursePayload(req.body);
    const requestMessage = String(req.body?.requestMessage || "").trim();
    const submissionType = ["existing_class", "pdf", "proposal"].includes(
      String(req.body?.submissionType || "proposal").trim().toLowerCase()
    )
      ? String(req.body?.submissionType || "proposal").trim().toLowerCase()
      : "proposal";

    if (!schoolId) {
      return res.status(400).json({
        message: "Your teacher account must be linked to a school before submitting a course."
      });
    }

    const courseFile = req.files?.courseFile?.[0] || null;
    const coverImageFile = req.files?.coverImageFile?.[0] || null;
    const lessonVideoFile = req.files?.lessonVideoFile?.[0] || null;

    if (submissionType === "pdf") {
      if (!courseFile) {
        return res.status(400).json({ message: "Choose a PDF course to upload." });
      }
      if (String(courseFile.mimetype).toLowerCase() !== "application/pdf") {
        return res.status(400).json({ message: "Course uploads must be PDF files." });
      }
      if (Number(courseFile.size || 0) > 50 * 1024 * 1024) {
        return res.status(413).json({ message: "PDF courses can be up to 50 MB." });
      }
    }

    if (coverImageFile) {
      if (!String(coverImageFile.mimetype || "").toLowerCase().startsWith("image/")) {
        return res.status(400).json({ message: "The course cover must be an image." });
      }
      if (Number(coverImageFile.size || 0) > 10 * 1024 * 1024) {
        return res.status(413).json({ message: "Course cover pictures can be up to 10 MB." });
      }
    }

    if (lessonVideoFile && !String(lessonVideoFile.mimetype || "").toLowerCase().startsWith("video/")) {
      return res.status(400).json({ message: "The Lesson upload must be a video file." });
    }

    if (submissionType !== "existing_class" && !payload.title) {
      return res.status(400).json({ message: "Course title is required." });
    }

    if (submissionType !== "existing_class" && !payload.subject) {
      return res.status(400).json({ message: "Course subject is required." });
    }

    if (requestMessage.length > 1000) {
      return res.status(400).json({
        message: "Submission note must be 1,000 characters or fewer."
      });
    }

    const coverImageUrl = learningExternalUrl(req.body?.coverImageUrl, "Course cover link");
    const curriculum = submissionType === "existing_class"
      ? []
      : learningCurriculumPayload(req.body, payload);

    let course;

    if (submissionType === "existing_class") {
      const existingClassId = normalizeObjectId(req.body?.existingClassId);
      if (!/^[a-f\d]{24}$/i.test(existingClassId)) {
        return res.status(400).json({ message: "Choose one of your existing classes." });
      }
      course = await Class.findOne({
        _id: existingClassId,
        teacherId: req.user._id,
        status: { $ne: "archived" }
      });

      if (!course) {
        return res.status(404).json({ message: "Choose one of your existing classes." });
      }
      if (course.published) {
        return res.status(409).json({ message: "This class is already published on AIFT Learning." });
      }
      if (course.publicationRequestStatus === "pending") {
        return res.status(409).json({ message: "This class is already waiting for Admin review." });
      }

      course.publicationSource = "teacher_request";
      course.publicationSubmissionType = "existing_class";
      course.publicationRequestStatus = "pending";
      course.publicationRequestMessage = requestMessage || null;
      course.publicationRequestedAt = new Date();
      course.publicationReviewedAt = null;
      course.publicationReviewedBy = null;
      course.publicationReviewNote = null;
      await course.save();
    } else {
      const duplicate = await Class.findOne({
        teacherId: req.user._id,
        publicationRequestStatus: "pending",
        title: { $regex: `^${payload.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
      }).select("_id").lean();

      if (duplicate) {
        return res.status(409).json({
          message: "You already have a pending submission with this title."
        });
      }

      if (submissionType === "pdf") {
        uploadedDocument = await uploadLearningPdf(courseFile, req.user._id);
      }

      if (coverImageFile) {
        uploadedCover = await uploadLearningAsset(coverImageFile, req.user._id, "covers");
      }

      if (lessonVideoFile) {
        uploadedVideo = await uploadLearningAsset(lessonVideoFile, req.user._id, "videos");
      }

      const courseCover = uploadedCover?.url || coverImageUrl || payload.coverImage || null;

      course = await Class.create({
        ...payload,
        coverImage: courseCover,
        schoolId,
        teacherId: req.user._id,
        published: false,
        status: "active",
        publicationSource: "teacher_request",
        publicationSubmissionType: submissionType,
        publicationDocument: uploadedDocument || undefined,
        materials: uploadedDocument ? [uploadedDocument.url] : [],
        publicationRequestStatus: "pending",
        publicationRequestMessage: requestMessage || null,
        publicationRequestedAt: new Date()
      });
      createdCourseId = course._id;

      let absoluteLessonIndex = 0;
      for (const moduleInput of curriculum) {
        const module = await ClassModule.create({
          schoolId,
          classId: course._id,
          title: moduleInput.title,
          description: moduleInput.lessons.length === 1
            ? "1 Lesson"
            : `${moduleInput.lessons.length} Lessons`,
          order: moduleInput.order,
          status: "published",
          isLocked: false
        });

        for (const lessonInput of moduleInput.lessons) {
          const isFirstLesson = absoluteLessonIndex === 0;
          const resources = [];

          if (isFirstLesson && uploadedDocument) {
            resources.push({
              title: uploadedDocument.originalName || payload.title,
              description: "Course PDF",
              url: uploadedDocument.url,
              secureUrl: uploadedDocument.url,
              type: "pdf",
              source: "upload",
              originalName: uploadedDocument.originalName,
              mimeType: uploadedDocument.mimeType,
              size: uploadedDocument.size,
              publicId: uploadedDocument.publicId,
              resourceType: "raw",
              uploadedBy: req.user._id
            });
          }

          if (lessonInput.resourceUrl) {
            resources.push({
              title: "Lesson resource",
              description: "External learning resource",
              url: lessonInput.resourceUrl,
              secureUrl: lessonInput.resourceUrl,
              type: "link",
              source: "link",
              uploadedBy: req.user._id
            });
          }

          const content = lessonInput.content || (isFirstLesson && uploadedDocument
            ? "Open the attached PDF to begin this course."
            : "");

          await ClassLesson.create({
            schoolId,
            classId: course._id,
            moduleId: module._id,
            title: lessonInput.title,
            summary: content.slice(0, 500) || payload.description || "",
            content,
            videoUrl: isFirstLesson && uploadedVideo
              ? uploadedVideo.url
              : lessonInput.videoUrl || "",
            coverUrl: courseCover || "",
            resources,
            order: lessonInput.order,
            durationMinutes: lessonInput.durationMinutes,
            status: "published",
            previewEnabled: absoluteLessonIndex === 0
          });

          absoluteLessonIndex += 1;
        }
      }
    }

    const admins = await User.find({
      role: "admin",
      status: { $nin: ["suspended", "deactivated"] }
    }).select("_id").lean();

    await Promise.all(admins.map(admin =>
      notifyLearningUser(req, admin._id, {
        title: "New course publication request",
        text: `${req.user.name || "A teacher"} submitted “${course.title}” (${submissionType.replace("_", " ")}) for Learning review.`,
        link: "/admin.html#learning",
        classId: course._id,
        priority: "high",
        actionState: "pending",
        groupKey: `course-publication-request:${course._id}`,
        metadata: {
          courseId: String(course._id),
          teacherId: String(req.user._id),
          status: "pending"
        }
      }).catch(error => {
        console.warn("COURSE REQUEST ADMIN NOTIFICATION ERROR:", error.message);
      })
    ));

    return res.status(201).json({
      message: "Course submitted for Admin review.",
      request: course
    });
  } catch (err) {
    if (createdCourseId) {
      await Promise.all([
        ClassLesson.deleteMany({ classId: createdCourseId }).catch(() => null),
        ClassModule.deleteMany({ classId: createdCourseId }).catch(() => null),
        Class.findByIdAndDelete(createdCourseId).catch(() => null)
      ]);
    }
    if (uploadedDocument?.publicId) {
      await cloudinary.uploader.destroy(uploadedDocument.publicId, { resource_type: "raw" }).catch(() => null);
    }
    if (uploadedCover?.publicId) {
      await cloudinary.uploader.destroy(uploadedCover.publicId, { resource_type: "image" }).catch(() => null);
    }
    if (uploadedVideo?.publicId) {
      await cloudinary.uploader.destroy(uploadedVideo.publicId, { resource_type: "video" }).catch(() => null);
    }
    console.error("POST TEACHER COURSE REQUEST ERROR:", err);
    return res.status(err.statusCode || 500).json({
      message: err.statusCode
        ? err.message
        : "AIFT could not submit this course for review."
    });
  }
});

/* ============================================
   ADMIN LEARNING MANAGEMENT
============================================ */

router.get("/admin/learning", auth, async (req, res) => {
  try {
    if (normalizeRole(req.user?.role) !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    const [courses, teachers, schools] = await Promise.all([
      Class.find({
        $or: [
          { published: true },
          { publicationSource: { $in: ["teacher_request", "admin"] } },
          { publicationRequestStatus: { $in: ["pending", "approved", "rejected"] } }
        ]
      })
        .populate("schoolId", "name schoolName profileImage schoolLogo status")
        .populate("teacherId", "name email profileImage subject department status aiftVerified")
        .populate("publicationReviewedBy", "name email")
        .sort({ publicationRequestedAt: -1, updatedAt: -1 })
        .limit(500)
        .lean(),
      User.find({
        role: "teacher",
        status: { $nin: ["deactivated"] }
      })
        .select("name email profileImage avatar subject department schoolId linkedSchoolId status aiftVerified assignedClasses")
        .populate("schoolId", "name schoolName")
        .populate("linkedSchoolId", "name schoolName")
        .sort({ createdAt: -1 })
        .lean(),
      User.find({
        role: "school",
        status: { $nin: ["deactivated"] }
      })
        .select("name schoolName email profileImage schoolLogo status aiftVerified")
        .sort({ schoolName: 1, name: 1 })
        .lean()
    ]);

    return res.json({
      courses,
      requests: courses.filter(item => item.publicationSource === "teacher_request"),
      teachers,
      schools
    });
  } catch (err) {
    console.error("GET ADMIN LEARNING ERROR:", err);
    return res.status(500).json({
      message: "AIFT could not load Learning management."
    });
  }
});

router.post("/admin/learning", auth, async (req, res) => {
  try {
    if (normalizeRole(req.user?.role) !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    const schoolId = normalizeObjectId(req.body?.schoolId);
    const teacherId = normalizeObjectId(req.body?.teacherId);
    const payload = learningCoursePayload(req.body);

    if (!payload.title || !payload.subject) {
      return res.status(400).json({
        message: "Course title and subject are required."
      });
    }

    const school = await User.findOne({
      _id: schoolId,
      role: "school",
      status: { $nin: ["suspended", "deactivated"] }
    }).select("_id").lean();

    if (!school) {
      return res.status(400).json({
        message: "Choose an active school for this course."
      });
    }

    let teacher = null;
    if (teacherId) {
      teacher = await User.findOne({
        _id: teacherId,
        role: "teacher",
        status: { $nin: ["suspended", "deactivated"] }
      }).select("_id schoolId linkedSchoolId").lean();

      if (!teacher) {
        return res.status(400).json({ message: "Choose an active teacher." });
      }

      const teacherSchoolId = normalizeObjectId(
        teacher.schoolId || teacher.linkedSchoolId
      );

      if (teacherSchoolId && teacherSchoolId !== schoolId) {
        return res.status(400).json({
          message: "The selected teacher is linked to another school."
        });
      }
    }

    const course = await Class.create({
      ...payload,
      schoolId,
      teacherId: teacherId || null,
      published: true,
      status: "active",
      publicationSource: "admin",
      publicationRequestStatus: "approved",
      publicationReviewedAt: new Date(),
      publicationReviewedBy: req.user._id
    });

    if (teacherId) {
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedClasses: course._id }
      });

      await notifyLearningUser(req, teacherId, {
        title: "Course published on AIFT Learning",
        text: `“${course.title}” is now available to learners.`,
        classId: course._id,
        actionState: "completed",
        groupKey: `course-published:${course._id}`,
        metadata: { courseId: String(course._id), status: "approved" }
      }).catch(error => {
        console.warn("ADMIN COURSE TEACHER NOTIFICATION ERROR:", error.message);
      });
    }

    const populated = await Class.findById(course._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .lean();

    return res.status(201).json({
      message: "Course published on AIFT Learning.",
      course: populated
    });
  } catch (err) {
    console.error("POST ADMIN LEARNING COURSE ERROR:", err);
    return res.status(500).json({
      message: "AIFT could not publish this course."
    });
  }
});

router.patch("/admin/learning/:id", auth, async (req, res) => {
  try {
    if (normalizeRole(req.user?.role) !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();
    const reviewNote = String(req.body?.reviewNote || "").trim();
    const allowed = ["approve", "reject", "publish", "unpublish", "archive"];

    if (!allowed.includes(action)) {
      return res.status(400).json({ message: "Choose a valid Learning action." });
    }

    if (reviewNote.length > 1000) {
      return res.status(400).json({
        message: "Admin review note must be 1,000 characters or fewer."
      });
    }

    const course = await Class.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (action === "approve") {
      course.publicationRequestStatus = "approved";
      course.published = true;
      course.status = "active";
      course.publishingSettings.visibility = "public";
      course.enrollmentSettings.accessType = "public";
    } else if (action === "reject") {
      course.publicationRequestStatus = "rejected";
      course.published = false;
    } else if (action === "publish") {
      course.published = true;
      course.status = "active";
      course.publishingSettings.visibility = "public";
    } else if (action === "unpublish") {
      course.published = false;
    } else if (action === "archive") {
      course.published = false;
      course.status = "archived";
    }

    if (["approve", "reject"].includes(action)) {
      course.publicationReviewedAt = new Date();
      course.publicationReviewedBy = req.user._id;
      course.publicationReviewNote = reviewNote || null;
    }

    await course.save();

    if (course.teacherId && ["approve", "reject"].includes(action)) {
      const approved = action === "approve";
      await notifyLearningUser(req, course.teacherId, {
        title: approved ? "Course approved" : "Course needs changes",
        text: approved
          ? `“${course.title}” is now published on AIFT Learning.`
          : `“${course.title}” was not published${reviewNote ? `: ${reviewNote}` : "."}`,
        classId: course._id,
        priority: approved ? "normal" : "high",
        actionState: approved ? "completed" : "declined",
        groupKey: `course-publication-review:${course._id}:${action}`,
        metadata: {
          courseId: String(course._id),
          status: course.publicationRequestStatus,
          reviewNote
        }
      }).catch(error => {
        console.warn("COURSE REVIEW TEACHER NOTIFICATION ERROR:", error.message);
      });
    }

    const populated = await Class.findById(course._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("publicationReviewedBy", "name email")
      .lean();

    return res.json({
      message: `Course ${action} action completed.`,
      course: populated
    });
  } catch (err) {
    console.error("PATCH ADMIN LEARNING COURSE ERROR:", err);
    return res.status(500).json({
      message: "AIFT could not update this course."
    });
  }
});

/* ============================================
   PERSONAL LEARNING DASHBOARD
============================================ */

router.get("/learning/dashboard", auth, async (req, res) => {
  try {
    const viewerId = req.user._id;
    const role = normalizeRole(req.user.role);
    const notificationTypes = [
      "class_update",
      "assignment",
      "assignment_updated",
      "submission_reviewed",
      "training_request",
      "announcement"
    ];

    if (role === "teacher") {
      const [courses, trainingRequests, updates] = await Promise.all([
        Class.find({
          teacherId: viewerId,
          status: { $ne: "archived" }
        })
          .select("title subject category coverImage schedule studentIds published publicationRequestStatus publicationReviewNote updatedAt createdAt")
          .populate("schoolId", "name schoolName profileImage schoolLogo")
          .sort({ updatedAt: -1 })
          .lean(),
        Notification.find({
          user: viewerId,
          type: "training_request",
          dismissed: { $ne: true }
        })
          .select("title text link actionState metadata read createdAt sender")
          .populate("sender", "name profileImage avatar headline role")
          .sort({ createdAt: -1 })
          .limit(12)
          .lean(),
        Notification.find({
          user: viewerId,
          type: { $in: notificationTypes },
          dismissed: { $ne: true }
        })
          .select("title text link type actionState read createdAt")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      ]);

      const learnerIds = new Set();
      courses.forEach(course => {
        (course.studentIds || []).forEach(studentId => {
          const value = normalizeObjectId(studentId);
          if (value) learnerIds.add(value);
        });
      });

      return res.json({
        mode: "teacher",
        viewer: {
          id: String(viewerId),
          name: req.user.name,
          role
        },
        metrics: {
          activeLearners: learnerIds.size,
          totalCourses: courses.length,
          publishedCourses: courses.filter(course => course.published === true).length,
          pendingCourses: courses.filter(course => course.publicationRequestStatus === "pending").length,
          trainingRequests: trainingRequests.filter(item => (item.actionState || "pending") === "pending").length
        },
        courses: courses.map(course => ({
          ...course,
          studentCount: Array.isArray(course.studentIds) ? course.studentIds.length : 0,
          studentIds: undefined
        })),
        trainingRequests,
        updates
      });
    }

    const courses = await Class.find({
      studentIds: viewerId,
      status: { $ne: "archived" }
    })
      .select("title subtitle subject category level language coverImage bannerImage estimatedDurationMinutes schedule published pricingSettings learningSettings updatedAt createdAt teacherId schoolId")
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name profileImage avatar subject department")
      .sort({ updatedAt: -1 })
      .lean();

    const classIds = courses.map(course => course._id);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [lessons, progress, certificateCount, updates] = await Promise.all([
      classIds.length
        ? ClassLesson.find({
            classId: { $in: classIds },
            $or: [
              { published: true },
              { status: { $in: ["published", "active"] } }
            ]
          })
            .select("classId moduleId title order estimatedDurationMinutes duration createdAt")
            .sort({ order: 1, createdAt: 1 })
            .lean()
        : [],
      classIds.length
        ? LessonProgress.find({
            classId: { $in: classIds },
            studentId: viewerId
          })
            .select("classId lessonId status progressPercent lastOpenedAt completedAt updatedAt")
            .sort({ updatedAt: -1 })
            .lean()
        : [],
      Certificate.countDocuments({ studentId: viewerId }),
      Notification.find({
        user: viewerId,
        type: { $in: notificationTypes },
        dismissed: { $ne: true }
      })
        .select("title text link type actionState read createdAt")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
    ]);

    const progressByLesson = new Map(
      progress.map(item => [normalizeObjectId(item.lessonId), item])
    );
    const courseSummaries = courses.map(course => {
      const courseId = normalizeObjectId(course._id);
      const courseLessons = lessons.filter(lesson => normalizeObjectId(lesson.classId) === courseId);
      const completedLessons = courseLessons.filter(lesson => {
        const item = progressByLesson.get(normalizeObjectId(lesson._id));
        return item?.status === "completed" || Number(item?.progressPercent || 0) >= 100;
      });
      const latest = progress
        .filter(item => normalizeObjectId(item.classId) === courseId)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
      const nextLesson = courseLessons.find(lesson => {
        const item = progressByLesson.get(normalizeObjectId(lesson._id));
        return !(item?.status === "completed" || Number(item?.progressPercent || 0) >= 100);
      }) || courseLessons[0] || null;
      const percentage = courseLessons.length
        ? Math.round((completedLessons.length / courseLessons.length) * 100)
        : 0;

      return {
        ...course,
        progress: percentage,
        completedLessons: completedLessons.length,
        totalLessons: courseLessons.length,
        nextLesson: nextLesson
          ? { id: nextLesson._id, title: nextLesson.title || "Next lesson" }
          : null,
        lastActivityAt: latest?.updatedAt || latest?.lastOpenedAt || course.updatedAt
      };
    }).sort((a, b) => new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0));

    const completedTotal = progress.filter(item =>
      item.status === "completed" || Number(item.progressPercent || 0) >= 100
    ).length;
    const completedThisWeek = progress.filter(item =>
      (item.status === "completed" || Number(item.progressPercent || 0) >= 100) &&
      new Date(item.completedAt || item.updatedAt || 0) >= weekStart
    ).length;
    const averageProgress = courseSummaries.length
      ? Math.round(courseSummaries.reduce((sum, course) => sum + course.progress, 0) / courseSummaries.length)
      : 0;

    let level = "Beginner";
    let nextLevelAt = 5;
    if (certificateCount > 0) {
      level = "Certified";
      nextLevelAt = null;
    } else if (completedTotal >= 30) {
      level = "Advanced";
      nextLevelAt = null;
    } else if (completedTotal >= 15) {
      level = "Skilled";
      nextLevelAt = 30;
    } else if (completedTotal >= 5) {
      level = "Developing";
      nextLevelAt = 15;
    }

    return res.json({
      mode: "learner",
      viewer: {
        id: String(viewerId),
        name: req.user.name,
        role
      },
      metrics: {
        enrolledCourses: courseSummaries.length,
        averageProgress,
        completedLessons: completedTotal,
        completedThisWeek,
        certificates: certificateCount
      },
      level: {
        name: level,
        completedLessons: completedTotal,
        nextLevelAt,
        remaining: nextLevelAt ? Math.max(nextLevelAt - completedTotal, 0) : 0
      },
      continueCourse: courseSummaries.find(course => course.progress < 100) || courseSummaries[0] || null,
      courses: courseSummaries,
      updates
    });
  } catch (err) {
    console.error("GET LEARNING DASHBOARD ERROR:", err);
    return res.status(500).json({
      message: "AIFT could not load your Learning dashboard."
    });
  }
});

/* ============================================
   SELF-ENROLLMENT FOR PUBLISHED COURSES
============================================ */

router.post("/:id/enroll", auth, async (req, res) => {
  try {
    if (!isLearningLearnerRole(req.user?.role)) {
      return res.status(403).json({
        message: "This account cannot enroll in Learning courses."
      });
    }

    const course = await Class.findById(req.params.id);
    if (!course || course.status === "archived" || course.published !== true) {
      return res.status(404).json({ message: "This course is not available." });
    }

    if (course.publishingSettings?.visibility !== "public") {
      return res.status(403).json({ message: "This course is not open for public enrollment." });
    }

    const learnerId = normalizeObjectId(req.user._id);
    const enrolled = (course.studentIds || []).map(normalizeObjectId).includes(learnerId);
    if (enrolled) {
      return res.json({ message: "You are already enrolled.", enrolled: true, courseId: course._id });
    }

    if (course.pricingSettings?.accessType === "paid") {
      return res.status(402).json({
        message: "Paid enrollment will be available after secure course payments are enabled.",
        code: "PAID_ENROLLMENT_REQUIRED"
      });
    }

    const enrollment = course.enrollmentSettings || {};
    const now = new Date();
    if (enrollment.accessType !== "public") {
      return res.status(403).json({ message: "This course requires an invitation." });
    }
    if (enrollment.enrollmentOpensAt && new Date(enrollment.enrollmentOpensAt) > now) {
      return res.status(403).json({ message: "Enrollment has not opened yet." });
    }
    if (enrollment.enrollmentClosesAt && new Date(enrollment.enrollmentClosesAt) <= now) {
      return res.status(403).json({ message: "Enrollment is closed." });
    }
    if (Number(enrollment.maximumStudents || 0) > 0 && course.studentIds.length >= Number(enrollment.maximumStudents)) {
      return res.status(409).json({ message: "This course is currently full." });
    }

    course.studentIds.addToSet(req.user._id);
    await course.save();

    if (course.teacherId) {
      await notifyLearningUser(req, course.teacherId, {
        title: "New course enrollment",
        text: `${req.user.name || "An AIFT member"} enrolled in “${course.title}”.`,
        classId: course._id,
        link: `/class-builder.html?id=${course._id}`,
        groupKey: `course-enrollment:${course._id}:${learnerId}`,
        metadata: { courseId: String(course._id), learnerId }
      }).catch(error => console.warn("COURSE ENROLLMENT NOTIFICATION ERROR:", error.message));
    }

    return res.status(201).json({
      message: "You are enrolled. Your progress will now be saved.",
      enrolled: true,
      courseId: course._id
    });
  } catch (err) {
    console.error("POST COURSE ENROLLMENT ERROR:", err);
    return res.status(500).json({ message: "AIFT could not complete enrollment." });
  }
});

/* ============================================
   LEARNING DISCOVERY
   GET /api/classes/discover

   Returns only active, published classes that
   are intentionally visible in Learning.
============================================ */

router.get("/discover", auth, async (req, res) => {
  try {
    const now = new Date();
    const viewerId = normalizeObjectId(req.user?._id);
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 100);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 36, 1),
      60
    );

    const query = {
      status: "active",
      published: true,
      $and: [
        {
          $or: [
            { "publishingSettings.visibility": "public" },
            { "publishingSettings.visibility": { $exists: false } }
          ]
        },
        {
          $or: [
            { "publishingSettings.scheduledPublishAt": null },
            { "publishingSettings.scheduledPublishAt": { $lte: now } }
          ]
        },
        {
          $or: [
            { "publishingSettings.scheduledArchiveAt": null },
            { "publishingSettings.scheduledArchiveAt": { $gt: now } }
          ]
        }
      ]
    };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(escapedSearch, "i");

      query.$or = [
        { title: pattern },
        { subtitle: pattern },
        { subject: pattern },
        { category: pattern },
        { description: pattern },
        { level: pattern },
        { language: pattern }
      ];
    }

    const classes = await Class.find(query)
      .select([
        "schoolId",
        "teacherId",
        "title",
        "subtitle",
        "subject",
        "category",
        "description",
        "level",
        "language",
        "coverImage",
        "bannerImage",
        "estimatedDurationMinutes",
        "schedule",
        "studentIds",
        "appearanceSettings.thumbnailImage",
        "appearanceSettings.showInstructor",
        "enrollmentSettings.accessType",
        "enrollmentSettings.maximumStudents",
        "enrollmentSettings.enrollmentOpensAt",
        "enrollmentSettings.enrollmentClosesAt",
        "learningSettings.certificatesEnabled",
        "pricingSettings.accessType",
        "pricingSettings.amount",
        "pricingSettings.currency",
        "createdAt",
        "updatedAt"
      ].join(" "))
      .populate(
        "schoolId",
        "name schoolName profileImage schoolLogo logo"
      )
      .populate(
        "teacherId",
        "name profileImage avatar subject department role"
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const safeClasses = classes.map(item => {
      const studentIds = Array.isArray(item.studentIds)
        ? item.studentIds.map(normalizeObjectId).filter(Boolean)
        : [];
      const enrollment = item.enrollmentSettings || {};
      const pricing = item.pricingSettings || {};
      const requiresPayment = pricing.accessType === "paid";
      const maximumStudents = Number(enrollment.maximumStudents || 0);
      const opensAt = enrollment.enrollmentOpensAt
        ? new Date(enrollment.enrollmentOpensAt)
        : null;
      const closesAt = enrollment.enrollmentClosesAt
        ? new Date(enrollment.enrollmentClosesAt)
        : null;

      return {
        ...item,
        studentIds: undefined,
        studentCount: studentIds.length,
        isEnrolled: viewerId
          ? studentIds.includes(viewerId)
          : false,
        requiresPayment:
          requiresPayment &&
          !studentIds.includes(viewerId),
        enrollmentOpen:
          enrollment.accessType === "public" &&
          !requiresPayment &&
          (!opensAt || opensAt <= now) &&
          (!closesAt || closesAt > now) &&
          (!maximumStudents || studentIds.length < maximumStudents)
      };
    });

    return res.json({
      classes: safeClasses,
      count: safeClasses.length
    });
  } catch (err) {
    console.error("GET /api/classes/discover error:", err);

    return res.status(500).json({
      message: "AIFT could not load learning opportunities."
    });
  }
});

/* ============================================
   GET CLASS BY ID
   GET /api/classes/:id
============================================ */
router.get("/:id", auth, async (req, res) => {
  try {
    const item = await Class.findById(req.params.id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    if (!item) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    return res.json(item);
  } catch (err) {
    console.error("GET /api/classes/:id error:", err);
    return res.status(500).json({
      message: "Failed to load class"
    });
  }
});

/* ============================================
   CREATE CLASS
   POST /api/classes
============================================ */
router.post("/", auth, upload.single("coverImage"), async (req, res) => {
  try {
    const {
      coverImage,
      schoolId,
      title,
      subject,
      teacherId,
      classCode,
      code,
      meetingLink,
      schedule,
      description,
      welcomeContent,
      level,
      language
    } = req.body;

    const finalSchoolId =
      req.user.role === "school"
        ? req.user._id
        : schoolId || getUserSchoolId(req.user);

    if (!finalSchoolId) {
      return res.status(400).json({
        message: "School ID is required"
      });
    }

    if (!canManageSchool(req.user, finalSchoolId)) {
      return res.status(403).json({
        message: "Not allowed to create class"
      });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        message: "Class title is required"
      });
    }

    if (teacherId) {
      const teacher = await User.findById(teacherId);

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found"
        });
      }

      const teacherRole = String(teacher.role || "").toLowerCase();

      if (
        !["teacher", "instructor", "faculty", "school"].includes(teacherRole)
      ) {
        return res.status(400).json({
          message: "Selected user is not a teacher"
        });
      }

      const teacherSchoolId =
        teacher.schoolId ||
        teacher.linkedSchoolId ||
        teacher.companyId ||
        finalSchoolId;

      if (String(teacherSchoolId) !== String(finalSchoolId)) {
        return res.status(403).json({
          message: "Teacher is not linked to this school"
        });
      }
    }

    let uploadedCover = null;

    if (req.file) {
      uploadedCover = await uploadClassCover(req.file);
    }

    const item = await Class.create({
      schoolId: finalSchoolId,
      title: String(title).trim(),
      subject: subject || null,
      teacherId: teacherId || null,
      studentIds: normalizeArray(req.body.studentIds),
      classCode: classCode || code || null,
      meetingLink: meetingLink || null,
      schedule: schedule || null,
      description: description || null,
      welcomeContent: welcomeContent || null,
      level: level || null,
      language: language || null,
      coverImage: uploadedCover || coverImage || null,
      materials: normalizeArray(req.body.materials),
      learningOutcomes: normalizeArray(req.body.learningOutcomes)
    });

    if (teacherId) {
      await User.findByIdAndUpdate(teacherId, {
        $addToSet: { assignedClasses: item._id }
      });
    }

    const populated = await Class.findById(item._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    const io = req.app.get("io");

    if (io) {
      io.to(String(finalSchoolId)).emit("class:new", populated);

      if (teacherId) {
        io.to(String(teacherId)).emit("class:new", populated);
      }
    }

    return res.status(201).json(populated);
  } catch (err) {
    console.error("POST /api/classes error:", err);
    return res.status(500).json({
      message: "Failed to create class"
    });
  }
});

/* ============================================
   UPDATE CLASS
   PATCH /api/classes/:id
============================================ */
router.patch("/:id", auth, upload.single("coverImage"), async (req, res) => {
  try {
    const item = await Class.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    if (!canManageSchool(req.user, item.schoolId)) {
      return res.status(403).json({
        message: "Not allowed to update class"
      });
    }

    const oldTeacherId = item.teacherId ? String(item.teacherId) : null;

    const fields = [
      "title",
      "subject",
      "teacherId",
      "meetingLink",
      "schedule",
      "description",
      "welcomeContent",
      "level",
      "language",
      "status"
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        item[field] = req.body[field] || null;
      }
    });

    if (req.body.classCode !== undefined || req.body.code !== undefined) {
      item.classCode = req.body.classCode || req.body.code || null;
    }

    if (req.body.studentIds !== undefined) {
      item.studentIds = normalizeArray(req.body.studentIds);
    }

    if (req.body.materials !== undefined) {
      item.materials = normalizeArray(req.body.materials);
    }

    if (req.body.learningOutcomes !== undefined) {
      item.learningOutcomes = normalizeArray(req.body.learningOutcomes);
    }

    if (req.body.published !== undefined) {
      item.published = Boolean(req.body.published);
    }

    if (req.file) {
      item.coverImage = await uploadClassCover(req.file);
    }

    if (req.body.coverImage !== undefined && !req.file) {
      item.coverImage = req.body.coverImage || null;
    }

    if (req.body.bannerImage !== undefined) {
      item.bannerImage = req.body.bannerImage || null;
    }

    await item.save();

    const newTeacherId = item.teacherId ? String(item.teacherId) : null;

    if (oldTeacherId && oldTeacherId !== newTeacherId) {
      await User.findByIdAndUpdate(oldTeacherId, {
        $pull: { assignedClasses: item._id }
      });
    }

    if (newTeacherId) {
      await User.findByIdAndUpdate(newTeacherId, {
        $addToSet: { assignedClasses: item._id }
      });
    }

    const populated = await Class.findById(item._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course");

    return res.json(populated);
  } catch (err) {
    console.error("PATCH /api/classes/:id error:", err);
    return res.status(500).json({
      message: "Failed to update class"
    });
  }
});
/* ============================================
   DELETE / ARCHIVE CLASS
   DELETE /api/classes/:id
============================================ */
router.delete("/:id", auth, async (req, res) => {
  try {
    const item = await Class.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    if (!canManageSchool(req.user, item.schoolId)) {
      return res.status(403).json({
        message: "Not allowed to delete class"
      });
    }

    item.status = "archived";
    await item.save();

    if (item.teacherId) {
      await User.findByIdAndUpdate(item.teacherId, {
        $pull: { assignedClasses: item._id }
      });
    }

    return res.json({
      message: "Class archived"
    });
  } catch (err) {
    console.error("DELETE /api/classes/:id error:", err);
    return res.status(500).json({
      message: "Failed to archive class"
    });
  }
});

/* =====================================================
   CLASS BUILDER DASHBOARD
   GET /api/classes/:id/builder
===================================================== */

router.get(
  "/:id/builder",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const classId =
        req.params.id;


      const classDoc =
        await Class.findById(
          classId
        )
          .populate(
            "schoolId",
            "name schoolName profileImage schoolLogo"
          )
          .populate(
            "teacherId",
            "name email profileImage avatar role subject department"
          )
          .populate(
            "studentIds",
            "name email profileImage avatar course"
          )
          .lean();


      if (
        !classDoc
      ) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      const user =
        req.user;


      if (
        !canViewClassBuilder(
          user,
          classDoc
        )
      ) {

        console.warn(
          "Class builder access denied",
          {

            classId:
              normalizeObjectId(
                classDoc._id
              ),

            role:
              normalizeRole(
                user.role
              ),

            userId:
              normalizeObjectId(
                user._id
              ),

            userSchoolIds:
              getUserSchoolIds(
                user
              ),

            classSchoolId:
              normalizeObjectId(
                classDoc.schoolId
              ),

            classTeacherId:
              normalizeObjectId(
                classDoc.teacherId
              )

          }
        );


        return res
          .status(403)
          .json({
            message:
              "Not allowed to view this class builder"
          });

      }


      const permissions =
        getClassBuilderPermissions(
          user,
          classDoc
        );


      const schoolId =
        classDoc.schoolId?._id ||
        classDoc.schoolId;


      const [
        modules,
        lessons,
        quizzes,
        quizSubmissions,
        assignments,
        submissions,
        attendance,
        progress
      ] =
        await Promise.all([

          ClassModule.find({
            classId
          })
            .sort({
              order:1,
              createdAt:1
            })
            .lean(),


          ClassLesson.find({
            classId
          })
            .sort({
              order:1,
              createdAt:1
            })
            .lean(),


          Quiz.find({
            classId
          })
            .sort({
              createdAt:-1
            })
            .lean(),


          QuizSubmission.find({
            classId
          })
            .populate(
              "quizId",
              "title passingScore attemptsAllowed status"
            )
            .populate(
              "studentId",
              "name email profileImage avatar course"
            )
            .sort({
              submittedAt:-1
            })
            .lean(),


          Assignment.find({
            classId
          })
            .sort({
              createdAt:-1
            })
            .lean(),


          Submission.find({
            classId
          })
            .populate(
              "assignmentId",
              "title dueDate status"
            )
            .populate(
              "studentId",
              "name email profileImage avatar course"
            )
            .sort({
              createdAt:-1
            })
            .lean(),


          Attendance.find({
            classId
          })
            .sort({
              date:-1
            })
            .limit(500)
            .lean(),


          LessonProgress.find({
            classId
          })
            .sort({
              updatedAt:-1
            })
            .lean()

        ]);


      const completedLessons =
        progress.filter(
          item =>
            item.status ===
              "completed" ||
            Number(
              item.progressPercent ||
              0
            ) >=
              100
        ).length;


      const totalProgress =
        progress.length
          ? Math.round(
              progress.reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  Number(
                    item.progressPercent ||
                    0
                  ),
                0
              ) /
              progress.length
            )
          : 0;


      const attendanceTotal =
        attendance.length;


      const attendancePresent =
        attendance.filter(
          item =>
            item.status ===
              "present"
        ).length;


      const attendanceRate =
        attendanceTotal
          ? Math.round(
              (
                attendancePresent /
                attendanceTotal
              ) *
              100
            )
          : 0;


      return res.json({

        class:
          classDoc,

        schoolId,

        /*
          The frontend uses this object to control visibility,
          but backend routes remain authoritative.
        */

        permissions,

        modules,

        lessons,

        quizzes,

        quizSubmissions,

        assignments,

        submissions,

        attendance,

        progress,

        analytics: {

          moduleCount:
            modules.length,

          lessonCount:
            lessons.length,

          quizCount:
            quizzes.length,

          assignmentCount:
            assignments.length,

          submissionCount:
            submissions.length,

          completedLessons,

          averageProgress:
            totalProgress,

          attendanceRate

        }

      });

    } catch (
      err
    ) {

      console.error(
        "GET class builder error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load class builder"
        });

    }

  }
);


/* =====================================================
   STUDENT CLASS PROGRESS
   GET /api/classes/:id/student-progress
===================================================== */

router.get(
  "/:id/student-progress",
  auth,
  async (req, res) => {
    try {
      const classId =
        normalizeObjectId(
          req.params.id
        );

      const role =
        normalizeRole(
          req.user?.role
        );

      const requestedStudentId =
        normalizeObjectId(
          req.query.studentId
        );

      /*
        Students may only request their own progress.

        School, teacher, and admin accounts may inspect a
        specific student by supplying ?studentId=<id>.
      */

      const studentId =
        role === "student"
          ? normalizeObjectId(
              req.user._id
            )
          : requestedStudentId;

      if (!classId) {
        return res.status(400).json({
          message:
            "A valid class ID is required."
        });
      }

      if (!studentId) {
        return res.status(400).json({
          message:
            "A student ID is required."
        });
      }

      const classDoc =
        await Class.findById(classId)
          .populate(
            "teacherId",
            "name email profileImage avatar subject department"
          )
          .populate(
            "studentIds",
            "name email profileImage avatar course"
          )
          .lean();

      if (!classDoc) {
        return res.status(404).json({
          message:"Class not found."
        });
      }

      if (
        !canViewClassBuilder(
          req.user,
          classDoc
        )
      ) {
        return res.status(403).json({
          message:
            "Not allowed to view progress for this class."
        });
      }

      /*
        A student must actually belong to the class.
      */

      const enrolledStudentIds =
        Array.isArray(
          classDoc.studentIds
        )
          ? classDoc.studentIds
              .map(
                normalizeObjectId
              )
              .filter(Boolean)
          : [];

      if (
        role === "student" &&
        !enrolledStudentIds.includes(
          studentId
        )
      ) {
        return res.status(403).json({
          message:
            "You are not enrolled in this class."
        });
      }

      const [
        lessons,
        lessonProgress,
        assignments,
        submissions,
        quizzes,
        quizSubmissions,
        attendance
      ] = await Promise.all([

        ClassLesson.find({
          classId,
          status:"published"
        })
          .sort({
            order:1,
            createdAt:1
          })
          .lean(),

        LessonProgress.find({
          classId,
          studentId
        })
          .sort({
            updatedAt:-1
          })
          .lean(),

        Assignment.find({
          classId,
          status:"published"
        })
          .sort({
            dueDate:1,
            createdAt:-1
          })
          .lean(),

        Submission.find({
          classId,
          studentId
        })
          .sort({
            createdAt:-1
          })
          .lean(),

        Quiz.find({
          classId,
          status:"published"
        })
          .sort({
            createdAt:1
          })
          .lean(),

        QuizSubmission.find({
          classId,
          studentId
        })
          .sort({
            submittedAt:-1,
            createdAt:-1
          })
          .lean(),

        Attendance.find({
          classId,
          studentId
        })
          .sort({
            date:-1,
            createdAt:-1
          })
          .lean()
      ]);

      /*
        Generic percentage utility.
      */

      const toPercent = value => {
        const number =
          Number(value);

        if (!Number.isFinite(number)) {
          return 0;
        }

        return Math.max(
          0,
          Math.min(
            100,
            Math.round(number)
          )
        );
      };

      /*
        LESSON PROGRESS

        Only published lessons are counted.
      */

      const progressByLessonId =
        new Map();

      lessonProgress.forEach(item => {
        const lessonId =
          normalizeObjectId(
            item.lessonId
          );

        if (
          lessonId &&
          !progressByLessonId.has(
            lessonId
          )
        ) {
          progressByLessonId.set(
            lessonId,
            item
          );
        }
      });

      const completedLessons =
        lessons.filter(lesson => {
          const progress =
            progressByLessonId.get(
              normalizeObjectId(
                lesson._id
              )
            );

          return (
            progress?.status ===
              "completed" ||
            Number(
              progress?.progressPercent ||
              0
            ) >= 100 ||
            progress?.completed === true
          );
        }).length;

      const lessonPercentage =
        lessons.length
          ? toPercent(
              (
                completedLessons /
                lessons.length
              ) * 100
            )
          : null;

      /*
        ASSIGNMENT PROGRESS

        One assignment counts as completed once the student
        has created a submission for it.
      */

      const submittedAssignmentIds =
        new Set(
          submissions
            .map(submission =>
              normalizeObjectId(
                submission.assignmentId
              )
            )
            .filter(Boolean)
        );

      const completedAssignments =
        assignments.filter(
          assignment =>
            submittedAssignmentIds.has(
              normalizeObjectId(
                assignment._id
              )
            )
        ).length;

      const assignmentPercentage =
        assignments.length
          ? toPercent(
              (
                completedAssignments /
                assignments.length
              ) * 100
            )
          : null;

      /*
        QUIZ PROGRESS

        A quiz counts as completed when at least one
        submission exists for that quiz.
      */

      const submittedQuizIds =
        new Set(
          quizSubmissions
            .map(submission =>
              normalizeObjectId(
                submission.quizId
              )
            )
            .filter(Boolean)
        );

      const completedQuizzes =
        quizzes.filter(
          quiz =>
            submittedQuizIds.has(
              normalizeObjectId(
                quiz._id
              )
            )
        ).length;

      const quizPercentage =
        quizzes.length
          ? toPercent(
              (
                completedQuizzes /
                quizzes.length
              ) * 100
            )
          : null;

      /*
        ATTENDANCE PROGRESS

        Same weighted rules used by your attendance
        analytics:

        present = 100%
        late    = 75%
        excused = 50%
        absent  = 0%
      */

      const attendanceWeights = {
        present:1,
        late:.75,
        excused:.5,
        absent:0
      };

      const attendancePoints =
        attendance.reduce(
          (total,record) => {
            return (
              total +
              (
                attendanceWeights[
                  record.status
                ] || 0
              )
            );
          },
          0
        );

      const attendancePercentage =
        attendance.length
          ? toPercent(
              (
                attendancePoints /
                attendance.length
              ) * 100
            )
          : null;

      /*
        Do not penalize a student for categories that the
        class does not use.

        Example:
        A class with no quizzes calculates progress from
        lessons, assignments, and attendance only.
      */

      const enabledComponents = [
        {
          key:"lessons",
          value:lessonPercentage,
          weight:45
        },
        {
          key:"assignments",
          value:assignmentPercentage,
          weight:30
        },
        {
          key:"quizzes",
          value:quizPercentage,
          weight:15
        },
        {
          key:"attendance",
          value:attendancePercentage,
          weight:10
        }
      ].filter(
        component =>
          component.value !== null
      );

      const availableWeight =
        enabledComponents.reduce(
          (total,component) =>
            total +
            component.weight,
          0
        );

      const overallPercentage =
        availableWeight
          ? toPercent(
              enabledComponents.reduce(
                (
                  total,
                  component
                ) => {
                  return (
                    total +
                    (
                      component.value *
                      component.weight
                    )
                  );
                },
                0
              ) /
              availableWeight
            )
          : 0;

      /*
        Locate the latest meaningful learning activity.
      */

      const recentActivityCandidates = [
        ...lessonProgress.map(item => ({
          type:"lesson",
          id:
            normalizeObjectId(
              item.lessonId
            ),
          date:
            item.updatedAt ||
            item.completedAt ||
            item.createdAt
        })),

        ...submissions.map(item => ({
          type:"assignment",
          id:
            normalizeObjectId(
              item.assignmentId
            ),
          date:
            item.updatedAt ||
            item.submittedAt ||
            item.createdAt
        })),

        ...quizSubmissions.map(item => ({
          type:"quiz",
          id:
            normalizeObjectId(
              item.quizId
            ),
          date:
            item.updatedAt ||
            item.submittedAt ||
            item.createdAt
        }))
      ]
        .filter(item => item.date)
        .sort(
          (first,second) =>
            new Date(
              second.date
            ).getTime() -
            new Date(
              first.date
            ).getTime()
        );

      const latestActivity =
        recentActivityCandidates[0] ||
        null;

      return res.json({
        classId,
        studentId,

        progress:{
          overall:overallPercentage,

          lessons:{
            total:lessons.length,
            completed:
              completedLessons,
            percentage:
              lessonPercentage ?? 0
          },

          assignments:{
            total:
              assignments.length,
            completed:
              completedAssignments,
            percentage:
              assignmentPercentage ?? 0
          },

          quizzes:{
            total:quizzes.length,
            completed:
              completedQuizzes,
            percentage:
              quizPercentage ?? 0
          },

          attendance:{
            total:
              attendance.length,

            present:
              attendance.filter(
                item =>
                  item.status ===
                  "present"
              ).length,

            late:
              attendance.filter(
                item =>
                  item.status ===
                  "late"
              ).length,

            absent:
              attendance.filter(
                item =>
                  item.status ===
                  "absent"
              ).length,

            excused:
              attendance.filter(
                item =>
                  item.status ===
                  "excused"
              ).length,

            percentage:
              attendancePercentage ?? 0
          }
        },

        latestActivity,

        generatedAt:
          new Date().toISOString()
      });
    } catch (err) {
      console.error(
        "GET student class progress error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to calculate student class progress."
      });
    }
  }
);

/* =========================================================
   AIFT CLASS LEARNING EXPERIENCE
   FILE: routes/classes.js

   PASTE THIS ENTIRE BLOCK IMMEDIATELY BEFORE your existing:
   PATCH /api/classes/:id/builder
========================================================= */

function isLearningContentPublished(item) {
  const status = String(item?.status || "").trim().toLowerCase();
  return item?.published === true || status === "published" || status === "active";
}

function isLearningContentArchived(item) {
  return String(item?.status || "").trim().toLowerCase() === "archived";
}

router.get("/:id/learning", auth, async (req, res) => {
  try {
    const classId = normalizeObjectId(req.params.id);
    const role = normalizeRole(req.user?.role);

    if (!classId) {
      return res.status(400).json({ message:"A valid class ID is required." });
    }

    const classDoc = await Class.findById(classId)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage avatar role subject department")
      .populate("studentIds", "name email profileImage avatar course role")
      .lean();

    if (!classDoc) {
      return res.status(404).json({ message:"Class not found." });
    }

/* =========================================================
   CLASS LEARNING ACCESS
========================================================= */

const viewerId =
  normalizeObjectId(
    req.user?._id
  );


const enrolledStudentIds =
  Array.isArray(
    classDoc.studentIds
  )
    ? classDoc.studentIds
        .map(
          normalizeObjectId
        )
        .filter(Boolean)

    : [];


const isEnrolled = enrolledStudentIds.includes(viewerId);
const canViewInstructorClass = Boolean(canViewClassBuilder(req.user, classDoc));
const learnerView = isEnrolled && !canViewInstructorClass;

if (!learnerView && !canViewInstructorClass) {
  return res.status(403).json({
    message: isLearningLearnerRole(role)
      ? "You are not enrolled in this class."
      : "You are not allowed to open this class."
  });
}

    const [rawModules, rawLessons, rawQuizzes, rawAssignments] = await Promise.all([
      ClassModule.find({ classId }).sort({ order:1, createdAt:1 }).lean(),
      ClassLesson.find({ classId }).sort({ order:1, createdAt:1 }).lean(),
      Quiz.find({ classId }).sort({ createdAt:1 }).lean(),
      Assignment.find({ classId }).sort({ dueDate:1, createdAt:1 }).lean()
    ]);

    const studentSafe = learnerView;

    const lessons = rawLessons.filter(lesson =>
      studentSafe
        ? isLearningContentPublished(lesson)
        : !isLearningContentArchived(lesson)
    );

    const visibleLessonIds = new Set(
      lessons.map(lesson => normalizeObjectId(lesson._id)).filter(Boolean)
    );

    const modules = rawModules.filter(module => {
      if (isLearningContentArchived(module)) return false;
      if (!studentSafe) return true;
      if (isLearningContentPublished(module)) return true;

      const moduleId = normalizeObjectId(module._id);

      return lessons.some(lesson =>
        normalizeObjectId(lesson.moduleId || lesson.module) === moduleId
      );
    });

    const quizzes = rawQuizzes.filter(quiz => {
      if (isLearningContentArchived(quiz)) return false;
      if (studentSafe && !isLearningContentPublished(quiz)) return false;

      const lessonId = normalizeObjectId(quiz.lessonId || quiz.lesson);

      return !lessonId || visibleLessonIds.has(lessonId);
    });

    const assignments = rawAssignments.filter(assignment => {
      if (isLearningContentArchived(assignment)) return false;
      if (studentSafe && !isLearningContentPublished(assignment)) return false;

      const lessonId = normalizeObjectId(assignment.lessonId || assignment.lesson);

      return !lessonId || visibleLessonIds.has(lessonId);
    });

    let lessonProgress = [];

    if (learnerView) {
      lessonProgress = await LessonProgress.find({
        classId,
        studentId:req.user._id
      })
        .sort({ updatedAt:-1 })
        .lean();
    }

    return res.json({
      class:classDoc,
      modules,
      lessons,
      quizzes,
      assignments,
      lessonProgress,
      viewer:{ _id:req.user._id, role },
      permissions:{
        canView:true,
        canTrackProgress:learnerView,
        canManage:Boolean(canManageAssignedClass(req.user, classDoc)),
        viewMode:learnerView ? "learner" : "instructor"
      }
    });
  } catch (err) {
    console.error("GET class learning experience error:", err);

    return res.status(500).json({
      message:"Failed to load the class learning experience."
    });
  }
});

router.patch("/:id/learning/lessons/:lessonId/progress", auth, async (req, res) => {
  try {
    const role = normalizeRole(req.user?.role);

    if (!isLearningLearnerRole(role)) {
      return res.status(403).json({
        message:"This account cannot save personal Lesson progress."
      });
    }

    const classId = normalizeObjectId(req.params.id);
    const lessonId = normalizeObjectId(req.params.lessonId);

    if (!classId || !lessonId) {
      return res.status(400).json({
        message:"A valid class and Lesson ID are required."
      });
    }

    const classDoc = await Class.findById(classId).lean();

    if (!classDoc) {
      return res.status(404).json({ message:"Class not found." });
    }

    const enrolledStudentIds = Array.isArray(classDoc.studentIds)
      ? classDoc.studentIds.map(normalizeObjectId).filter(Boolean)
      : [];

    const studentId = normalizeObjectId(req.user._id);

    if (!enrolledStudentIds.includes(studentId)) {
      return res.status(403).json({ message:"You are not enrolled in this class." });
    }

    const lesson = await ClassLesson.findOne({ _id:lessonId, classId });

    if (!lesson) {
      return res.status(404).json({ message:"Lesson not found in this class." });
    }

    if (!isLearningContentPublished(lesson)) {
      return res.status(403).json({
        message:"This Lesson is not available to students."
      });
    }

    const completed = req.body?.completed === true;

    let progress = await LessonProgress.findOne({
      classId,
      lessonId,
      studentId:req.user._id
    });

    if (!progress) {
      progress = new LessonProgress({
        schoolId:classDoc.schoolId,
        classId,
        moduleId:lesson.moduleId || lesson.module || null,
        lessonId,
        studentId:req.user._id
      });
    }

    progress.status = completed ? "completed" : "in_progress";
    progress.progressPercent = completed ? 100 : 0;
    progress.completedAt = completed ? new Date() : null;

    if ("lastActivityAt" in progress) {
      progress.lastActivityAt = new Date();
    }

    await progress.save();

    return res.json({
      message:completed ? "Lesson completed." : "Lesson marked in progress.",
      progress:progress.toObject()
    });
  } catch (err) {
    console.error("PATCH class Lesson progress error:", err);

    return res.status(500).json({
      message:"Failed to save Lesson progress."
    });
  }
});

/* =====================================================
   UPDATE CLASS BUILDER
   PATCH /api/classes/:id/builder

   PERMISSION MODEL

   ADMIN / SCHOOL
     Full class administration + instructional content.

   ASSIGNED TEACHER
     Instructional content only.

   Teachers cannot:
     - reassign the instructor
     - change class ownership
     - change class identity
     - archive the class
     - publish/unpublish the class
     - change enrollment rules
     - change publishing/discovery settings
     - change appearance branding
     - change School notification policy
===================================================== */

router.patch(
  "/:id/builder",
  auth,
  async (
    req,
    res
  ) => {

    try {

      /* =================================================
         LOAD CLASS
      ================================================= */

      const classDoc =
        await Class.findById(
          req.params.id
        );


      if (
        !classDoc
      ) {

        return res
          .status(404)
          .json({
            message:
              "Class not found"
          });

      }


      /* =================================================
         BASE BUILDER ACCESS
      ================================================= */

      if (
        !canManageAssignedClass(
          req.user,
          classDoc
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this class builder"
          });

      }


      const role =
        normalizeRole(
          req.user?.role
        );


      const permissions =
        getClassBuilderPermissions(
          req.user,
          classDoc
        );


      const canManageInstruction =
        permissions
          .canManageInstruction ===
        true;


      const canManageSchoolSettings =
        (
          permissions
            .canEditClassIdentity ===
          true
        );


      /* =================================================
         TEACHER FORBIDDEN FIELDS

         IMPORTANT:

         Do not silently ignore administrative changes from
         teachers.

         Reject them explicitly so a modified browser request
         cannot make it look like the change succeeded.
      ================================================= */

      const schoolOnlyFields = [

        /* ownership */
        "teacherId",
        "schoolId",

        /* class identity */
        "title",
        "name",
        "subtitle",
        "category",
        "subject",
        "level",
        "language",
        "description",
        "classCode",
        "code",

        /* schedule / identity */
        "schedule",
        "meetingLink",
        "estimatedDurationMinutes",

        /* branding */
        "coverImage",
        "bannerImage",
        "appearanceSettings",

        /* lifecycle */
        "status",
        "published",

        /* administrative settings */
        "enrollmentSettings",
        "publishingSettings",
        "notificationSettings"

      ];


      if (
        role ===
        "teacher"
      ) {

        const attemptedRestrictedFields =
          schoolOnlyFields.filter(
            field =>
              req.body[field] !==
              undefined
          );


        if (
          attemptedRestrictedFields.length
        ) {

          console.warn(
            "Teacher attempted restricted Class Builder update",
            {

              userId:
                normalizeObjectId(
                  req.user._id
                ),

              classId:
                normalizeObjectId(
                  classDoc._id
                ),

              fields:
                attemptedRestrictedFields

            }
          );


          return res
            .status(403)
            .json({

              message:
                "Your teacher account cannot change School-managed class settings.",

              restrictedFields:
                attemptedRestrictedFields

            });

        }

      }


      /* =================================================
         OLD TEACHER

         Needed only if a School/Admin changes teacherId.
      ================================================= */

      const oldTeacherId =
        classDoc.teacherId
          ? String(
              classDoc.teacherId
            )
          : null;


      /* =================================================
         SCHOOL / ADMIN — CLASS IDENTITY
      ================================================= */

      if (
        canManageSchoolSettings
      ) {

        /* =============================================
           TITLE
        ============================================= */

        if (
          req.body.title !==
          undefined
        ) {

          const title =
            normalizeString(
              req.body.title,
              {
                fallback:
                  null,

                maximumLength:
                  120
              }
            );


          if (
            !title
          ) {

            return res
              .status(400)
              .json({
                message:
                  "Class title is required"
              });

          }


          classDoc.title =
            title;

        }


        if (
          req.body.name !==
          undefined
        ) {

          const title =
            normalizeString(
              req.body.name,
              {
                fallback:
                  null,

                maximumLength:
                  120
              }
            );


          if (
            title
          ) {

            classDoc.title =
              title;

          }

        }


        /* =============================================
           SUBTITLE
        ============================================= */

        if (
          req.body.subtitle !==
          undefined
        ) {

          classDoc.subtitle =
            normalizeString(
              req.body.subtitle,
              {
                fallback:
                  null,

                maximumLength:
                  220
              }
            );

        }


        /* =============================================
           CATEGORY
        ============================================= */

        if (
          req.body.category !==
          undefined
        ) {

          classDoc.category =
            normalizeString(
              req.body.category,
              {
                fallback:
                  null,

                maximumLength:
                  120
              }
            );

        }


        /* =============================================
           SUBJECT
        ============================================= */

        if (
          req.body.subject !==
          undefined
        ) {

          classDoc.subject =
            normalizeString(
              req.body.subject,
              {
                fallback:
                  null,

                maximumLength:
                  120
              }
            );

        }


        /* =============================================
           LEVEL
        ============================================= */

        if (
          req.body.level !==
          undefined
        ) {

          classDoc.level =
            normalizeString(
              req.body.level,
              {
                fallback:
                  null,

                maximumLength:
                  80
              }
            );

        }


        /* =============================================
           LANGUAGE
        ============================================= */

        if (
          req.body.language !==
          undefined
        ) {

          classDoc.language =
            normalizeString(
              req.body.language,
              {
                fallback:
                  null,

                maximumLength:
                  80
              }
            );

        }


        /* =============================================
           DESCRIPTION
        ============================================= */

        if (
          req.body.description !==
          undefined
        ) {

          classDoc.description =
            normalizeString(
              req.body.description,
              {
                fallback:
                  null,

                maximumLength:
                  3000
              }
            );

        }


        /* =============================================
           DURATION
        ============================================= */

        if (
          req.body
            .estimatedDurationMinutes !==
          undefined
        ) {

          classDoc
            .estimatedDurationMinutes =
            normalizeNumber(
              req.body
                .estimatedDurationMinutes,
              {

                fallback:
                  classDoc
                    .estimatedDurationMinutes ||
                  0,

                minimum:
                  0,

                maximum:
                  1000000,

                integer:
                  true

              }
            );

        }


        /* =============================================
           SCHEDULE
        ============================================= */

        if (
          req.body.schedule !==
          undefined
        ) {

          classDoc.schedule =
            normalizeString(
              req.body.schedule,
              {

                fallback:
                  null,

                maximumLength:
                  200

              }
            );

        }


        /* =============================================
           MEETING LINK
        ============================================= */

        if (
          req.body.meetingLink !==
          undefined
        ) {

          classDoc.meetingLink =
            normalizeString(
              req.body.meetingLink,
              {

                fallback:
                  null,

                maximumLength:
                  500

              }
            );

        }


        /* =============================================
           CLASS CODE
        ============================================= */

        if (
          req.body.classCode !==
            undefined ||
          req.body.code !==
            undefined
        ) {

          classDoc.classCode =
            normalizeString(
              req.body.classCode ??
              req.body.code,
              {

                fallback:
                  null,

                maximumLength:
                  40

              }
            );

        }


        /* =============================================
           COVER IMAGE
        ============================================= */

        if (
          req.body.coverImage !==
          undefined
        ) {

          classDoc.coverImage =
            normalizeString(
              req.body.coverImage,
              {

                fallback:
                  null,

                maximumLength:
                  800

              }
            );

        }


        /* =============================================
           BANNER
        ============================================= */

        if (
          req.body.bannerImage !==
          undefined
        ) {

          classDoc.bannerImage =
            normalizeString(
              req.body.bannerImage,
              {

                fallback:
                  null,

                maximumLength:
                  800

              }
            );

        }

      }


      /* =================================================
         SCHOOL / ADMIN — TEACHER ASSIGNMENT
      ================================================= */

      if (
        req.body.teacherId !==
        undefined
      ) {

        if (
          !permissions
            .canAssignTeacher
        ) {

          return res
            .status(403)
            .json({
              message:
                "Only the School or an administrator can change the assigned teacher."
            });

        }


        const nextTeacherId =
          normalizeNullableObjectId(
            req.body.teacherId
          );


        if (
          nextTeacherId
        ) {

          const teacher =
            await User.findById(
              nextTeacherId
            );


          if (
            !teacher
          ) {

            return res
              .status(404)
              .json({
                message:
                  "Teacher not found"
              });

          }


          const teacherRole =
            normalizeRole(
              teacher.role
            );


          if (
            ![
              "teacher",
              "school",
              "admin"
            ].includes(
              teacherRole
            )
          ) {

            return res
              .status(400)
              .json({
                message:
                  "Selected user is not an instructor"
              });

          }


          /*
            A normal teacher/school account being assigned must
            belong to this School.

            Admin remains exempt.
          */

          if (
            teacherRole !==
            "admin"
          ) {

            const teacherSchoolIds = [

              ...getUserSchoolIds(
                teacher
              ),

              normalizeObjectId(
                teacher.companyId
              )

            ].filter(
              Boolean
            );


            const uniqueTeacherSchoolIds =
              [
                ...new Set(
                  teacherSchoolIds
                )
              ];


            if (
              !uniqueTeacherSchoolIds.includes(
                normalizeObjectId(
                  classDoc.schoolId
                )
              )
            ) {

              return res
                .status(403)
                .json({
                  message:
                    "Teacher is not linked to this school"
                });

            }

          }

        }


        classDoc.teacherId =
          nextTeacherId;

      }


      /* =================================================
         INSTRUCTIONAL CONTENT

         AVAILABLE TO:
           Admin
           owning School
           explicitly assigned teacher
      ================================================= */

      if (
        canManageInstruction
      ) {

        /* =============================================
           WELCOME / TEACHING CONTENT
        ============================================= */

        if (
          req.body.welcomeContent !==
          undefined
        ) {

          classDoc.welcomeContent =
            normalizeString(
              req.body.welcomeContent,
              {

                fallback:
                  null,

                maximumLength:
                  10000

              }
            );

        }


        /* =============================================
           LEARNING OUTCOMES
        ============================================= */

        if (
          req.body.learningOutcomes !==
          undefined
        ) {

          classDoc.learningOutcomes =
            normalizeArray(
              req.body.learningOutcomes
            )
              .map(
                item =>
                  String(
                    item
                  ).trim()
              )
              .filter(
                Boolean
              );

        }


        /* =============================================
           MATERIALS
        ============================================= */

        if (
          req.body.materials !==
          undefined
        ) {

          classDoc.materials =
            normalizeArray(
              req.body.materials
            )
              .map(
                item =>
                  String(
                    item
                  ).trim()
              )
              .filter(
                Boolean
              );

        }


        /* =============================================
           VISUAL PROJECT CANVAS
        ============================================= */

        if (
          req.body.projectCanvas !==
          undefined
        ) {

          classDoc.projectCanvas =
            Array.isArray(
              req.body.projectCanvas
            )
              ? req.body.projectCanvas
              : [];


          classDoc
            .projectCanvasUpdatedAt =
            new Date();

        }


        /* =============================================
           CONTENT BLOCKS
        ============================================= */

        if (
          req.body.contentBlocks !==
          undefined
        ) {

          classDoc.contentBlocks =
            Array.isArray(
              req.body.contentBlocks
            )
              ? req.body.contentBlocks
              : [];


          classDoc
            .contentBlocksUpdatedAt =
            new Date();

        }


        /* =============================================
           LEARNING SETTINGS

           These control teaching behavior rather than School
           ownership/discovery, so the assigned teacher may
           manage them.
        ============================================= */

        if (
          req.body.learningSettings !==
          undefined
        ) {

          classDoc.learningSettings =
            sanitizeLearningSettings(

              req.body.learningSettings,

              classDoc
                .learningSettings
                ?.toObject
                ? classDoc
                    .learningSettings
                    .toObject()
                : classDoc
                    .learningSettings ||
                  {}

            );

        }


        /* =============================================
           ASSESSMENT SETTINGS

           Teacher may control Quiz/Assignment behavior for
           the class they teach.
        ============================================= */

        if (
          req.body.assessmentSettings !==
          undefined
        ) {

          classDoc.assessmentSettings =
            sanitizeAssessmentSettings(

              req.body.assessmentSettings,

              classDoc
                .assessmentSettings
                ?.toObject
                ? classDoc
                    .assessmentSettings
                    .toObject()
                : classDoc
                    .assessmentSettings ||
                  {}

            );

        }

      }


      /* =================================================
         SCHOOL / ADMIN — CLASS STATE
      ================================================= */

      if (
        permissions
          .canArchiveClass
      ) {

        if (
          req.body.status !==
          undefined
        ) {

          classDoc.status =
            normalizeEnum(
              req.body.status,
              [
                "active",
                "archived"
              ],
              classDoc.status ||
              "active"
            );

        }

      }


      if (
        permissions
          .canPublishClass
      ) {

        if (
          req.body.published !==
          undefined
        ) {

          classDoc.published =
            normalizeBoolean(
              req.body.published,
              classDoc.published ??
              false
            );

        }

      }


      /* =================================================
         SCHOOL / ADMIN — APPEARANCE
      ================================================= */

      if (
        permissions
          .canManageAppearance &&
        req.body.appearanceSettings !==
          undefined
      ) {

        classDoc.appearanceSettings =
          sanitizeAppearanceSettings(

            req.body.appearanceSettings,

            classDoc
              .appearanceSettings
              ?.toObject
              ? classDoc
                  .appearanceSettings
                  .toObject()
              : classDoc
                  .appearanceSettings ||
                {}

          );

      }


      /* =================================================
         SCHOOL / ADMIN — ENROLLMENT
      ================================================= */

      if (
        permissions
          .canManageEnrollment &&
        req.body.enrollmentSettings !==
          undefined
      ) {

        classDoc.enrollmentSettings =
          sanitizeEnrollmentSettings(

            req.body.enrollmentSettings,

            classDoc
              .enrollmentSettings
              ?.toObject
              ? classDoc
                  .enrollmentSettings
                  .toObject()
              : classDoc
                  .enrollmentSettings ||
                {}

          );

      }


      /* =================================================
         SCHOOL / ADMIN — PUBLISHING
      ================================================= */

      if (
        permissions
          .canManagePublishing &&
        req.body.publishingSettings !==
          undefined
      ) {

        classDoc.publishingSettings =
          sanitizePublishingSettings(

            req.body.publishingSettings,

            classDoc
              .publishingSettings
              ?.toObject
              ? classDoc
                  .publishingSettings
                  .toObject()
              : classDoc
                  .publishingSettings ||
                {}

          );

      }


      /* =================================================
         SCHOOL / ADMIN — NOTIFICATIONS
      ================================================= */

      if (
        permissions
          .canManageNotificationSettings &&
        req.body.notificationSettings !==
          undefined
      ) {

        classDoc.notificationSettings =
          sanitizeNotificationSettings(

            req.body.notificationSettings,

            classDoc
              .notificationSettings
              ?.toObject
              ? classDoc
                  .notificationSettings
                  .toObject()
              : classDoc
                  .notificationSettings ||
                {}

          );

      }


      /* =================================================
         SAVE
      ================================================= */

      await classDoc.save();


      /* =================================================
         SYNCHRONIZE TEACHER REFERENCES

         This normally runs only for School/Admin because
         teacherId is a School-managed field.
      ================================================= */

      const newTeacherId =
        classDoc.teacherId
          ? String(
              classDoc.teacherId
            )
          : null;


      if (
        oldTeacherId &&
        oldTeacherId !==
          newTeacherId
      ) {

        await User.findByIdAndUpdate(
          oldTeacherId,
          {
            $pull:{
              assignedClasses:
                classDoc._id
            }
          }
        );

      }


      if (
        newTeacherId &&
        (
          !oldTeacherId ||
          oldTeacherId !==
            newTeacherId
        )
      ) {

        await User.findByIdAndUpdate(
          newTeacherId,
          {
            $addToSet:{
              assignedClasses:
                classDoc._id
            }
          }
        );

      }


      /* =================================================
         AUTHORITATIVE RESPONSE
      ================================================= */

      const updatedClass =
        await Class.findById(
          classDoc._id
        )
          .populate(
            "schoolId",
            "name schoolName profileImage schoolLogo"
          )
          .populate(
            "teacherId",
            "name email profileImage avatar role subject department"
          )
          .populate(
            "studentIds",
            "name email profileImage avatar course"
          );


      /* =================================================
         SOCKET.IO
      ================================================= */

      const io =
        req.app.get(
          "io"
        );


      if (
        io
      ) {

        io.to(
          String(
            classDoc.schoolId
          )
        ).emit(
          "class:builder:updated",
          {

            classId:
              classDoc._id,

            class:
              updatedClass

          }
        );


        if (
          newTeacherId
        ) {

          io.to(
            newTeacherId
          ).emit(
            "class:builder:updated",
            {

              classId:
                classDoc._id,

              class:
                updatedClass

            }
          );

        }

      }


      /* =================================================
         RETURN PERMISSIONS TOO

         Important because the frontend can refresh its
         permission-based visibility after a save.
      ================================================= */

      return res.json({

        success:
          true,

        class:
          updatedClass,

        permissions:
          getClassBuilderPermissions(
            req.user,
            updatedClass
          )

      });

    } catch (
      err
    ) {

      console.error(
        "PATCH class builder error:",
        err
      );


      if (
        err?.statusCode ===
        400
      ) {

        return res
          .status(400)
          .json({
            message:
              err.message ||
              "Invalid class settings"
          });

      }


      if (
        err?.name ===
        "ValidationError"
      ) {

        const firstValidationError =
          Object.values(
            err.errors ||
            {}
          )[0];


        return res
          .status(400)
          .json({
            message:
              firstValidationError
                ?.message ||
              err.message ||
              "Invalid class settings"
          });

      }


      if (
        err?.name ===
        "CastError"
      ) {

        return res
          .status(400)
          .json({
            message:
              "One of the supplied IDs is invalid."
          });

      }


      return res
        .status(500)
        .json({
          message:
            "Failed to update class builder"
        });

    }

  }
);
/* =====================================================
   UPDATE LESSON FROM VISUAL STUDIO NORMAL MODE
   PATCH /api/classes/:id/builder/lesson/:lessonId
===================================================== */
router.patch("/:id/builder/lesson/:lessonId", auth, async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    if (
      !canManageAssignedClass(
        req.user,
        classDoc
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to update this lesson"
      });
    }

    const lesson = await ClassLesson.findOne({
      _id: req.params.lessonId,
      classId: req.params.id
    });

    if (!lesson) {
      return res.status(404).json({
        message: "Lesson not found"
      });
    }

    const allowedLessonFields = [
      "title",
      "description",
      "content",
      "videoUrl",
      "resourceUrl",
      "duration",
      "order",
      "moduleId",
      "published"
    ];

    allowedLessonFields.forEach(field => {
      if (req.body[field] !== undefined) {
        lesson[field] = req.body[field];
      }
    });

    await lesson.save();

    return res.json({
      success: true,
      lesson
    });
  } catch (err) {
    console.error("PATCH builder lesson error:", err);
    return res.status(500).json({
      message: "Failed to update lesson"
    });
  }
});

/* =====================================================
   UPDATE QUIZ FROM VISUAL STUDIO NORMAL MODE
   PATCH /api/classes/:id/builder/quiz/:quizId
===================================================== */
router.patch("/:id/builder/quiz/:quizId", auth, async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    if (
      !canManageAssignedClass(
        req.user,
        classDoc
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to update this quiz"
      });
    }

    const quiz = await Quiz.findOne({
      _id: req.params.quizId,
      classId: req.params.id
    });

    if (!quiz) {
      return res.status(404).json({
        message: "Quiz not found"
      });
    }

    const allowedQuizFields = [
      "title",
      "instructions",
      "questions",
      "passingScore",
      "timeLimitMinutes",
      "attemptsAllowed",
      "status",
      "lessonId",
      "moduleId"
    ];

    allowedQuizFields.forEach(field => {
      if (req.body[field] !== undefined) {
        quiz[field] = req.body[field];
      }
    });

    await quiz.save();

    return res.json({
      success: true,
      quiz
    });
  } catch (err) {
    console.error("PATCH builder quiz error:", err);
    return res.status(500).json({
      message: "Failed to update quiz"
    });
  }
});

module.exports = router;
