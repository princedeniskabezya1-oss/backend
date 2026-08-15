const mongoose =
  require("mongoose");

const Submission =
  require("../models/Submission");


/* =========================================================
   SUBMISSION INTEGRITY SERVICE

   PURPOSE
   ---------------------------------------------------------
   Evidence-oriented comparison of student submissions.

   This service does NOT decide whether plagiarism,
   cheating, collusion, or misconduct occurred.

   It calculates reproducible internal similarity evidence
   which may later be interpreted by Kabezya and reviewed
   by an authorized teacher.

   SECURITY
   ---------------------------------------------------------
   - comparison scope is constrained by school/class/
     assignment
   - student's own submission is excluded
   - raw comparison submissions are never returned
   - only relevant matched excerpts are returned
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_OPTIONS = {

  minPhraseWords:
    6,

  maxPhraseWords:
    14,

  maxMatchesPerSubmission:
    8,

  maxTotalMatches:
    25,

  maxComparisonSubmissions:
    250,

  minimumMeaningfulWords:
    8,

  exactSimilarityThreshold:
    0.98,

  nearExactSimilarityThreshold:
    0.82,

  phraseOverlapThreshold:
    0.58

};


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value
){

  if(
    value === null ||
    value === undefined
  ){

    return "";

  }


  return String(
    value
  );

}


/* =========================================================
   NORMALIZE OBJECT ID
========================================================= */

function normalizeObjectId(
  value
){

  const candidate =
    value?._id ||
    value?.id ||
    value;


  const text =
    safeString(
      candidate
    )
      .trim();


  if(
    !text ||
    !mongoose.Types.ObjectId
      .isValid(
        text
      )
  ){

    return null;

  }


  return new mongoose.Types.ObjectId(
    text
  );

}


/* =========================================================
   SAME OBJECT ID
========================================================= */

function sameObjectId(
  left,
  right
){

  const a =
    safeString(
      left?._id ||
      left?.id ||
      left
    )
      .trim();


  const b =
    safeString(
      right?._id ||
      right?.id ||
      right
    )
      .trim();


  return Boolean(
    a &&
    b &&
    a === b
  );

}


/* =========================================================
   NORMALIZE TEXT

   This representation is used only for comparison.

   The original submission text is preserved separately.
========================================================= */

function normalizeComparisonText(
  value
){

  return safeString(
    value
  )

    /*
      Unicode normalization helps avoid trivial differences
      caused by equivalent character representations.
    */

    .normalize(
      "NFKC"
    )

    .toLowerCase()

    /*
      Normalize apostrophes and quotation marks.
    */

    .replace(
      /[\u2018\u2019\u201A\u201B]/g,
      "'"
    )

    .replace(
      /[\u201C\u201D\u201E\u201F]/g,
      '"'
    )

    /*
      Remove URLs from the comparison body.

      URLs themselves should eventually be reviewed through
      the citation/source pipeline instead.
    */

    .replace(
      /https?:\/\/\S+/gi,
      " "
    )

    /*
      Convert punctuation into spaces while retaining
      letters and numbers from Unicode languages.
    */

    .replace(
      /[^\p{L}\p{N}'\s]+/gu,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


/* =========================================================
   TOKENIZE
========================================================= */

function tokenize(
  value
){

  const normalized =
    normalizeComparisonText(
      value
    );


  if(
    !normalized
  ){

    return [];

  }


  return normalized
    .split(
      /\s+/
    )
    .filter(
      Boolean
    );

}


/* =========================================================
   REMOVE LOW-VALUE TOKENS

   These are intentionally conservative.

   We do NOT aggressively remove language-specific stopwords
   because AIFT may contain multilingual student work.
========================================================= */

function isUsefulToken(
  token
){

  const text =
    safeString(
      token
    )
      .trim();


  if(
    !text
  ){

    return false;

  }


  /*
    Single-character alphabetic tokens produce too much
    accidental overlap.
  */

  if(
    /^\p{L}$/u.test(
      text
    )
  ){

    return false;

  }


  return true;

}


/* =========================================================
   USEFUL TOKENS
========================================================= */

function getUsefulTokens(
  value
){

  return tokenize(
    value
  )
    .filter(
      isUsefulToken
    );

}


/* =========================================================
   UNIQUE TOKENS
========================================================= */

function getUniqueTokenSet(
  value
){

  return new Set(
    getUsefulTokens(
      value
    )
  );

}


/* =========================================================
   JACCARD SIMILARITY

   Useful as one broad lexical-overlap signal.

   This is NOT a plagiarism percentage.
========================================================= */

function calculateJaccardSimilarity(
  left,
  right
){

  const leftSet =
    left instanceof Set
      ? left
      : getUniqueTokenSet(
          left
        );


  const rightSet =
    right instanceof Set
      ? right
      : getUniqueTokenSet(
          right
        );


  if(
    !leftSet.size ||
    !rightSet.size
  ){

    return 0;

  }


  let intersection =
    0;


  for(
    const token
    of leftSet
  ){

    if(
      rightSet.has(
        token
      )
    ){

      intersection +=
        1;

    }

  }


  const union =
    leftSet.size +
    rightSet.size -
    intersection;


  if(
    union <= 0
  ){

    return 0;

  }


  return intersection /
    union;

}


/* =========================================================
   DICE SIMILARITY
========================================================= */

function calculateDiceSimilarity(
  left,
  right
){

  const leftSet =
    left instanceof Set
      ? left
      : getUniqueTokenSet(
          left
        );


  const rightSet =
    right instanceof Set
      ? right
      : getUniqueTokenSet(
          right
        );


  if(
    !leftSet.size ||
    !rightSet.size
  ){

    return 0;

  }


  let intersection =
    0;


  for(
    const token
    of leftSet
  ){

    if(
      rightSet.has(
        token
      )
    ){

      intersection +=
        1;

    }

  }


  return (
    2 *
    intersection
  ) /
    (
      leftSet.size +
      rightSet.size
    );

}


/* =========================================================
   BUILD N-GRAMS
========================================================= */

function buildNGrams(
  tokens,
  size
){

  const list =
    Array.isArray(
      tokens
    )
      ? tokens
      : [];


  const n =
    Math.max(
      1,
      Number(
        size ||
        1
      )
    );


  if(
    list.length <
    n
  ){

    return [];

  }


  const result =
    [];


  for(
    let index = 0;
    index <=
      list.length - n;
    index += 1
  ){

    const words =
      list.slice(
        index,
        index + n
      );


    result.push({
      index,

      words,

      text:
        words.join(
          " "
        )
    });

  }


  return result;

}


/* =========================================================
   CREATE N-GRAM INDEX
========================================================= */

function createNGramIndex(
  tokens,
  size
){

  const index =
    new Map();


  for(
    const gram
    of buildNGrams(
      tokens,
      size
    )
  ){

    if(
      !index.has(
        gram.text
      )
    ){

      index.set(
        gram.text,
        []
      );

    }


    index
      .get(
        gram.text
      )
      .push(
        gram.index
      );

  }


  return index;

}


/* =========================================================
   FIND EXACT PHRASE MATCHES

   Finds shared contiguous phrases.

   Longer matches are preferred over shorter duplicates.
========================================================= */

function findExactPhraseMatches(
  targetText,
  comparisonText,
  options = {}
){

  const settings = {
    ...DEFAULT_OPTIONS,
    ...options
  };


  const targetTokens =
    getUsefulTokens(
      targetText
    );


  const comparisonTokens =
    getUsefulTokens(
      comparisonText
    );


  if(
    targetTokens.length <
      settings.minPhraseWords ||
    comparisonTokens.length <
      settings.minPhraseWords
  ){

    return [];

  }


  const matches =
    [];


  const seen =
    new Set();


  /*
    Start with larger phrases so smaller phrases contained
    inside a larger match can be ignored later.
  */

  for(
    let size =
      Math.min(
        settings.maxPhraseWords,
        targetTokens.length,
        comparisonTokens.length
      );

    size >=
      settings.minPhraseWords;

    size -=
      1
  ){

    const comparisonIndex =
      createNGramIndex(
        comparisonTokens,
        size
      );


    const targetGrams =
      buildNGrams(
        targetTokens,
        size
      );


    for(
      const gram
      of targetGrams
    ){

      if(
        !comparisonIndex.has(
          gram.text
        )
      ){

        continue;

      }


      /*
        Avoid returning the same text repeatedly at several
        n-gram sizes.
      */

      const normalizedKey =
        gram.text;


      let contained =
        false;


      for(
        const existing
        of matches
      ){

        if(
          existing.normalizedText
            .includes(
              normalizedKey
            )
        ){

          contained =
            true;

          break;

        }

      }


      if(
        contained ||
        seen.has(
          normalizedKey
        )
      ){

        continue;

      }


      seen.add(
        normalizedKey
      );


      matches.push({

        wordCount:
          size,

        normalizedText:
          normalizedKey,

        submittedText:
          gram.words.join(
            " "
          ),

        matchedText:
          gram.words.join(
            " "
          )

      });


      if(
        matches.length >=
        settings.maxMatchesPerSubmission
      ){

        return matches;

      }

    }

  }


  return matches;

}


/* =========================================================
   CHARACTER SIMILARITY

   Lightweight normalized edit-distance implementation.

   We cap text length because this signal is only intended
   for identifying nearly identical submissions.
========================================================= */

function calculateLevenshteinDistance(
  left,
  right
){

  const a =
    safeString(
      left
    );


  const b =
    safeString(
      right
    );


  if(
    a === b
  ){

    return 0;

  }


  if(
    !a.length
  ){

    return b.length;

  }


  if(
    !b.length
  ){

    return a.length;

  }


  /*
    Keep only two rows instead of allocating a full matrix.
  */

  let previous =
    new Array(
      b.length + 1
    );


  let current =
    new Array(
      b.length + 1
    );


  for(
    let column = 0;
    column <= b.length;
    column += 1
  ){

    previous[
      column
    ] =
      column;

  }


  for(
    let row = 1;
    row <= a.length;
    row += 1
  ){

    current[
      0
    ] =
      row;


    for(
      let column = 1;
      column <= b.length;
      column += 1
    ){

      const cost =
        a[
          row - 1
        ] ===
        b[
          column - 1
        ]
          ? 0
          : 1;


      current[
        column
      ] =
        Math.min(

          current[
            column - 1
          ] +
            1,

          previous[
            column
          ] +
            1,

          previous[
            column - 1
          ] +
            cost

        );

    }


    [
      previous,
      current
    ] = [
      current,
      previous
    ];

  }


  return previous[
    b.length
  ];

}


/* =========================================================
   NORMALIZED CHARACTER SIMILARITY
========================================================= */

function calculateCharacterSimilarity(
  left,
  right
){

  const MAX_CHARACTERS =
    6000;


  const a =
    normalizeComparisonText(
      left
    )
      .slice(
        0,
        MAX_CHARACTERS
      );


  const b =
    normalizeComparisonText(
      right
    )
      .slice(
        0,
        MAX_CHARACTERS
      );


  if(
    !a ||
    !b
  ){

    return 0;

  }


  if(
    a === b
  ){

    return 1;

  }


  const longest =
    Math.max(
      a.length,
      b.length
    );


  if(
    !longest
  ){

    return 0;

  }


  const distance =
    calculateLevenshteinDistance(
      a,
      b
    );


  return Math.max(
    0,
    Math.min(
      1,
      1 -
      (
        distance /
        longest
      )
    )
  );

}


/* =========================================================
   COMPOSITE DOCUMENT SIMILARITY

   Multiple deterministic signals are combined.

   Again: this is similarity, not proof of plagiarism.
========================================================= */

function calculateDocumentSimilarity(
  targetText,
  comparisonText
){

  const targetSet =
    getUniqueTokenSet(
      targetText
    );


  const comparisonSet =
    getUniqueTokenSet(
      comparisonText
    );


  const jaccard =
    calculateJaccardSimilarity(
      targetSet,
      comparisonSet
    );


  const dice =
    calculateDiceSimilarity(
      targetSet,
      comparisonSet
    );


  const targetNormalized =
    normalizeComparisonText(
      targetText
    );


  const comparisonNormalized =
    normalizeComparisonText(
      comparisonText
    );


  /*
    Character similarity is most useful when the documents
    are reasonably similar in size.

    Otherwise a short answer contained in a long answer could
    distort the signal.
  */

  const targetLength =
    targetNormalized.length;


  const comparisonLength =
    comparisonNormalized.length;


  const smaller =
    Math.min(
      targetLength,
      comparisonLength
    );


  const larger =
    Math.max(
      targetLength,
      comparisonLength
    );


  const sizeRatio =
    larger
      ? smaller /
        larger
      : 0;


  const character =
    sizeRatio >=
      0.6
      ? calculateCharacterSimilarity(
          targetNormalized,
          comparisonNormalized
        )
      : 0;


  const composite =
    character
      ? (
          (
            jaccard *
            0.30
          ) +
          (
            dice *
            0.35
          ) +
          (
            character *
            0.35
          )
        )
      : (
          (
            jaccard *
            0.45
          ) +
          (
            dice *
            0.55
          )
        );


  return {

    jaccard:
      Math.max(
        0,
        Math.min(
          1,
          jaccard
        )
      ),

    dice:
      Math.max(
        0,
        Math.min(
          1,
          dice
        )
      ),

    character:
      Math.max(
        0,
        Math.min(
          1,
          character
        )
      ),

    sizeRatio:
      Math.max(
        0,
        Math.min(
          1,
          sizeRatio
        )
      ),

    composite:
      Math.max(
        0,
        Math.min(
          1,
          composite
        )
      )

  };

}


/* =========================================================
   DETERMINE EVIDENCE TYPE
========================================================= */

function determineEvidenceType(
  similarity
){

  const score =
    Number(
      similarity?.composite ||
      0
    );


  if(
    score >=
    DEFAULT_OPTIONS
      .exactSimilarityThreshold
  ){

    return "exact";

  }


  if(
    score >=
    DEFAULT_OPTIONS
      .nearExactSimilarityThreshold
  ){

    return "near_exact";

  }


  return "phrase_overlap";

}


/* =========================================================
   ROUND PERCENT
========================================================= */

function toPercent(
  value
){

  const number =
    Number(
      value ||
      0
    );


  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        number *
        100
      )
    )
  );

}


/* =========================================================
   EXTRACT SUBMISSION TEXT

   Your existing Submission model currently stores `text`.

   This helper also tolerates common future aliases without
   changing the database contract.
========================================================= */

function getSubmissionText(
  submission
){

  return safeString(
    submission?.text ||
    submission?.content ||
    submission?.answer ||
    submission?.response ||
    ""
  )
    .trim();

}


/* =========================================================
   BUILD COMPARISON QUERY

   IMPORTANT:
   We compare against the same assignment first.

   This greatly reduces false positives caused by students
   answering unrelated questions with common language.
========================================================= */

function buildComparisonQuery({
  submission,
  schoolId,
  classId,
  assignmentId
}){

  const targetSubmissionId =
    normalizeObjectId(
      submission?._id
    );


  const targetStudentId =
    normalizeObjectId(
      submission?.studentId
    );


  const resolvedSchoolId =
    normalizeObjectId(
      schoolId ||
      submission?.schoolId
    );


  const resolvedClassId =
    normalizeObjectId(
      classId ||
      submission?.classId
    );


  const resolvedAssignmentId =
    normalizeObjectId(
      assignmentId ||
      submission?.assignmentId
    );


  if(
    !resolvedSchoolId ||
    !resolvedAssignmentId
  ){

    const error =
      new Error(
        "School and assignment context are required for submission comparison."
      );


    error.statusCode =
      400;


    throw error;

  }


  const query = {

    schoolId:
      resolvedSchoolId,

    assignmentId:
      resolvedAssignmentId

  };


  /*
    Keep the comparison inside the same class when the
    submission has a class identity.
  */

  if(
    resolvedClassId
  ){

    query.classId =
      resolvedClassId;

  }


  if(
    targetSubmissionId
  ){

    query._id = {
      $ne:
        targetSubmissionId
    };

  }


  /*
    Defensive exclusion in case duplicate submission records
    ever exist for the same student.
  */

  if(
    targetStudentId
  ){

    query.studentId = {
      $ne:
        targetStudentId
    };

  }


  return query;

}


/* =========================================================
   LOAD COMPARISON SUBMISSIONS
========================================================= */

async function loadComparableSubmissions({
  submission,
  schoolId = null,
  classId = null,
  assignmentId = null,
  limit =
    DEFAULT_OPTIONS
      .maxComparisonSubmissions
}){

  if(
    !submission
  ){

    const error =
      new Error(
        "Submission is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  const query =
    buildComparisonQuery({
      submission,
      schoolId,
      classId,
      assignmentId
    });


  const safeLimit =
    Math.max(
      1,
      Math.min(
        500,
        Number(
          limit ||
          DEFAULT_OPTIONS
            .maxComparisonSubmissions
        )
      )
    );


  return Submission
    .find(
      query
    )
    .select(
      [
        "_id",
        "studentId",
        "schoolId",
        "classId",
        "assignmentId",
        "text",
        "submittedAt",
        "createdAt"
      ]
        .join(
          " "
        )
    )
    .sort({
      submittedAt:-1,
      createdAt:-1
    })
    .limit(
      safeLimit
    )
    .lean();

}


/* =========================================================
   ANALYZE ONE COMPARISON
========================================================= */

function analyzeSubmissionPair(
  targetSubmission,
  comparisonSubmission,
  options = {}
){

  const settings = {
    ...DEFAULT_OPTIONS,
    ...options
  };


  const targetText =
    getSubmissionText(
      targetSubmission
    );


  const comparisonText =
    getSubmissionText(
      comparisonSubmission
    );


  const targetWords =
    getUsefulTokens(
      targetText
    );


  const comparisonWords =
    getUsefulTokens(
      comparisonText
    );


  if(
    targetWords.length <
      settings.minimumMeaningfulWords ||
    comparisonWords.length <
      settings.minimumMeaningfulWords
  ){

    return null;

  }


  const similarity =
    calculateDocumentSimilarity(
      targetText,
      comparisonText
    );


  const phraseMatches =
    findExactPhraseMatches(
      targetText,
      comparisonText,
      settings
    );


  const hasMeaningfulPhrase =
    phraseMatches.some(
      match =>
        Number(
          match?.wordCount ||
          0
        ) >=
        settings.minPhraseWords
    );


  const relevant =
    similarity.composite >=
      settings.phraseOverlapThreshold ||
    hasMeaningfulPhrase;


  if(
    !relevant
  ){

    return null;

  }


  const evidenceType =
    determineEvidenceType(
      similarity
    );


  const similarityPercent =
    toPercent(
      similarity.composite
    );


  return {

    sourceType:
      "submission",

    sourceId:
      comparisonSubmission?._id ||
      null,

    sourceStudentId:
      comparisonSubmission?.studentId ||
      null,

    sourceTitle:
      "Another submission for this assignment",

    sourceUrl:
      "",

    /*
      We deliberately do NOT return the full comparison
      submission.
    */

    submittedText:
      phraseMatches?.[0]
        ?.submittedText ||
      "",

    matchedText:
      phraseMatches?.[0]
        ?.matchedText ||
      "",

    similarity:
      Number(
        similarity.composite
          .toFixed(
            4
          )
      ),

    similarityPercent,

    evidenceType,

    verified:
      true,

    metrics:{

      jaccard:
        Number(
          similarity.jaccard
            .toFixed(
              4
            )
        ),

      dice:
        Number(
          similarity.dice
            .toFixed(
              4
            )
        ),

      character:
        Number(
          similarity.character
            .toFixed(
              4
            )
        ),

      sizeRatio:
        Number(
          similarity.sizeRatio
            .toFixed(
              4
            )
        )

    },

    phraseMatches:
      phraseMatches.map(
        match => ({
          wordCount:
            match.wordCount,

          submittedText:
            match.submittedText,

          matchedText:
            match.matchedText
        })
      )

  };

}


/* =========================================================
   ANALYZE INTERNAL SUBMISSION SIMILARITY
========================================================= */

async function analyzeInternalSubmissionSimilarity({
  submission,
  schoolId = null,
  classId = null,
  assignmentId = null,
  options = {}
}){

  if(
    !submission
  ){

    const error =
      new Error(
        "Submission is required for integrity analysis."
      );


    error.statusCode =
      400;


    throw error;

  }


  const settings = {
    ...DEFAULT_OPTIONS,
    ...options
  };


  const targetText =
    getSubmissionText(
      submission
    );


  const targetWords =
    getUsefulTokens(
      targetText
    );


  /* =====================================================
     NOT ENOUGH TEXT
  ===================================================== */

  if(
    targetWords.length <
    settings.minimumMeaningfulWords
  ){

    return {

      checked:
        false,

      reason:
        "insufficient_text",

      comparedSubmissionCount:
        0,

      highestSimilarity:
        0,

      matches:
        []

    };

  }


  /* =====================================================
     LOAD SAME-ASSIGNMENT SUBMISSIONS
  ===================================================== */

  const comparisons =
    await loadComparableSubmissions({

      submission,

      schoolId,

      classId,

      assignmentId,

      limit:
        settings
          .maxComparisonSubmissions

    });


  if(
    !comparisons.length
  ){

    return {

      checked:
        true,

      reason:
        "no_comparable_submissions",

      comparedSubmissionCount:
        0,

      highestSimilarity:
        0,

      matches:
        []

    };

  }


  /* =====================================================
     COMPARE
  ===================================================== */

  const results =
    [];


  for(
    const comparison
    of comparisons
  ){

    /*
      Additional defensive identity checks.
    */

    if(
      sameObjectId(
        comparison?._id,
        submission?._id
      ) ||
      sameObjectId(
        comparison?.studentId,
        submission?.studentId
      )
    ){

      continue;

    }


    const result =
      analyzeSubmissionPair(
        submission,
        comparison,
        settings
      );


    if(
      !result
    ){

      continue;

    }


    results.push(
      result
    );

  }


  /* =====================================================
     SORT STRONGEST EVIDENCE FIRST
  ===================================================== */

  results.sort(
    (
      left,
      right
    ) =>
      Number(
        right?.similarity ||
        0
      ) -
      Number(
        left?.similarity ||
        0
      )
  );


  const matches =
    results.slice(
      0,
      settings.maxTotalMatches
    );


  const highestSimilarity =
    matches.length
      ? Math.max(
          ...matches.map(
            item =>
              Number(
                item?.similarityPercent ||
                0
              )
          )
        )
      : 0;


  return {

    checked:
      true,

    reason:
      "completed",

    comparedSubmissionCount:
      comparisons.length,

    highestSimilarity,

    matches

  };

}


/* =========================================================
   CALCULATE INTERNAL REVIEW SIGNAL

   This is intentionally NOT called a plagiarism score.

   It summarizes how much attention the deterministic
   evidence deserves.
========================================================= */

function calculateInternalReviewSignal(
  analysis
){

  if(
    !analysis?.checked
  ){

    return 0;

  }


  const matches =
    Array.isArray(
      analysis?.matches
    )
      ? analysis.matches
      : [];


  if(
    !matches.length
  ){

    return 0;

  }


  const highest =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          analysis
            ?.highestSimilarity ||
          0
        )
      )
    );


  const exactMatches =
    matches.filter(
      item =>
        item?.evidenceType ===
        "exact"
    )
      .length;


  const nearExactMatches =
    matches.filter(
      item =>
        item?.evidenceType ===
        "near_exact"
    )
      .length;


  const phraseEvidence =
    matches.reduce(
      (
        total,
        item
      ) =>
        total +
        (
          Array.isArray(
            item?.phraseMatches
          )
            ? item.phraseMatches.length
            : 0
        ),
      0
    );


  let signal =
    highest;


  if(
    exactMatches
  ){

    signal =
      Math.max(
        signal,
        90
      );

  }else if(
    nearExactMatches
  ){

    signal =
      Math.max(
        signal,
        75
      );

  }


  if(
    phraseEvidence >=
    5
  ){

    signal +=
      5;

  }


  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        signal
      )
    )
  );

}


/* =========================================================
   DETERMINE INTERNAL REVIEW STATUS
========================================================= */

function determineInternalReviewStatus(
  analysis
){

  const signal =
    calculateInternalReviewSignal(
      analysis
    );


  if(
    signal >=
    85
  ){

    return "high_concern";

  }


  if(
    signal >=
    55
  ){

    return "review";

  }


  return "clear";

}


/* =========================================================
   SANITIZE MATCHES FOR STORAGE

   Removes temporary calculation fields that are useful
   during analysis but are not part of the Mongoose evidence
   schema.
========================================================= */

function sanitizeMatchesForStorage(
  matches
){

  return (
    Array.isArray(
      matches
    )
      ? matches
      : []
  )
    .map(
      item => ({

        sourceType:
          item?.sourceType ||
          "submission",

        sourceId:
          item?.sourceId ||
          null,

        sourceStudentId:
          item?.sourceStudentId ||
          null,

        sourceTitle:
          safeString(
            item?.sourceTitle
          )
            .slice(
              0,
              500
            ),

        sourceUrl:
          safeString(
            item?.sourceUrl
          )
            .slice(
              0,
              3000
            ),

        submittedText:
          safeString(
            item?.submittedText
          )
            .slice(
              0,
              5000
            ),

        matchedText:
          safeString(
            item?.matchedText
          )
            .slice(
              0,
              5000
            ),

        similarity:
          Math.max(
            0,
            Math.min(
              1,
              Number(
                item?.similarity ||
                0
              )
            )
          ),

        similarityPercent:
          Math.max(
            0,
            Math.min(
              100,
              Number(
                item?.similarityPercent ||
                0
              )
            )
          ),

        evidenceType:
          [
            "exact",
            "near_exact",
            "phrase_overlap",
            "semantic_similarity",
            "citation",
            "other"
          ]
            .includes(
              item?.evidenceType
            )
              ? item.evidenceType
              : "other",

        verified:
          Boolean(
            item?.verified
          )

      })
    );

}


/* =========================================================
   BUILD INTERNAL ANALYSIS FOR INSPECTION MODEL
========================================================= */

function buildInternalInspectionEvidence(
  analysis
){

  return {

    checked:
      Boolean(
        analysis?.checked
      ),

    comparedSubmissionCount:
      Math.max(
        0,
        Number(
          analysis
            ?.comparedSubmissionCount ||
          0
        )
      ),

    highestSimilarity:
      Math.max(
        0,
        Math.min(
          100,
          Number(
            analysis
              ?.highestSimilarity ||
            0
          )
        )
      ),

    matches:
      sanitizeMatchesForStorage(
        analysis?.matches
      )

  };

}


/* =========================================================
   MAIN SERVICE
========================================================= */

async function inspectSubmissionIntegrity({
  submission,
  schoolId = null,
  classId = null,
  assignmentId = null,
  options = {}
}){

  if(
    !submission
  ){

    const error =
      new Error(
        "Submission is required."
      );


    error.statusCode =
      400;


    throw error;

  }


  const internalAnalysis =
    await analyzeInternalSubmissionSimilarity({

      submission,

      schoolId,

      classId,

      assignmentId,

      options

    });


  const reviewScore =
    calculateInternalReviewSignal(
      internalAnalysis
    );


  const status =
    determineInternalReviewStatus(
      internalAnalysis
    );


  return {

    status,

    reviewScore,

    internalSimilarity:
      buildInternalInspectionEvidence(
        internalAnalysis
      ),

    /*
      These are deliberately untouched until their actual
      engines exist.

      Never pretend these checks happened.
    */

    courseMaterialSimilarity:{
      checked:false,
      highestSimilarity:0,
      matches:[]
    },

    webReview:{
      checked:false,
      provider:"",
      checkedAt:null,
      matches:[]
    },

    writingConsistency:{
      status:
        "insufficient_evidence",

      variationScore:
        0,

      observations:[]
    },

    citationReview:
      [],

    metadata:{

      internalAnalysisReason:
        internalAnalysis?.reason ||
        "",

      integrityEngineVersion:
        "1.0.0"

    }

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  inspectSubmissionIntegrity,

  analyzeInternalSubmissionSimilarity,

  analyzeSubmissionPair,

  calculateDocumentSimilarity,

  calculateJaccardSimilarity,

  calculateDiceSimilarity,

  calculateCharacterSimilarity,

  findExactPhraseMatches,

  calculateInternalReviewSignal,

  determineInternalReviewStatus,

  normalizeComparisonText,

  getSubmissionText

};
