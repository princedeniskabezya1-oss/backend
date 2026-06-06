const express = require("express");
const multer = require("multer");
const ChatAsset = require("../models/ChatAsset");
const authMiddleware = require("../middleware/auth");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

const upload = multer({
  storage:multer.memoryStorage(),
  limits:{
    fileSize:20 * 1024 * 1024
  }
});

function uploadToCloudinary(file){
  return new Promise((resolve,reject)=>{
    const resourceType =
      file.mimetype.startsWith("image") ? "image" : "raw";

    const stream = cloudinary.uploader.upload_stream(
      {
        folder:"aift/chat-assets",
        resource_type:resourceType
      },
      (error,result)=>{
        if(error) return reject(error);

        resolve({
          url:result.secure_url,
          publicId:result.public_id
        });
      }
    );

    stream.end(file.buffer);
  });
}

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const type = req.query.type || "sticker";

    const assets = await ChatAsset.find({
      owner:req.user.id,
      type
    }).sort({ createdAt:-1 });

    res.json(assets);

  }catch(error){
    console.error("GET CHAT ASSETS ERROR:",error);
    res.status(500).json({ message:"Unable to load chat assets" });
  }
});

router.post("/", authMiddleware, upload.single("file"), async (req,res)=>{
  try{
    if(!req.file && !req.body.url){
      return res.status(400).json({
        message:"File or URL is required"
      });
    }

    let uploaded = null;

    if(req.file){
      uploaded = await uploadToCloudinary(req.file);
    }

    const asset = await ChatAsset.create({
      owner:req.user.id,
      type:req.body.type || "sticker",
      title:req.body.title || "",
      url:uploaded?.url || req.body.url,
      publicId:uploaded?.publicId || "",
      mimeType:req.file?.mimetype || req.body.mimeType || "",
      source:req.body.source || "uploaded",
      originalMessageId:req.body.originalMessageId || undefined,
      isFavorite:req.body.isFavorite === "true" || req.body.isFavorite === true
    });

    res.status(201).json(asset);

  }catch(error){
    console.error("CREATE CHAT ASSET ERROR:",error);
    res.status(500).json({ message:"Unable to save chat asset" });
  }
});

router.patch("/:id/favorite", authMiddleware, async (req,res)=>{
  try{
    const asset = await ChatAsset.findOne({
      _id:req.params.id,
      owner:req.user.id
    });

    if(!asset){
      return res.status(404).json({ message:"Asset not found" });
    }

    asset.isFavorite = !asset.isFavorite;
    await asset.save();

    res.json(asset);

  }catch(error){
    console.error("FAVORITE CHAT ASSET ERROR:",error);
    res.status(500).json({ message:"Unable to update asset" });
  }
});

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{
    const asset = await ChatAsset.findOne({
      _id:req.params.id,
      owner:req.user.id
    });

    if(!asset){
      return res.status(404).json({ message:"Asset not found" });
    }

    await asset.deleteOne();

    res.json({ success:true });

  }catch(error){
    console.error("DELETE CHAT ASSET ERROR:",error);
    res.status(500).json({ message:"Unable to delete asset" });
  }
});

module.exports = router;
