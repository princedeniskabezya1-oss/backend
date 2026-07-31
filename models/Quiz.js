const mongoose = require("mongoose");

const quizQuestionSchema = new mongoose.Schema(
  {

    source:{

    type:String,

    enum:[
        "embedded",
        "question_bank"
    ],

    default:"embedded"

},
    question: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["multiple_choice", "true_false", "short_answer"],
      default: "multiple_choice",
    },

    options: {
      type: [String],
      default: [],
    },

    correctAnswer: {
      type: String,
      default: "",
    },

    questionBankId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "QuestionBank",
  default: null,
},

  snapshot:{

    type:Boolean,

    default:false

},

explanation: {
  type: String,
  default: "",
},

difficulty: {
  type: String,
  default: "medium",
},

required: {
  type: Boolean,
  default: true,
},

    points: {
      type: Number,
      default: 1,
    },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },

    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassModule",
      index: true,
    },

    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassLesson",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    instructions: {
      type: String,
      default: "",
    },

    questions: {
      type: [quizQuestionSchema],
      default: [],
    },

    passingScore: {
      type: Number,
      default: 70,
    },

    timeLimitMinutes: {
      type: Number,
      default: 0,
    },

    attemptsAllowed: {
      type: Number,
      default: 1,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quiz", quizSchema);
