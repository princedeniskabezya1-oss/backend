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

const EmployerAIConversation =
  require(
    "../models/EmployerAIConversation"
  );


/* =========================================================
   SERVICES
========================================================= */

const {
  EMPLOYER_KABEZYA_MODES,
  generateEmployerKabezyaResponse
} =
  require(
    "../services/employerKabezyaService"
  );


/* =========================================================
   AIFT EMPLOYER — KABEZYA AI

   Responsibilities:
   ---------------------------------------------------------
   - secure Employer-only Kabezya access
   - generate Employer AI responses
   - create persistent conversations
   - load recent conversations
   - load one saved conversation
   - persist user / assistant messages
   - edit a previous user message
   - remove conversation turns after an edit
   - enforce account-level rate limiting
   - prevent one Employer from reading another Employer's AI
     conversations

   IMPORTANT:
   ---------------------------------------------------------
   Teacher Kabezya remains completely separate.

   Teacher:
   /api/kabezya/teacher/*

   Employer:
   /api/kabezya/employer/*
========================================================= */


/* =========================================================
   RATE LIMIT
========================================================= */

const EMPLOYER_AI_WINDOW_MS =
  5 *
  60 *
  1000;


const EMPLOYER_AI_MAX_REQUESTS =
  180;


const employerAIUsage =
  new Map();


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value,
  maxLength = 10000
){

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(value)
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
    normalizeId(value);


  return Boolean(
    id &&
    mongoose.Types.ObjectId
      .isValid(id)
  );

}


/* =========================================================
   ARRAY
========================================================= */

function asArray(
  value
){

  return Array.isArray(value)
    ? value
    : [];

}


/* =========================================================
   USER ROLE
========================================================= */

function getRole(
  user
){

  return safeString(
    user?.role,
    100
  ).toLowerCase();

}


/* =========================================================
   EMPLOYER ACCESS
========================================================= */

function isEmployerUser(
  user
){

  return getRole(user) ===
    "employer";

}


/* =========================================================
   OWNER ID
========================================================= */

function getEmployerOwnerId(
  user
){

  return normalizeId(
    user?._id
  );

}


/* =========================================================
   REQUIRE EMPLOYER
========================================================= */

function requireEmployer(
  req,
  res,
  next
){

  if (
    !req.user ||
    !isEmployerUser(req.user)
  ) {

    return res.status(403).json({
      message:
        "Employer access required.",
      code:
        "EMPLOYER_KABEZYA_FORBIDDEN"
    });

  }


  const employerId =
    getEmployerOwnerId(
      req.user
    );


  if (
    !employerId ||
    !isValidObjectId(
      employerId
    )
  ) {

    return res.status(403).json({
      message:
        "A valid Employer account is required.",
      code:
        "EMPLOYER_KABEZYA_INVALID_ACCOUNT"
    });

  }


  next();

}


/* =========================================================
   RATE LIMIT KEY
========================================================= */

function getEmployerAIRateLimitKey(
  req
){

  return (
    getEmployerOwnerId(
      req.user
    ) ||
    safeString(
      req.ip,
      200
    ) ||
    "unknown"
  );

}


/* =========================================================
   RATE LIMIT MIDDLEWARE
========================================================= */

function employerAIRateLimit(
  req,
  res,
  next
){

  const now =
    Date.now();


  const key =
    getEmployerAIRateLimitKey(
      req
    );


  const existing =
    employerAIUsage.get(
      key
    );


  let bucket =
    existing;


  if (
    !bucket ||
    (
      now -
      Number(
        bucket.startedAt ||
        0
      )
    ) >=
      EMPLOYER_AI_WINDOW_MS
  ) {

    bucket = {
      startedAt:
        now,

      count:
        0
    };

  }


  if (
    Number(
      bucket.count ||
      0
    ) >=
    EMPLOYER_AI_MAX_REQUESTS
  ) {

    const elapsed =
      now -
      Number(
        bucket.startedAt ||
        now
      );


    const remainingMs =
      Math.max(
        0,
        EMPLOYER_AI_WINDOW_MS -
        elapsed
      );


    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          remainingMs /
          1000
        )
      );


    res.setHeader(
      "Retry-After",
      String(
        retryAfterSeconds
      )
    );


    return res.status(429).json({
      message:
        "Too many Kabezya requests. Please wait a moment and try again.",

      code:
        "EMPLOYER_KABEZYA_RATE_LIMITED",

      retryAfterSeconds
    });

  }


  bucket.count =
    Number(
      bucket.count ||
      0
    ) + 1;


  employerAIUsage.set(
    key,
    bucket
  );


  next();

}


/* =========================================================
   NORMALIZE MODE
========================================================= */

function normalizeEmployerKabezyaMode(
  value
){

  const requested =
    safeString(
      value,
      100
    ).toLowerCase();


  const modes =
    Object.values(
      EMPLOYER_KABEZYA_MODES ||
      {}
    );


  if (
    modes.includes(
      requested
    )
  ) {

    return requested;

  }


  return (
    EMPLOYER_KABEZYA_MODES
      ?.ASSISTANT ||
    "assistant"
  );

}


/* =========================================================
   SAFE CONTEXT
========================================================= */

function normalizeEmployerContext(
  value
){

  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {

    return {};

  }


  const context = {};


  if (value.workspace) {

    context.workspace =
      safeString(
        value.workspace,
        100
      );

  }


  if (value.currentSection) {

    context.currentSection =
      safeString(
        value.currentSection,
        100
      );

  }


  if (
    value.employer &&
    typeof value.employer ===
      "object" &&
    !Array.isArray(
      value.employer
    )
  ) {

    context.employer = {

      id:
        safeString(
          value.employer.id,
          200
        ),

      name:
        safeString(
          value.employer.name,
          500
        ),

      industry:
        safeString(
          value.employer.industry,
          500
        ),

      location:
        safeString(
          value.employer.location,
          500
        )

    };

  }


  if (
    value.summary &&
    typeof value.summary ===
      "object" &&
    !Array.isArray(
      value.summary
    )
  ) {

    context.summary = {

      jobs:
        Math.max(
          0,
          Number(
            value.summary.jobs ||
            0
          ) || 0
        ),

      activeJobs:
        Math.max(
          0,
          Number(
            value.summary.activeJobs ||
            0
          ) || 0
        ),

      applications:
        Math.max(
          0,
          Number(
            value.summary.applications ||
            0
          ) || 0
        )

    };

  }


  return context;

}


/* =========================================================
   NORMALIZE HISTORY
========================================================= */

function normalizeHistory(
  value
){

  return asArray(value)
    .slice(-30)
    .map(
      item => {

        const role =
          safeString(
            item?.role,
            50
          ).toLowerCase();


        const content =
          safeString(
            item?.content ??
            item?.message ??
            item?.text,
            12000
          );


        if (!content) {
          return null;
        }


        return {

          role:
            role ===
            "assistant"
              ? "assistant"
              : "user",

          content

        };

      }
    )
    .filter(Boolean);

}


/* =========================================================
   SAFE TITLE
========================================================= */

function createConversationTitle(
  message
){

  const text =
    safeString(
      message,
      1000
    );


  if (!text) {

    return "New conversation";

  }


  const compact =
    text.replace(
      /\s+/g,
      " "
    );


  if (
    compact.length <=
    70
  ) {

    return compact;

  }


  return (
    compact.slice(
      0,
      67
    ) +
    "..."
  );

}


/* =========================================================
   SERIALIZE MESSAGE
========================================================= */

function serializeMessage(
  message
){

  if (!message) {
    return null;
  }


  return {

    id:
      normalizeId(
        message._id ||
        message.id
      ),

    _id:
      normalizeId(
        message._id ||
        message.id
      ),

    role:
      safeString(
        message.role,
        50
      ),

    content:
      safeString(
        message.content,
        20000
      ),

    responseSnapshot:
      message.responseSnapshot ??
      null,

    createdAt:
      message.createdAt ||
      null,

    updatedAt:
      message.updatedAt ||
      null

  };

}


/* =========================================================
   SERIALIZE CONVERSATION
========================================================= */

function serializeConversation(
  conversation,
  options = {}
){

  if (!conversation) {
    return null;
  }


  const includeMessages =
    options.includeMessages !==
    false;


  const result = {

    id:
      normalizeId(
        conversation._id ||
        conversation.id
      ),

    _id:
      normalizeId(
        conversation._id ||
        conversation.id
      ),

    title:
      safeString(
        conversation.title,
        500
      ) ||
      "Conversation",

    mode:
      safeString(
        conversation.mode,
        100
      ) ||
      "assistant",

    context:
      conversation.context ||
      {},

    createdAt:
      conversation.createdAt ||
      null,

    updatedAt:
      conversation.updatedAt ||
      null,

    lastMessageAt:
      conversation.lastMessageAt ||
      conversation.updatedAt ||
      conversation.createdAt ||
      null

  };


  if (includeMessages) {

    result.messages =
      asArray(
        conversation.messages
      )
        .map(
          serializeMessage
        )
        .filter(Boolean);

  }


  return result;

}


/* =========================================================
   FIND OWNED CONVERSATION
========================================================= */

async function findOwnedConversation(
  employerId,
  conversationId
){

  if (
    !isValidObjectId(
      conversationId
    )
  ) {

    return null;

  }


  return EmployerAIConversation
    .findOne({
      _id:
        conversationId,

      employerId:
        employerId
    });

}


/* =========================================================
   AI RESPONSE TEXT
========================================================= */

function getEmployerKabezyaResponseText(
  result
){

  if (
    typeof result ===
    "string"
  ) {

    return safeString(
      result,
      20000
    );

  }


  return safeString(
    result?.reply ??
    result?.answer ??
    result?.message ??
    result?.response ??
    result?.content ??
    result?.text,
    20000
  );

}


/* =========================================================
   HEALTH / CAPABILITIES
========================================================= */

router.get(
  "/",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    return res.json({

      ok:true,

      service:
        "AIFT Employer Kabezya",

      workspace:
        "employer",

      modes:
        Object.values(
          EMPLOYER_KABEZYA_MODES ||
          {}
        )

    });

  }
);


/* =========================================================
   GET RECENT CONVERSATIONS
========================================================= */

router.get(
  "/conversations",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const requestedLimit =
        Number(
          req.query.limit ||
          40
        );


      const limit =
        Math.max(
          1,
          Math.min(
            Number.isFinite(
              requestedLimit
            )
              ? requestedLimit
              : 40,
            100
          )
        );


      const conversations =
        await EmployerAIConversation
          .find({
            employerId:
              employerId
          })
          .sort({
            lastMessageAt:-1,
            updatedAt:-1,
            createdAt:-1
          })
          .limit(
            limit
          )
          .lean();


      return res.json({

        conversations:
          conversations
            .map(
              conversation =>
                serializeConversation(
                  conversation,
                  {
                    includeMessages:
                      false
                  }
                )
            )
            .filter(Boolean)

      });

    } catch (error) {

      console.error(
        "GET Employer Kabezya conversations error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not load Kabezya conversations.",

        code:
          "EMPLOYER_KABEZYA_CONVERSATIONS_LOAD_FAILED"
      });

    }

  }
);


/* =========================================================
   CREATE CONVERSATION
========================================================= */

router.post(
  "/conversations",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const mode =
        normalizeEmployerKabezyaMode(
          req.body?.mode
        );


      const context =
        normalizeEmployerContext(
          req.body?.context
        );


      const initialMessage =
        safeString(
          req.body?.message ??
          req.body?.prompt,
          12000
        );


      const requestedTitle =
        safeString(
          req.body?.title,
          200
        );


      const conversation =
        await EmployerAIConversation.create({

          employerId:
            employerId,

          mode,

          title:
            requestedTitle ||
            createConversationTitle(
              initialMessage
            ),

          context,

          messages:[],

          lastMessageAt:
            new Date()

        });


      return res
        .status(201)
        .json(
          serializeConversation(
            conversation
          )
        );

    } catch (error) {

      console.error(
        "POST Employer Kabezya conversation error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not create the Kabezya conversation.",

        code:
          "EMPLOYER_KABEZYA_CONVERSATION_CREATE_FAILED"
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
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const conversationId =
        normalizeId(
          req.params
            .conversationId
        );


      if (
        !isValidObjectId(
          conversationId
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid conversation ID.",

          code:
            "EMPLOYER_KABEZYA_INVALID_CONVERSATION"
        });

      }


      const conversation =
        await findOwnedConversation(
          employerId,
          conversationId
        );


      if (!conversation) {

        return res.status(404).json({
          message:
            "Kabezya conversation not found.",

          code:
            "EMPLOYER_KABEZYA_CONVERSATION_NOT_FOUND"
        });

      }


      return res.json(
        serializeConversation(
          conversation
        )
      );

    } catch (error) {

      console.error(
        "GET Employer Kabezya conversation error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not load the Kabezya conversation.",

        code:
          "EMPLOYER_KABEZYA_CONVERSATION_LOAD_FAILED"
      });

    }

  }
);


/* =========================================================
   SAVE MESSAGE
========================================================= */

router.post(
  "/conversations/:conversationId/messages",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const conversationId =
        normalizeId(
          req.params
            .conversationId
        );


      if (
        !isValidObjectId(
          conversationId
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid conversation ID.",

          code:
            "EMPLOYER_KABEZYA_INVALID_CONVERSATION"
        });

      }


      const role =
        safeString(
          req.body?.role,
          50
        ).toLowerCase();


      if (
        ![
          "user",
          "assistant"
        ].includes(role)
      ) {

        return res.status(400).json({
          message:
            "Message role must be user or assistant.",

          code:
            "EMPLOYER_KABEZYA_INVALID_MESSAGE_ROLE"
        });

      }


      const content =
        safeString(
          req.body?.content,
          20000
        );


      if (!content) {

        return res.status(400).json({
          message:
            "Message content is required.",

          code:
            "EMPLOYER_KABEZYA_MESSAGE_REQUIRED"
        });

      }


      const conversation =
        await findOwnedConversation(
          employerId,
          conversationId
        );


      if (!conversation) {

        return res.status(404).json({
          message:
            "Kabezya conversation not found.",

          code:
            "EMPLOYER_KABEZYA_CONVERSATION_NOT_FOUND"
        });

      }


      conversation.messages.push({

        role,

        content,

        responseSnapshot:
          req.body
            ?.responseSnapshot ??
          null

      });


      conversation.lastMessageAt =
        new Date();


      /*
       * For a brand-new conversation,
       * use the first user message as
       * its Recent Conversations title.
       */
      if (
        role === "user" &&
        (
          !conversation.title ||
          conversation.title ===
            "New conversation"
        )
      ) {

        conversation.title =
          createConversationTitle(
            content
          );

      }


      /*
       * Keep conversation storage bounded.
       * This protects MongoDB documents from
       * unlimited growth.
       */
      if (
        conversation.messages.length >
        200
      ) {

        conversation.messages =
          conversation.messages.slice(
            -200
          );

      }


      await conversation.save();


      const savedMessage =
        conversation.messages[
          conversation.messages.length -
          1
        ];


      return res
        .status(201)
        .json({

          message:
            serializeMessage(
              savedMessage
            ),

          conversation:
            serializeConversation(
              conversation
            )

        });

    } catch (error) {

      console.error(
        "POST Employer Kabezya message error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not save the Kabezya message.",

        code:
          "EMPLOYER_KABEZYA_MESSAGE_SAVE_FAILED"
      });

    }

  }
);


/* =========================================================
   EDIT MESSAGE

   This follows the important Teacher behavior:
   after an earlier user message is edited, every later turn
   is removed so a new assistant response can be generated
   from that point.
========================================================= */

router.patch(
  "/conversations/:conversationId/messages/:messageId",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const conversationId =
        normalizeId(
          req.params
            .conversationId
        );


      const messageId =
        normalizeId(
          req.params
            .messageId
        );


      if (
        !isValidObjectId(
          conversationId
        ) ||
        !isValidObjectId(
          messageId
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid conversation or message ID.",

          code:
            "EMPLOYER_KABEZYA_INVALID_MESSAGE"
        });

      }


      const content =
        safeString(
          req.body?.content,
          20000
        );


      if (!content) {

        return res.status(400).json({
          message:
            "Edited message content is required.",

          code:
            "EMPLOYER_KABEZYA_MESSAGE_REQUIRED"
        });

      }


      const conversation =
        await findOwnedConversation(
          employerId,
          conversationId
        );


      if (!conversation) {

        return res.status(404).json({
          message:
            "Kabezya conversation not found.",

          code:
            "EMPLOYER_KABEZYA_CONVERSATION_NOT_FOUND"
        });

      }


      const messageIndex =
        conversation.messages
          .findIndex(
            message =>
              normalizeId(
                message._id
              ) ===
              messageId
          );


      if (
        messageIndex <
        0
      ) {

        return res.status(404).json({
          message:
            "Kabezya message not found.",

          code:
            "EMPLOYER_KABEZYA_MESSAGE_NOT_FOUND"
        });

      }


      const selectedMessage =
        conversation.messages[
          messageIndex
        ];


      if (
        safeString(
          selectedMessage.role,
          50
        ).toLowerCase() !==
        "user"
      ) {

        return res.status(400).json({
          message:
            "Only Employer messages can be edited.",

          code:
            "EMPLOYER_KABEZYA_ASSISTANT_MESSAGE_IMMUTABLE"
        });

      }


      selectedMessage.content =
        content;


      /*
       * Remove every turn after the
       * edited Employer message.
       */
      conversation.messages =
        conversation.messages.slice(
          0,
          messageIndex + 1
        );


      conversation.lastMessageAt =
        new Date();


      if (
        messageIndex ===
        0
      ) {

        conversation.title =
          createConversationTitle(
            content
          );

      }


      await conversation.save();


      return res.json(
        serializeConversation(
          conversation
        )
      );

    } catch (error) {

      console.error(
        "PATCH Employer Kabezya message error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not update the Kabezya message.",

        code:
          "EMPLOYER_KABEZYA_MESSAGE_UPDATE_FAILED"
      });

    }

  }
);


/* =========================================================
   DELETE CONVERSATION
========================================================= */

router.delete(
  "/conversations/:conversationId",
  auth,
  requireEmployer,
  async (
    req,
    res
  ) => {

    try {

      const employerId =
        getEmployerOwnerId(
          req.user
        );


      const conversationId =
        normalizeId(
          req.params
            .conversationId
        );


      if (
        !isValidObjectId(
          conversationId
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid conversation ID.",

          code:
            "EMPLOYER_KABEZYA_INVALID_CONVERSATION"
        });

      }


      const result =
        await EmployerAIConversation
          .deleteOne({

            _id:
              conversationId,

            employerId:
              employerId

          });


      if (
        !result.deletedCount
      ) {

        return res.status(404).json({
          message:
            "Kabezya conversation not found.",

          code:
            "EMPLOYER_KABEZYA_CONVERSATION_NOT_FOUND"
        });

      }


      return res.json({
        success:true
      });

    } catch (error) {

      console.error(
        "DELETE Employer Kabezya conversation error:",
        error
      );


      return res.status(500).json({
        message:
          "Could not delete the Kabezya conversation.",

        code:
          "EMPLOYER_KABEZYA_CONVERSATION_DELETE_FAILED"
      });

    }

  }
);


/* =========================================================
   GENERAL EMPLOYER ASSISTANT
========================================================= */

router.post(
  "/assistant",
  auth,
  requireEmployer,
  employerAIRateLimit,
  async (
    req,
    res
  ) => {

    try {

      const prompt =
        safeString(
          req.body?.message ??
          req.body?.prompt,
          12000
        );


      if (!prompt) {

        return res.status(400).json({
          message:
            "A message is required.",

          code:
            "EMPLOYER_KABEZYA_PROMPT_REQUIRED"
        });

      }


      const mode =
        normalizeEmployerKabezyaMode(
          req.body?.mode
        );


      const context =
        normalizeEmployerContext(
          req.body?.context
        );


      const history =
        normalizeHistory(
          req.body?.history
        );


      const employerId =
        getEmployerOwnerId(
          req.user
        );


      /*
       * Do not trust an Employer ID supplied
       * by the browser. The authenticated
       * account is always authoritative.
       */
      context.workspace =
        "employer";


      context.authenticatedEmployerId =
        employerId;


      context.employer =
        context.employer || {};


      context.employer.id =
        employerId;


      context.employer.name =
        safeString(
          req.user?.companyName ||
          req.user?.name ||
          context.employer.name,
          500
        );


      context.employer.industry =
        safeString(
          req.user?.industry ||
          context.employer.industry,
          500
        );


      context.employer.location =
        safeString(
          req.user?.location ||
          context.employer.location,
          500
        );


      const result =
        await generateEmployerKabezyaResponse({

          employer:
            req.user,

          employerId,

          mode,

          prompt,

          history,

          context

        });


      const reply =
        getEmployerKabezyaResponseText(
          result
        );


      if (!reply) {

        return res.status(502).json({
          message:
            "Kabezya returned an empty response.",

          code:
            "EMPLOYER_KABEZYA_EMPTY_RESPONSE"
        });

      }


      return res.json({

        reply,

        answer:
          reply,

        response:
          reply,

        mode,

        conversationId:
          normalizeId(
            req.body
              ?.conversationId
          ) ||
          null,

        usage:
          result?.usage ||
          null,

        model:
          result?.model ||
          null,

        meta:
          result?.meta ||
          null

      });

    } catch (error) {

      console.error(
        "POST Employer Kabezya assistant error:",
        error
      );


      const providerStatus =
        Number(
          error?.status ||
          error?.statusCode ||
          error?.response?.status ||
          0
        );


      if (
        providerStatus ===
        429
      ) {

        return res.status(429).json({
          message:
            "Kabezya is receiving many requests right now. Please try again shortly.",

          code:
            "EMPLOYER_KABEZYA_PROVIDER_RATE_LIMITED"
        });

      }


      if (
        providerStatus ===
        401 ||
        providerStatus ===
        403
      ) {

        return res.status(502).json({
          message:
            "The Kabezya AI provider could not authorize this request.",

          code:
            "EMPLOYER_KABEZYA_PROVIDER_AUTH_FAILED"
        });

      }


      if (
        providerStatus >=
        500
      ) {

        return res.status(502).json({
          message:
            "Kabezya's AI provider is temporarily unavailable.",

          code:
            "EMPLOYER_KABEZYA_PROVIDER_UNAVAILABLE"
        });

      }


      return res.status(500).json({
        message:
          safeString(
            error?.publicMessage ||
            error?.message,
            500
          ) ||
          "Kabezya could not complete this request.",

        code:
          "EMPLOYER_KABEZYA_REQUEST_FAILED"
      });

    }

  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
