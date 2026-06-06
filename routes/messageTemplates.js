const express = require("express");
const mongoose = require("mongoose");

const MessageTemplate = require("../models/MessageTemplate");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

function isValidId(id){
  return mongoose.Types.ObjectId.isValid(id);
}

function canUseTemplate(template,user){
  if(String(template.owner) === String(user.id)) return true;
  if(template.visibility === "team") return true;
  if(template.visibility === "company" && template.companyId) return true;
  if(template.visibility === "school" && template.schoolId) return true;
  return false;
}

router.get("/", authMiddleware, async (req,res)=>{
  try{
    const { category, search = "", visibility, limit = 80 } = req.query;

    const query = {
      isActive:true,
      $or:[
        { owner:req.user.id },
        { visibility:"team" },
        { visibility:"company" },
        { visibility:"school" }
      ]
    };

    if(category) query.category = category;
    if(visibility) query.visibility = visibility;

    if(search){
      query.$text = { $search:search };
    }

    const templates = await MessageTemplate.find(query)
      .populate("owner","name profileImage role")
      .sort({ lastUsedAt:-1, updatedAt:-1 })
      .limit(Math.min(Number(limit) || 80,150));

    res.json(templates);

  }catch(error){
    console.error("GET MESSAGE TEMPLATES ERROR:",error);
    res.status(500).json({ message:"Unable to load templates" });
  }
});

router.post("/", authMiddleware, async (req,res)=>{
  try{
    const {
      title,
      category = "general",
      body,
      variables = [],
      visibility = "private",
      companyId,
      schoolId
    } = req.body;

    if(!title || !String(title).trim()){
      return res.status(400).json({ message:"Template title is required" });
    }

    if(!body || !String(body).trim()){
      return res.status(400).json({ message:"Template body is required" });
    }

    const template = await MessageTemplate.create({
      owner:req.user.id,
      title:String(title).trim(),
      category,
      body:String(body).trim(),
      variables:Array.isArray(variables) ? variables : [],
      visibility,
      companyId:isValidId(companyId) ? companyId : undefined,
      schoolId:isValidId(schoolId) ? schoolId : undefined
    });

    res.status(201).json(template);

  }catch(error){
    console.error("CREATE MESSAGE TEMPLATE ERROR:",error);
    res.status(500).json({ message:"Unable to create template" });
  }
});

router.get("/:id", authMiddleware, async (req,res)=>{
  try{
    const template = await MessageTemplate.findById(req.params.id);

    if(!template){
      return res.status(404).json({ message:"Template not found" });
    }

    if(!canUseTemplate(template,req.user)){
      return res.status(403).json({ message:"Not allowed" });
    }

    res.json(template);

  }catch(error){
    console.error("GET MESSAGE TEMPLATE ERROR:",error);
    res.status(500).json({ message:"Unable to load template" });
  }
});

router.patch("/:id", authMiddleware, async (req,res)=>{
  try{
    const template = await MessageTemplate.findById(req.params.id);

    if(!template){
      return res.status(404).json({ message:"Template not found" });
    }

    if(String(template.owner) !== String(req.user.id)){
      return res.status(403).json({ message:"Only owner can edit template" });
    }

    [
      "title",
      "category",
      "body",
      "variables",
      "visibility",
      "companyId",
      "schoolId",
      "isActive"
    ].forEach(key=>{
      if(req.body[key] !== undefined){
        template[key] = req.body[key];
      }
    });

    await template.save();

    res.json(template);

  }catch(error){
    console.error("UPDATE MESSAGE TEMPLATE ERROR:",error);
    res.status(500).json({ message:"Unable to update template" });
  }
});

router.patch("/:id/use", authMiddleware, async (req,res)=>{
  try{
    const template = await MessageTemplate.findById(req.params.id);

    if(!template){
      return res.status(404).json({ message:"Template not found" });
    }

    if(!canUseTemplate(template,req.user)){
      return res.status(403).json({ message:"Not allowed" });
    }

    template.usageCount += 1;
    template.lastUsedAt = new Date();

    await template.save();

    let output = template.body;

    const values = req.body.values || {};

    Object.keys(values).forEach(key=>{
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`,"g");
      output = output.replace(pattern,values[key] || "");
    });

    res.json({
      template,
      output
    });

  }catch(error){
    console.error("USE MESSAGE TEMPLATE ERROR:",error);
    res.status(500).json({ message:"Unable to use template" });
  }
});

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{
    const template = await MessageTemplate.findById(req.params.id);

    if(!template){
      return res.status(404).json({ message:"Template not found" });
    }

    if(String(template.owner) !== String(req.user.id)){
      return res.status(403).json({ message:"Only owner can delete template" });
    }

    template.isActive = false;
    await template.save();

    res.json({ success:true });

  }catch(error){
    console.error("DELETE MESSAGE TEMPLATE ERROR:",error);
    res.status(500).json({ message:"Unable to delete template" });
  }
});

module.exports = router;
