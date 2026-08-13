"use strict";

const express =
  require("express");

const mongoose =
  require("mongoose");

const auth =
  require("../middleware/auth");

const QuestionBank =
  require("../models/QuestionBank");


const router =
  express.Router();


/* =========================================================
   QUESTION BANK
   PRODUCTION ROUTE

   ACCESS MODEL
   ---------------------------------------------------------

   ADMIN
   - Can read all Question Bank items.
   - Can create for any valid School.
   - Can edit/delete any Question Bank item.

   SCHOOL
   - Can read every Question Bank item belonging to itself.
   - Can create for itself.
   - Can edit/delete every Question Bank item belonging to it.

   TEACHER
   - Can read only questions they personally created.
   - Can create only inside a School linked to their account.
   - Can edit/delete only questions they personally created.

   IMPORTANT
   ---------------------------------------------------------

   The client NEVER controls:
   - createdBy
   - arbitrary School ownership

   createdBy always comes from req.user._id.
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const QUESTION_TYPES =
  new Set([
    "multiple_choice",
    "checkbox",
    "true_false",
    "essay",
    "short_answer",
    "matching",
    "ordering",
    "fill_blank",
    "coding"
  ]);


const QUESTION_DIFFICULTIES =
  new Set([
    "easy",
    "medium",
    "hard"
  ]);


const QUESTION_BLOOM_LEVELS =
  new Set([
    "remember",
    "understand",
    "apply",
    "analyze",
    "evaluate",
    "create"
  ]);


const ATTACHMENT_TYPES =
  new Set([
    "image",
    "video",
    "audio",
    "file"
  ]);


/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(
  value
){

  const role =
    String(
      value ||
      ""
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
    aliases[
      role
    ] ||
    role
  );

}


/* =========================================================
   ID NORMALIZATION
========================================================= */

function normalizeId(
  value
){

  if(
    value === null ||
    value === undefined
  ){

    return "";

  }


  if(
    typeof value ===
    "string"
  ){

    return value.trim();

  }


  if(
    typeof value ===
    "number"
  ){

    return String(
      value
    );

  }


  if(
    typeof value ===
      "object" &&
    value._id !==
      undefined
  ){

    return normalizeId(
      value._id
    );

  }


  if(
    typeof value ===
      "object" &&
    value.id !==
      undefined
  ){

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

function sameId(
  first,
  second
){

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
   OBJECT ID VALIDATION
========================================================= */

function isValidObjectId(
  value
){

  const id =
    normalizeId(
      value
    );


  return Boolean(
    id &&
    mongoose.Types.ObjectId
      .isValid(
        id
      )
  );

}


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value,
  fallback = ""
){

  if(
    value === null ||
    value === undefined
  ){

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
){

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
   SAFE BOOLEAN
========================================================= */

function safeBoolean(
  value,
  fallback = false
){

  if(
    typeof value ===
    "boolean"
  ){

    return value;

  }


  if(
    typeof value ===
    "string"
  ){

    const normalized =
      value
        .trim()
        .toLowerCase();


    if(
      normalized ===
        "true"
    ){

      return true;

    }


    if(
      normalized ===
        "false"
    ){

      return false;

    }

  }


  if(
    value ===
    1
  ){

    return true;

  }


  if(
    value ===
    0
  ){

    return false;

  }


  return fallback;

}


/* =========================================================
   SAFE ARRAY
========================================================= */

function normalizeArray(
  value
){

  return Array.isArray(
    value
  )
    ? value
    : [];

}


/* =========================================================
   ESCAPE REGEX
========================================================= */

function escapeRegex(
  value
){

  return String(
    value ||
    ""
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

}


/* =========================================================
   USER SCHOOL IDS
========================================================= */

function getUserSchoolIds(
  user
){

  if(
    !user
  ){

    return [];

  }


  const role =
    normalizeRole(
      user.role
    );


  const ids =
    new Set();


  /*
    School account owns itself.
  */

  if(
    role ===
    "school"
  ){

    const ownId =
      normalizeId(
        user._id
      );


    if(
      ownId
    ){

      ids.add(
        ownId
      );

    }

  }


  /*
    Teacher migration compatibility.
  */

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


        if(
          id
        ){

          ids.add(
            id
          );

        }

      }
    );


  /*
    Optional multi-school compatibility.
  */

  if(
    Array.isArray(
      user.schoolIds
    )
  ){

    user.schoolIds
      .forEach(
        value => {

          const id =
            normalizeId(
              value
            );


          if(
            id
          ){

            ids.add(
              id
            );

          }

        }
      );

  }


  return Array.from(
    ids
  );

}


/* =========================================================
   SCHOOL ACCESS
========================================================= */

function canAccessSchool(
  user,
  schoolId
){

  if(
    !user ||
    !schoolId
  ){

    return false;

  }


  const role =
    normalizeRole(
      user.role
    );


  if(
    role ===
    "admin"
  ){

    return true;

  }


  return getUserSchoolIds(
    user
  )
    .some(
      authorizedSchoolId =>
        sameId(
          authorizedSchoolId,
          schoolId
        )
    );

}


/* =========================================================
   READ ACCESS
========================================================= */

function canReadQuestion(
  user,
  question
){

  if(
    !user ||
    !question
  ){

    return false;

  }


  const role =
    normalizeRole(
      user.role
    );


  /* =====================================================
     ADMIN
  ===================================================== */

  if(
    role ===
    "admin"
  ){

    return true;

  }


  /* =====================================================
     SCHOOL BOUNDARY
  ===================================================== */

  if(
    !canAccessSchool(
      user,
      question.schoolId
    )
  ){

    return false;

  }


  /* =====================================================
     SCHOOL
  ===================================================== */

  if(
    role ===
    "school"
  ){

    return true;

  }


  /* =====================================================
     TEACHER

     Teachers only read their own reusable questions.
  ===================================================== */

  if(
    role ===
    "teacher"
  ){

    return sameId(
      question.createdBy,
      user._id
    );

  }


  return false;

}


/* =========================================================
   WRITE ACCESS
========================================================= */

function canManageQuestion(
  user,
  question
){

  if(
    !user ||
    !question
  ){

    return false;

  }


  const role =
    normalizeRole(
      user.role
    );


  if(
    role ===
    "admin"
  ){

    return true;

  }


  if(
    !canAccessSchool(
      user,
      question.schoolId
    )
  ){

    return false;

  }


  if(
    role ===
    "school"
  ){

    return true;

  }


  if(
    role ===
    "teacher"
  ){

    return sameId(
      question.createdBy,
      user._id
    );

  }


  return false;

}


/* =========================================================
   RESOLVE SCHOOL FOR CREATE
========================================================= */

function resolveCreateSchoolId(
  user,
  requestedSchoolId
){

  if(
    !user
  ){

    return "";

  }


  const role =
    normalizeRole(
      user.role
    );


  /* =====================================================
     ADMIN

     Admin must explicitly specify a School.
  ===================================================== */

  if(
    role ===
    "admin"
  ){

    const schoolId =
      normalizeId(
        requestedSchoolId
      );


    return isValidObjectId(
      schoolId
    )
      ? schoolId
      : "";

  }


  /* =====================================================
     SCHOOL

     School always creates under itself.
  ===================================================== */

  if(
    role ===
    "school"
  ){

    return normalizeId(
      user._id
    );

  }


  /* =====================================================
     TEACHER
  ===================================================== */

  if(
    role ===
    "teacher"
  ){

    const authorizedSchoolIds =
      getUserSchoolIds(
        user
      );


    if(
      !authorizedSchoolIds.length
    ){

      return "";

    }


    const requested =
      normalizeId(
        requestedSchoolId
      );


    /*
      If Class Builder supplied schoolId, validate it against
      the authenticated teacher's School relationships.
    */

    if(
      requested
    ){

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
      If the teacher belongs to exactly one School, deriving
      ownership is unambiguous.
    */

    if(
      authorizedSchoolIds.length ===
      1
    ){

      return authorizedSchoolIds[
        0
      ];

    }


    /*
      Multi-School teacher must identify which authorized
      School this reusable question belongs to.
    */

    return "";

  }


  return "";

}


/* =========================================================
   NORMALIZE QUESTION TYPE
========================================================= */

function normalizeQuestionType(
  value,
  fallback =
    "multiple_choice"
){

  const type =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_TYPES.has(
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
){

  const difficulty =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_DIFFICULTIES.has(
    difficulty
  )
    ? difficulty
    : fallback;

}


/* =========================================================
   NORMALIZE BLOOM
========================================================= */

function normalizeQuestionBloom(
  value,
  fallback =
    "remember"
){

  const bloom =
    safeString(
      value,
      fallback
    )
      .toLowerCase();


  return QUESTION_BLOOM_LEVELS.has(
    bloom
  )
    ? bloom
    : fallback;

}


/* =========================================================
   NORMALIZE POINTS
========================================================= */

function normalizeQuestionPoints(
  value,
  fallback = 1
){

  return Math.max(
    0,
    safeNumber(
      value,
      fallback
    )
  );

}


/* =========================================================
   NORMALIZE TAGS
========================================================= */

function normalizeQuestionTags(
  value
){

  return [
    ...new Set(
      normalizeArray(
        value
      )
        .map(
          item =>
            safeString(
              item
            )
        )
        .filter(
          Boolean
        )
    )
  ];

}


/* =========================================================
   NORMALIZE QUESTION OPTIONS

   Matches models/QuestionBank.js:

   {
     id:String,
     text:String,
     isCorrect:Boolean
   }
========================================================= */

function normalizeQuestionOptions(
  value
){

  return normalizeArray(
    value
  )
    .map(
      option => {

        /* =================================================
           LEGACY STRING SUPPORT
        ================================================= */

        if(
          typeof option ===
          "string"
        ){

          const text =
            safeString(
              option
            );


          if(
            !text
          ){

            return null;

          }


          return {

            id:
              new mongoose
                .Types
                .ObjectId()
                .toString(),

            text,

            isCorrect:
              false

          };

        }


        /* =================================================
           OBJECT OPTION
        ================================================= */

        const text =
          safeString(
            option?.text
          );


        if(
          !text
        ){

          return null;

        }


        return {

          id:
            safeString(
              option?.id
            ) ||
            new mongoose
              .Types
              .ObjectId()
              .toString(),

          text,

          isCorrect:
            safeBoolean(
              option?.isCorrect,
              false
            )

        };

      }
    )
    .filter(
      Boolean
    );

}


/* =========================================================
   NORMALIZE ATTACHMENTS

   Matches models/QuestionBank.js:

   {
     type:image|video|audio|file,
     url:String,
     name:String
   }
========================================================= */

function normalizeQuestionAttachments(
  value
){

  return normalizeArray(
    value
  )
    .map(
      attachment => {

        const type =
          safeString(
            attachment?.type
          )
            .toLowerCase();


        const url =
          safeString(
            attachment?.url
          );


        const name =
          safeString(
            attachment?.name
          );


        if(
          !ATTACHMENT_TYPES.has(
            type
          )
        ){

          return null;

        }


        /*
          Attachment schema allows empty url, but there is
          little value storing an entirely empty attachment.
        */

        if(
          !url &&
          !name
        ){

          return null;

        }


        return {

          type,

          url,

          name

        };

      }
    )
    .filter(
      Boolean
    );

}


/* =========================================================
   VALIDATE OPTIONS FOR QUESTION TYPE
========================================================= */

function validateQuestionOptions(
  type,
  options
){

  /* =====================================================
     MULTIPLE CHOICE
  ===================================================== */

  if(
    type ===
    "multiple_choice"
  ){

    if(
      options.length <
      2
    ){

      return {
        valid:
          false,

        message:
          "Multiple-choice questions require at least two answer options."
      };

    }


    const correctCount =
      options.filter(
        option =>
          option.isCorrect ===
          true
      ).length;


    if(
      correctCount !==
      1
    ){

      return {
        valid:
          false,

        message:
          "Multiple-choice questions require exactly one correct answer."
      };

    }

  }


  /* =====================================================
     CHECKBOX / MULTI-SELECT
  ===================================================== */

  if(
    type ===
    "checkbox"
  ){

    if(
      options.length <
      2
    ){

      return {
        valid:
          false,

        message:
          "Checkbox questions require at least two answer options."
      };

    }


    if(
      !options.some(
        option =>
          option.isCorrect ===
          true
      )
    ){

      return {
        valid:
          false,

        message:
          "Checkbox questions require at least one correct answer."
      };

    }

  }


  /* =====================================================
     TRUE / FALSE
  ===================================================== */

  if(
    type ===
    "true_false"
  ){

    if(
      options.length
    ){

      const correctCount =
        options.filter(
          option =>
            option.isCorrect ===
            true
        ).length;


      if(
        correctCount !==
        1
      ){

        return {
          valid:
            false,

          message:
            "True/False questions require exactly one correct answer."
        };

      }

    }

  }


  return {
    valid:
      true,

    message:
      ""
  };

}


/* =========================================================
   CREATE VERSION SNAPSHOT
========================================================= */

function appendQuestionVersion(
  question,
  userId
){

  if(
    !question
  ){

    return;

  }


  const versions =
    Array.isArray(
      question.versions
    )
      ? question.versions
      : [];


  const lastVersion =
    versions.length
      ? Math.max(
          ...versions
            .map(
              item =>
                safeNumber(
                  item?.version,
                  0
                )
            )
        )
      : 0;


  versions.push({

    version:
      lastVersion +
      1,

    updatedAt:
      new Date(),

    updatedBy:
      userId

  });


  /*
    Prevent unbounded metadata growth.
  */

  question.versions =
    versions.slice(
      -100
    );

}


/* =========================================================
   BUILD SAFE UPDATE OBJECT
========================================================= */

function buildQuestionUpdates(
  body,
  currentQuestion
){

  const updates =
    {};


  /* =====================================================
     TITLE
  ===================================================== */

  if(
    body.title !==
    undefined
  ){

    const title =
      safeString(
        body.title
      );


    if(
      !title
    ){

      const error =
        new Error(
          "Question title cannot be empty."
        );

      error.statusCode =
        400;

      throw error;

    }


    updates.title =
      title;

  }


  /* =====================================================
     QUESTION TEXT
  ===================================================== */

  if(
    body.question !==
    undefined
  ){

    const questionText =
      safeString(
        body.question
      );


    if(
      !questionText
    ){

      const error =
        new Error(
          "Question text cannot be empty."
        );

      error.statusCode =
        400;

      throw error;

    }


    updates.question =
      questionText;

  }


  /* =====================================================
     TYPE
  ===================================================== */

  if(
    body.type !==
    undefined
  ){

    updates.type =
      normalizeQuestionType(
        body.type,
        currentQuestion?.type ||
        "multiple_choice"
      );

  }


  /* =====================================================
     OPTIONS
  ===================================================== */

  if(
    body.options !==
    undefined
  ){

    updates.options =
      normalizeQuestionOptions(
        body.options
      );

  }


  /* =====================================================
     EXPLANATION
  ===================================================== */

  if(
    body.explanation !==
    undefined
  ){

    updates.explanation =
      safeString(
        body.explanation
      );

  }


  /* =====================================================
     POINTS
  ===================================================== */

  if(
    body.points !==
    undefined
  ){

    updates.points =
      normalizeQuestionPoints(
        body.points,
        currentQuestion?.points ||
        1
      );

  }


  /* =====================================================
     DIFFICULTY
  ===================================================== */

  if(
    body.difficulty !==
    undefined
  ){

    updates.difficulty =
      normalizeQuestionDifficulty(
        body.difficulty,
        currentQuestion?.difficulty ||
        "medium"
      );

  }


  /* =====================================================
     BLOOM
  ===================================================== */

  if(
    body.bloom !==
    undefined
  ){

    updates.bloom =
      normalizeQuestionBloom(
        body.bloom,
        currentQuestion?.bloom ||
        "remember"
      );

  }


  /* =====================================================
     CATEGORY
  ===================================================== */

  if(
    body.category !==
    undefined
  ){

    updates.category =
      safeString(
        body.category,
        "General"
      );

  }


  /* =====================================================
     TAGS
  ===================================================== */

  if(
    body.tags !==
    undefined
  ){

    updates.tags =
      normalizeQuestionTags(
        body.tags
      );

  }


  /* =====================================================
     ATTACHMENTS
  ===================================================== */

  if(
    body.attachments !==
    undefined
  ){

    updates.attachments =
      normalizeQuestionAttachments(
        body.attachments
      );

  }


  /* =====================================================
     AI GENERATED
  ===================================================== */

  if(
    body.aiGenerated !==
    undefined
  ){

    updates.aiGenerated =
      safeBoolean(
        body.aiGenerated,
        false
      );

  }


  /* =====================================================
     ARCHIVED
  ===================================================== */

  if(
    body.archived !==
    undefined
  ){

    updates.archived =
      safeBoolean(
        body.archived,
        false
      );

  }


  return updates;

}


/* =========================================================
   ERROR RESPONSE
========================================================= */

function sendQuestionBankError(
  res,
  err,
  context
){

  console.error(
    context,
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
     EXPLICIT HTTP ERROR
  ===================================================== */

  if(
    Number.isInteger(
      err?.statusCode
    )
  ){

    return res
      .status(
        err.statusCode
      )
      .json({

        message:
          err.message ||
          "Question Bank request failed"

      });

  }


  /* =====================================================
     VALIDATION
  ===================================================== */

  if(
    err?.name ===
    "ValidationError"
  ){

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
     CAST ERROR
  ===================================================== */

  if(
    err?.name ===
    "CastError"
  ){

    return res
      .status(400)
      .json({

        message:
          `Invalid ${
            err?.path ||
            "Question Bank"
          } value`,

        errorType:
          "cast"

      });

  }


  /* =====================================================
     DUPLICATE INDEX
  ===================================================== */

  if(
    Number(
      err?.code
    ) ===
    11000
  ){

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
          `A database uniqueness rule prevented this Question Bank operation on "${duplicateField}".`,

        errorType:
          "duplicate_index",

        field:
          duplicateField

      });

  }


  /* =====================================================
     DATABASE ERROR
  ===================================================== */

  if(
    err?.name ===
      "MongoServerError" ||
    err?.name ===
      "MongoError"
  ){

    return res
      .status(500)
      .json({

        message:
          err?.message ||
          "MongoDB failed while processing the Question Bank request.",

        errorType:
          "database"

      });

  }


  return res
    .status(500)
    .json({

      message:
        err?.message ||
        "Question Bank request failed",

      errorType:
        "server"

    });

}


/* =========================================================
   GET QUESTION BANK
   GET /api/question-bank
========================================================= */

router.get(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const role =
        normalizeRole(
          req.user.role
        );


      const query =
        {};


      /* =====================================================
         ADMIN
      ===================================================== */

      if(
        role ===
        "admin"
      ){

        if(
          req.query.schoolId
        ){

          if(
            !isValidObjectId(
              req.query.schoolId
            )
          ){

            return res
              .status(400)
              .json({
                message:
                  "Invalid schoolId"
              });

          }


          query.schoolId =
            normalizeId(
              req.query.schoolId
            );

        }


        /*
          Admin may optionally inspect one creator.
        */

        if(
          req.query.createdBy
        ){

          if(
            !isValidObjectId(
              req.query.createdBy
            )
          ){

            return res
              .status(400)
              .json({
                message:
                  "Invalid createdBy"
              });

          }


          query.createdBy =
            normalizeId(
              req.query.createdBy
            );

        }

      }


      /* =====================================================
         SCHOOL

         All questions belonging to the School.
      ===================================================== */

      else if(
        role ===
        "school"
      ){

        query.schoolId =
          req.user._id;

      }


      /* =====================================================
         TEACHER

         Only questions created by this teacher.
      ===================================================== */

      else if(
        role ===
        "teacher"
      ){

        const schoolIds =
          getUserSchoolIds(
            req.user
          );


        if(
          !schoolIds.length
        ){

          return res
            .status(403)
            .json({
              message:
                "Your teacher account is not linked to a School."
            });

        }


        query.createdBy =
          req.user._id;


        if(
          req.query.schoolId
        ){

          const requestedSchoolId =
            normalizeId(
              req.query.schoolId
            );


          if(
            !canAccessSchool(
              req.user,
              requestedSchoolId
            )
          ){

            return res
              .status(403)
              .json({
                message:
                  "Not allowed to access this School's Question Bank."
              });

          }


          query.schoolId =
            requestedSchoolId;

        }else{

          query.schoolId = {
            $in:
              schoolIds
          };

        }

      }


      /* =====================================================
         OTHER ROLES
      ===================================================== */

      else{

        return res
          .status(403)
          .json({
            message:
              "Not allowed to access Question Bank."
          });

      }


      /* =====================================================
         ARCHIVED
      ===================================================== */

      if(
        req.query.archived !==
        undefined
      ){

        query.archived =
          safeBoolean(
            req.query.archived,
            false
          );

      }


      /* =====================================================
         CATEGORY
      ===================================================== */

      if(
        req.query.category
      ){

        query.category =
          safeString(
            req.query.category
          );

      }


      /* =====================================================
         DIFFICULTY
      ===================================================== */

      if(
        req.query.difficulty
      ){

        const difficulty =
          safeString(
            req.query.difficulty
          )
            .toLowerCase();


        if(
          !QUESTION_DIFFICULTIES.has(
            difficulty
          )
        ){

          return res
            .status(400)
            .json({
              message:
                "Invalid difficulty filter."
            });

        }


        query.difficulty =
          difficulty;

      }


      /* =====================================================
         TYPE
      ===================================================== */

      if(
        req.query.type
      ){

        const type =
          safeString(
            req.query.type
          )
            .toLowerCase();


        if(
          !QUESTION_TYPES.has(
            type
          )
        ){

          return res
            .status(400)
            .json({
              message:
                "Invalid question type filter."
            });

        }


        query.type =
          type;

      }


      /* =====================================================
         SEARCH
      ===================================================== */

      if(
        req.query.search
      ){

        const search =
          escapeRegex(
            safeString(
              req.query.search
            ).slice(
              0,
              200
            )
          );


        if(
          search
        ){

          query.$or = [

            {
              title:{
                $regex:
                  search,

                $options:
                  "i"
              }
            },

            {
              question:{
                $regex:
                  search,

                $options:
                  "i"
              }
            },

            {
              category:{
                $regex:
                  search,

                $options:
                  "i"
              }
            },

            {
              tags:{
                $regex:
                  search,

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
          .populate(
            "createdBy",
            "name email profileImage role"
          )
          .sort({
            updatedAt:
              -1,

            createdAt:
              -1
          })
          .lean();


      return res.json(
        questions
      );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "GET /api/question-bank error"
      );

    }

  }
);


/* =========================================================
   GET ONE QUESTION
   GET /api/question-bank/:id
========================================================= */

router.get(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid question ID."
          });

      }


      const question =
        await QuestionBank
          .findById(
            req.params.id
          )
          .populate(
            "createdBy",
            "name email profileImage role"
          )
          .lean();


      if(
        !question
      ){

        return res
          .status(404)
          .json({
            message:
              "Question not found."
          });

      }


      if(
        !canReadQuestion(
          req.user,
          question
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to view this question."
          });

      }


      return res.json(
        question
      );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "GET /api/question-bank/:id error"
      );

    }

  }
);


/* =========================================================
   CREATE QUESTION
   POST /api/question-bank
========================================================= */

router.post(
  "/",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const role =
        normalizeRole(
          req.user.role
        );


      if(
        ![
          "admin",
          "school",
          "teacher"
        ].includes(
          role
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to create Question Bank items."
          });

      }


      /* =====================================================
         TITLE
      ===================================================== */

      const title =
        safeString(
          req.body.title
        );


      if(
        !title
      ){

        return res
          .status(400)
          .json({
            message:
              "Question title is required."
          });

      }


      /* =====================================================
         QUESTION TEXT
      ===================================================== */

      const questionText =
        safeString(
          req.body.question
        );


      if(
        !questionText
      ){

        return res
          .status(400)
          .json({
            message:
              "Question text is required."
          });

      }


      /* =====================================================
         SCHOOL OWNERSHIP
      ===================================================== */

      const schoolId =
        resolveCreateSchoolId(
          req.user,
          req.body.schoolId
        );


      if(
        !schoolId
      ){

        return res
          .status(403)
          .json({
            message:
              role ===
              "admin"
                ? "A valid School ID is required."
                : "A valid authorized School is required."
          });

      }


      if(
        !isValidObjectId(
          schoolId
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid schoolId."
          });

      }


      if(
        !canAccessSchool(
          req.user,
          schoolId
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to create questions for this School."
          });

      }


      /* =====================================================
         QUESTION CONTENT
      ===================================================== */

      const type =
        normalizeQuestionType(
          req.body.type
        );


      const options =
        normalizeQuestionOptions(
          req.body.options
        );


      const optionValidation =
        validateQuestionOptions(
          type,
          options
        );


      if(
        !optionValidation.valid
      ){

        return res
          .status(400)
          .json({
            message:
              optionValidation.message
          });

      }


      /* =====================================================
         CREATE

         createdBy intentionally ignores req.body.createdBy.
      ===================================================== */

      const question =
        await QuestionBank.create({

          schoolId,

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
              req.body.points,
              1
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
            normalizeQuestionTags(
              req.body.tags
            ),

          attachments:
            normalizeQuestionAttachments(
              req.body.attachments
            ),

          aiGenerated:
            safeBoolean(
              req.body.aiGenerated,
              false
            ),

          usageCount:
            0,

          versions:[
            {

              version:
                1,

              updatedAt:
                new Date(),

              updatedBy:
                req.user._id

            }
          ],

          archived:
            false

        });


      const populated =
        await QuestionBank
          .findById(
            question._id
          )
          .populate(
            "createdBy",
            "name email profileImage role"
          )
          .lean();


      return res
        .status(201)
        .json(
          populated
        );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "POST /api/question-bank error"
      );

    }

  }
);


/* =========================================================
   UPDATE QUESTION
   PATCH /api/question-bank/:id
========================================================= */

router.patch(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid question ID."
          });

      }


      const question =
        await QuestionBank.findById(
          req.params.id
        );


      if(
        !question
      ){

        return res
          .status(404)
          .json({
            message:
              "Question not found."
          });

      }


      if(
        !canManageQuestion(
          req.user,
          question
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to update this question."
          });

      }


      /* =====================================================
         OWNERSHIP IS IMMUTABLE

         schoolId and createdBy are deliberately ignored.
      ===================================================== */

      const updates =
        buildQuestionUpdates(
          req.body,
          question
        );


      /* =====================================================
         DETERMINE RESULTING TYPE / OPTIONS

         Needed because type and options may be changed
         independently in the same PATCH.
      ===================================================== */

      const resultingType =
        updates.type ??
        question.type;


      const resultingOptions =
        updates.options ??
        normalizeQuestionOptions(
          question.options
        );


      const optionValidation =
        validateQuestionOptions(
          resultingType,
          resultingOptions
        );


      if(
        !optionValidation.valid
      ){

        return res
          .status(400)
          .json({
            message:
              optionValidation.message
          });

      }


      /* =====================================================
         VERSION
      ===================================================== */

      appendQuestionVersion(
        question,
        req.user._id
      );


      /* =====================================================
         APPLY CHANGES
      ===================================================== */

      Object.entries(
        updates
      )
        .forEach(
          ([
            field,
            value
          ]) => {

            question[
              field
            ] =
              value;

          }
        );


      await question.save();


      const populated =
        await QuestionBank
          .findById(
            question._id
          )
          .populate(
            "createdBy",
            "name email profileImage role"
          )
          .lean();


      return res.json(
        populated
      );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "PATCH /api/question-bank/:id error"
      );

    }

  }
);


/* =========================================================
   ARCHIVE QUESTION
   PATCH /api/question-bank/:id/archive
========================================================= */

router.patch(
  "/:id/archive",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid question ID."
          });

      }


      const question =
        await QuestionBank.findById(
          req.params.id
        );


      if(
        !question
      ){

        return res
          .status(404)
          .json({
            message:
              "Question not found."
          });

      }


      if(
        !canManageQuestion(
          req.user,
          question
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to archive this question."
          });

      }


      appendQuestionVersion(
        question,
        req.user._id
      );


      question.archived =
        true;


      await question.save();


      return res.json(
        question
      );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "PATCH /api/question-bank/:id/archive error"
      );

    }

  }
);


/* =========================================================
   RESTORE QUESTION
   PATCH /api/question-bank/:id/restore
========================================================= */

router.patch(
  "/:id/restore",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid question ID."
          });

      }


      const question =
        await QuestionBank.findById(
          req.params.id
        );


      if(
        !question
      ){

        return res
          .status(404)
          .json({
            message:
              "Question not found."
          });

      }


      if(
        !canManageQuestion(
          req.user,
          question
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to restore this question."
          });

      }


      appendQuestionVersion(
        question,
        req.user._id
      );


      question.archived =
        false;


      await question.save();


      return res.json(
        question
      );

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "PATCH /api/question-bank/:id/restore error"
      );

    }

  }
);


/* =========================================================
   DELETE QUESTION
   DELETE /api/question-bank/:id
========================================================= */

router.delete(
  "/:id",
  auth,
  async (
    req,
    res
  ) => {

    try{

      if(
        !isValidObjectId(
          req.params.id
        )
      ){

        return res
          .status(400)
          .json({
            message:
              "Invalid question ID."
          });

      }


      const question =
        await QuestionBank.findById(
          req.params.id
        );


      if(
        !question
      ){

        return res
          .status(404)
          .json({
            message:
              "Question not found."
          });

      }


      if(
        !canManageQuestion(
          req.user,
          question
        )
      ){

        return res
          .status(403)
          .json({
            message:
              "Not allowed to delete this question."
          });

      }


      const questionId =
        normalizeId(
          question._id
        );


      await question.deleteOne();


      return res.json({

        message:
          "Question deleted.",

        questionId

      });

    }catch(
      err
    ){

      return sendQuestionBankError(
        res,
        err,
        "DELETE /api/question-bank/:id error"
      );

    }

  }
);


module.exports =
  router;
