const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const Story = require("../models/Story");
const Conversation = require("../models/Conversation");
const auth = require("../middleware/auth");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter(req, file, callback){
    const mime = String(file?.mimetype || "").toLowerCase();
    if(mime.startsWith("image/") || mime.startsWith("video/")){
      return callback(null, true);
    }
    callback(new Error("Stories support image and video uploads only"));
  }
});

function validId(value){
  return mongoose.Types.ObjectId.isValid(value);
}

function storyAuthorFields(){
  return "name companyName schoolName role profileImage logo avatar headline profession course";
}

function storyPayload(story, viewerId){
  const value = story.toObject ? story.toObject({ virtuals:true }) : { ...story };
  const viewers = Array.isArray(value.viewers) ? value.viewers : [];
  const owner = String(value.author?._id || value.author) === String(viewerId);

  value.seen = viewers.some(item => String(item?.user?._id || item?.user || "") === String(viewerId));
  value.viewerCount = viewers.length;

  if(!owner){
    delete value.viewers;
  }

  return value;
}

async function uploadStoryMedia(file){
  if(!file) return null;

  const isVideo = String(file.mimetype || "").startsWith("video/");

  return new Promise((resolve, reject)=>{
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:"aift/stories",
        resource_type:isVideo ? "video" : "image"
      },
      (error, result)=>{
        if(error) return reject(error);
        resolve({
          url:result.secure_url,
          publicId:result.public_id,
          mimeType:file.mimetype,
          type:isVideo ? "video" : "image"
        });
      }
    );

    stream.end(file.buffer);
  });
}

async function directContactIds(userId){
  const conversations = await Conversation.find({
    type:"direct",
    participantIds:userId
  }).select("participantIds participants").lean();

  const ids = new Set([String(userId)]);

  conversations.forEach(conversation=>{
    (conversation.participantIds || []).forEach(id=>{
      if(id) ids.add(String(id));
    });

    (conversation.participants || []).forEach(participant=>{
      const id = participant?.user;
      if(id && participant.isActive !== false && participant.blocked !== true){
        ids.add(String(id));
      }
    });
  });

  return [...ids]
    .filter(validId)
    .map(id => new mongoose.Types.ObjectId(id));
}

router.get("/", auth, async (req, res)=>{
  try{
    const now = new Date();
    const contactIds = await directContactIds(req.user._id);

    const stories = await Story.find({
      deletedAt:null,
      expiresAt:{ $gt:now },
      $or:[
        { author:req.user._id },
        { audience:"everyone" },
        { audience:"connections", author:{ $in:contactIds } }
      ]
    })
      .populate("author", storyAuthorFields())
      .sort({ createdAt:1 });

    const grouped = new Map();

    stories.forEach(story=>{
      const authorId = String(story.author?._id || story.author);
      if(!grouped.has(authorId)){
        grouped.set(authorId, {
          author:story.author,
          stories:[],
          hasUnseen:false,
          latestAt:story.createdAt
        });
      }

      const group = grouped.get(authorId);
      const payload = storyPayload(story, req.user._id);
      group.stories.push(payload);
      group.hasUnseen = group.hasUnseen || !payload.seen;
      group.latestAt = story.createdAt;
    });

    const groups = [...grouped.values()].sort((a,b)=>{
      if(a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return new Date(b.latestAt) - new Date(a.latestAt);
    });

    res.json({ groups });
  }catch(error){
    console.error("GET STORIES ERROR:", error);
    res.status(500).json({ message:"Unable to load stories" });
  }
});

router.post("/", auth, upload.single("file"), async (req, res)=>{
  try{
    const text = String(req.body?.text || "").trim();
    const audience = req.body?.audience === "everyone" ? "everyone" : "connections";

    if(!text && !req.file){
      return res.status(400).json({ message:"Add text, a photo, or a video to your story" });
    }

    const media = await uploadStoryMedia(req.file);
    const type = media?.type || "text";

    const story = await Story.create({
      author:req.user._id,
      type,
      text,
      mediaUrl:media?.url || "",
      mediaPublicId:media?.publicId || "",
      mediaMimeType:media?.mimeType || "",
      background:String(req.body?.background || "").trim().slice(0,80),
      audience,
      expiresAt:new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await story.populate("author", storyAuthorFields());

    const io = req.app.get("io") || req.io;
    io?.emit?.("storyCreated", {
      storyId:story._id,
      authorId:req.user._id
    });

    res.status(201).json({ story:storyPayload(story, req.user._id) });
  }catch(error){
    console.error("CREATE STORY ERROR:", error);
    res.status(500).json({ message:error.message || "Unable to create story" });
  }
});

router.patch("/:id/view", auth, async (req, res)=>{
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ message:"Invalid story ID" });
    }

    const story = await Story.findOne({
      _id:req.params.id,
      deletedAt:null,
      expiresAt:{ $gt:new Date() }
    });

    if(!story){
      return res.status(404).json({ message:"Story not found" });
    }

    const isOwner = String(story.author) === String(req.user._id);

    if(!isOwner && story.audience === "connections"){
      const contactIds = await directContactIds(req.user._id);
      if(!contactIds.some(id => String(id) === String(story.author))){
        return res.status(403).json({ message:"You cannot view this story" });
      }
    }

    const alreadyViewed = story.viewers.some(item => String(item.user) === String(req.user._id));

    if(!alreadyViewed && !isOwner){
      story.viewers.push({ user:req.user._id, viewedAt:new Date() });
      await story.save();
    }

    res.json({ seen:true, viewerCount:story.viewers.length });
  }catch(error){
    console.error("VIEW STORY ERROR:", error);
    res.status(500).json({ message:"Unable to mark story as viewed" });
  }
});

router.get("/:id/viewers", auth, async (req, res)=>{
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ message:"Invalid story ID" });
    }

    const story = await Story.findById(req.params.id)
      .populate("viewers.user", storyAuthorFields());

    if(!story){
      return res.status(404).json({ message:"Story not found" });
    }

    if(String(story.author) !== String(req.user._id)){
      return res.status(403).json({ message:"Only the story owner can view viewers" });
    }

    res.json({ viewers:story.viewers || [] });
  }catch(error){
    console.error("STORY VIEWERS ERROR:", error);
    res.status(500).json({ message:"Unable to load story viewers" });
  }
});

router.delete("/:id", auth, async (req, res)=>{
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ message:"Invalid story ID" });
    }

    const story = await Story.findOne({ _id:req.params.id, author:req.user._id });

    if(!story){
      return res.status(404).json({ message:"Story not found" });
    }

    story.deletedAt = new Date();
    await story.save();

    if(story.mediaPublicId){
      const resourceType = story.type === "video" ? "video" : "image";
      cloudinary.uploader.destroy(story.mediaPublicId, { resource_type:resourceType }).catch(()=>{});
    }

    const io = req.app.get("io") || req.io;
    io?.emit?.("storyDeleted", { storyId:story._id, authorId:req.user._id });

    res.json({ success:true });
  }catch(error){
    console.error("DELETE STORY ERROR:", error);
    res.status(500).json({ message:"Unable to delete story" });
  }
});

router.use((error, req, res, next)=>{
  if(error instanceof multer.MulterError){
    return res.status(400).json({ message:error.code === "LIMIT_FILE_SIZE" ? "Story media must be 30MB or smaller" : error.message });
  }

  if(error){
    return res.status(400).json({ message:error.message || "Invalid story upload" });
  }

  next();
});

module.exports = router;
