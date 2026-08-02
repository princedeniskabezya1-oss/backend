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
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        message: "Class not found"
      });
    }

    if (!canManageSchool(req.user, classDoc.schoolId)) {
      return res.status(403).json({
        message: "Not allowed to update class builder"
      });
    }

    const allowedFields = [
      "title",
      "name",
      "subject",
      "description",
      "classCode",
      "code",
      "meetingLink",
      "schedule",
      "teacherId",
      "coverImage",
      "bannerImage",
      "welcomeContent",
      "learningOutcomes",
      "level",
      "language",
      "materials",
      "status",
      "projectCanvas",
      "projectCanvasUpdatedAt",
      "contentBlocks",
      "contentBlocksUpdatedAt",
      "published"
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (
          ["learningOutcomes", "materials"].includes(field)
        ) {
          classDoc[field] = normalizeArray(req.body[field]);
        } else if (field === "name") {
          classDoc.title = req.body[field] || classDoc.title;
        } else if (field === "code") {
          classDoc.classCode = req.body[field] || null;
        } else {
          classDoc[field] = req.body[field];
        }
      }
    });

    if (req.body.contentBlocks !== undefined) {
      classDoc.contentBlocksUpdatedAt = new Date();
    }

    if (req.body.projectCanvas !== undefined) {
      classDoc.projectCanvasUpdatedAt = new Date();
    }

    await classDoc.save();

    const updatedClass = await Class.findById(classDoc._id)
      .populate("schoolId", "name schoolName profileImage schoolLogo")
      .populate("teacherId", "name email profileImage avatar role subject department")
      .populate("studentIds", "name email profileImage avatar course");

    const io = req.app.get("io");

    if (io) {
      io.to(String(classDoc.schoolId)).emit("class:builder:updated", {
        classId: classDoc._id,
        class: updatedClass
      });
    }

    return res.json({
      success: true,
      class: updatedClass
    });
  } catch (err) {
    console.error("PATCH class builder error:", err);
    return res.status(500).json({
      message: "Failed to update class builder"
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
