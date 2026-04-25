require("dotenv").config();
const mongoose = require("mongoose");
const TaskTemplate = require("../models/TaskTemplate");

const templates = [
  {
    name: "Candidate Screening",
    category: "candidate_screening",
    workflow: "hiring",
    defaultPriority: "high",
    description: "Review candidate profile and decide whether to move forward.",
    checklist: [
      { label: "Check profile completeness" },
      { label: "Review work experience" },
      { label: "Check skills match" },
      { label: "Add screening notes" }
    ]
  },
  {
    name: "CV Review",
    category: "cv_review",
    workflow: "hiring",
    defaultPriority: "medium",
    description: "Review CV and highlight strengths, gaps, and next step.",
    checklist: [
      { label: "Open CV/resume" },
      { label: "Check role match" },
      { label: "Check language quality" },
      { label: "Recommend shortlist/reject" }
    ]
  },
  {
    name: "Interview Scheduling",
    category: "interview_scheduling",
    workflow: "hiring",
    defaultPriority: "high",
    description: "Coordinate interview schedule between candidate and hiring team.",
    checklist: [
      { label: "Confirm candidate availability" },
      { label: "Confirm hiring manager availability" },
      { label: "Send calendar invite" },
      { label: "Update application status" }
    ]
  },
  {
    name: "Interview Notes",
    category: "interview_notes",
    workflow: "hiring",
    defaultPriority: "medium",
    description: "Capture interview feedback and decision.",
    checklist: [
      { label: "Add technical/role notes" },
      { label: "Add communication notes" },
      { label: "Add recommendation" }
    ]
  },
  {
    name: "Candidate Follow-up",
    category: "candidate_follow_up",
    workflow: "hiring",
    defaultPriority: "medium",
    description: "Follow up with candidates after application or interview.",
    checklist: [
      { label: "Send follow-up message" },
      { label: "Record candidate response" },
      { label: "Set next action" }
    ]
  },
  {
    name: "Background Check",
    category: "background_check",
    workflow: "hiring",
    defaultPriority: "high",
    description: "Collect and verify background check information.",
    checklist: [
      { label: "Request documents" },
      { label: "Verify references" },
      { label: "Upload result" }
    ]
  },
  {
    name: "Document Collection",
    category: "document_collection",
    workflow: "hiring",
    defaultPriority: "high",
    description: "Collect IDs, certificates, contracts, and onboarding documents.",
    checklist: [
      { label: "Request documents" },
      { label: "Review documents" },
      { label: "Mark complete" }
    ]
  },
  {
    name: "Onboarding Checklist",
    category: "onboarding_checklist",
    workflow: "hiring",
    defaultPriority: "high",
    description: "Prepare candidate for onboarding.",
    checklist: [
      { label: "Confirm start date" },
      { label: "Create account" },
      { label: "Assign training" },
      { label: "Confirm first schedule" }
    ]
  },
  {
    name: "Shift Attendance",
    category: "shift_attendance",
    workflow: "bpo_operations",
    defaultPriority: "urgent",
    description: "Confirm agent attendance for assigned shift.",
    checklist: [
      { label: "Agent clocked in" },
      { label: "Agent followed schedule" },
      { label: "Agent clocked out" }
    ]
  },
  {
    name: "QA Check",
    category: "qa_check",
    workflow: "bpo_operations",
    defaultPriority: "high",
    description: "Review call/chat/email quality for assigned agent.",
    checklist: [
      { label: "Review interaction" },
      { label: "Score quality" },
      { label: "Add coaching note" }
    ]
  },
  {
    name: "Daily Productivity Report",
    category: "daily_productivity_report",
    workflow: "bpo_operations",
    defaultPriority: "medium",
    description: "Prepare daily output report for BPO operations.",
    checklist: [
      { label: "Check completed tasks" },
      { label: "Check attendance" },
      { label: "Submit report" }
    ]
  },
  {
    name: "Client Escalation",
    category: "client_escalation",
    workflow: "bpo_operations",
    defaultPriority: "urgent",
    description: "Handle urgent client/customer escalation.",
    checklist: [
      { label: "Review issue" },
      { label: "Contact responsible agent" },
      { label: "Update client" },
      { label: "Close escalation" }
    ]
  },
  {
    name: "Training Assignment",
    category: "training_assignment",
    workflow: "training",
    defaultPriority: "medium",
    description: "Assign training content to agent or candidate.",
    checklist: [
      { label: "Assign module" },
      { label: "Confirm completion" },
      { label: "Review score" }
    ]
  },
  {
    name: "Agent Performance Review",
    category: "agent_performance_review",
    workflow: "bpo_operations",
    defaultPriority: "medium",
    description: "Review agent attendance, task completion, and QA score.",
    checklist: [
      { label: "Check attendance" },
      { label: "Check tasks" },
      { label: "Check QA score" },
      { label: "Add coaching action" }
    ]
  }
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  for (const template of templates) {
    await TaskTemplate.updateOne(
      { name: template.name, isSystem: true },
      { $set: { ...template, isSystem: true } },
      { upsert: true }
    );
  }

  console.log(`Seeded ${templates.length} system task templates.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
