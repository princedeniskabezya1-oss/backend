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

function canManageSchool(user, schoolId) {
  if (!user || !schoolId) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  if (role === "admin") {
    return true;
  }

  const normalizedSchoolId =
    normalizeObjectId(schoolId);

  const belongsToSchool =
    getUserSchoolIds(user)
      .includes(
        normalizedSchoolId
      );

  if (role === "school") {
    return belongsToSchool;
  }

  if (role === "teacher") {
    return belongsToSchool;
  }

  return false;
}

function canViewClassBuilder(
  user,
  classDoc
) {
  if (!user || !classDoc) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  const userId =
    normalizeObjectId(user._id);

  const classSchoolId =
    normalizeObjectId(
      classDoc.schoolId
    );

  const classTeacherId =
    normalizeObjectId(
      classDoc.teacherId
    );

  const studentIds =
    Array.isArray(
      classDoc.studentIds
    )
      ? classDoc.studentIds
          .map(normalizeObjectId)
          .filter(Boolean)
      : [];

  if (role === "admin") {
    return true;
  }

  if (
    role === "school" &&
    getUserSchoolIds(user)
      .includes(classSchoolId)
  ) {
    return true;
  }

  if (
    role === "teacher" &&
    (
      classTeacherId === userId ||
      getUserSchoolIds(user)
        .includes(classSchoolId)
    )
  ) {
    return true;
  }

  if (
    role === "student" &&
    studentIds.includes(userId)
  ) {
    return true;
  }

  return false;
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

/* ============================================
   GET CLASSES
   GET /api/classes
============================================ */
router.get("/", auth, async (req, res) => {
  try {
    const user = req.user;

    const query = {};

    if (user.role === "admin") {
      if (req.query.schoolId) query.schoolId = req.query.schoolId;
    } else if (user.role === "school") {
      query.schoolId = user._id;
    } else if (user.role === "teacher") {
      query.$or = [
        { teacherId: user._id },
        { schoolId: user.schoolId || user.linkedSchoolId }
      ];
    } else if (user.role === "student") {
      query.$or = [
        { studentIds: user._id },
        { schoolId: user.schoolId || user.linkedSchoolId }
      ];
    } else if (req.query.schoolId) {
      query.schoolId = req.query.schoolId;
    }

    if (req.query.teacherId) query.teacherId = req.query.teacherId;
    if (req.query.status) query.status = req.query.status;

    const classes = await Class.find(query)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage subject department")
      .populate("studentIds", "name email profileImage course")
      .sort({ createdAt: -1 });

    return res.json(classes);
  } catch (err) {
    console.error("GET /api/classes error:", err);
    return res.status(500).json({
      message: "Failed to load classes"
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
router.get("/:id/builder", auth, async (req, res) => {
  try {
    const classId = req.params.id;

    const classDoc = await Class.findById(classId)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage avatar role subject department")
      .populate("studentIds", "name email profileImage avatar course")
      .lean();

    if (!classDoc) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

const user =
  req.user;

const canAccess =
  canViewClassBuilder(
    user,
    classDoc
  );

if (!canAccess) {
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

  return res.status(403).json({
    message:
      "Not allowed to view this class builder"
  });
}

    const schoolId = classDoc.schoolId?._id || classDoc.schoolId;

    const [
      modules,
      lessons,
      quizzes,
      quizSubmissions,
      assignments,
      submissions,
      attendance,
      progress
    ] = await Promise.all([
      ClassModule.find({
        classId
      })
        .sort({
          order: 1,
          createdAt: 1
        })
        .lean(),

      ClassLesson.find({
        classId
      })
        .sort({
          order: 1,
          createdAt: 1
        })
        .lean(),

      Quiz.find({
        classId
      })
        .sort({
          createdAt: -1
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
          submittedAt: -1
        })
        .lean(),

      Assignment.find({
        classId
      })
        .sort({
          createdAt: -1
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
          createdAt: -1
        })
        .lean(),

      Attendance.find({
        classId
      })
        .sort({
          date: -1
        })
        .limit(500)
        .lean(),

      LessonProgress.find({
        classId
      })
        .sort({
          updatedAt: -1
        })
        .lean()
    ]);

    const completedLessons = progress.filter(
      item =>
        item.status === "completed" ||
        Number(item.progressPercent || 0) >= 100
    ).length;

    const totalProgress = progress.length
      ? Math.round(
          progress.reduce(
            (sum, item) => sum + Number(item.progressPercent || 0),
            0
          ) / progress.length
        )
      : 0;

    const attendanceTotal = attendance.length;

    const attendancePresent = attendance.filter(
      item => item.status === "present"
    ).length;

    const attendanceRate = attendanceTotal
      ? Math.round((attendancePresent / attendanceTotal) * 100)
      : 0;

    return res.json({
      class: classDoc,
      schoolId,
      modules,
      lessons,
      quizzes,
      quizSubmissions,
      assignments,
      submissions,
      attendance,
      progress,
      analytics: {
        moduleCount: modules.length,
        lessonCount: lessons.length,
        quizCount: quizzes.length,
        assignmentCount: assignments.length,
        submissionCount: submissions.length,
        completedLessons,
        averageProgress: totalProgress,
        attendanceRate
      }
    });
  } catch (err) {
    console.error("GET class builder error:", err);
    return res.status(500).json({
      message: "Failed to load class builder"
    });
  }
});

/* =====================================================
   UPDATE CLASS BUILDER PROFILE + VISUAL CONTENT
   PATCH /api/classes/:id/builder
===================================================== */

router.patch("/:id/builder", auth, async (req, res) => {
  try {
    const classDoc =
      await Class.findById(
        req.params.id
      );

    if (!classDoc) {
      return res.status(404).json({
        message:
          "Class not found"
      });
    }

    if (
      !canManageSchool(
        req.user,
        classDoc.schoolId
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to update class builder"
      });
    }

    const oldTeacherId =
      classDoc.teacherId
        ? String(classDoc.teacherId)
        : null;

    /* ============================================
       GENERAL CLASS INFORMATION
    ============================================ */

    if (
      req.body.title !==
      undefined
    ) {
      const title =
        normalizeString(
          req.body.title,
          {
            fallback:null,
            maximumLength:120
          }
        );

      if (!title) {
        return res.status(400).json({
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
            fallback:null,
            maximumLength:120
          }
        );

      if (title) {
        classDoc.title =
          title;
      }
    }

    if (
      req.body.subtitle !==
      undefined
    ) {
      classDoc.subtitle =
        normalizeString(
          req.body.subtitle,
          {
            fallback:null,
            maximumLength:220
          }
        );
    }

    if (
      req.body.category !==
      undefined
    ) {
      classDoc.category =
        normalizeString(
          req.body.category,
          {
            fallback:null,
            maximumLength:120
          }
        );
    }

    if (
      req.body.estimatedDurationMinutes !==
      undefined
    ) {
      classDoc.estimatedDurationMinutes =
        normalizeNumber(
          req.body.estimatedDurationMinutes,
          {
            fallback:
              classDoc.estimatedDurationMinutes ||
              0,

            minimum:0,
            maximum:1000000,
            integer:true
          }
        );
    }

    if (
      req.body.subject !==
      undefined
    ) {
      classDoc.subject =
        normalizeString(
          req.body.subject,
          {
            fallback:null,
            maximumLength:120
          }
        );
    }

    if (
      req.body.level !==
      undefined
    ) {
      classDoc.level =
        normalizeString(
          req.body.level,
          {
            fallback:null,
            maximumLength:80
          }
        );
    }

    if (
      req.body.language !==
      undefined
    ) {
      classDoc.language =
        normalizeString(
          req.body.language,
          {
            fallback:null,
            maximumLength:80
          }
        );
    }

    if (
      req.body.description !==
      undefined
    ) {
      classDoc.description =
        normalizeString(
          req.body.description,
          {
            fallback:null,
            maximumLength:3000
          }
        );
    }

    if (
      req.body.welcomeContent !==
      undefined
    ) {
      classDoc.welcomeContent =
        normalizeString(
          req.body.welcomeContent,
          {
            fallback:null,
            maximumLength:10000
          }
        );
    }

    if (
      req.body.schedule !==
      undefined
    ) {
      classDoc.schedule =
        normalizeString(
          req.body.schedule,
          {
            fallback:null,
            maximumLength:200
          }
        );
    }

    if (
      req.body.meetingLink !==
      undefined
    ) {
      classDoc.meetingLink =
        normalizeString(
          req.body.meetingLink,
          {
            fallback:null,
            maximumLength:500
          }
        );
    }

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
            fallback:null,
            maximumLength:40
          }
        );
    }

    /* ============================================
       CLASS RELATIONSHIPS
    ============================================ */

    if (
      req.body.teacherId !==
      undefined
    ) {
      const nextTeacherId =
        normalizeNullableObjectId(
          req.body.teacherId
        );

      if (nextTeacherId) {
        const teacher =
          await User.findById(
            nextTeacherId
          );

        if (!teacher) {
          return res.status(404).json({
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
          return res.status(400).json({
            message:
              "Selected user is not an instructor"
          });
        }

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
  ].filter(Boolean);

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
    return res.status(403).json({
      message:
        "Teacher is not linked to this school"
    });
  }
}
      }

      classDoc.teacherId =
        nextTeacherId;
    }

    /* ============================================
       MEDIA AND CLASS CONTENT
    ============================================ */

    if (
      req.body.coverImage !==
      undefined
    ) {
      classDoc.coverImage =
        normalizeString(
          req.body.coverImage,
          {
            fallback:null,
            maximumLength:800
          }
        );
    }

    if (
      req.body.bannerImage !==
      undefined
    ) {
      classDoc.bannerImage =
        normalizeString(
          req.body.bannerImage,
          {
            fallback:null,
            maximumLength:800
          }
        );
    }

    if (
      req.body.learningOutcomes !==
      undefined
    ) {
      classDoc.learningOutcomes =
        normalizeArray(
          req.body.learningOutcomes
        )
          .map(item =>
            String(item).trim()
          )
          .filter(Boolean);
    }

    if (
      req.body.materials !==
      undefined
    ) {
      classDoc.materials =
        normalizeArray(
          req.body.materials
        )
          .map(item =>
            String(item).trim()
          )
          .filter(Boolean);
    }

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

      classDoc.projectCanvasUpdatedAt =
        new Date();
    }

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

      classDoc.contentBlocksUpdatedAt =
        new Date();
    }

    /* ============================================
       CLASS STATE
    ============================================ */

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

    /* ============================================
       STRUCTURED SETTINGS
    ============================================ */

    if (
      req.body.appearanceSettings !==
      undefined
    ) {
      classDoc.appearanceSettings =
        sanitizeAppearanceSettings(
          req.body.appearanceSettings,
          classDoc.appearanceSettings?.toObject
            ? classDoc.appearanceSettings.toObject()
            : classDoc.appearanceSettings ||
              {}
        );
    }

    if (
      req.body.enrollmentSettings !==
      undefined
    ) {
      classDoc.enrollmentSettings =
        sanitizeEnrollmentSettings(
          req.body.enrollmentSettings,
          classDoc.enrollmentSettings?.toObject
            ? classDoc.enrollmentSettings.toObject()
            : classDoc.enrollmentSettings ||
              {}
        );
    }

    if (
      req.body.learningSettings !==
      undefined
    ) {
      classDoc.learningSettings =
        sanitizeLearningSettings(
          req.body.learningSettings,
          classDoc.learningSettings?.toObject
            ? classDoc.learningSettings.toObject()
            : classDoc.learningSettings ||
              {}
        );
    }

    if (
      req.body.assessmentSettings !==
      undefined
    ) {
      classDoc.assessmentSettings =
        sanitizeAssessmentSettings(
          req.body.assessmentSettings,
          classDoc.assessmentSettings?.toObject
            ? classDoc.assessmentSettings.toObject()
            : classDoc.assessmentSettings ||
              {}
        );
    }

    if (
      req.body.publishingSettings !==
      undefined
    ) {
      classDoc.publishingSettings =
        sanitizePublishingSettings(
          req.body.publishingSettings,
          classDoc.publishingSettings?.toObject
            ? classDoc.publishingSettings.toObject()
            : classDoc.publishingSettings ||
              {}
        );
    }

    if (
      req.body.notificationSettings !==
      undefined
    ) {
      classDoc.notificationSettings =
        sanitizeNotificationSettings(
          req.body.notificationSettings,
          classDoc.notificationSettings?.toObject
            ? classDoc.notificationSettings.toObject()
            : classDoc.notificationSettings ||
              {}
        );
    }

    await classDoc.save();

    /* ============================================
       SYNCHRONIZE TEACHER CLASS REFERENCES
    ============================================ */

    const newTeacherId =
      classDoc.teacherId
        ? String(classDoc.teacherId)
        : null;

    if (
      oldTeacherId &&
      oldTeacherId !==
      newTeacherId
    ) {
      await User.findByIdAndUpdate(
        oldTeacherId,
        {
          $pull: {
            assignedClasses:
              classDoc._id
          }
        }
      );
    }

    if (newTeacherId) {
      await User.findByIdAndUpdate(
        newTeacherId,
        {
          $addToSet: {
            assignedClasses:
              classDoc._id
          }
        }
      );
    }

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

    const io =
      req.app.get("io");

    if (io) {
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

      if (newTeacherId) {
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

    return res.json({
      success:true,
      class:updatedClass
    });
  } catch (err) {
    console.error(
      "PATCH class builder error:",
      err
    );

    if (
      err?.statusCode === 400
    ) {
      return res.status(400).json({
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

      return res.status(400).json({
        message:
          firstValidationError?.message ||
          err.message ||
          "Invalid class settings"
      });
    }

    if (
      err?.name ===
      "CastError"
    ) {
      return res.status(400).json({
        message:
          "One of the supplied IDs is invalid."
      });
    }

    return res.status(500).json({
      message:
        "Failed to update class builder"
    });
  }
});
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

    if (!canManageSchool(req.user, classDoc.schoolId)) {
      return res.status(403).json({
        message: "Not allowed to update lesson"
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

    if (!canManageSchool(req.user, classDoc.schoolId)) {
      return res.status(403).json({
        message: "Not allowed to update quiz"
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
