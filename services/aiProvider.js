const {
  GoogleGenAI
} = require(
  "@google/genai"
);


/* =========================================================
   GEMINI CLIENT
========================================================= */

let geminiClient = null;


/* =========================================================
   NORMALIZE PROVIDER ERROR
========================================================= */

function getProviderStatus(error){

  const candidates = [
    error?.status,
    error?.statusCode,
    error?.code,
    error?.response?.status,
    error?.error?.code
  ];

  for (
    const candidate
    of candidates
  ){

    const value =
      Number(
        candidate
      );

    if (
      Number.isFinite(value) &&
      value >= 400 &&
      value <= 599
    ){
      return value;
    }

  }

  return 0;
}


function normalizeGeminiError(
  error
){

  const status =
    getProviderStatus(
      error
    );

  const providerMessage =
    String(
      error?.message ||
      error?.error?.message ||
      error?.response?.data?.error?.message ||
      ""
    ).trim();


  /*
    Authentication / invalid API key.
  */

  if (
    status === 401 ||
    status === 403 ||
    /api[\s_-]*key/i.test(
      providerMessage
    ) ||
    /permission denied/i.test(
      providerMessage
    ) ||
    /unauthenticated/i.test(
      providerMessage
    )
  ){

    const normalized =
      new Error(
        "Gemini authentication failed. Check the GEMINI_API_KEY configured on the backend."
      );

    normalized.statusCode =
      503;

    normalized.providerStatus =
      status;

    normalized.cause =
      error;

    return normalized;
  }


  /*
    Rate limit / quota.
  */

  if (
    status === 429 ||
    /quota/i.test(
      providerMessage
    ) ||
    /rate limit/i.test(
      providerMessage
    ) ||
    /resource exhausted/i.test(
      providerMessage
    )
  ){

    const normalized =
      new Error(
        "AI Learning is temporarily busy or has reached its Gemini quota. Please try again shortly."
      );

    normalized.statusCode =
      429;

    normalized.providerStatus =
      status;

    normalized.cause =
      error;

    return normalized;
  }


  /*
    Invalid request / unsupported model configuration.
  */

  if (
    status === 400
  ){

    const normalized =
      new Error(
        "Gemini rejected the AI request configuration."
      );

    normalized.statusCode =
      502;

    normalized.providerStatus =
      status;

    normalized.cause =
      error;

    return normalized;
  }


  /*
    Model not found.
  */

  if (
    status === 404 ||
    /model.*not found/i.test(
      providerMessage
    ) ||
    /not found.*model/i.test(
      providerMessage
    )
  ){

    const normalized =
      new Error(
        "The configured Gemini model is not available."
      );

    normalized.statusCode =
      503;

    normalized.providerStatus =
      status;

    normalized.cause =
      error;

    return normalized;
  }


  /*
    Provider unavailable.
  */

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ){

    const normalized =
      new Error(
        "Gemini is temporarily unavailable."
      );

    normalized.statusCode =
      503;

    normalized.providerStatus =
      status;

    normalized.cause =
      error;

    return normalized;
  }


  const normalized =
    new Error(
      "Gemini could not generate the AI response."
    );

  normalized.statusCode =
    502;

  normalized.providerStatus =
    status;

  normalized.cause =
    error;

  return normalized;
}


/* =========================================================
   CREATE GEMINI CLIENT
========================================================= */

function getGeminiClient(){

  if (
    geminiClient
  ){
    return geminiClient;
  }


  const apiKey =
    String(
      process.env.GEMINI_API_KEY ||
      ""
    ).trim();


  if (
    !apiKey
  ){

    const error =
      new Error(
        "GEMINI_API_KEY is not configured."
      );

    error.statusCode =
      503;

    throw error;
  }


  geminiClient =
    new GoogleGenAI({
      apiKey
    });


  return geminiClient;
}


/* =========================================================
   MODEL
========================================================= */

function getGeminiModel(){

  return String(
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash"
  ).trim();

}


/* =========================================================
   BUILD GEMINI CONTENTS
========================================================= */

function buildGeminiContents({
  history = [],
  message = ""
}){

  const contents = [];


  for (
    const item
    of history
  ){

    if (
      item?.role !== "user" &&
      item?.role !== "assistant"
    ){
      continue;
    }


    const text =
      String(
        item.content ||
        ""
      ).trim();


    if (
      !text
    ){
      continue;
    }


    contents.push({

      role:
        item.role ===
          "assistant"
          ? "model"
          : "user",

      parts:[
        {
          text
        }
      ]

    });

  }


  const currentMessage =
    String(
      message ||
      ""
    ).trim();


  if (
    !currentMessage
  ){

    const error =
      new Error(
        "AI message is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  contents.push({

    role:
      "user",

    parts:[
      {
        text:
          currentMessage
      }
    ]

  });


  return contents;
}


/* =========================================================
   EXTRACT RESPONSE TEXT
========================================================= */

function extractGeminiText(
  response
){

  /*
    Current @google/genai SDK exposes response.text.
  */

  const directText =
    typeof response?.text ===
      "string"
      ? response.text.trim()
      : "";


  if (
    directText
  ){
    return directText;
  }


  /*
    Defensive fallback for candidate-based responses.
  */

  const candidates =
    Array.isArray(
      response?.candidates
    )
      ? response.candidates
      : [];


  const parts = [];


  for (
    const candidate
    of candidates
  ){

    const contentParts =
      Array.isArray(
        candidate?.content?.parts
      )
        ? candidate.content.parts
        : [];


    for (
      const part
      of contentParts
    ){

      const text =
        String(
          part?.text ||
          ""
        ).trim();


      if (
        text
      ){
        parts.push(
          text
        );
      }

    }

  }


  return parts
    .join("\n")
    .trim();
}


/* =========================================================
   GENERATE AI RESPONSE
========================================================= */

async function generateAIResponse({
  systemInstruction = "",
  contextText = "",
  history = [],
  message = ""
}){

  const client =
    getGeminiClient();


  const model =
    getGeminiModel();


  if (
    !model
  ){

    const error =
      new Error(
        "GEMINI_MODEL is not configured."
      );

    error.statusCode =
      503;

    throw error;
  }


  const instructionParts = [];


  const baseInstruction =
    String(
      systemInstruction ||
      ""
    ).trim();


  if (
    baseInstruction
  ){
    instructionParts.push(
      baseInstruction
    );
  }


  const verifiedContext =
    String(
      contextText ||
      ""
    ).trim();


  if (
    verifiedContext
  ){

    instructionParts.push(
      [
        "AIFT VERIFIED COURSE MATERIAL",
        "",
        verifiedContext
      ].join("\n")
    );

  }


  const instructions =
    instructionParts
      .filter(Boolean)
      .join("\n\n");


  const contents =
    buildGeminiContents({
      history,
      message
    });


  const startedAt =
    Date.now();


  let response;


  try{

    response =
      await client.models.generateContent({

        model,

        contents,

        config:{

          /*
            Do not send an empty system instruction.
          */

          ...(
            instructions
              ? {
                  systemInstruction:
                    instructions
                }
              : {}
          ),

          temperature:
            0.35,

          maxOutputTokens:
            3000

        }

      });

  }catch(error){

    /*
      Log the provider error on the server only.

      Never send API keys or raw provider objects
      back to the browser.
    */

    console.error(
      "Gemini generateContent failed:",
      {
        status:
          getProviderStatus(
            error
          ),

        name:
          error?.name ||
          "",

        message:
          error?.message ||
          ""
      }
    );


    throw normalizeGeminiError(
      error
    );

  }


  const text =
    extractGeminiText(
      response
    );


  if (
    !text
  ){

    console.error(
      "Gemini returned no usable text:",
      {
        model,

        finishReason:
          response
            ?.candidates
            ?.[0]
            ?.finishReason ||
          "",

        candidateCount:
          Array.isArray(
            response?.candidates
          )
            ? response.candidates.length
            : 0
      }
    );


    const error =
      new Error(
        "Gemini returned an empty response."
      );

    error.statusCode =
      502;

    throw error;
  }


  const usageMetadata =
    response?.usageMetadata ||
    {};


  return {

    text,

    model,

    responseTimeMs:
      Date.now() -
      startedAt,

    usage:{

      inputTokens:
        Number(
          usageMetadata
            .promptTokenCount ||
          0
        ),

      outputTokens:
        Number(
          usageMetadata
            .candidatesTokenCount ||
          0
        ),

      totalTokens:
        Number(
          usageMetadata
            .totalTokenCount ||
          0
        )

    }

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  generateAIResponse,
  getGeminiModel
};
