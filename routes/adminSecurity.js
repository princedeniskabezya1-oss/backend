const express = require("express");
const auth = require("../middleware/auth");
const SecurityEvent = require("../models/SecurityEvent");

const router = express.Router();

router.use(auth);
router.use((req,res,next)=>{
  if(req.user?.role !== "admin") return res.status(403).json({ message:"Admin access only", code:"ADMIN_ONLY" });
  next();
});

router.get("/events", async(req,res)=>{
  try{
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const severity = ["low","medium","high","critical"].includes(String(req.query.severity || ""))
      ? String(req.query.severity)
      : null;
    const query = severity ? { severity } : {};
    const events = await SecurityEvent.find(query)
      .sort({ createdAt:-1 })
      .limit(limit)
      .select("-__v")
      .lean();
    return res.json({ events, retentionDays:30 });
  }catch(error){
    console.error("ADMIN SECURITY EVENTS ERROR:", error.message);
    return res.status(500).json({ message:"Unable to load security events." });
  }
});

router.get("/summary", async(_req,res)=>{
  try{
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const grouped = await SecurityEvent.aggregate([
      { $match:{ createdAt:{ $gte:since } } },
      { $group:{ _id:"$severity", count:{ $sum:1 } } }
    ]);
    const summary = { low:0, medium:0, high:0, critical:0 };
    grouped.forEach(item=>{ if(Object.hasOwn(summary,item._id)) summary[item._id]=item.count; });
    return res.json({ since, summary });
  }catch(error){
    console.error("ADMIN SECURITY SUMMARY ERROR:", error.message);
    return res.status(500).json({ message:"Unable to load the security summary." });
  }
});

module.exports = router;
