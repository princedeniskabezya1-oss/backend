const mongoose = require("mongoose");

const StoryViewerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    viewedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const StoryElementSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["text", "caption", "mention"], required: true },
    text: { type: String, trim: true, maxlength: 500, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    x: { type: Number, min: 0, max: 100, default: 50 },
    y: { type: Number, min: 0, max: 100, default: 50 },
    scale: { type: Number, min: 0.4, max: 4, default: 1 },
    rotation: { type: Number, min: -360, max: 360, default: 0 },
    zIndex: { type: Number, min: 0, max: 100, default: 1 },
    opacity: { type: Number, min: 0.1, max: 1, default: 1 },
    font: { type: String, trim: true, maxlength: 80, default: "Inter" },
    fontSize: { type: Number, min: 12, max: 120, default: 34 },
    color: { type: String, trim: true, maxlength: 32, default: "#ffffff" },
    align: { type: String, enum: ["left", "center", "right"], default: "center" },
    style: { type: String, enum: ["clean", "strong", "typewriter", "neon", "classic"], default: "clean" },
    animation: { type: String, enum: ["none", "fade", "slide_up", "slide_down", "slide_left", "slide_right", "typewriter", "pop"], default: "none" }
  },
  { _id: true }
);

const StoryMusicSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: "" },
    publicId: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, maxlength: 180, default: "" },
    artist: { type: String, trim: true, maxlength: 180, default: "" },
    coverUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    startAt: { type: Number, min: 0, max: 36000, default: 0 },
    duration: { type: Number, min: 1, max: 45, default: 15 },
    volume: { type: Number, min: 0, max: 1, default: 1 },
    muted: { type: Boolean, default: false },
    source: { type: String, enum: ["upload", "aift_catalog", "external"], default: "upload" }
  },
  { _id: false }
);

const StoryMediaTransformSchema = new mongoose.Schema(
  {
    x: { type: Number, min: -5000, max: 5000, default: 0 },
    y: { type: Number, min: -5000, max: 5000, default: 0 },
    scale: { type: Number, min: 1, max: 5, default: 1 },
    rotation: { type: Number, min: -180, max: 180, default: 0 }
  },
  { _id: false }
);

const StorySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["text", "image", "video"], required: true },
    text: { type: String, trim: true, maxlength: 1500, default: "" },
    mediaUrl: { type: String, trim: true, default: "" },
    mediaPublicId: { type: String, trim: true, default: "" },
    mediaMimeType: { type: String, trim: true, default: "" },
    mediaTransform: { type: StoryMediaTransformSchema, default: undefined },
    playbackDuration: { type: Number, min: 1, max: 45, default: 6 },
    background: { type: String, trim: true, maxlength: 80, default: "" },
    elements: { type: [StoryElementSchema], default: [] },
    taggedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    music: { type: StoryMusicSchema, default: undefined },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    audience: { type: String, enum: ["connections", "everyone"], default: "connections", index: true },
    viewers: { type: [StoryViewerSchema], default: [] },
    expiresAt: { type: Date, required: true, index: true },
    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ author: 1, createdAt: -1 });
StorySchema.index({ audience: 1, expiresAt: 1, createdAt: -1 });
StorySchema.index({ taggedUsers: 1, expiresAt: 1 });
StorySchema.virtual("viewerCount").get(function viewerCount(){ return Array.isArray(this.viewers) ? this.viewers.length : 0; });
StorySchema.virtual("likeCount").get(function likeCount(){ return Array.isArray(this.likes) ? this.likes.length : 0; });
StorySchema.set("toJSON", { virtuals: true });
StorySchema.set("toObject", { virtuals: true });
module.exports = mongoose.model("Story", StorySchema);