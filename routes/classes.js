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

    if (!canViewClassBuilder(req.user, classDoc)) {
      return res.status(403).json({ message:"You are not allowed to open this class." });
    }

    const viewerId = normalizeObjectId(req.user?._id);

    const enrolledStudentIds = Array.isArray(classDoc.studentIds)
      ? classDoc.studentIds.map(normalizeObjectId).filter(Boolean)
      : [];

    if (role === "student" && !enrolledStudentIds.includes(viewerId)) {
      return res.status(403).json({ message:"You are not enrolled in this class." });
    }

    const [rawModules, rawLessons, rawQuizzes, rawAssignments] = await Promise.all([
      ClassModule.find({ classId }).sort({ order:1, createdAt:1 }).lean(),
      ClassLesson.find({ classId }).sort({ order:1, createdAt:1 }).lean(),
      Quiz.find({ classId }).sort({ createdAt:1 }).lean(),
      Assignment.find({ classId }).sort({ dueDate:1, createdAt:1 }).lean()
    ]);

    const studentSafe = role === "student";

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

    if (role === "student") {
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
        canTrackProgress:role === "student",
        canManage:Boolean(canManageAssignedClass(req.user, classDoc)),
        viewMode:role === "student" ? "learner" : "instructor"
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

    if (role !== "student") {
      return res.status(403).json({
        message:"Only students can save personal Lesson progress."
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
