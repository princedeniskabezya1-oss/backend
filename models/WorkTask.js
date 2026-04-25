const mongoose = require("mongoose");

const TASK_CATEGORIES = [
  "candidate_screening",
  "cv_review",
  "interview_scheduling",
  "interview_notes",
  "candidate_follow_up",
  "background_check",
  "document_collection",
  "onboarding_checklist",
  "job_post_review",
  "applicant_ranking",
  "candidate_message",
  "candidate_rejection",
  "candidate_shortlist",
  "offer_letter",
  "shift_attendance",
  "qa_check",
  "daily_productivity_report",
  "client_escalation",
  "missed_schedule_alert",
  "coaching_note",
  "training_assignment",
  "qa_score_review",
  "payroll_attendance_export",
  "agent_performance_review",
  "custom"
];

const WorkTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule", default: null },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentSession", default: null },

    category: { type: String, enum: TASK_CATEGORIES, default: "custom", index: true },
    workflow: { type: String, enum: ["hiring", "bpo_operations", "training", "custom"], default: "hiring", index: true },

    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium", index: true },
    status: {
      type: String,
      enum: ["todo", "in_progress", "blocked", "done", "cancelled"],
      default: "todo",
      index: true
    },

    dueDate: { type: Date, default: null, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    checklist: [
      {
        label: { type: String, required: true },
        done: { type: Boolean, default: false },
        doneAt: { type: Date, default: null }
      }
    ],

    notes: [
      {
        body: { type: String, required: true },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
      }
    ],

    attachments: [
      {
        url: String,
        filename: String,
        mimeType: String,
        uploadedAt: { type: Date, default: Date.now }
      }
    ],

    outcome: {
      type: String,
      enum: ["none", "passed", "failed", "rescheduled", "needs_review", "candidate_unreachable", "completed"],
      default: "none"
    },

    score: { type: Number, min: 0, max: 100, default: null },
    tags: [{ type: String, trim: true }]
  },
  { timestamps: true }
);

WorkTaskSchema.index({ companyId: 1, status: 1, dueDate: 1 });
WorkTaskSchema.index({ assigneeId: 1, status: 1, dueDate: 1 });
WorkTaskSchema.index({ companyId: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model("WorkTask", WorkTaskSchema);
module.exports.TASK_CATEGORIES = TASK_CATEGORIES;
