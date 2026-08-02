const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const Class = require("../models/Class");


/* ============================================
   HELPERS
============================================ */

function normalizeRole(value) {
  const role =
    String(value || "")
      .trim()
      .toLowerCase();

  const aliases = {
    administrator: "admin",
    instructor: "teacher",
    faculty: "teacher",
    learner: "student"
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

  const values = [
    user.schoolId,
    user.linkedSchoolId
  ];

  if (role === "school") {
    values.push(user._id);
  }

  return [
    ...new Set(
      values
        .map(normalizeObjectId)
        .filter(Boolean)
    )
  ];
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

  if (
    ![
      "school",
      "teacher"
    ].includes(role)
  ) {
    return false;
  }

  return getUserSchoolIds(user)
    .includes(
      normalizeObjectId(schoolId)
    );
}


function isStudentEnrolled(user, classDoc) {
  if (!user || !classDoc) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  if (role !== "student") {
    return false;
  }

  const studentId =
    normalizeObjectId(user._id);

  const enrolledStudentIds =
    Array.isArray(classDoc.studentIds)
      ? classDoc.studentIds
          .map(normalizeObjectId)
          .filter(Boolean)
      : [];

  return enrolledStudentIds.includes(
    studentId
  );
}


function canViewClass(user, classDoc) {
  if (!user || !classDoc) {
    return false;
  }

  const role =
    normalizeRole(user.role);

  if (role === "admin") {
    return true;
  }

  if (
    canManageSchool(
      user,
      classDoc.schoolId
    )
  ) {
    return true;
  }

  return isStudentEnrolled(
    user,
    classDoc
  );
}


function pick(object, fields) {
  const output = {};

  fields.forEach(field => {
    if (
      object[field] !== undefined
    ) {
      output[field] =
        object[field];
    }
  });

  return output;
}


function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function gradeQuestion(
  question,
  submittedAnswer
) {
  const answer =
    String(
      submittedAnswer || ""
    ).trim();

  const correctAnswer =
    String(
      question.correctAnswer || ""
    ).trim();

  if (
    question.type ===
    "short_answer"
  ) {
    return (
      normalizeAnswer(answer) ===
      normalizeAnswer(correctAnswer)
    );
  }

  return answer === correctAnswer;
}


/* ============================================
   GET QUIZZES
   GET /api/quizzes
============================================ */

router.get(
  "/",
  auth,
  async (req, res) => {
    try {
      const {
        classId,
        moduleId,
        lessonId,
        schoolId,
        status
      } = req.query;

      const query = {};

      if (classId) {
        const classDoc =
          await Class.findById(
            classId
          ).select(
            "schoolId teacherId studentIds"
          );

        if (!classDoc) {
          return res.status(404).json({
            message: "Class not found"
          });
        }

        if (
          !canViewClass(
            req.user,
            classDoc
          )
        ) {
          return res.status(403).json({
            message:
              "Not allowed to view quizzes for this class"
          });
        }

        query.classId =
          classId;
      } else {
        const role =
          normalizeRole(
            req.user.role
          );

        if (role === "admin") {
          if (schoolId) {
            query.schoolId =
              schoolId;
          }
        } else {
          const userSchoolIds =
            getUserSchoolIds(
              req.user
            );

          if (!userSchoolIds.length) {
            return res.status(403).json({
              message:
                "User is not linked to a school"
            });
          }

          query.schoolId = {
            $in: userSchoolIds
          };
        }
      }

      if (moduleId) {
        query.moduleId =
          moduleId;
      }

      if (lessonId) {
        query.lessonId =
          lessonId;
      }

      if (status) {
        query.status =
          status;
      }

      /*
        Students should only see published quizzes.
      */
      if (
        normalizeRole(
          req.user.role
        ) === "student"
      ) {
        query.status =
          "published";
      }

      const quizzes =
        await Quiz.find(query)
          .sort({
            createdAt: -1
          })
          .lean();

      return res.json(
        quizzes
      );
    } catch (err) {
      console.error(
        "GET /api/quizzes error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to load quizzes"
      });
    }
  }
);


/* ============================================
   CREATE QUIZ
   POST /api/quizzes
============================================ */

router.post(
  "/",
  auth,
  async (req, res) => {
    try {
      const {
        schoolId,
        classId,
        title
      } = req.body;

      if (
        !schoolId ||
        !classId ||
        !String(title || "").trim()
      ) {
        return res.status(400).json({
          message:
            "schoolId, classId, and title are required"
        });
      }

      const classDoc =
        await Class.findById(
          classId
        );

      if (!classDoc) {
        return res.status(404).json({
          message: "Class not found"
        });
      }

      if (
        normalizeObjectId(
          classDoc.schoolId
        ) !==
        normalizeObjectId(
          schoolId
        )
      ) {
        return res.status(403).json({
          message:
            "Class does not belong to this school"
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
            "Not allowed to create quizzes"
        });
      }

      const quiz =
        await Quiz.create({
          schoolId:
            classDoc.schoolId,

          classId:
            classDoc._id,

          moduleId:
            req.body.moduleId ||
            null,

          lessonId:
            req.body.lessonId ||
            null,

          title:
            String(title).trim(),

          instructions:
            req.body.instructions ||
            "",

          questions:
            Array.isArray(
              req.body.questions
            )
              ? req.body.questions
              : [],

          passingScore:
            Number(
              req.body.passingScore ??
              70
            ),

          timeLimitMinutes:
            Number(
              req.body.timeLimitMinutes ??
              0
            ),

          attemptsAllowed:
            Math.max(
              1,
              Number(
                req.body.attemptsAllowed ??
                1
              )
            ),

          status:
            [
              "draft",
              "published",
              "archived"
            ].includes(
              req.body.status
            )
              ? req.body.status
              : "draft"
        });

      return res.status(201).json(
        quiz
      );
    } catch (err) {
      console.error(
        "POST /api/quizzes error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to create quiz"
      });
    }
  }
);


/* ============================================
   UPDATE QUIZ
   PATCH /api/quizzes/:id
============================================ */

router.patch(
  "/:id",
  auth,
  async (req, res) => {
    try {
      const quiz =
        await Quiz.findById(
          req.params.id
        );

      if (!quiz) {
        return res.status(404).json({
          message: "Quiz not found"
        });
      }

      if (
        !canManageSchool(
          req.user,
          quiz.schoolId
        )
      ) {
        return res.status(403).json({
          message:
            "Not allowed to update quiz"
        });
      }

      const updates =
        pick(
          req.body,
          [
            "moduleId",
            "lessonId",
            "title",
            "instructions",
            "questions",
            "passingScore",
            "timeLimitMinutes",
            "attemptsAllowed",
            "status"
          ]
        );

      Object.entries(
        updates
      ).forEach(
        ([
          field,
          value
        ]) => {
          quiz[field] =
            value;
        }
      );

      await quiz.save();

      return res.json(
        quiz
      );
    } catch (err) {
      console.error(
        "PATCH /api/quizzes/:id error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to update quiz"
      });
    }
  }
);


/* ============================================
   DELETE QUIZ
   DELETE /api/quizzes/:id
============================================ */

router.delete(
  "/:id",
  auth,
  async (req, res) => {
    try {
      const quiz =
        await Quiz.findById(
          req.params.id
        );

      if (!quiz) {
        return res.status(404).json({
          message: "Quiz not found"
        });
      }

      if (
        !canManageSchool(
          req.user,
          quiz.schoolId
        )
      ) {
        return res.status(403).json({
          message:
            "Not allowed to delete quiz"
        });
      }

      const deleteResult =
        await QuizSubmission.deleteMany({
          quizId: quiz._id
        });

      await quiz.deleteOne();

      return res.json({
        message: "Quiz deleted",

        deletedSubmissionCount:
          deleteResult.deletedCount ||
          0
      });
    } catch (err) {
      console.error(
        "DELETE /api/quizzes/:id error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to delete quiz"
      });
    }
  }
);


/* ============================================
   GET QUIZ SUBMISSIONS
   GET /api/quizzes/submissions
============================================ */

router.get(
  "/submissions/list",
  auth,
  async (req, res) => {
    try {
      const {
        classId,
        quizId,
        studentId
      } = req.query;

      const query = {};

      const role =
        normalizeRole(
          req.user.role
        );

      if (classId) {
        const classDoc =
          await Class.findById(
            classId
          );

        if (!classDoc) {
          return res.status(404).json({
            message: "Class not found"
          });
        }

        if (
          !canViewClass(
            req.user,
            classDoc
          )
        ) {
          return res.status(403).json({
            message:
              "Not allowed to view quiz submissions"
          });
        }

        query.classId =
          classId;
      }

      if (quizId) {
        const quiz =
          await Quiz.findById(
            quizId
          );

        if (!quiz) {
          return res.status(404).json({
            message: "Quiz not found"
          });
        }

        if (
          role !== "student" &&
          !canManageSchool(
            req.user,
            quiz.schoolId
          )
        ) {
          return res.status(403).json({
            message:
              "Not allowed to view quiz submissions"
          });
        }

        query.quizId =
          quizId;
      }

      /*
        Students can only view their own submissions.
      */
      if (role === "student") {
        query.studentId =
          req.user._id;
      } else if (studentId) {
        query.studentId =
          studentId;
      }

      if (
        role !== "student" &&
        !classId &&
        !quizId
      ) {
        const schoolIds =
          getUserSchoolIds(
            req.user
          );

        if (
          role !== "admin"
        ) {
          query.schoolId = {
            $in: schoolIds
          };
        }
      }

      const submissions =
        await QuizSubmission.find(
          query
        )
          .populate(
            "quizId",
            "title passingScore attemptsAllowed status"
          )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "studentId",
            "name email profileImage avatar course"
          )
          .sort({
            submittedAt: -1,
            createdAt: -1
          })
          .lean();

      return res.json(
        submissions
      );
    } catch (err) {
      console.error(
        "GET quiz submissions error:",
        err
      );

      return res.status(500).json({
        message:
          "Failed to load quiz submissions"
      });
    }
  }
);


/* ============================================
   SUBMIT QUIZ
   POST /api/quizzes/:id/submit
============================================ */

router.post(
  "/:id/submit",
  auth,
  async (req, res) => {
    try {
      const role =
        normalizeRole(
          req.user.role
        );

      if (role !== "student") {
        return res.status(403).json({
          message:
            "Only students can submit quizzes"
        });
      }

      const quiz =
        await Quiz.findById(
          req.params.id
        );

      if (!quiz) {
        return res.status(404).json({
          message: "Quiz not found"
        });
      }

      if (
        quiz.status !==
        "published"
      ) {
        return res.status(403).json({
          message:
            "This quiz is not available"
        });
      }

      const classDoc =
        await Class.findById(
          quiz.classId
        ).select(
          "schoolId studentIds"
        );

      if (!classDoc) {
        return res.status(404).json({
          message: "Class not found"
        });
      }

      if (
        !isStudentEnrolled(
          req.user,
          classDoc
        )
      ) {
        return res.status(403).json({
          message:
            "You are not enrolled in this class"
        });
      }

      const previousAttemptCount =
        await QuizSubmission.countDocuments({
          quizId: quiz._id,
          studentId: req.user._id
        });

      const attemptsAllowed =
        Math.max(
          1,
          Number(
            quiz.attemptsAllowed ||
            1
          )
        );

      if (
        previousAttemptCount >=
        attemptsAllowed
      ) {
        return res.status(403).json({
          message:
            "You have used all allowed attempts for this quiz"
        });
      }

      const submittedAnswers =
        Array.isArray(
          req.body.answers
        )
          ? req.body.answers
          : [];

      let totalPoints = 0;
      let score = 0;

      const gradedAnswers =
        quiz.questions.map(
          question => {
            const submitted =
              submittedAnswers.find(
                answer =>
                  normalizeObjectId(
                    answer.questionId
                  ) ===
                  normalizeObjectId(
                    question._id
                  )
              );

            const points =
              Math.max(
                0,
                Number(
                  question.points ||
                  1
                )
              );

            totalPoints +=
              points;

            const submittedAnswer =
              String(
                submitted?.answer ||
                ""
              ).trim();

            const isCorrect =
              gradeQuestion(
                question,
                submittedAnswer
              );

            const pointsEarned =
              isCorrect
                ? points
                : 0;

            score +=
              pointsEarned;

            return {
              questionId:
                question._id,

              answer:
                submittedAnswer,

              isCorrect,

              pointsEarned,

              pointsPossible:
                points
            };
          }
        );

      const percentage =
        totalPoints
          ? Math.round(
              score /
              totalPoints *
              100
            )
          : 0;

      const attemptNumber =
        previousAttemptCount +
        1;

      const timeSpentSeconds =
        Math.max(
          0,
          Number(
            req.body.timeSpentSeconds ||
            0
          )
        );

      const submission =
        await QuizSubmission.create({
          schoolId:
            quiz.schoolId,

          classId:
            quiz.classId,

          quizId:
            quiz._id,

          studentId:
            req.user._id,

          attemptNumber,

          answers:
            gradedAnswers,

          score,

          totalPoints,

          percentage,

          passed:
            percentage >=
            Number(
              quiz.passingScore ||
              70
            ),

          status:
            "submitted",

          startedAt:
            req.body.startedAt ||
            null,

          submittedAt:
            new Date(),

          timeSpentSeconds
        });

      const populated =
        await QuizSubmission.findById(
          submission._id
        )
          .populate(
            "quizId",
            "title passingScore attemptsAllowed status"
          )
          .populate(
            "classId",
            "title subject classCode"
          )
          .populate(
            "studentId",
            "name email profileImage avatar course"
          );

      const io =
        req.app.get("io");

      if (io) {
        io
          .to(
            String(
              quiz.schoolId
            )
          )
          .emit(
            "quiz:submitted",
            populated
          );

        io
          .to(
            String(
              req.user._id
            )
          )
          .emit(
            "quiz:submitted",
            populated
          );
      }

      return res.status(201).json(
        populated
      );
    } catch (err) {
      console.error(
        "POST quiz submit error:",
        err
      );

      if (
        err?.code === 11000
      ) {
        return res.status(409).json({
          message:
            "This quiz attempt has already been recorded"
        });
      }

      return res.status(500).json({
        message:
          "Failed to submit quiz"
      });
    }
  }
);


module.exports = router;
