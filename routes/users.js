const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Notification = require("../models/Notification");

const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");

/* ============================================
   ADMIN GET ALL USERS
============================================ */
router.get("/", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ============================================
   ADMIN CREATE USER
============================================ */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      password: hashed,
      role
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

/* ============================================
   GET CURRENT USER
============================================ */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    let score = 0;
    if (user.profileImage) score += 15;
    if (user.bannerImage) score += 10;
    if (user.bio) score += 15;
    if (user.skills?.length) score += 20;
    if (user.experience?.length) score += 20;
    if (user.cvUrl) score += 20;

    res.json({
      ...user.toObject(),
      completeness: score
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load user" });
  }
});

/* ============================================
   FOLLOWERS / FOLLOWING
============================================ */
router.get("/me/followers", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "name profileImage headline role");
    res.json(user.followers);
  } catch (err) {
    res.status(500).json({ message: "Failed to load followers" });
  }
});

router.get("/me/following", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("following", "name profileImage headline role");
    res.json(user.following);
  } catch (err) {
    res.status(500).json({ message: "Failed to load following" });
  }
});

/* ============================================
   UPDATE PROFILE
============================================ */
router.patch(
  "/profile",
  auth,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "cv", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const assignIfPresent = (field) => {
        if (req.body[field] !== undefined && String(req.body[field]).trim() !== "") {
          user[field] = req.body[field];
        }
      };

      [
        "name", "headline", "bio", "location", "website",
        "companyName", "industry", "contactEmail", "department"
      ].forEach(assignIfPresent);

      if (req.body.companyTags) {
        try { user.companyTags = JSON.parse(req.body.companyTags); } catch {}
      }
      if (req.body.experience) {
        try { user.experience = JSON.parse(req.body.experience); } catch {}
      }
      if (req.body.education) {
        try { user.education = JSON.parse(req.body.education); } catch {}
      }
      if (req.body.skills) {
        try { user.skills = JSON.parse(req.body.skills); } catch {}
      }

      if (req.files?.profileImage?.[0]) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_profiles", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(req.files.profileImage[0].buffer);
        });
        user.profileImage = result.secure_url;
      }

      if (req.files?.bannerImage?.[0]) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_banners", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(req.files.bannerImage[0].buffer);
        });
        user.bannerImage = result.secure_url;
      }

      if (req.files?.cv?.[0]) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "aift_cvs", resource_type: "auto" },
            (error, output) => error ? reject(error) : resolve(output)
          ).end(req.files.cv[0].buffer);
        });
        user.cvUrl = result.secure_url;
      }

      await user.save();
      res.json(user);
    } catch (err) {
      console.error("PROFILE UPDATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ============================================
   FOLLOW / UNFOLLOW
============================================ */
router.patch("/:id/follow", auth, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "Cannot follow yourself" });
    }

    const targetUser = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isFollowing = currentUser.following.includes(targetUser._id);

    if (isFollowing) {
      currentUser.following.pull(targetUser._id);
      targetUser.followers.pull(currentUser._id);
    } else {
      currentUser.following.push(targetUser._id);
      targetUser.followers.push(currentUser._id);

      await Notification.create({
        user: targetUser._id,
        type: "follow",
        sender: currentUser._id,
        text: `${currentUser.name} started following you`,
        link: `/public-profile.html?id=${currentUser._id}`
      });
    }

    await currentUser.save();
    await targetUser.save();

    res.json({
      followers: targetUser.followers.length,
      following: !isFollowing
    });
  } catch (err) {
    console.error("FOLLOW ERROR:", err);
    res.status(400).json({ message: "Follow failed" });
  }
});

/* ============================================
   NETWORK
============================================ */
router.get("/network", auth, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id }
    }).select("_id name email headline bio role profileImage followers skills department course companyId teamRole isBlockedByEmployer education experience expectedSalary companyName location");

    res.json(users);
  } catch (err) {
    console.error("NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});

/* ============================================
   JOB SEEKER DISCOVERY
============================================ */
router.get("/jobseekers/discover", auth, async (req, res) => {
  try {
    const query = {
      role: { $in: ["talent", "agent"] },
      isBlockedByEmployer: { $ne: true }
    };

    if (req.query.skill) {
      query.skills = { $in: [new RegExp(req.query.skill, "i")] };
    }

    if (req.query.keyword) {
      query.$or = [
        { name: new RegExp(req.query.keyword, "i") },
        { headline: new RegExp(req.query.keyword, "i") },
        { bio: new RegExp(req.query.keyword, "i") },
        { skills: { $in: [new RegExp(req.query.keyword, "i")] } }
      ];
    }

    if (req.query.department) {
      query.department = new RegExp(req.query.department, "i");
    }

    const users = await User.find(query)
      .select("_id name email role headline bio profileImage skills education experience expectedSalary location companyId teamRole")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to discover job seekers" });
  }
});

/* ============================================
   EMPLOYER PUBLIC PROFILE
============================================ */
router.get("/employer/:id/public", async (req, res) => {
  try {
    const employer = await User.findById(req.params.id)
      .select("-password");

    if (!employer) {
      return res.status(404).json({ message: "Employer not found" });
    }

    const jobs = await Job.find({ employerId: employer._id, status: "active" })
      .sort({ createdAt: -1 })
      .limit(10);

    const applications = await Application.find({ employerId: employer._id });
    const team = await User.find({
      companyId: employer._id,
      isBlockedByEmployer: false
    }).select("name profileImage headline teamRole department");

    res.json({
      employer,
      jobs,
      team,
      stats: {
        activeJobs: jobs.length,
        totalApplications: applications.length,
        followers: employer.followers?.length || 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load employer public profile" });
  }
});

/* ============================================
   PUBLIC PROFILE
============================================ */
router.get("/:id/public", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("followers", "name profileImage headline role")
      .populate("following", "name profileImage headline role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("PUBLIC PROFILE ERROR:", err);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

/* ============================================
   ADMIN
============================================ */
router.patch("/:id", adminOnly, async (req, res) => {
  try {
    const { role, status } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { role, status },
      { new: true }
    ).select("-password");

    res.json(updated);
  } catch (err) {
    console.error("ADMIN UPDATE ERROR:", err);
    res.status(400).json({ message: "Failed to update user" });
  }
});

router.patch("/:id/password", adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(req.params.id, { password: hashed });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("ADMIN PASSWORD ERROR:", err);
    res.status(400).json({ message: "Failed to update password" });
  }
});

router.delete("/:id", adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(400).json({ message: "Failed to delete user" });
  }
});

router.get("/activity", auth, async (req, res) => {
  const applications = await Application.find({ applicantId: req.user.id });
  const user = await User.findById(req.user.id);

  res.json({
    totalApplications: applications.length,
    savedJobs: user.savedJobs.length
  });
});

router.get("/suggestions", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const suggestions = await User.find({
      _id: { $ne: req.user.id, $nin: user.following || [] }
    })
      .limit(5)
      .select("name profileImage headline role");

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: "Failed to load suggestions" });
  }
});

module.exports = router;