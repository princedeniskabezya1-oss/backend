const express = require("express");

const ConferenceRecording = require("../models/ConferenceRecording");
const Meeting = require("../models/Meeting");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   GET RECORDINGS
========================= */

router.get("/", authMiddleware, async (req,res)=>{
  try{

    const {
      meetingId,
      limit = 50
    } = req.query;

    const query = {};

    if(meetingId){
      query.meetingId = meetingId;
    }

    const recordings =
      await ConferenceRecording.find(query)
      .populate(
        "owner",
        "name profileImage role"
      )
      .populate(
        "meetingId",
        "title meetingCode"
      )
      .sort({
        createdAt:-1
      })
      .limit(
        Math.min(Number(limit)||50,150)
      );

    res.json(recordings);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load recordings"
    });
  }
});

/* =========================
   GET ONE
========================= */

router.get("/:id", authMiddleware, async (req,res)=>{
  try{

    const recording =
      await ConferenceRecording.findById(
        req.params.id
      )
      .populate(
        "owner",
        "name profileImage role"
      )
      .populate(
        "meetingId",
        "title meetingCode"
      );

    if(!recording){
      return res.status(404).json({
        message:"Recording not found"
      });
    }

    res.json(recording);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to load recording"
    });
  }
});

/* =========================
   CREATE
========================= */

router.post("/", authMiddleware, async (req,res)=>{
  try{

    const recording =
      await ConferenceRecording.create({
        ...req.body,
        owner:req.user.id
      });

    res.status(201).json(recording);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to create recording"
    });
  }
});

/* =========================
   UPDATE
========================= */

router.patch("/:id", authMiddleware, async (req,res)=>{
  try{

    const recording =
      await ConferenceRecording.findById(
        req.params.id
      );

    if(!recording){
      return res.status(404).json({
        message:"Recording not found"
      });
    }

    if(
      String(recording.owner) !==
      String(req.user.id)
    ){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    Object.keys(req.body).forEach(key=>{
      recording[key] = req.body[key];
    });

    await recording.save();

    res.json(recording);

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to update recording"
    });
  }
});

/* =========================
   DELETE
========================= */

router.delete("/:id", authMiddleware, async (req,res)=>{
  try{

    const recording =
      await ConferenceRecording.findById(
        req.params.id
      );

    if(!recording){
      return res.status(404).json({
        message:"Recording not found"
      });
    }

    if(
      String(recording.owner) !==
      String(req.user.id)
    ){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    await recording.deleteOne();

    res.json({
      success:true
    });

  }catch(error){

    console.error(error);

    res.status(500).json({
      message:"Unable to delete recording"
    });
  }
});

module.exports = router;
