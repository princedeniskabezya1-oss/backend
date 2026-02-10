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

/*
  POST /api/jobs
*/
router.post("/", (req, res) => {
  const { title, company, location, description, type } = req.body;

  // ✅ BASIC VALIDATION
  if (!title || !company || !location || !description) {
    return res.status(400).json({
      message: "Missing required fields"
    });
  }

  const newJob = {
    id: jobs.length + 1,
    title,
    company,
    location,
    description,
    type: type || "Full-time",
    status: "active",
    postedAt: "Just now"
  };

  jobs.unshift(newJob); // add to top

  console.log("✅ New job posted:", newJob);

  res.status(201).json(newJob);
});

module.exports = router;

