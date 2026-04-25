const mongoose = require("mongoose");

const TaskTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    workflow: { type: String, enum: ["hiring", "bpo_operations", "training", "custom"], default: "hiring" },
    description: { type: String, default: "" },
    defaultPriority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    checklist: [{ label: String, done: { type: Boolean, default: false } }],
    isSystem: { type: Boolean, default: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

TaskTemplateSchema.index({ workflow: 1, category: 1 });
TaskTemplateSchema.index({ companyId: 1, workflow: 1 });

module.exports = mongoose.model("TaskTemplate", TaskTemplateSchema);
