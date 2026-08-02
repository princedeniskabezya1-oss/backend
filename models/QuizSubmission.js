const mongoose = require("mongoose");


const quizSubmissionAnswerSchema =
  new mongoose.Schema(
    {
      questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },

      answer: {
        type: String,
        trim: true,
        default: ""
      },

      isCorrect: {
        type: Boolean,
        default: false
      },

      pointsEarned: {
        type: Number,
        min: 0,
        default: 0
      },

      pointsPossible: {
        type: Number,
        min: 0,
        default: 0
      }
    },
    {
      _id: false
    }
  );


const quizSubmissionSchema =
  new mongoose.Schema(
    {
      schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        required: true,
        index: true
      },

      quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Quiz",
        required: true,
        index: true
      },

      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      attemptNumber: {
        type: Number,
        min: 1,
        required: true
      },

      answers: {
        type: [quizSubmissionAnswerSchema],
        default: []
      },

      score: {
        type: Number,
        min: 0,
        default: 0
      },

      totalPoints: {
        type: Number,
        min: 0,
        default: 0
      },

      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
        index: true
      },

      passed: {
        type: Boolean,
        default: false,
        index: true
      },

      status: {
        type: String,
        enum: [
          "submitted",
          "reviewed"
        ],
        default: "submitted",
        index: true
      },

      startedAt: {
        type: Date,
        default: null
      },

      submittedAt: {
        type: Date,
        default: Date.now,
        index: true
      },

      timeSpentSeconds: {
        type: Number,
        min: 0,
        default: 0
      }
    },
    {
      timestamps: true
    }
  );


/*
  A student can submit multiple attempts, but the same attempt
  number cannot be created twice for the same quiz.
*/
quizSubmissionSchema.index(
  {
    quizId: 1,
    studentId: 1,
    attemptNumber: 1
  },
  {
    unique: true
  }
);


quizSubmissionSchema.index({
  classId: 1,
  studentId: 1,
  submittedAt: -1
});


quizSubmissionSchema.index({
  quizId: 1,
  submittedAt: -1
});


quizSubmissionSchema.index({
  schoolId: 1,
  submittedAt: -1
});


module.exports =
  mongoose.model(
    "QuizSubmission",
    quizSubmissionSchema
  );
