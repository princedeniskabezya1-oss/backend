const express =
  require("express");

const mongoose =
  require("mongoose");

const {
  generateAIResponse
} =
  require("../services/aiProvider");


const auth =
  require("../middleware/auth");

const StudentAIConversation =
  require("../models/StudentAIConversation");


const {
  ALLOWED_AI_MODES,
  ALLOWED_SOURCE_TYPES,
  MAX_MESSAGE_LENGTH,
  normalizeString,
  normalizeId,
  normalizeRole,
  isValidObjectId,
  getUserSchoolIds,
  buildStudentLearningContext,
  buildStudentAIModelInput,
  createStudentAIConversationTitle
} =
  require("../services/studentAIService");


const router =
  express.Router();


/* =========================================================
   STUDENT ACCESS
========================================================= */

function requireStudent(
  req
){

  const role =
    normalizeRole(
      req.user?.role
    );


  if (
    role !==
    "student"
  ){

    const error =
      new Error(
        "AI Learning is currently available to student accounts."
      );

    error.statusCode =
      403;

    throw error;

  }


  return req.user;

}


/* =========================================================
   SCHOOL ID
========================================================= */

function getStudentSchoolId(
  student
){

  const schoolIds =
    getUserSchoolIds(
      student
    );


  if (
    !schoolIds.length
  ){
    return null;
  }


  return schoolIds[0];

}


/* =========================================================
   SAFE MODE
========================================================= */

function normalizeAIMode(
  value
){

  const mode =
    normalizeString(
      value,
      30
    )
      .toLowerCase();


  return ALLOWED_AI_MODES.has(
    mode
  )
    ? mode
    : "ask";

}


/* =========================================================
   SAFE SOURCE TYPE
========================================================= */

function normalizeAISourceType(
  value
){

  const sourceType =
    normalizeString(
      value,
      30
    )
      .toLowerCase();


  return ALLOWED_SOURCE_TYPES.has(
    sourceType
  )
    ? sourceType
    : "general";

}


/* =========================================================
   CONVERSATION SERIALIZER
========================================================= */

function serializeConversation(
  conversation,
  {
    includeMessages = true
  } = {}
){

  if (!conversation){
    return null;
  }


  const raw =
    typeof conversation.toObject ===
      "function"
      ? conversation.toObject()
      : conversation;


  return {
    _id:
      normalizeId(
        raw._id
      ),

    title:
      normalizeString(
        raw.title,
        180
      ),

    mode:
      raw.mode ||
      "ask",

    classId:
      normalizeId(
        raw.classId
      ) ||
      null,

    sourceType:
      raw.sourceType ||
      "general",

    sourceId:
      normalizeId(
        raw.sourceId
      ) ||
      null,

    status:
      raw.status ||
      "active",

    messageCount:
      Number(
        raw.messageCount ||
        0
      ),

    lastMessageAt:
      raw.lastMessageAt ||
      null,

    createdAt:
      raw.createdAt ||
      null,

    updatedAt:
      raw.updatedAt ||
      null,

    messages:
      includeMessages
        ? (
            Array.isArray(
              raw.messages
            )
              ? raw.messages.map(
                  message => ({
                    _id:
                      normalizeId(
                        message._id
                      ),

                    role:
                      message.role,

                    content:
                      message.content,

                    mode:
                      message.mode ||
                      raw.mode ||
                      "ask",

                    createdAt:
                      message.createdAt ||
                      null
                  })
                )
              : []
          )
        : undefined
  };

}


/* =========================================================
   CONVERSATION OWNERSHIP
========================================================= */

async function loadOwnedConversation(
  conversationId,
  studentId
){

  if (
    !isValidObjectId(
      conversationId
    )
  ){

    const error =
      new Error(
        "Invalid AI conversation ID."
      );

    error.statusCode =
      400;

    throw error;

  }


  const conversation =
    await StudentAIConversation
      .findOne({
        _id:
          conversationId,

        studentId
      });


  if (!conversation){

    const error =
      new Error(
        "AI conversation not found."
      );

    error.statusCode =
      404;

    throw error;

  }


  return conversation;

}


/* =========================================================
   USAGE CONTROL
========================================================= */

const AI_REQUEST_WINDOW_MS =
  10 * 60 * 1000;

const MAX_AI_REQUESTS_PER_WINDOW =
  30;


async function enforceStudentAIUsageLimit(
  studentId
){

  const since =
    new Date(
      Date.now() -
      AI_REQUEST_WINDOW_MS
    );


  const result =
    await StudentAIConversation
      .aggregate([
        {
          $match:{
            studentId:
              new mongoose.Types.ObjectId(
                studentId
              )
          }
        },

        {
          $unwind:
            "$messages"
        },

        {
          $match:{
            "messages.role":
              "user",

            "messages.createdAt":{
              $gte:
                since
            }
          }
        },

        {
          $count:
            "count"
        }
      ]);


  const count =
    Number(
      result?.[0]?.count ||
      0
    );


  if (
    count >=
    MAX_AI_REQUESTS_PER_WINDOW
  ){

    const error =
      new Error(
        "You have reached the temporary AI Learning request limit. Please wait a few minutes and try again."
      );

    error.statusCode =
      429;

    throw error;

  }

}



/* =========================================================
   GET RECENT AI CONVERSATIONS
========================================================= */

router.get(
  "/conversations",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const student =
        requireStudent(
          req
        );


      const conversations =
        await StudentAIConversation
          .find({
            studentId:
              student._id,

            status:
              "active"
          })
          .sort({
            lastMessageAt:-1,
            updatedAt:-1
          })
          .limit(20)
          .select(
            "-messages"
          )
          .lean();


      return res.json({
        conversations:
          conversations.map(
            conversation =>
              serializeConversation(
                conversation,
                {
                  includeMessages:
                    false
                }
              )
          )
      });

    }catch(error){

      console.error(
        "GET /api/student-ai/conversations failed:",
        error
      );


      return res
        .status(
          error.statusCode ||
          500
        )
        .json({
          message:
            error.message ||
            "Could not load AI conversations."
        });

    }

  }
);


/* =========================================================
   GET ONE CONVERSATION
========================================================= */

router.get(
  "/conversations/:conversationId",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const student =
        requireStudent(
          req
        );


      const conversation =
        await loadOwnedConversation(
          req.params
            .conversationId,
          student._id
        );


      return res.json({
        conversation:
          serializeConversation(
            conversation
          )
      });

    }catch(error){

      console.error(
        "GET student AI conversation failed:",
        error
      );


      return res
        .status(
          error.statusCode ||
          500
        )
        .json({
          message:
            error.message ||
            "Could not load AI conversation."
        });

    }

  }
);


/* =========================================================
   CREATE / CONTINUE AI CHAT
========================================================= */

router.post(
  "/chat",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const student =
        requireStudent(
          req
        );


      await enforceStudentAIUsageLimit(
        student._id
      );


      const message =
        normalizeString(
          req.body?.message,
          MAX_MESSAGE_LENGTH
        );


      if (!message){

        return res
          .status(400)
          .json({
            message:
              "A message is required."
          });

      }


      const mode =
        normalizeAIMode(
          req.body?.mode
        );


      const sourceType =
        normalizeAISourceType(
          req.body?.sourceType
        );


      const classId =
        normalizeId(
          req.body?.classId
        );


      const sourceId =
        normalizeId(
          req.body?.sourceId
        );


      /*
        Resource source support is intentionally blocked
        until the exact StudentResource backend model is
        connected.

        Never trust a resource object sent directly from
        the browser.
      */

      if (
        sourceType ===
        "resource"
      ){

        return res
          .status(501)
          .json({
            message:
              "AI Resource context is not connected to the verified resource backend yet."
          });

      }


      if (
        sourceType !==
          "general" &&
        !sourceId
      ){

        return res
          .status(400)
          .json({
            message:
              "Select the learning item you want to use with AI."
          });

      }


      let conversation =
        null;


      const requestedConversationId =
        normalizeId(
          req.body?.conversationId
        );


      if (
        requestedConversationId
      ){

        conversation =
          await loadOwnedConversation(
            requestedConversationId,
            student._id
          );

      }


      /* =====================================================
         BUILD VERIFIED COURSE CONTEXT
      ===================================================== */

      const learningContext =
        await buildStudentLearningContext({
          student,

          classId,

          sourceType,

          sourceId
        });


      /*
        Never trust browser-supplied chat history when a real
        conversation exists.

        History comes from MongoDB.
      */

      const history =
        conversation
          ? conversation.messages
              .filter(
                storedMessage =>
                  (
                    storedMessage.role ===
                      "user" ||
                    storedMessage.role ===
                      "assistant"
                  )
              )
              .slice(
                -12
              )
              .map(
                storedMessage => ({
                  role:
                    storedMessage.role,

                  content:
                    storedMessage.content
                })
              )
          : [];


      const modelInput =
        buildStudentAIModelInput({
          message,
          mode,
          history,

          contextText:
            learningContext
              .contextText
        });


      /* =====================================================
         GENERATE REAL AI RESPONSE
      ===================================================== */

const generated =
  await generateAIResponse({

    systemInstruction:
      modelInput.systemInstruction,

    contextText:
      learningContext.contextText,

    history:
      modelInput.history,

    message:
      modelInput.message

  });


      /* =====================================================
         CREATE CONVERSATION WHEN NECESSARY
      ===================================================== */

      if (!conversation){

        conversation =
          new StudentAIConversation({

            studentId:
              student._id,

            schoolId:
              getStudentSchoolId(
                student
              ),

            title:
              createStudentAIConversationTitle(
                message
              ),

            mode,

            classId:
              learningContext
                .classDoc?._id ||
              (
                isValidObjectId(
                  classId
                )
                  ? classId
                  : null
              ),

            sourceType,

            sourceId:
              (
                sourceId &&
                isValidObjectId(
                  sourceId
                )
              )
                ? sourceId
                : null,

            status:
              "active",

            messages:[]
          });

      }else{

        /*
          The most recently selected context becomes the
          active context for the conversation.
        */

        conversation.mode =
          mode;


        conversation.classId =
          learningContext
            .classDoc?._id ||
          (
            isValidObjectId(
              classId
            )
              ? classId
              : null
          );


        conversation.sourceType =
          sourceType;


        conversation.sourceId =
          (
            sourceId &&
            isValidObjectId(
              sourceId
            )
          )
            ? sourceId
            : null;

      }


      /* =====================================================
         STORE USER MESSAGE
      ===================================================== */

      conversation.messages.push({

        role:
          "user",

        content:
          message,

        mode,

        classId:
          conversation.classId,

        sourceType,

        sourceId:
          conversation.sourceId,

        createdAt:
          new Date()

      });


      /* =====================================================
         STORE ASSISTANT RESPONSE
      ===================================================== */

      conversation.messages.push({

        role:
          "assistant",

        content:
          generated.text,

        mode,

        classId:
          conversation.classId,

        sourceType,

        sourceId:
          conversation.sourceId,

        model:
          generated.model,

        inputTokens:
          generated.usage
            .inputTokens,

        outputTokens:
          generated.usage
            .outputTokens,

        totalTokens:
          generated.usage
            .totalTokens,

        responseTimeMs:
          generated.responseTimeMs,

        createdAt:
          new Date()

      });


      await conversation.save();


      return res.json({

        success:true,

        conversationId:
          normalizeId(
            conversation._id
          ),

        message:{
          role:
            "assistant",

          content:
            generated.text,

          mode,

          createdAt:
            conversation.messages[
              conversation.messages.length -
              1
            ].createdAt
        },

        context:{
          classId:
            normalizeId(
              conversation.classId
            ) ||
            null,

          sourceType,

          sourceId:
            normalizeId(
              conversation.sourceId
            ) ||
            null,

          grounded:
            learningContext
              .hasCourseContext ===
            true
        },

        usage:{
          inputTokens:
            generated.usage
              .inputTokens,

          outputTokens:
            generated.usage
              .outputTokens,

          totalTokens:
            generated.usage
              .totalTokens
        }

      });

    }catch(error){

      console.error(
        "POST /api/student-ai/chat failed:",
        error
      );


      /*
        Do not expose provider internals or API secrets
        to the browser.
      */

      if (
        error.statusCode
      ){

        return res
          .status(
            error.statusCode
          )
          .json({
            message:
              error.message
          });

      }


const providerStatus =
  Number(
    error?.status ||
    error?.statusCode ||
    error?.code ||
    0
  );


if (
  providerStatus ===
    429
){

  return res
    .status(429)
    .json({
      message:
        "AI Learning is busy right now. Please try again shortly."
    });

}


if (
  providerStatus === 401 ||
  providerStatus === 403
){

  console.error(
    "Gemini authentication failed. Check GEMINI_API_KEY."
  );


  return res
    .status(503)
    .json({
      message:
        "AI Learning is temporarily unavailable."
    });

}


/*
  Keep the browser response safe while preserving
  enough information in Render logs to diagnose
  provider failures.
*/

console.error(
  "Unhandled Student AI provider failure:",
  {
    status:
      providerStatus,

    name:
      error?.name ||
      "",

    message:
      error?.message ||
      ""
  }
);


return res
  .status(500)
  .json({
    message:
      "AIFT could not generate the learning response."
  });

    }

  }
);


/* =========================================================
   CLEAR / ARCHIVE CONVERSATION
========================================================= */

router.delete(
  "/conversations/:conversationId",
  auth,
  async (
    req,
    res
  ) => {

    try{

      const student =
        requireStudent(
          req
        );


      const conversation =
        await loadOwnedConversation(
          req.params
            .conversationId,
          student._id
        );


      conversation.status =
        "archived";


      await conversation.save();


      return res.json({
        success:true
      });

    }catch(error){

      console.error(
        "DELETE student AI conversation failed:",
        error
      );


      return res
        .status(
          error.statusCode ||
          500
        )
        .json({
          message:
            error.message ||
            "Could not remove AI conversation."
        });

    }

  }
);


module.exports =
  router;
