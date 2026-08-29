const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

function getUserId(req){
  return req.user?._id || req.user?.id;
}

router.get("/",auth,async (req,res) => {
  try{
    const userId = getUserId(req);
    const notifications = await Notification.find({ user:userId })
      .populate("sender","name profileImage companyName schoolName role")
      .sort({ createdAt:-1 })
      .limit(250)
      .lean();

    return res.json(notifications);
  }catch(error){
    console.error("GET NOTIFICATIONS ERROR:",error);
    return res.status(500).json({ message:"Failed to load notifications" });
  }
});

async function getUnreadNotificationCount(req,res){
  try{
    const userId = getUserId(req);
    if(!userId){
      return res.status(401).json({ message:"User not found in token" });
    }

    const count = await Notification.countDocuments({
      user:userId,
      read:false
    });

    return res.json({ count });
  }catch(error){
    console.error("UNREAD NOTIFICATION COUNT ERROR:",error);
    return res.status(500).json({ message:"Failed to count notifications" });
  }
}

router.get("/unread",auth,getUnreadNotificationCount);
router.get("/unread-count",auth,getUnreadNotificationCount);

router.patch("/:id/read",auth,async (req,res) => {
  try{
    const userId = getUserId(req);
    const notification = await Notification.findOneAndUpdate(
      {
        _id:req.params.id,
        user:userId
      },
      {
        $set:{ read:true }
      },
      {
        new:true
      }
    );

    if(!notification){
      return res.status(404).json({ message:"Notification not found" });
    }

    return res.json({
      message:"Marked as read",
      notification
    });
  }catch(error){
    console.error("MARK NOTIFICATION READ ERROR:",error);
    return res.status(500).json({ message:"Failed to update notification" });
  }
});

module.exports = router;
