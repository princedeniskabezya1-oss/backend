const express = require("express");

const ConferenceTranscript =
require("../models/ConferenceTranscript");

const authMiddleware =
require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   GET TRANSCRIPTS
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{

    const transcripts =
      await ConferenceTranscript.find()
      .sort({
        createdAt:-1
      });

    res.json(transcripts);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load transcripts"
    });
  }
});

/* =========================
   GET ONE
========================= */

router.get("/:id", authMiddleware, async (req,res)=>{
  try{

    const transcript =
      await ConferenceTranscript.findById(
        req.params.id
      );

    if(!transcript){
      return res.status(404).json({
        message:"Transcript not found"
      });
    }

    res.json(transcript);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load transcript"
    });
  }
});

/* =========================
   CREATE
========================= */

router.post("/", authMiddleware, async (req,res)=>{
  try{

    const transcript =
      await ConferenceTranscript.create(
        req.body
      );

    res.status(201).json(transcript);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to create transcript"
    });
  }
});

/* =========================
   UPDATE
========================= */

router.patch("/:id", authMiddleware, async (req,res)=>{
  try{

    const transcript =
      await ConferenceTranscript.findById(
        req.params.id
      );

    if(!transcript){
      return res.status(404).json({
        message:"Transcript not found"
      });
    }

    Object.keys(req.body).forEach(key=>{
      transcript[key] =
      req.body[key];
    });

    await transcript.save();

    res.json(transcript);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to update transcript"
    });
  }
});

/* =========================
   DELETE
========================= */

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{

    const transcript =
      await ConferenceTranscript.findById(
        req.params.id
      );

    if(!transcript){
      return res.status(404).json({
        message:"Transcript not found"
      });
    }

    await transcript.deleteOne();

    res.json({
      success:true
    });

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to delete transcript"
    });
  }
});

module.exports = router;
