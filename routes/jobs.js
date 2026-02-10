const express = require("express");
const router = express.Router();

/*
  TEMP IN-MEMORY JOBS
  Later this comes from MongoDB
*/
const jobs = [
  {
    id: 1,
    title: "Frontend Developer",
    company: "Tech Corp",
    location: "Remote",
    description: "Build modern web interfaces using HTML, CSS, and JavaScript.",
    status: "active",
    postedAt: "3 days ago"
  },
  {
    id: 2,
    title: "Backend Engineer",
    company: "Startup Labs",
    location: "Philippines",
    description: "Work on APIs, databases, and scalable backend services.",
    status: "active",
    postedAt: "1 week ago"
  }
];

/*
  GET /api/jobs
*/
router.get("/", (req, res) => {
  res.json(jobs);
});

module.exports = router;
