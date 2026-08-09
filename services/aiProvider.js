const {
  GoogleGenAI
} = require(
  "@google/genai"
);


let geminiClient =
  null;


function getGeminiClient(){

  if (geminiClient){
    return geminiClient;
  }


  const apiKey =
    String(
      process.env.GEMINI_API_KEY ||
      ""
    ).trim();


  if (!apiKey){

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


function getGeminiModel(){

  return String(
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash"
  ).trim();
}


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


    contents.push({
      role:
        item.role ===
          "assistant"
          ? "model"
          : "user",

      parts:[
        {
          text:
            String(
              item.content ||
              ""
            )
        }
      ]
    });
  }


  contents.push({
    role:"user",

    parts:[
      {
        text:
          String(
            message ||
            ""
          )
      }
    ]
  });


  return contents;
}


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


  const instructions =
    [
      String(
        systemInstruction ||
        ""
      ).trim(),

      contextText
        ? [
            "AIFT VERIFIED COURSE MATERIAL",
            "",
            String(
              contextText
            ).trim()
          ].join("\n")
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");


  const contents =
    buildGeminiContents({
      history,
      message
    });


  const startedAt =
    Date.now();


  const response =
    await client.models.generateContent({
      model,

      contents,

      config:{
        systemInstruction:
          instructions,

        temperature:
          0.35,

        maxOutputTokens:
          3000
      }
    });


  const text =
    String(
      response?.text ||
      ""
    ).trim();


  if (!text){

    const error =
      new Error(
        "Gemini returned an empty response."
      );

    error.statusCode =
      502;

    throw error;
  }


  return {
    text,

    model,

    responseTimeMs:
      Date.now() -
      startedAt,

    usage:{
      inputTokens:
        Number(
          response?.usageMetadata
            ?.promptTokenCount ||
          0
        ),

      outputTokens:
        Number(
          response?.usageMetadata
            ?.candidatesTokenCount ||
          0
        ),

      totalTokens:
        Number(
          response?.usageMetadata
            ?.totalTokenCount ||
          0
        )
    }
  };
}


module.exports = {
  generateAIResponse,
  getGeminiModel
};
