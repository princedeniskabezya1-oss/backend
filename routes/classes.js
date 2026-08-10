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

  /*
    ADMIN

    Administrators may inspect every class builder.
  */
  if (role === "admin") {
    return true;
  }

  /*
    SCHOOL

    A school account may access builders belonging
    to that school.
  */
  if (role === "school") {
    return getUserSchoolIds(user)
      .includes(classSchoolId);
  }

  /*
    TEACHER

    Teachers may only access a class builder when
    they are the teacher explicitly assigned to
    that class.

    Belonging to the same school alone does NOT
    grant builder access.
  */
  if (role === "teacher") {
    return (
      Boolean(userId) &&
      Boolean(classTeacherId) &&
      classTeacherId === userId
    );
  }

  /*
    STUDENT

    Students may access class learning information
    only when they are enrolled in the class.

    Write permissions are handled separately by
    the protected mutation routes.
  */
  if (role === "student") {
    return (
      Boolean(userId) &&
      studentIds.includes(userId)
    );
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
      !canManageAssignedClass(
        req.user,
        classDoc
      )
    ) {
      return res.status(403).json({
        message:
          "Not allowed to update this class builder"
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

      /*
        Only the owning school or an admin may
        assign, replace, or remove a teacher.

        An assigned teacher may edit instructional
        content, but may not change class ownership.
      */
      if (
        !canManageSchool(
          req.user,
          classDoc.schoolId
        )
      ) {
        return res.status(403).json({
          message:
            "Only the school or an administrator can change the assigned teacher."
        });
      }

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
