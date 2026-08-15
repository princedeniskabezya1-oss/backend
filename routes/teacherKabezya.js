const express =
  require("express");

const mongoose =
  require("mongoose");

const router =
  express.Router();


/* =========================================================
   MIDDLEWARE
========================================================= */

const auth =
  require(
    "../middleware/auth"
  );


/* =========================================================
   MODELS
========================================================= */

const User =
  require(
    "../models/User"
  );


const Class =
  require(
    "../models/Class"
  );


const Assignment =
  require(
    "../models/Assignment"
  );


const Submission =
  require(
    "../models/Submission"
  );


const SubmissionAIInspection =
  require(
    "../models/SubmissionAIInspection"
  );


const TeacherAIConversation =
  require(
    "../models/TeacherAIConversation"
  );


/* =========================================================
   SERVICES
========================================================= */

const {
  inspectSubmissionIntegrity
} =
  require(
    "../services/submissionIntegrityService"
  );


const {
  TEACHER_KABEZYA_MODES,

  analyzeTeacherSubmissionWithAI,

  generateTeacherKabezyaResponse,

  generateTeacherStructuredContent
} =
  require(
    "../services/teacherKabezyaService"
  );


/* =========================================================
   KABEZYA CORE HELPERS + RATE LIMIT
   Production Teacher AI Request Protection
========================================================= */


/* =========================================================
   RATE LIMIT CONFIGURATION

   AIFT ACCOUNT-LEVEL LIMIT

   180 accepted requests / 5 minutes / account.

   This protects AIFT from accidental loops and abuse while
   allowing normal conversational AI usage.

   IMPORTANT:
   This does NOT control Gemini's own provider quota.
========================================================= */

const TEACHER_AI_WINDOW_MS =
  5 *
  60 *
  1000;


const TEACHER_AI_MAX_REQUESTS =
  180;


const teacherAIUsage =
  new Map();


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value,
  maxLength =
    10000
){

  if(
    value === null ||
    value === undefined
  ){

    return "";

  }


  return String(
    value
  )
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   NORMALIZE ID
========================================================= */

function normalizeId(
  value
){

  const candidate =
    value?._id ||
    value?.id ||
    value;


  return safeString(
    candidate,
    200
  );

}


/* =========================================================
   VALID OBJECT ID
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
   SAME ID
========================================================= */

function sameId(
  left,
  right
){

  const a =
    normalizeId(
      left
    );


  const b =
    normalizeId(
      right
    );


  return Boolean(
    a &&
    b &&
    a === b
  );

}


/* =========================================================
   ARRAY
========================================================= */

function asArray(
  value
){

  return Array.isArray(
    value
  )
    ? value
    : [];

}


/* =========================================================
   ROLE
========================================================= */

function getRole(
  user
){

  return safeString(
    user?.role,
    100
  )
    .toLowerCase();

}


/* =========================================================
   SCHOOL ID
========================================================= */

function getUserSchoolId(
  user
){

  if(
    !user
  ){

    return "";

  }


  const role =
    getRole(
      user
    );


  if(
    role ===
    "school"
  ){

    return normalizeId(
      user._id
    );

  }


  return normalizeId(
    user.schoolId ||
    user.linkedSchoolId
  );

}


/* =========================================================
   REQUIRE TEACHER KABEZYA ACCESS
========================================================= */

function requireTeacherKabezya(
  req,
  res,
  next
){

  const role =
    getRole(
      req.user
    );


  if(
    ![
      "teacher",
      "school",
      "admin"
    ]
      .includes(
        role
      )
  ){

    return res
      .status(
        403
      )
      .json({

        ok:
          false,

        code:
          "TEACHER_KABEZYA_ACCESS_DENIED",

        message:
          "Teacher Kabezya access is not available for this account."

      });

  }


  next();

}


/* =========================================================
   TEACHER AI RATE LIMIT

   IMPORTANT:

   This limiter is deliberately separate from Gemini's
   provider quota.

   If THIS middleware rejects a request, it ALWAYS returns:

     code: TEACHER_AI_RATE_LIMITED

   That lets the frontend distinguish an AIFT account limit
   from a Gemini/provider 429.
========================================================= */

function enforceTeacherAIRateLimit(
  req,
  res,
  next
){

  const userId =
    normalizeId(
      req.user?._id
    );


  if(
    !userId
  ){

    return res
      .status(
        401
      )
      .json({

        ok:
          false,

        code:
          "KABEZYA_AUTH_REQUIRED",

        message:
          "Authentication is required."

      });

  }


  const now =
    Date.now();


  const existing =
    teacherAIUsage.get(
      userId
    ) ||
    [];


  /* =====================================================
     CLEAN ACTIVE WINDOW
  ===================================================== */

  const active =
    existing
      .map(
        timestamp =>
          Number(
            timestamp
          )
      )
      .filter(
        timestamp =>
          Number.isFinite(
            timestamp
          ) &&
          now -
          timestamp <
          TEACHER_AI_WINDOW_MS
      )
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  /* =====================================================
     ACCOUNT LIMIT REACHED
  ===================================================== */

  if(
    active.length >=
    TEACHER_AI_MAX_REQUESTS
  ){

    const oldestRequestAt =
      active[0] ||
      now;


    const elapsed =
      Math.max(
        0,
        now -
        oldestRequestAt
      );


    const retryAfterMs =
      Math.max(
        1000,
        TEACHER_AI_WINDOW_MS -
        elapsed
      );


    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          retryAfterMs /
          1000
        )
      );


    /*
      Do not count the rejected request.
    */

    teacherAIUsage.set(
      userId,
      active
    );


    res.set(
      "Retry-After",
      String(
        retryAfterSeconds
      )
    );


    res.set(
      "X-RateLimit-Limit",
      String(
        TEACHER_AI_MAX_REQUESTS
      )
    );


    res.set(
      "X-RateLimit-Remaining",
      "0"
    );


    res.set(
      "X-RateLimit-Reset",
      String(
        Math.ceil(
          (
            now +
            retryAfterMs
          ) /
          1000
        )
      )
    );


    return res
      .status(
        429
      )
      .json({

        ok:
          false,

        /*
          CRITICAL:
          This tells the frontend that the 429 came from
          AIFT, rather than Gemini.
        */

        code:
          "TEACHER_AI_RATE_LIMITED",

        message:
          "Kabezya has reached the temporary AIFT request limit for this account.",

        retryAfterMs,

        retryAfterSeconds,

        rateLimit:{

          source:
            "aift",

          limit:
            TEACHER_AI_MAX_REQUESTS,

          remaining:
            0,

          windowMs:
            TEACHER_AI_WINDOW_MS,

          resetAt:
            new Date(
              now +
              retryAfterMs
            )
              .toISOString()

        }

      });

  }


  /* =====================================================
     ACCEPT REQUEST
  ===================================================== */

  active.push(
    now
  );


  teacherAIUsage.set(
    userId,
    active
  );


  const remaining =
    Math.max(
      0,
      TEACHER_AI_MAX_REQUESTS -
      active.length
    );


  res.set(
    "X-RateLimit-Limit",
    String(
      TEACHER_AI_MAX_REQUESTS
    )
  );


  res.set(
    "X-RateLimit-Remaining",
    String(
      remaining
    )
  );


  /*
    Make the source explicit for debugging.
  */

  res.set(
    "X-AIFT-AI-RateLimit",
    "teacher"
  );


  next();

}

/* =========================================================
   SAFE ERROR RESPONSE
========================================================= */

function sendRouteError(
  res,
  error,
  fallbackMessage =
    "Kabezya could not complete the request."
){

  const status =
    Number(
      error?.statusCode ||
      error?.status ||
      500
    );


  const safeStatus =
    status >= 400 &&
    status <= 599
      ? status
      : 500;


  const message =
    safeString(
      error?.message ||
      fallbackMessage,
      2000
    );


  return res
    .status(
      safeStatus
    )
    .json({
      message:
        message ||
        fallbackMessage
    });

}


/* =========================================================
   FIND SUBMISSION

   Population is intentionally conservative.
========================================================= */

async function loadSubmission(
  submissionId
){

  if(
    !isValidObjectId(
      submissionId
    )
  ){

    const error =
      new Error(
        "A valid submission is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  const submission =
    await Submission
      .findById(
        submissionId
      )
      .populate(
        "studentId",
        "name email profileImage schoolId linkedSchoolId role"
      )
      .lean();


  if(
    !submission
  ){

    const error =
      new Error(
        "Submission not found."
      );


    error.statusCode =
      404;


    throw error;

  }


  return submission;

}


/* =========================================================
   LOAD ASSIGNMENT
========================================================= */

async function loadAssignment(
  assignmentId
){

  if(
    !isValidObjectId(
      assignmentId
    )
  ){

    return null;

  }


  return Assignment
    .findById(
      assignmentId
    )
    .lean();

}


/* =========================================================
   LOAD CLASS
========================================================= */

async function loadClass(
  classId
){

  if(
    !isValidObjectId(
      classId
    )
  ){

    return null;

  }


  return Class
    .findById(
      classId
    )
    .lean();

}


/* =========================================================
   VERIFY SCHOOL BOUNDARY
========================================================= */

function verifySchoolBoundary(
  user,
  submission
){

  const role =
    getRole(
      user
    );


  if(
    role ===
    "admin"
  ){

    return true;

  }


  const userSchoolId =
    getUserSchoolId(
      user
    );


  const submissionSchoolId =
    normalizeId(
      submission?.schoolId
    );


  if(
    !userSchoolId ||
    !submissionSchoolId ||
    !sameId(
      userSchoolId,
      submissionSchoolId
    )
  ){

    const error =
      new Error(
        "You are not allowed to inspect this submission."
      );


    error.statusCode =
      403;


    throw error;

  }


  return true;

}


/* =========================================================
   VERIFY TEACHER SUBMISSION ACCESS

   Teacher:
   - same school
   - must be the teacher assigned to the submission when
     teacherId exists

   School:
   - same school

   Admin:
   - allowed

   This intentionally does not trust submissionId alone.
========================================================= */

function verifySubmissionAccess(
  user,
  submission
){

  if(
    !user ||
    !submission
  ){

    const error =
      new Error(
        "Submission access could not be verified."
      );


    error.statusCode =
      403;


    throw error;

  }


  const role =
    getRole(
      user
    );


  if(
    role ===
    "admin"
  ){

    return true;

  }


  verifySchoolBoundary(
    user,
    submission
  );


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

    const submissionTeacherId =
      normalizeId(
        submission?.teacherId
      );


    /*
      Your existing Submission architecture assigns a
      teacherId. When present, enforce it.
    */

    if(
      submissionTeacherId &&
      !sameId(
        submissionTeacherId,
        user._id
      )
    ){

      const error =
        new Error(
          "You are not assigned to this submission."
        );


      error.statusCode =
        403;


      throw error;

    }


    return true;

  }


  const error =
    new Error(
      "You are not allowed to inspect this submission."
    );


  error.statusCode =
    403;


  throw error;

}


/* =========================================================
   VERIFY CLASS ACCESS

   Used by general Teacher Kabezya requests.
========================================================= */

function verifyClassAccess(
  user,
  classDoc
){

  if(
    !classDoc
  ){

    return true;

  }


  const role =
    getRole(
      user
    );


  if(
    role ===
    "admin"
  ){

    return true;

  }


  const userSchoolId =
    getUserSchoolId(
      user
    );


  const classSchoolId =
    normalizeId(
      classDoc?.schoolId
    );


  if(
    userSchoolId &&
    classSchoolId &&
    sameId(
      userSchoolId,
      classSchoolId
    )
  ){

    return true;

  }


  const error =
    new Error(
      "You are not allowed to use this class with Kabezya."
    );


  error.statusCode =
    403;


  throw error;

}


/* =========================================================
   RESOLVE CONTEXT

   IMPORTANT:
   IDs may come from the browser.

   Actual class/assignment/student/submission content is
   always loaded from MongoDB.
========================================================= */

async function resolveTeacherContext(
  user,
  body = {}
){

  const classId =
    normalizeId(
      body?.classId ||
      body?.context?.classId
    );


  const assignmentId =
    normalizeId(
      body?.assignmentId ||
      body?.context?.assignmentId
    );


  const studentId =
    normalizeId(
      body?.studentId ||
      body?.context?.studentId
    );


  const submissionId =
    normalizeId(
      body?.submissionId ||
      body?.context?.submissionId
    );


  let classDoc =
    null;


  let assignment =
    null;


  let student =
    null;


  let submission =
    null;


  /* =====================================================
     SUBMISSION
  ===================================================== */

  if(
    submissionId
  ){

    submission =
      await loadSubmission(
        submissionId
      );


    verifySubmissionAccess(
      user,
      submission
    );


    student =
      submission.studentId &&
      typeof submission.studentId ===
        "object"
        ? submission.studentId
        : null;

  }


  /* =====================================================
     ASSIGNMENT
  ===================================================== */

  const resolvedAssignmentId =
    normalizeId(
      submission?.assignmentId ||
      assignmentId
    );


  if(
    resolvedAssignmentId
  ){

    assignment =
      await loadAssignment(
        resolvedAssignmentId
      );

  }


  /* =====================================================
     CLASS
  ===================================================== */

  const resolvedClassId =
    normalizeId(
      submission?.classId ||
      assignment?.classId ||
      classId
    );


  if(
    resolvedClassId
  ){

    classDoc =
      await loadClass(
        resolvedClassId
      );


    verifyClassAccess(
      user,
      classDoc
    );

  }


  /* =====================================================
     STUDENT WITHOUT SUBMISSION
  ===================================================== */

  if(
    !student &&
    studentId &&
    isValidObjectId(
      studentId
    )
  ){

    student =
      await User
        .findById(
          studentId
        )
        .select(
          "name email profileImage schoolId linkedSchoolId role"
        )
        .lean();


    if(
      student
    ){

      const role =
        getRole(
          user
        );


      if(
        role !==
        "admin"
      ){

        const userSchoolId =
          getUserSchoolId(
            user
          );


        const studentSchoolId =
          normalizeId(
            student.schoolId ||
            student.linkedSchoolId
          );


        if(
          !userSchoolId ||
          !studentSchoolId ||
          !sameId(
            userSchoolId,
            studentSchoolId
          )
        ){

          const error =
            new Error(
              "You are not allowed to analyze this student."
            );


          error.statusCode =
            403;


          throw error;

        }

      }

    }

  }


  return {

    classDoc,

    assignment,

    student,

    submission

  };

}


/* =========================================================
   INSPECTION SNAPSHOT
========================================================= */

function buildSubmissionSnapshot(
  submission,
  assignment
){

  return {

    title:
      safeString(
        assignment?.title ||
        "Student submission",
        500
      ),

    submittedText:
      safeString(
        submission?.text ||
        submission?.content ||
        "",
        50000
      ),

    submittedAt:
      submission?.submittedAt ||
      submission?.createdAt ||
      null

  };

}


/* =========================================================
   CREATE PROCESSING INSPECTION
========================================================= */

async function createInspectionRecord({
  user,
  submission,
  assignment
}){

  const schoolId =
    normalizeId(
      submission?.schoolId
    );


  const teacherId =
    getRole(
      user
    ) ===
      "teacher"
      ? normalizeId(
          user._id
        )
      : normalizeId(
          submission?.teacherId ||
          user?._id
        );


  const studentId =
    normalizeId(
      submission?.studentId
    );


  const assignmentId =
    normalizeId(
      submission?.assignmentId ||
      assignment?._id
    );


  if(
    !isValidObjectId(
      schoolId
    ) ||
    !isValidObjectId(
      teacherId
    ) ||
    !isValidObjectId(
      studentId
    ) ||
    !isValidObjectId(
      assignmentId
    )
  ){

    const error =
      new Error(
        "The submission does not contain enough information to create an AI inspection."
      );


    error.statusCode =
      400;


    throw error;

  }


  return SubmissionAIInspection
    .create({

      schoolId,

      teacherId,

      studentId,

      classId:
        isValidObjectId(
          submission?.classId
        )
          ? normalizeId(
              submission.classId
            )
          : null,

      assignmentId,

      submissionId:
        submission._id,

      submissionSnapshot:
        buildSubmissionSnapshot(
          submission,
          assignment
        ),

      status:
        "processing",

      reviewScore:
        0,

      metadata:{
        source:
          "teacher_kabezya",

        routeVersion:
          "1.0.0"
      }

    });

}


/* =========================================================
   PUBLIC INSPECTION RESPONSE

   Do not expose:
   - another student's identity
   - internal sourceStudentId
   - raw model internals
========================================================= */

function serializeInspection(
  inspection
){

  if(
    !inspection
  ){

    return null;

  }


  const source =
    typeof inspection.toObject ===
      "function"
      ? inspection.toObject()
      : inspection;


  const internalMatches =
    asArray(
      source?.internalSimilarity
        ?.matches
    )
      .map(
        match => ({

          sourceType:
            match?.sourceType ||
            "submission",

          sourceTitle:
            safeString(
              match?.sourceTitle,
              500
            ),

          submittedText:
            safeString(
              match?.submittedText,
              5000
            ),

          matchedText:
            safeString(
              match?.matchedText,
              5000
            ),

          similarity:
            Number(
              match?.similarity ||
              0
            ),

          similarityPercent:
            Number(
              match?.similarityPercent ||
              0
            ),

          evidenceType:
            match?.evidenceType ||
            "other",

          verified:
            Boolean(
              match?.verified
            )

        })
      );


  return {

    id:
      normalizeId(
        source?._id
      ),

    submissionId:
      normalizeId(
        source?.submissionId
      ),

    assignmentId:
      normalizeId(
        source?.assignmentId
      ),

    classId:
      normalizeId(
        source?.classId
      ),

    status:
      source?.status ||
      "processing",

    reviewScore:
      Number(
        source?.reviewScore ||
        0
      ),

    internalSimilarity:{

      checked:
        Boolean(
          source?.internalSimilarity
            ?.checked
        ),

      comparedSubmissionCount:
        Number(
          source?.internalSimilarity
            ?.comparedSubmissionCount ||
          0
        ),

      highestSimilarity:
        Number(
          source?.internalSimilarity
            ?.highestSimilarity ||
          0
        ),

      matches:
        internalMatches

    },

    courseMaterialSimilarity:{

      checked:
        Boolean(
          source?.courseMaterialSimilarity
            ?.checked
        ),

      highestSimilarity:
        Number(
          source?.courseMaterialSimilarity
            ?.highestSimilarity ||
          0
        ),

      matches:
        asArray(
          source?.courseMaterialSimilarity
            ?.matches
        )

    },

    webReview:{

      checked:
        Boolean(
          source?.webReview
            ?.checked
        ),

      provider:
        source?.webReview
          ?.checked
          ? safeString(
              source?.webReview
                ?.provider,
              200
            )
          : "",

      checkedAt:
        source?.webReview
          ?.checkedAt ||
        null,

      matches:
        source?.webReview
          ?.checked
          ? asArray(
              source?.webReview
                ?.matches
            )
          : []

    },

    writingConsistency:
      source?.writingConsistency ||
      {
        status:
          "insufficient_evidence",

        variationScore:
          0,

        observations:
          []
      },

    citationReview:
      asArray(
        source?.citationReview
      ),

    aiAnalysis:
      source?.aiAnalysis ||
      {},

    teacherReview:
      source?.teacherReview ||
      {},

    createdAt:
      source?.createdAt ||
      null,

    updatedAt:
      source?.updatedAt ||
      null

  };

}


/* =========================================================
   POST
   /api/kabezya/teacher/inspect-submission

   This is the endpoint your teacher frontend needs for:
   - Review Work
   - Feedback
   - originality inspection
========================================================= */

router.post(
  "/teacher/inspect-submission",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  async(
    req,
    res
  ) => {

    let inspection =
      null;


    try{

      const submissionId =
        normalizeId(
          req.body?.submissionId ||
          req.body?.context?.submissionId
        );


      if(
        !submissionId
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "Select a student submission before asking Kabezya to review the work."
          });

      }


      /* ===================================================
         LOAD + AUTHORIZE
      =================================================== */

      const context =
        await resolveTeacherContext(
          req.user,
          {
            ...req.body,
            submissionId
          }
        );


      const submission =
        context.submission;


      if(
        !submission
      ){

        return res
          .status(
            404
          )
          .json({
            message:
              "Submission not found."
          });

      }


      /* ===================================================
         CREATE AUDIT RECORD
      =================================================== */

      inspection =
        await createInspectionRecord({

          user:
            req.user,

          submission,

          assignment:
            context.assignment

        });


      /* ===================================================
         DETERMINISTIC INTEGRITY ANALYSIS
      =================================================== */

      const integrity =
        await inspectSubmissionIntegrity({

          submission,

          schoolId:
            submission.schoolId,

          classId:
            submission.classId,

          assignmentId:
            submission.assignmentId

        });


      inspection.status =
        integrity.status;


      inspection.reviewScore =
        integrity.reviewScore;


      inspection.internalSimilarity =
        integrity.internalSimilarity;


      inspection.courseMaterialSimilarity =
        integrity.courseMaterialSimilarity;


      inspection.webReview =
        integrity.webReview;


      inspection.writingConsistency =
        integrity.writingConsistency;


      inspection.citationReview =
        integrity.citationReview;


      inspection.metadata = {
        ...(
          inspection.metadata ||
          {}
        ),

        ...(
          integrity.metadata ||
          {}
        )
      };


      await inspection.save();


      /* ===================================================
         KABEZYA INTERPRETATION
      =================================================== */

      const aiResult =
        await analyzeTeacherSubmissionWithAI({

          submission,

          assignment:
            context.assignment,

          student:
            context.student,

          classDoc:
            context.classDoc,

          integrity,

          teacherPrompt:
            safeString(
              req.body?.prompt ||
              req.body?.message ||
              "",
              6000
            ),

          history:
            asArray(
              req.body?.history
            )

        });


      const analysis =
        aiResult.analysis ||
        {};


      /* ===================================================
         WRITING CONSISTENCY

         This is AI observation only, not proof of AI use.
      =================================================== */

      inspection.writingConsistency =
        analysis.writingConsistency ||
        integrity.writingConsistency;


      inspection.citationReview =
        analysis.citationReview ||
        [];


      /* ===================================================
         AI ANALYSIS
      =================================================== */

      inspection.aiAnalysis = {

        summary:
          safeString(
            analysis.message,
            12000
          ),

        strengths:
          asArray(
            analysis.strengths
          ),

        concerns:
          asArray(
            analysis.concerns
          ),

        recommendedTeacherActions:
          asArray(
            analysis
              .recommendedTeacherActions
          ),

        suggestedFeedback:
          safeString(
            analysis.suggestedFeedback,
            10000
          ),

        suggestedScore:
          analysis.suggestedScore ??
          null,

        model:
          safeString(
            aiResult?.provider?.model,
            200
          ),

        inputTokens:
          Number(
            aiResult?.provider
              ?.usage
              ?.inputTokens ||
            0
          ),

        outputTokens:
          Number(
            aiResult?.provider
              ?.usage
              ?.outputTokens ||
            0
          ),

        totalTokens:
          Number(
            aiResult?.provider
              ?.usage
              ?.totalTokens ||
            0
          ),

        responseTimeMs:
          Number(
            aiResult?.provider
              ?.responseTimeMs ||
            0
          )

      };


      /*
        Preserve deterministic status as the authoritative
        integrity status.

        Gemini does not override deterministic evidence.
      */

      inspection.error = {
        occurred:false,
        message:""
      };


      await inspection.save();


      /* ===================================================
         RESPONSE

         Include aliases used by the current teacher
         frontend normalizer.
      =================================================== */

      return res.json({

        ok:true,

        message:
          analysis.message ||
          "Kabezya completed the submission review.",

        feedback:
          analysis.suggestedFeedback ||
          "",

        score:
          analysis.suggestedScore ??
          null,

        strengths:
          analysis.strengths ||
          [],

        concerns:
          analysis.concerns ||
          [],

        recommendedTeacherActions:
          analysis
            .recommendedTeacherActions ||
          [],

        integrityAssessment:
          analysis.integrityAssessment ||
          null,

        writingConsistency:
          inspection.writingConsistency,

        citationReview:
          inspection.citationReview,

        integrity:{

          status:
            inspection.status,

          reviewScore:
            inspection.reviewScore,

          internalSimilarity:
            inspection
              .internalSimilarity,

          courseMaterialSimilarity:
            inspection
              .courseMaterialSimilarity,

          webReview:
            inspection.webReview

        },

        inspection:
          serializeInspection(
            inspection
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya inspect-submission error:",
        {
          name:
            error?.name ||
            "",

          message:
            error?.message ||
            "",

          status:
            error?.statusCode ||
            error?.status ||
            500
        }
      );


      /* ===================================================
         RETAIN FAILED AUDIT RECORD
      =================================================== */

      if(
        inspection
      ){

        try{

          inspection.status =
            "failed";


          inspection.error = {

            occurred:true,

            message:
              safeString(
                error?.message ||
                "Inspection failed.",
                2000
              )

          };


          await inspection.save();

        }catch(
          saveError
        ){

          console.error(
            "Unable to mark Kabezya inspection as failed:",
            saveError?.message ||
            saveError
          );

        }

      }


      return sendRouteError(
        res,
        error,
        "Kabezya could not inspect this submission."
      );

    }

  }
);


/* =========================================================
   POST
   /api/kabezya/teacher/assistant
========================================================= */

router.post(
  "/teacher/assistant",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  async(
    req,
    res
  ) => {

    try{

      const prompt =
        safeString(
          req.body?.prompt ||
          req.body?.message,
          6000
        );


      if(
        !prompt
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "Enter a question or instruction for Kabezya."
          });

      }


      const context =
        await resolveTeacherContext(
          req.user,
          req.body
        );


      const result =
        await generateTeacherKabezyaResponse({

          mode:
            TEACHER_KABEZYA_MODES
              .ASSISTANT,

          prompt,

          context,

          history:
            asArray(
              req.body?.history
            )

        });


      return res.json({
        ok:true,
        ...result
      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya assistant error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error
      );

    }

  }
);


/* =========================================================
   POST
   /api/kabezya/teacher/analyze-class
========================================================= */

router.post(
  "/teacher/analyze-class",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  async(
    req,
    res
  ) => {

    try{

      const context =
        await resolveTeacherContext(
          req.user,
          req.body
        );


      if(
        !context.classDoc
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "Select a class before asking Kabezya to analyze it."
          });

      }


      const result =
        await generateTeacherKabezyaResponse({

          mode:
            TEACHER_KABEZYA_MODES
              .CLASS_ANALYSIS,

          prompt:
            safeString(
              req.body?.prompt ||
              "Analyze this class and identify useful teaching priorities.",
              6000
            ),

          context,

          history:
            asArray(
              req.body?.history
            )

        });


      return res.json({
        ok:true,
        ...result
      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya analyze-class error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error
      );

    }

  }
);


/* =========================================================
   POST
   /api/kabezya/teacher/analyze-student
========================================================= */

router.post(
  "/teacher/analyze-student",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  async(
    req,
    res
  ) => {

    try{

      const context =
        await resolveTeacherContext(
          req.user,
          req.body
        );


      if(
        !context.student
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "Select a student before asking Kabezya to analyze learning progress."
          });

      }


      const result =
        await generateTeacherKabezyaResponse({

          mode:
            TEACHER_KABEZYA_MODES
              .STUDENT_ANALYSIS,

          prompt:
            safeString(
              req.body?.prompt ||
              "Analyze this student's available learning context and suggest useful teaching support.",
              6000
            ),

          context,

          history:
            asArray(
              req.body?.history
            )

        });


      return res.json({
        ok:true,
        ...result
      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya analyze-student error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error
      );

    }

  }
);


/* =========================================================
   STRUCTURED GENERATION HANDLER
========================================================= */

async function handleStructuredGeneration(
  req,
  res,
  mode
){

  try{

    const prompt =
      safeString(
        req.body?.prompt ||
        req.body?.message,
        6000
      );


    if(
      !prompt
    ){

      return res
        .status(
          400
        )
        .json({
          message:
            "Describe what you want Kabezya to create."
        });

    }


    const context =
      await resolveTeacherContext(
        req.user,
        req.body
      );


    const result =
      await generateTeacherStructuredContent({

        mode,

        prompt,

        context,

        history:
          asArray(
            req.body?.history
          )

      });


    return res.json({
      ok:true,
      ...result
    });

  }catch(
    error
  ){

    console.error(
      "teacherKabezya generation error:",
      {
        mode,
        message:
          error?.message ||
          ""
      }
    );


    return sendRouteError(
      res,
      error
    );

  }

}


/* =========================================================
   POST
   /api/kabezya/teacher/generate-quiz
========================================================= */

router.post(
  "/teacher/generate-quiz",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  (
    req,
    res
  ) =>
    handleStructuredGeneration(
      req,
      res,
      TEACHER_KABEZYA_MODES
        .GENERATE_QUIZ
    )
);


/* =========================================================
   POST
   /api/kabezya/teacher/generate-assignment
========================================================= */

router.post(
  "/teacher/generate-assignment",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  (
    req,
    res
  ) =>
    handleStructuredGeneration(
      req,
      res,
      TEACHER_KABEZYA_MODES
        .GENERATE_ASSIGNMENT
    )
);


/* =========================================================
   POST
   /api/kabezya/teacher/lesson-plan
========================================================= */

router.post(
  "/teacher/lesson-plan",

  auth,

  requireTeacherKabezya,

  enforceTeacherAIRateLimit,

  (
    req,
    res
  ) =>
    handleStructuredGeneration(
      req,
      res,
      TEACHER_KABEZYA_MODES
        .LESSON_PLAN
    )
);


/* =========================================================
   GET
   /api/kabezya/teacher/inspections/:submissionId

   Returns previous authorized inspections for the selected
   submission.
========================================================= */

router.get(
  "/teacher/inspections/:submissionId",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const submission =
        await loadSubmission(
          req.params.submissionId
        );


      verifySubmissionAccess(
        req.user,
        submission
      );


      const inspections =
        await SubmissionAIInspection
          .find({
            submissionId:
              submission._id
          })
          .sort({
            createdAt:-1
          })
          .limit(
            20
          )
          .lean();


      return res.json({

        ok:true,

        inspections:
          inspections.map(
            serializeInspection
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya inspection history error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not load the inspection history."
      );

    }

  }
);


/* =========================================================
   PATCH
   /api/kabezya/teacher/inspections/:inspectionId/review

   Saves the HUMAN teacher/school review.

   This does not alter Submission.grade and does not create
   disciplinary action.
========================================================= */

router.patch(
  "/teacher/inspections/:inspectionId/review",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const inspectionId =
        normalizeId(
          req.params.inspectionId
        );


      if(
        !isValidObjectId(
          inspectionId
        )
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "A valid inspection is required."
          });

      }


      const inspection =
        await SubmissionAIInspection
          .findById(
            inspectionId
          );


      if(
        !inspection
      ){

        return res
          .status(
            404
          )
          .json({
            message:
              "Inspection not found."
          });

      }


      const role =
        getRole(
          req.user
        );


      if(
        role !==
        "admin"
      ){

        const userSchoolId =
          getUserSchoolId(
            req.user
          );


        if(
          !sameId(
            userSchoolId,
            inspection.schoolId
          )
        ){

          return res
            .status(
              403
            )
            .json({
              message:
                "You are not allowed to review this inspection."
            });

        }


        if(
          role ===
            "teacher" &&
          !sameId(
            inspection.teacherId,
            req.user._id
          )
        ){

          return res
            .status(
              403
            )
            .json({
              message:
                "You are not allowed to review this inspection."
            });

        }

      }


      const allowedDecisions =
        new Set([
          "pending",
          "no_concern",
          "needs_discussion",
          "confirmed_issue",
          "dismissed"
        ]);


      const decision =
        safeString(
          req.body?.decision,
          100
        );


      if(
        !allowedDecisions.has(
          decision
        )
      ){

        return res
          .status(
            400
          )
          .json({
            message:
              "Select a valid teacher review decision."
          });

      }


      inspection.teacherReview = {

        reviewed:
          decision !==
          "pending",

        reviewedAt:
          decision !==
          "pending"
            ? new Date()
            : null,

        reviewedBy:
          decision !==
          "pending"
            ? req.user._id
            : null,

        decision,

        notes:
          safeString(
            req.body?.notes,
            10000
          )

      };


      await inspection.save();


      return res.json({

        ok:true,

        message:
          "Teacher review saved.",

        inspection:
          serializeInspection(
            inspection
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya save teacher review error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "The teacher review could not be saved."
      );

    }

  }
);

/* =========================================================
   KABEZYA CONVERSATIONS
   Persistent Teacher AI Conversation System

   Supports:
   - recent conversations
   - reopening old conversations
   - continuing previous conversations
   - renaming conversations
   - appending user / assistant messages
   - editing user prompts
   - ChatGPT-style branch reset after message editing
   - archiving conversations
   - ownership enforcement

   SECURITY:
   Every conversation is scoped to the authenticated account.
========================================================= */


/* =========================================================
   VALID TEACHER AI CONVERSATION MODES
========================================================= */

const TEACHER_AI_CONVERSATION_MODES =
  new Set([
    "assistant",
    "class-analysis",
    "student-analysis",
    "submission-review",
    "generate-quiz",
    "generate-assignment",
    "feedback",
    "lesson-plan"
  ]);


/* =========================================================
   NORMALIZE CONVERSATION MODE
========================================================= */

function normalizeTeacherAIConversationMode(
  value
){

  const normalized =
    safeString(
      value,
      100
    );


  return TEACHER_AI_CONVERSATION_MODES
    .has(
      normalized
    )
      ? normalized
      : "assistant";

}


/* =========================================================
   OPTIONAL OBJECT ID

   Returns null instead of storing empty strings.
========================================================= */

function normalizeOptionalObjectId(
  value
){

  const id =
    normalizeId(
      value
    );


  if(
    !id ||
    !mongoose.Types.ObjectId
      .isValid(
        id
      )
  ){

    return null;

  }


  return id;

}


/* =========================================================
   CONVERSATION OWNER

   The current schema uses teacherId as the owner field.

   Teacher, school and admin accounts supported by the
   Kabezya route own their own conversation histories.
========================================================= */

function getTeacherAIConversationOwnerId(
  user
){

  return normalizeId(
    user?._id
  );

}


/* =========================================================
   SAFE CONVERSATION TITLE
========================================================= */

function normalizeTeacherAIConversationTitle(
  value
){

  const title =
    safeString(
      value,
      180
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  return title ||
    "New conversation";

}


/* =========================================================
   BUILD TITLE FROM PROMPT

   Keeps right-panel conversation titles concise.
========================================================= */

function buildTeacherAIConversationTitle(
  value
){

  const source =
    safeString(
      value,
      1000
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  if(
    !source
  ){

    return "New conversation";

  }


  if(
    source.length <=
    72
  ){

    return source;

  }


  return `${
    source.slice(
      0,
      69
    )
  }...`;

}


/* =========================================================
   SAFE RESPONSE SNAPSHOT

   The snapshot lets structured responses reopen correctly:
   - Work Inspector
   - feedback
   - quiz
   - assignment
   - lesson plan

   JSON cloning removes Mongoose/runtime objects and ensures
   only serializable response data is retained.
========================================================= */

function normalizeTeacherAIResponseSnapshot(
  value
){

  if(
    !value ||
    typeof value !==
      "object"
  ){

    return null;

  }


  try{

    return JSON.parse(
      JSON.stringify(
        value
      )
    );

  }catch(
    error
  ){

    return null;

  }

}


/* =========================================================
   SERIALIZE CONVERSATION MESSAGE
========================================================= */

function serializeTeacherAIMessage(
  message
){

  if(
    !message
  ){

    return null;

  }


  const source =
    typeof message.toObject ===
      "function"
      ? message.toObject()
      : message;


  return {

    id:
      normalizeId(
        source?._id
      ),

    role:
      safeString(
        source?.role,
        50
      ),

    content:
      safeString(
        source?.content,
        30000
      ),

    mode:
      normalizeTeacherAIConversationMode(
        source?.mode
      ),

    classId:
      normalizeId(
        source?.classId
      ),

    studentId:
      normalizeId(
        source?.studentId
      ),

    assignmentId:
      normalizeId(
        source?.assignmentId
      ),

    submissionId:
      normalizeId(
        source?.submissionId
      ),

    quizId:
      normalizeId(
        source?.quizId
      ),

    responseSnapshot:
      source?.responseSnapshot &&
      typeof source.responseSnapshot ===
        "object"
        ? source.responseSnapshot
        : null,

    model:
      safeString(
        source?.model,
        200
      ),

    inputTokens:
      Number(
        source?.inputTokens ||
        0
      ),

    outputTokens:
      Number(
        source?.outputTokens ||
        0
      ),

    totalTokens:
      Number(
        source?.totalTokens ||
        0
      ),

    responseTimeMs:
      Number(
        source?.responseTimeMs ||
        0
      ),

    edited:
      Boolean(
        source?.edited
      ),

    editedAt:
      source?.editedAt ||
      null,

    createdAt:
      source?.createdAt ||
      null

  };

}


/* =========================================================
   SERIALIZE CONVERSATION

   includeMessages=false is used by the right-panel list so
   the browser does not download every historical message.
========================================================= */

function serializeTeacherAIConversation(
  conversation,
  {
    includeMessages =
      true
  } = {}
){

  if(
    !conversation
  ){

    return null;

  }


  const source =
    typeof conversation.toObject ===
      "function"
      ? conversation.toObject()
      : conversation;


  const result = {

    id:
      normalizeId(
        source?._id
      ),

    title:
      normalizeTeacherAIConversationTitle(
        source?.title
      ),

    mode:
      normalizeTeacherAIConversationMode(
        source?.mode
      ),

    classId:
      normalizeId(
        source?.classId
      ),

    studentId:
      normalizeId(
        source?.studentId
      ),

    assignmentId:
      normalizeId(
        source?.assignmentId
      ),

    submissionId:
      normalizeId(
        source?.submissionId
      ),

    quizId:
      normalizeId(
        source?.quizId
      ),

    status:
      safeString(
        source?.status,
        50
      ) ||
      "active",

    messageCount:
      Number(
        source?.messageCount ||
        asArray(
          source?.messages
        ).length ||
        0
      ),

    lastMessageAt:
      source?.lastMessageAt ||
      source?.updatedAt ||
      source?.createdAt ||
      null,

    createdAt:
      source?.createdAt ||
      null,

    updatedAt:
      source?.updatedAt ||
      null

  };


  if(
    includeMessages
  ){

    result.messages =
      asArray(
        source?.messages
      )
        .map(
          serializeTeacherAIMessage
        )
        .filter(
          Boolean
        );

  }


  return result;

}


/* =========================================================
   LOAD OWNED CONVERSATION

   Never trust a conversation ID from the browser by itself.
========================================================= */

async function loadOwnedTeacherAIConversation(
  user,
  conversationId,
  {
    includeArchived =
      false
  } = {}
){

  const ownerId =
    getTeacherAIConversationOwnerId(
      user
    );


  if(
    !ownerId
  ){

    const error =
      new Error(
        "Kabezya conversation ownership could not be verified."
      );


    error.statusCode =
      401;


    throw error;

  }


  if(
    !isValidObjectId(
      conversationId
    )
  ){

    const error =
      new Error(
        "A valid Kabezya conversation is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  const query = {

    _id:
      normalizeId(
        conversationId
      ),

    teacherId:
      ownerId

  };


  if(
    !includeArchived
  ){

    query.status =
      "active";

  }


  const conversation =
    await TeacherAIConversation
      .findOne(
        query
      );


  if(
    !conversation
  ){

    const error =
      new Error(
        "Kabezya conversation not found."
      );


    error.statusCode =
      404;


    throw error;

  }


  return conversation;

}


/* =========================================================
   BUILD MESSAGE PAYLOAD
========================================================= */

function buildTeacherAIMessagePayload(
  body = {}
){

  const role =
    safeString(
      body?.role,
      50
    )
      .toLowerCase();


  if(
    ![
      "user",
      "assistant"
    ].includes(
      role
    )
  ){

    const error =
      new Error(
        "A valid conversation message role is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  const content =
    safeString(
      body?.content,
      30000
    );


  const responseSnapshot =
    normalizeTeacherAIResponseSnapshot(
      body?.responseSnapshot
    );


  /*
    User messages always require readable text.

    Assistant messages may contain a structured snapshot,
    although normally they also include readable content.
  */

  if(
    !content &&
    !(
      role ===
        "assistant" &&
      responseSnapshot
    )
  ){

    const error =
      new Error(
        "Conversation message content is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  return {

    role,

    content,

    mode:
      normalizeTeacherAIConversationMode(
        body?.mode
      ),

    classId:
      normalizeOptionalObjectId(
        body?.classId
      ),

    studentId:
      normalizeOptionalObjectId(
        body?.studentId
      ),

    assignmentId:
      normalizeOptionalObjectId(
        body?.assignmentId
      ),

    submissionId:
      normalizeOptionalObjectId(
        body?.submissionId
      ),

    quizId:
      normalizeOptionalObjectId(
        body?.quizId
      ),

    responseSnapshot,

    model:
      safeString(
        body?.model,
        200
      ),

    inputTokens:
      Math.max(
        0,
        Number(
          body?.inputTokens ||
          0
        )
      ),

    outputTokens:
      Math.max(
        0,
        Number(
          body?.outputTokens ||
          0
        )
      ),

    totalTokens:
      Math.max(
        0,
        Number(
          body?.totalTokens ||
          0
        )
      ),

    responseTimeMs:
      Math.max(
        0,
        Number(
          body?.responseTimeMs ||
          0
        )
      ),

    createdAt:
      new Date()

  };

}


/* =========================================================
   CREATE CONVERSATION

   POST /api/kabezya/teacher/conversations
========================================================= */

router.post(
  "/teacher/conversations",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const ownerId =
        getTeacherAIConversationOwnerId(
          req.user
        );


      if(
        !ownerId
      ){

        return res
          .status(
            401
          )
          .json({

            ok:
              false,

            message:
              "Authentication is required."

          });

      }


      const initialMessage =
        safeString(
          req.body?.message ||
          req.body?.prompt,
          30000
        );


      const requestedTitle =
        safeString(
          req.body?.title,
          180
        );


      const title =
        requestedTitle
          ? normalizeTeacherAIConversationTitle(
              requestedTitle
            )
          : initialMessage
            ? buildTeacherAIConversationTitle(
                initialMessage
              )
            : "New conversation";


      const conversation =
        new TeacherAIConversation({

          teacherId:
            ownerId,

          schoolId:
            normalizeOptionalObjectId(
              getUserSchoolId(
                req.user
              )
            ),

          title,

          mode:
            normalizeTeacherAIConversationMode(
              req.body?.mode
            ),

          classId:
            normalizeOptionalObjectId(
              req.body?.classId
            ),

          studentId:
            normalizeOptionalObjectId(
              req.body?.studentId
            ),

          assignmentId:
            normalizeOptionalObjectId(
              req.body?.assignmentId
            ),

          submissionId:
            normalizeOptionalObjectId(
              req.body?.submissionId
            ),

          quizId:
            normalizeOptionalObjectId(
              req.body?.quizId
            ),

          status:
            "active",

          messages:[]

        });


      /*
        Optional initial user message.

        This is useful when the frontend creates the
        conversation as the first prompt is sent.
      */

      if(
        initialMessage
      ){

        conversation.messages.push({

          role:
            "user",

          content:
            initialMessage,

          mode:
            conversation.mode,

          classId:
            conversation.classId,

          studentId:
            conversation.studentId,

          assignmentId:
            conversation.assignmentId,

          submissionId:
            conversation.submissionId,

          quizId:
            conversation.quizId,

          createdAt:
            new Date()

        });

      }


      conversation.ensureTitle();


      await conversation.save();


      return res
        .status(
          201
        )
        .json({

          ok:
            true,

          conversation:
            serializeTeacherAIConversation(
              conversation
            )

        });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya create conversation error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not create the conversation."
      );

    }

  }
);


/* =========================================================
   RECENT CONVERSATIONS

   GET /api/kabezya/teacher/conversations

   Query:
     limit=30
========================================================= */

router.get(
  "/teacher/conversations",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const ownerId =
        getTeacherAIConversationOwnerId(
          req.user
        );


      if(
        !ownerId
      ){

        return res
          .status(
            401
          )
          .json({

            ok:
              false,

            message:
              "Authentication is required."

          });

      }


      const requestedLimit =
        Number(
          req.query?.limit ||
          30
        );


      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.isFinite(
              requestedLimit
            )
              ? Math.floor(
                  requestedLimit
                )
              : 30
          )
        );


      const conversations =
        await TeacherAIConversation
          .find({

            teacherId:
              ownerId,

            status:
              "active"

          })
          .sort({

            lastMessageAt:
              -1,

            updatedAt:
              -1

          })
          .limit(
            limit
          )
          .lean();


      return res.json({

        ok:
          true,

        conversations:
          conversations
            .map(
              conversation =>
                serializeTeacherAIConversation(
                  conversation,
                  {
                    includeMessages:
                      false
                  }
                )
            )
            .filter(
              Boolean
            )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya recent conversations error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not load recent conversations."
      );

    }

  }
);


/* =========================================================
   OPEN ONE CONVERSATION

   GET /api/kabezya/teacher/conversations/:conversationId
========================================================= */

router.get(
  "/teacher/conversations/:conversationId",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId
        );


      return res.json({

        ok:
          true,

        conversation:
          serializeTeacherAIConversation(
            conversation
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya load conversation error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not load the conversation."
      );

    }

  }
);


/* =========================================================
   UPDATE CONVERSATION

   PATCH /api/kabezya/teacher/conversations/:conversationId

   Supports:
   - title
   - mode
   - active context
========================================================= */

router.patch(
  "/teacher/conversations/:conversationId",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId
        );


      /* ===================================================
         TITLE
      =================================================== */

      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "title"
          )
      ){

        conversation.title =
          normalizeTeacherAIConversationTitle(
            req.body?.title
          );

      }


      /* ===================================================
         MODE
      =================================================== */

      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "mode"
          )
      ){

        conversation.mode =
          normalizeTeacherAIConversationMode(
            req.body?.mode
          );

      }


      /* ===================================================
         CONTEXT
      =================================================== */

      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "classId"
          )
      ){

        conversation.classId =
          normalizeOptionalObjectId(
            req.body?.classId
          );

      }


      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "studentId"
          )
      ){

        conversation.studentId =
          normalizeOptionalObjectId(
            req.body?.studentId
          );

      }


      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "assignmentId"
          )
      ){

        conversation.assignmentId =
          normalizeOptionalObjectId(
            req.body?.assignmentId
          );

      }


      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "submissionId"
          )
      ){

        conversation.submissionId =
          normalizeOptionalObjectId(
            req.body?.submissionId
          );

      }


      if(
        Object.prototype
          .hasOwnProperty.call(
            req.body ||
            {},
            "quizId"
          )
      ){

        conversation.quizId =
          normalizeOptionalObjectId(
            req.body?.quizId
          );

      }


      await conversation.save();


      return res.json({

        ok:
          true,

        conversation:
          serializeTeacherAIConversation(
            conversation
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya update conversation error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not update the conversation."
      );

    }

  }
);


/* =========================================================
   APPEND MESSAGE

   POST
   /api/kabezya/teacher/conversations/:conversationId/messages

   Used after:
   - teacher sends prompt
   - real Kabezya response arrives
========================================================= */

router.post(
  "/teacher/conversations/:conversationId/messages",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId
        );


      const messagePayload =
        buildTeacherAIMessagePayload(
          req.body
        );


      conversation.messages.push(
        messagePayload
      );


      /*
        Synchronize the conversation-level active context
        with the latest message when supplied.
      */

      conversation.mode =
        messagePayload.mode ||
        conversation.mode;


      if(
        messagePayload.classId
      ){

        conversation.classId =
          messagePayload.classId;

      }


      if(
        messagePayload.studentId
      ){

        conversation.studentId =
          messagePayload.studentId;

      }


      if(
        messagePayload.assignmentId
      ){

        conversation.assignmentId =
          messagePayload.assignmentId;

      }


      if(
        messagePayload.submissionId
      ){

        conversation.submissionId =
          messagePayload.submissionId;

      }


      if(
        messagePayload.quizId
      ){

        conversation.quizId =
          messagePayload.quizId;

      }


      /*
        The model also provides ensureTitle().
      */

      conversation.ensureTitle();


      await conversation.save();


      const storedMessage =
        conversation.messages[
          conversation.messages.length -
          1
        ];


      return res
        .status(
          201
        )
        .json({

          ok:
            true,

          message:
            serializeTeacherAIMessage(
              storedMessage
            ),

          conversation:
            serializeTeacherAIConversation(
              conversation,
              {
                includeMessages:
                  false
              }
            )

        });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya append conversation message error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not save the conversation message."
      );

    }

  }
);


/* =========================================================
   EDIT USER MESSAGE

   PATCH
   /api/kabezya/teacher/conversations/:conversationId/messages/:messageId

   ChatGPT-style behavior:

   Editing an earlier user prompt invalidates every response
   generated after that prompt.

   Therefore:
     1. update the selected user message
     2. remove every later message
     3. frontend resends the edited prompt
     4. new conversation branch continues from there
========================================================= */

router.patch(
  "/teacher/conversations/:conversationId/messages/:messageId",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId
        );


      const messageId =
        normalizeId(
          req.params
            .messageId
        );


      if(
        !isValidObjectId(
          messageId
        )
      ){

        return res
          .status(
            400
          )
          .json({

            ok:
              false,

            message:
              "A valid conversation message is required."

          });

      }


      const messageIndex =
        conversation.messages
          .findIndex(
            message =>
              sameId(
                message?._id,
                messageId
              )
          );


      if(
        messageIndex <
        0
      ){

        return res
          .status(
            404
          )
          .json({

            ok:
              false,

            message:
              "Conversation message not found."

          });

      }


      const message =
        conversation.messages[
          messageIndex
        ];


      if(
        message.role !==
        "user"
      ){

        return res
          .status(
            400
          )
          .json({

            ok:
              false,

            message:
              "Only teacher messages can be edited."

          });

      }


      const content =
        safeString(
          req.body?.content,
          30000
        );


      if(
        !content
      ){

        return res
          .status(
            400
          )
          .json({

            ok:
              false,

            message:
              "The edited message cannot be empty."

          });

      }


      /* ===================================================
         PRESERVE ORIGINAL CONTENT
      =================================================== */

      if(
        !message.edited &&
        !safeString(
          message.originalContent
        )
      ){

        message.originalContent =
          message.content;

      }


      message.content =
        content;


      message.edited =
        true;


      message.editedAt =
        new Date();


      /* ===================================================
         CHATGPT-STYLE BRANCH RESET

         Remove all messages generated after the edited turn.
      =================================================== */

      conversation.messages =
        conversation.messages
          .slice(
            0,
            messageIndex +
            1
          );


      conversation.response =
        undefined;


      /*
        If first message changed, update title automatically.
      */

      const firstUserIndex =
        conversation.messages
          .findIndex(
            item =>
              item?.role ===
              "user"
          );


      if(
        firstUserIndex ===
        messageIndex
      ){

        conversation.title =
          buildTeacherAIConversationTitle(
            content
          );

      }


      await conversation.save();


      return res.json({

        ok:
          true,

        conversation:
          serializeTeacherAIConversation(
            conversation
          ),

        editedMessage:
          serializeTeacherAIMessage(
            conversation.messages[
              conversation.messages.length -
              1
            ]
          ),

        regenerate:
          true

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya edit conversation message error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not edit the conversation message."
      );

    }

  }
);


/* =========================================================
   ARCHIVE / REMOVE CONVERSATION

   DELETE /api/kabezya/teacher/conversations/:conversationId

   Soft deletion is intentional:
   - removes it from Recent Conversations
   - avoids accidental irreversible loss
   - supports future recovery/audit functionality
========================================================= */

router.delete(
  "/teacher/conversations/:conversationId",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId
        );


      conversation.status =
        "archived";


      await conversation.save();


      return res.json({

        ok:
          true,

        message:
          "Conversation removed from recent conversations.",

        conversationId:
          normalizeId(
            conversation._id
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya remove conversation error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not remove the conversation."
      );

    }

  }
);


/* =========================================================
   RESTORE ARCHIVED CONVERSATION

   PATCH
   /api/kabezya/teacher/conversations/:conversationId/restore
========================================================= */

router.patch(
  "/teacher/conversations/:conversationId/restore",

  auth,

  requireTeacherKabezya,

  async(
    req,
    res
  ) => {

    try{

      const conversation =
        await loadOwnedTeacherAIConversation(
          req.user,
          req.params
            .conversationId,
          {
            includeArchived:
              true
          }
        );


      conversation.status =
        "active";


      conversation.lastMessageAt =
        new Date();


      await conversation.save();


      return res.json({

        ok:
          true,

        conversation:
          serializeTeacherAIConversation(
            conversation
          )

      });

    }catch(
      error
    ){

      console.error(
        "teacherKabezya restore conversation error:",
        error?.message ||
        error
      );


      return sendRouteError(
        res,
        error,
        "Kabezya could not restore the conversation."
      );

    }

  }
);



/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
