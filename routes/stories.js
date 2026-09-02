const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const Story = require("../models/Story");
const StorySetting = require("../models/StorySetting");
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
  const value = story.toObject
    ? story.toObject({ virtuals:true })
    : { ...story };

  const viewers = Array.isArray(value.viewers)
    ? value.viewers
    : [];

  const owner =
    String(value.author?._id || value.author) === String(viewerId);

  value.seen = viewers.some(item =>
    String(item?.user?._id || item?.user || "") === String(viewerId)
  );

  value.viewerCount = viewers.length;

  if(!owner){
    delete value.viewers;
  }

  return value;
}

async function uploadStoryMedia(file){
  if(!file) return null;

  const isVideo =
    String(file.mimetype || "").startsWith("video/");

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
  const normalizedUserId = String(userId);

  const conversations = await Conversation.find({
    type:"direct",
    participantIds:userId
  })
    .select("participants")
    .lean();

  const ids = new Set([normalizedUserId]);

  conversations.forEach(conversation=>{
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants
      : [];

    const self = participants.find(participant =>
      String(participant?.user || "") === normalizedUserId
    );

    if(!self || self.isActive === false || self.blocked === true){
      return;
    }

    participants.forEach(participant=>{
      const participantId = String(participant?.user || "");

      if(
        !participantId ||
        participantId === normalizedUserId ||
        participant.isActive === false ||
        participant.blocked === true
      ){
        return;
      }

      ids.add(participantId);
    });
  });

  return [...ids]
    .filter(validId)
    .map(id => new mongoose.Types.ObjectId(id));
}

async function mutedStoryAuthorIds(userId){
  const settings = await StorySetting.find({
    user:userId,
    muted:true
  })
    .select("author")
    .lean();

  return settings
    .map(item => item.author)
    .filter(Boolean);
}

async function emitStoryEvent(req, story, eventName){
  const io = req.app.get("io") || req.io;

  if(!io || !story){
    return;
  }

  const authorId = String(story.author?._id || story.author || req.user._id);
  const payload = {
    storyId:String(story._id),
    authorId,
    event:eventName
  };

  if(story.audience === "everyone"){
    io.emit(eventName, payload);
    return;
  }

  const contactIds = await directContactIds(authorId);
  const recipients = new Set([
    authorId,
    ...contactIds.map(id => String(id))
  ]);

  recipients.forEach(userId=>{
    io.to(userId).emit(eventName, payload);
  });
}

router.get("/", auth, async (req, res)=>{
  try{
    const now = new Date();
    const [contactIds, mutedAuthorIds] = await Promise.all([
      directContactIds(req.user._id),
      mutedStoryAuthorIds(req.user._id)
    ]);

    const mutedSet = new Set(
      mutedAuthorIds.map(id => String(id))
    );

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
      const isOwner = authorId === String(req.user._id);

      if(!isOwner && mutedSet.has(authorId)){
        return;
      }

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
      if(a.hasUnseen !== b.hasUnseen){
        return a.hasUnseen ? -1 : 1;
      }

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
    const audience =
      req.body?.audience === "everyone"
        ? "everyone"
        : "connections";

    if(!text && !req.file){
      return res.status(400).json({
        message:"Add text, a photo, or a video to your story"
      });
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
    await emitStoryEvent(req, story, "storyCreated");

    res.status(201).json({
      story:storyPayload(story, req.user._id)
    });
  }catch(error){
    console.error("CREATE STORY ERROR:", error);
    res.status(500).json({
      message:error.message || "Unable to create story"
    });
  }
});

router.patch("/authors/:authorId/mute", auth, async (req, res)=>{
  try{
    const authorId = String(req.params.authorId || "");

    if(!validId(authorId)){
      return res.status(400).json({ message:"Invalid story author ID" });
    }

    if(authorId === String(req.user._id)){
      return res.status(400).json({ message:"You cannot mute your own stories" });
    }

    const muted = req.body?.muted !== false;

    const setting = await StorySetting.findOneAndUpdate(
      {
        user:req.user._id,
        author:authorId
      },
      {
        $set:{
          muted,
          mutedAt:muted ? new Date() : null
        },
        $setOnInsert:{
          user:req.user._id,
          author:authorId
        }
      },
      {
        upsert:true,
        new:true,
        setDefaultsOnInsert:true
      }
    );

    res.json({
      authorId,
      muted:!!setting.muted,
      mutedAt:setting.mutedAt || null
    });
  }catch(error){
    console.error("MUTE STORY AUTHOR ERROR:", error);
    res.status(500).json({ message:"Unable to update story preference" });
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

    const isOwner =
      String(story.author) === String(req.user._id);

    if(!isOwner && story.audience === "connections"){
      const contactIds = await directContactIds(req.user._id);

      if(!contactIds.some(id => String(id) === String(story.author))){
        return res.status(403).json({
          message:"You cannot view this story"
        });
      }
    }

    const alreadyViewed = story.viewers.some(item =>
      String(item.user) === String(req.user._id)
    );

    if(!alreadyViewed && !isOwner){
      story.viewers.push({
        user:req.user._id,
        viewedAt:new Date()
      });

      await story.save();

      const io = req.app.get("io") || req.io;

      io?.to?.(String(story.author)).emit("storyViewed", {
        storyId:String(story._id),
        viewerCount:story.viewers.length
      });
    }

    res.json({
      seen:true,
      viewerCount:story.viewers.length
    });
  }catch(error){
    console.error("VIEW STORY ERROR:", error);
    res.status(500).json({
      message:"Unable to mark story as viewed"
    });
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
      return res.status(403).json({
        message:"Only the story owner can view viewers"
      });
    }

    res.json({ viewers:story.viewers || [] });
  }catch(error){
    console.error("STORY VIEWERS ERROR:", error);
    res.status(500).json({
      message:"Unable to load story viewers"
    });
  }
});

router.delete("/:id", auth, async (req, res)=>{
  try{
    if(!validId(req.params.id)){
      return res.status(400).json({ message:"Invalid story ID" });
    }

    const story = await Story.findOne({
      _id:req.params.id,
      author:req.user._id
    });

    if(!story){
      return res.status(404).json({ message:"Story not found" });
    }

    story.deletedAt = new Date();
    await story.save();

    if(story.mediaPublicId){
      const resourceType =
        story.type === "video"
          ? "video"
          : "image";

      cloudinary.uploader
        .destroy(story.mediaPublicId, { resource_type:resourceType })
        .catch(()=>{});
    }

    await emitStoryEvent(req, story, "storyDeleted");

    res.json({ success:true });
  }catch(error){
    console.error("DELETE STORY ERROR:", error);
    res.status(500).json({ message:"Unable to delete story" });
  }
});

router.use((error, req, res, next)=>{
  if(error instanceof multer.MulterError){
    return res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Story media must be 30MB or smaller"
          : error.message
    });
  }

  if(error){
    return res.status(400).json({
      message:error.message || "Invalid story upload"
    });
  }

  next();
});

module.exports = router;
