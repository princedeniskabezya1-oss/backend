"use strict";

const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const QuestionBank = require("../models/QuestionBank");


/* =========================================================
   QUESTION BANK
   PRODUCTION SECURITY REPLACEMENT

   SECURITY MODEL
   ---------------------------------------------------------
   ADMIN
   - May read/manage questions across schools.
   - schoolId may be supplied when creating.

   SCHOOL
   - May read/manage all questions belonging to itself.
   - Cannot operate on another school's questions.

   TEACHER
   - May read questions belonging to the school they are
     actually linked to.
   - May create questions for that school.
   - May update/delete only questions they created.

   CLIENT MUST NOT CONTROL
   ---------------------------------------------------------
   - createdBy
   - another user's school scope
========================================================= */


/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value) {

  const role =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  const aliases = {

    instructor:
      "teacher",

    faculty:
      "teacher",

    administrator:
      "admin"

  };


  return (
    aliases[role] ||
    role
  );

}


/* =========================================================
   ID NORMALIZATION
========================================================= */

function normalizeId(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  if (
    typeof value ===
    "string"
  ) {

    return value.trim();

  }


  if (
    typeof value ===
    "number"
  ) {

    return String(
      value
    );

  }


  if (
    typeof value ===
      "object" &&
    value._id !==
      undefined
  ) {

    return normalizeId(
      value._id
    );

  }


  if (
    typeof value ===
      "object" &&
    value.id !==
      undefined
  ) {

    return normalizeId(
      value.id
    );

  }


  return String(
    value
  ).trim();

}


/* =========================================================
   ID COMPARISON
========================================================= */

function sameId(first, second) {

  const firstId =
    normalizeId(
      first
    );

  const secondId =
    normalizeId(
      second
    );


  return Boolean(
    firstId &&
    secondId &&
    firstId ===
      secondId
  );

}


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value,
  fallback = ""
) {

  if (
    value === null ||
    value === undefined
  ) {

    return fallback;

  }


  const normalized =
    String(
      value
    ).trim();


  return (
    normalized ||
    fallback
  );

}


/* =========================================================
   SAFE NUMBER
========================================================= */

function safeNumber(
  value,
  fallback = 0
) {

  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : fallback;

}


/* =========================================================
   PICK ALLOWED FIELDS
========================================================= */

function pick(
  obj,
  fields
) {

  const out = {};


  fields.forEach(
    field => {

      if (
        obj[field] !==
        undefined
      ) {

        out[field] =
          obj[field];

      }

    }
  );


  return out;

}


/* =========================================================
   VALID OBJECT ID
========================================================= */

function isValidObjectId(value) {

  return mongoose.Types.ObjectId
    .isValid(
      normalizeId(
        value
      )
    );

}


/* =========================================================
   USER SCHOOL IDS

   Supports the school relationships already used elsewhere
   in AIFT:
     school account -> own _id
     teacher -> schoolId / linkedSchoolId

   Both may exist during migration, so return all valid
   authorized IDs rather than guessing which field is newer.
========================================================= */

function getUserSchoolIds(user) {

  if (
    !user
  ) {

    return [];

  }


  const role =
    normalizeRole(
      user.role
    );


  const ids =
    new Set();


  if (
    role ===
    "school"
  ) {

    const ownId =
      normalizeId(
        user._id
      );


    if (
      ownId
    ) {

      ids.add(
        ownId
      );

    }

  }


  [
    user.schoolId,
    user.linkedSchoolId
  ]
    .forEach(
      value => {

        const id =
          normalizeId(
            value
          );


        if (
          id
        ) {

          ids.add(
            id
          );

        }

      }
    );


  return Array.from(
    ids
  );

}


/* =========================================================
   SCHOOL ACCESS

   Admin is unrestricted.

   School/teacher access is limited to a school ID actually
   associated with their authenticated account.
========================================================= */

function canAccessSchool(
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


  if (
    role ===
    "admin"
  ) {

    return true;

  }


  return getUserSchoolIds(
    user
  )
    .some(
      id =>
        sameId(
          id,
          schoolId
        )
    );

}


/* =========================================================
   QUESTION READ ACCESS
========================================================= */

function canReadQuestion(
  user,
  question
) {

  if (
    !user ||
    !question
  ) {

    return false;

  }


  const role =
    normalizeRole(
      user.role
    );


  /* =====================================================
     ADMIN
  ===================================================== */

  if (
    role ===
    "admin"
  ) {

    return true;

  }


  /* =====================================================
     MUST BELONG TO QUESTION'S SCHOOL
  ===================================================== */

  if (
    !canAccessSchool(
      user,
      question.schoolId
    )
  ) {

    return false;

  }


  /* =====================================================
     SCHOOL
  ===================================================== */

  if (
    role ===
    "school"
  ) {

    return true;

  }


  /* =====================================================
     TEACHER
  ===================================================== */

  if (
    role ===
    "teacher"
  ) {

    return sameId(
      question.createdBy,
      user._id
    );

  }


  return false;

}


/* =========================================================
   QUESTION WRITE ACCESS

   ADMIN:
     any question.

   SCHOOL:
     any question inside its own school.

   TEACHER:
     questions inside their school, but only when the teacher
     created that question.

   This prevents one teacher from silently modifying another
   teacher's reusable assessment content.
========================================================= */

function canManageQuestion(
  user,
  question
) {

  if (
    !user ||
    !question
  ) {

    return false;

  }


  const role =
    normalizeRole(
      user.role
    );


  if (
    role ===
    "admin"
  ) {

    return true;

  }


  if (
    !canAccessSchool(
      user,
      question.schoolId
    )
  ) {

    return false;

  }


  if (
    role ===
    "school"
  ) {

    return true;

  }


  if (
    role ===
    "teacher"
  ) {

    return sameId(
      question.createdBy,
      user._id
    );

  }


  return false;

}


/* =========================================================
   RESOLVE CREATE SCHOOL ID

   Teachers/schools do not get to choose arbitrary ownership.

   ADMIN:
     schoolId must be supplied.

   SCHOOL:
     own authenticated account ID.

   TEACHER:
     authenticated linked school.

   If a teacher is linked to multiple schools and the request
   includes schoolId, it must be one of those authorized IDs.
========================================================= */

function resolveCreateSchoolId(
  user,
  requestedSchoolId
) {

  const role =
    normalizeRole(
      user?.role
    );


  if (
    role ===
    "admin"
  ) {

    const schoolId =
      normalizeId(
        requestedSchoolId
      );


    return schoolId;

  }


  const authorizedSchoolIds =
    getUserSchoolIds(
      user
    );


  if (
    !authorizedSchoolIds.length
  ) {

    return "";

  }


  const requested =
    normalizeId(
      requestedSchoolId
    );


  if (
    requested
  ) {

    const matched =
      authorizedSchoolIds
        .find(
          schoolId =>
            sameId(
              schoolId,
              requested
            )
        );


    return (
      matched ||
      ""
    );

  }


  /*
    A normal teacher currently belongs to one school.

    If only one authorized school exists, deriving it is
    unambiguous.
  */

  if (
    authorizedSchoolIds.length ===
    1
  ) {

    return authorizedSchoolIds[0];

  }


  return "";

}


/* =========================================================
   NORMALIZE ARRAY
========================================================= */

function normalizeArray(value) {

  return Array.isArray(
    value
  )
    ? value
    : [];

}


/* =========================================================
   NORMALIZE POINTS
========================================================= */

function normalizeQuestionPoints(value) {

  return Math.max(
    0,
    safeNumber(
      value,
      1
    )
  );

}


/* =========================================================
   SUPPORTED QUESTION TYPES
========================================================= */

const QUESTION_TYPES =
  new Set([
    "multiple_choice",
    "true_false",
    "short_answer",
    "essay"
  ]);


/* =========================================================
   SUPPORTED DIFFICULTIES
========================================================= */

const QUESTION_DIFFICULTIES =
  new Set([
    "easy",
    "medium",
    "hard"
  ]);


/* =========================================================
   SUPPORTED BLOOM LEVELS
========================================================= */

const QUESTION_BLOOM_LEVELS =
  new Set([
    "remember",
    "understand",
    "apply",
    "analyze",
    "evaluate",
    "create"
  ]);


/* =========================================================
   NORMALIZE QUESTION TYPE
========================================================= */

function normalizeQuestionType(
  value,
  fallback =
    "multiple_choice"
) {

  const type =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_TYPES
    .has(
      type
    )
      ? type
      : fallback;

}


/* =========================================================
   NORMALIZE DIFFICULTY
========================================================= */

function normalizeQuestionDifficulty(
  value,
  fallback =
    "medium"
) {

  const difficulty =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_DIFFICULTIES
    .has(
      difficulty
    )
      ? difficulty
      : fallback;

}


/* =========================================================
   NORMALIZE BLOOM LEVEL
========================================================= */

function normalizeQuestionBloom(
  value,
  fallback =
    "remember"
) {

  const bloom =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_BLOOM_LEVELS
    .has(
      bloom
    )
      ? bloom
      : fallback;

}


/* =========================================================
   GET /api/question-bank

   ACCESS MODEL
   ---------------------------------------------------------

   ADMIN
     May view Question Bank items across all schools.
     Optional schoolId filters the result.

   SCHOOL
     May view every Question Bank item belonging to itself,
     including questions created by all teachers in that School.

   TEACHER
     May view ONLY questions created by that authenticated
     teacher, and only inside a School the teacher is actually
     linked to.

   IMPORTANT
   ---------------------------------------------------------

   The browser cannot widen teacher scope by changing:

     schoolId
     createdBy
     teacherId

   Teacher ownership always comes from req.user._id.
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const {
        schoolId,
        category,
        difficulty,
        type,
        search,
        archived
      } =
        req.query;


      const role =
        normalizeRole(
          req.user.role
        );


      const query =
        {};


      /* =====================================================
         ADMIN
      ===================================================== */

      if (
        role ===
        "admin"
      ) {

        if (
          schoolId
        ) {

          if (
            !isValidObjectId(
              schoolId
            )
          ) {

            return res
              .status(400)
              .json({
                message:
                  "Invalid schoolId"
              });

          }


          query.schoolId =
            schoolId;

        }

      }


      /* =====================================================
         SCHOOL
      ===================================================== */

      else if (
        role ===
        "school"
      ) {

        query.schoolId =
          req.user._id;

      }


      /* =====================================================
         TEACHER
      ===================================================== */

      else if (
        role ===
        "teacher"
      ) {

        const userSchoolIds =
          getUserSchoolIds(
            req.user
          );


        if (
          !userSchoolIds.length
        ) {

          return res
            .status(403)
            .json({
              message:
                "Your teacher account is not linked to a school"
            });

        }


        /*
          Teacher ownership is authoritative.

          Never accept createdBy from req.query.
        */

        query.createdBy =
          req.user._id;


        if (
          schoolId
        ) {

          if (
            !canAccessSchool(
              req.user,
              schoolId
            )
          ) {

            return res
              .status(403)
              .json({
                message:
                  "Not allowed to access this school's question bank"
              });

          }


          query.schoolId =
            schoolId;

        } else {

          query.schoolId = {
            $in:
              userSchoolIds
          };

        }

      }


      /* =====================================================
         OTHER ROLES
      ===================================================== */

      else {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to access Question Bank"
          });

      }


      /* =====================================================
         CATEGORY
      ===================================================== */

      if (
        category
      ) {

        query.category =
          String(
            category
          );

      }


      /* =====================================================
         DIFFICULTY
      ===================================================== */

      if (
        difficulty
      ) {

        query.difficulty =
          normalizeQuestionDifficulty(
            difficulty
          );

      }


      /* =====================================================
         TYPE
      ===================================================== */

      if (
        type
      ) {

        query.type =
          normalizeQuestionType(
            type
          );

      }


      /* =====================================================
         ARCHIVED
      ===================================================== */

      if (
        archived !==
        undefined
      ) {

        query.archived =
          String(
            archived
          ).toLowerCase() ===
          "true";

      }


      /* =====================================================
         SEARCH
      ===================================================== */

      if (
        search
      ) {

        const searchValue =
          safeString(
            search
          );


        if (
          searchValue
        ) {

          query.$or = [

            {
              title:{
                $regex:
                  searchValue,

                $options:
                  "i"
              }
            },

            {
              question:{
                $regex:
                  searchValue,

                $options:
                  "i"
              }
            },

            {
              tags:{
                $regex:
                  searchValue,

                $options:
                  "i"
              }
            }

          ];

        }

      }


      const questions =
        await QuestionBank
          .find(
            query
          )
          .sort({
            updatedAt:
              -1
          })
          .lean();


      return res.json(
        questions
      );

    } catch (
      err
    ) {

      console.error(
        "GET question bank error:",
        err
      );


      return res
        .status(500)
        .json({
          message:
            "Failed to load question bank"
        });

    }

  }
);


/* =========================================================
   GET /api/question-bank/:id
========================================================= */

router.get(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(
            400
          )
          .json({
            message:
              "Invalid question ID"
          });

      }


      const question =
        await QuestionBank
          .findById(
            req.params.id
          )
          .lean();


      if (
        !question
      ) {

        return res
          .status(
            404
          )
          .json({
            message:
              "Question not found"
          });

      }


      if (
        !canReadQuestion(
          req.user,
          question
        )
      ) {

        return res
          .status(
            403
          )
          .json({
            message:
              "Not allowed to view this question"
          });

      }


      return res.json(
        question
      );

    } catch (
      err
    ) {

      console.error(
        "GET question error:",
        err
      );


      return res
        .status(
          500
        )
        .json({
          message:
            "Failed to load question"
        });

    }

  }
);


/* =========================================================
   POST /api/question-bank

   OWNERSHIP
   ---------------------------------------------------------

   createdBy ALWAYS comes from req.user._id.

   The browser cannot assign ownership.

   ADMIN
     May create for an authorized supplied School.

   SCHOOL
     Creates for itself.

   TEACHER
     Creates only inside a School actually linked to the
     authenticated teacher.
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try {

      /* =====================================================
         BASIC INPUT
      ===================================================== */

      const title =
        safeString(
          req.body.title
        );


      const questionText =
        safeString(
          req.body.question
        );


      if (
        !title ||
        !questionText
      ) {

        return res
          .status(400)
          .json({
            message:
              "title and question are required"
          });

      }


      /* =====================================================
         SCHOOL
      ===================================================== */

      const schoolId =
        resolveCreateSchoolId(
          req.user,
          req.body.schoolId
        );


      if (
        !schoolId
      ) {

        return res
          .status(403)
          .json({
            message:
              "A valid authorized school is required"
          });

      }


      if (
        !isValidObjectId(
          schoolId
        )
      ) {

        return res
          .status(400)
          .json({
            message:
              "Invalid schoolId"
          });

      }


      if (
        !canAccessSchool(
          req.user,
          schoolId
        )
      ) {

        return res
          .status(403)
          .json({
            message:
              "Not allowed to create questions for this school"
          });

      }


      /* =====================================================
         OPTIONS

         Normalize the Class Builder option format before
         sending it into Mongoose.

         Browser format:
           {
             id,
             text,
             isCorrect
           }

         Database format:
           {
             text,
             isCorrect
           }

         Local UI IDs must never become ownership/database
         identifiers.
      ===================================================== */

      const options =
        normalizeArray(
          req.body.options
        )
          .map(
            option => {

              /*
                Legacy string option support.
              */

              if (
                typeof option ===
                "string"
              ) {

                return {
                  text:
                    safeString(
                      option
                    ),

                  isCorrect:
                    false
                };

              }


              return {

                text:
                  safeString(
                    option?.text
                  ),

                isCorrect:
                  Boolean(
                    option?.isCorrect
                  )

              };

            }
          )
          .filter(
            option =>
              Boolean(
                option.text
              )
          );


      const type =
        normalizeQuestionType(
          req.body.type
        );


      /* =====================================================
         MULTIPLE-CHOICE VALIDATION
      ===================================================== */

      if (
        type ===
        "multiple_choice"
      ) {

        if (
          options.length <
          2
        ) {

          return res
            .status(400)
            .json({
              message:
                "Multiple-choice questions require at least two options"
            });

        }


        if (
          !options.some(
            option =>
              option.isCorrect ===
              true
          )
        ) {

          return res
            .status(400)
            .json({
              message:
                "Select the correct answer before saving the question"
            });

        }

      }


      /* =====================================================
         CREATE
      ===================================================== */

      const item =
        await QuestionBank.create({

          schoolId,

          /*
            Authoritative authenticated ownership.
          */

          createdBy:
            req.user._id,

          title,

          question:
            questionText,

          type,

          options,

          explanation:
            safeString(
              req.body.explanation
            ),

          points:
            normalizeQuestionPoints(
              req.body.points
            ),

          difficulty:
            normalizeQuestionDifficulty(
              req.body.difficulty
            ),

          bloom:
            normalizeQuestionBloom(
              req.body.bloom
            ),

          category:
            safeString(
              req.body.category,
              "General"
            ),

          tags:
            normalizeArray(
              req.body.tags
            )
              .map(
                tag =>
                  safeString(
                    tag
                  )
              )
              .filter(
                Boolean
              ),

          attachments:
            normalizeArray(
              req.body.attachments
            ),

          aiGenerated:
            Boolean(
              req.body.aiGenerated
            ),

          archived:
            false

        });


      return res
        .status(201)
        .json(
          item
        );

    } catch (
      err
    ) {

      /*
        Keep the complete error in Render logs.
      */

      console.error(
        "POST /api/question-bank error:",
        {
          name:
            err?.name,

          code:
            err?.code,

          message:
            err?.message,

          errors:
            err?.errors,

          stack:
            err?.stack
        }
      );


      /* =====================================================
         MONGOOSE VALIDATION
      ===================================================== */

      if (
        err?.name ===
        "ValidationError"
      ) {

        const firstError =
          Object.values(
            err.errors ||
            {}
          )[0];


        return res
          .status(400)
          .json({
            message:
              firstError?.message ||
              err.message ||
              "Question validation failed"
          });

      }


      /* =====================================================
         CAST ERROR
      ===================================================== */

      if (
        err?.name ===
        "CastError"
      ) {

        return res
          .status(400)
          .json({
            message:
              `Invalid ${err.path || "question"} value`
          });

      }


      /* =====================================================
         DUPLICATE INDEX
      ===================================================== */

      if (
        err?.code ===
        11000
      ) {

        return res
          .status(409)
          .json({
            message:
              "A Question Bank item with this unique value already exists"
          });

      }


      /* =====================================================
         UNKNOWN SERVER ERROR
      ===================================================== */

      return res
        .status(500)
        .json({
          message:
            "Failed to create question"
        });

    }

  }
);

/* =========================================================
   PATCH /api/question-bank/:id

   schoolId and createdBy cannot be modified here.
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(
            400
          )
          .json({
            message:
              "Invalid question ID"
          });

      }


      const question =
        await QuestionBank
          .findById(
            req.params.id
          );


      if (
        !question
      ) {

        return res
          .status(
            404
          )
          .json({
            message:
              "Question not found"
          });

      }


      if (
        !canManageQuestion(
          req.user,
          question
        )
      ) {

        return res
          .status(
            403
          )
          .json({
            message:
              "Not allowed to update this question"
          });

      }


      const updates =
        pick(
          req.body,
          [
            "title",
            "question",
            "type",
            "options",
            "explanation",
            "points",
            "difficulty",
            "bloom",
            "category",
            "tags",
            "attachments",
            "archived"
          ]
        );


      /* ---------------------------------------------------
         FIELD NORMALIZATION
      --------------------------------------------------- */

      if (
        updates.title !==
        undefined
      ) {

        updates.title =
          safeString(
            updates.title
          );


        if (
          !updates.title
        ) {

          return res
            .status(
              400
            )
            .json({
              message:
                "Question title cannot be empty"
            });

        }

      }


      if (
        updates.question !==
        undefined
      ) {

        updates.question =
          safeString(
            updates.question
          );


        if (
          !updates.question
        ) {

          return res
            .status(
              400
            )
            .json({
              message:
                "Question text cannot be empty"
            });

        }

      }


      if (
        updates.type !==
        undefined
      ) {

        updates.type =
          normalizeQuestionType(
            updates.type,
            question.type ||
            "multiple_choice"
          );

      }


      if (
        updates.options !==
        undefined
      ) {

        updates.options =
          normalizeArray(
            updates.options
          );

      }


      if (
        updates.explanation !==
        undefined
      ) {

        updates.explanation =
          safeString(
            updates.explanation
          );

      }


      if (
        updates.points !==
        undefined
      ) {

        updates.points =
          normalizeQuestionPoints(
            updates.points
          );

      }


      if (
        updates.difficulty !==
        undefined
      ) {

        updates.difficulty =
          normalizeQuestionDifficulty(
            updates.difficulty,
            question.difficulty ||
            "medium"
          );

      }


      if (
        updates.bloom !==
        undefined
      ) {

        updates.bloom =
          normalizeQuestionBloom(
            updates.bloom,
            question.bloom ||
            "remember"
          );

      }


      if (
        updates.category !==
        undefined
      ) {

        updates.category =
          safeString(
            updates.category,
            "General"
          );

      }


      if (
        updates.tags !==
        undefined
      ) {

        updates.tags =
          normalizeArray(
            updates.tags
          );

      }


      if (
        updates.attachments !==
        undefined
      ) {

        updates.attachments =
          normalizeArray(
            updates.attachments
          );

      }


      if (
        updates.archived !==
        undefined
      ) {

        updates.archived =
          Boolean(
            updates.archived
          );

      }


      Object.entries(
        updates
      )
        .forEach(
          ([
            field,
            value
          ]) => {

            question[field] =
              value;

          }
        );


      /*
        If the schema uses timestamps:true, Mongoose maintains
        updatedAt automatically.

        Setting it explicitly also keeps compatibility with
        the existing model if timestamps are manually defined.
      */

      question.updatedAt =
        new Date();


      await question.save();


      return res.json(
        question
      );

} catch (
  err
) {

  /* =====================================================
     FULL SERVER DIAGNOSTIC

     This appears in Render logs.
  ===================================================== */

  console.error(
    "POST /api/question-bank error:",
    {

      name:
        err?.name,

      code:
        err?.code,

      message:
        err?.message,

      path:
        err?.path,

      value:
        err?.value,

      keyPattern:
        err?.keyPattern,

      keyValue:
        err?.keyValue,

      errors:
        err?.errors,

      stack:
        err?.stack

    }
  );


  /* =====================================================
     VALIDATION
  ===================================================== */

  if (
    err?.name ===
    "ValidationError"
  ) {

    const firstError =
      Object.values(
        err.errors ||
        {}
      )[0];


    return res
      .status(400)
      .json({

        message:
          firstError?.message ||
          err.message ||
          "Question validation failed",

        errorType:
          "validation"

      });

  }


  /* =====================================================
     INVALID OBJECT ID / CAST
  ===================================================== */

  if (
    err?.name ===
    "CastError"
  ) {

    return res
      .status(400)
      .json({

        message:
          `Invalid ${
            err?.path ||
            "question"
          } value`,

        errorType:
          "cast"

      });

  }


  /* =====================================================
     MONGODB DUPLICATE INDEX

     Important during schema migrations because an obsolete
     unique index can remain in Atlas even when it no longer
     exists in the Mongoose schema.
  ===================================================== */

  if (
    Number(
      err?.code
    ) ===
    11000
  ) {

    const duplicateField =
      Object.keys(
        err?.keyPattern ||
        err?.keyValue ||
        {}
      )[0] ||
      "unknown";


    return res
      .status(409)
      .json({

        message:
          `Question could not be created because of a duplicate database index on "${duplicateField}".`,

        errorType:
          "duplicate_index",

        field:
          duplicateField

      });

  }


  /* =====================================================
     MONGODB SERVER ERROR
  ===================================================== */

  if (
    err?.name ===
      "MongoServerError" ||
    err?.name ===
      "MongoError"
  ) {

    return res
      .status(500)
      .json({

        message:
          err?.message ||
          "MongoDB failed while creating the question.",

        errorType:
          "database"

      });

  }


  /* =====================================================
     UNKNOWN ERROR
  ===================================================== */

  return res
    .status(500)
    .json({

      message:
        err?.message ||
        "Failed to create question",

      errorType:
        "server"

    });

}

  }
);


/* =========================================================
   DELETE /api/question-bank/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try {

      if (
        !isValidObjectId(
          req.params.id
        )
      ) {

        return res
          .status(
            400
          )
          .json({
            message:
              "Invalid question ID"
          });

      }


      const question =
        await QuestionBank
          .findById(
            req.params.id
          );


      if (
        !question
      ) {

        return res
          .status(
            404
          )
          .json({
            message:
              "Question not found"
          });

      }


      if (
        !canManageQuestion(
          req.user,
          question
        )
      ) {

        return res
          .status(
            403
          )
          .json({
            message:
              "Not allowed to delete this question"
          });

      }


      await question.deleteOne();


      return res.json({
        message:
          "Question deleted",

        questionId:
          normalizeId(
            question._id
          )
      });

    } catch (
      err
    ) {

      console.error(
        "DELETE question error:",
        err
      );


      return res
        .status(
          500
        )
        .json({
          message:
            "Failed to delete question"
        });

    }

  }
);


module.exports = router;
