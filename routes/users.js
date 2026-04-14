const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const upload = require("../middleware/upload");

/* ======================================================
   ADMIN – GET ALL USERS
====================================================== */
router.get("/", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* ======================================================
   ADMIN – CREATE USER
====================================================== */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role
    });

    res.status(201).json({ message: "User created successfully" });

  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    res.status(500).json({ message: "Failed to create user" });
  }
});

/* ======================================================
   GET CURRENT USER (IMPORTANT: MUST BE ABOVE /:id ROUTES)
====================================================== */
router.get("/me", auth, async (req, res) => {
  try {

    const user = await User.findById(req.user.id).select("-password");

    let score = 0;

    if(user.profileImage) score += 15;
    if(user.bannerImage) score += 10;
    if(user.bio) score += 15;
    if(user.skills.length) score += 20;
    if(user.experience.length) score += 20;
    if(user.cvUrl) score += 20;

    res.json({
      ...user.toObject(),
      completeness: score
    });

  } catch (err) {
    res.status(500).json({ message: "Failed to load user" });
  }
});
/* =========================================
   GET MY FOLLOWERS
========================================= */
router.get("/me/followers", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("followers", "name profileImage headline role");

    res.json(user.followers);

  } catch (err) {
    res.status(500).json({ message: "Failed to load followers" });
  }
});

/* =========================================
   GET MY FOLLOWING
========================================= */
router.get("/me/following", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("following", "name profileImage headline role");

    res.json(user.following);

  } catch (err) {
    res.status(500).json({ message: "Failed to load following" });
  }
});

/* ======================================================
   UPDATE PROFILE (NAME + HEADLINE + IMAGES)
====================================================== */
const cloudinary = require("../config/cloudinary");

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

      // Update basic fields if provided
if (req.body.name && req.body.name.trim() !== "") {
  user.name = req.body.name;
}

if (req.body.headline && req.body.headline.trim() !== "") {
  user.headline = req.body.headline;
}

if (req.body.bio && req.body.bio.trim() !== "") {
  user.bio = req.body.bio;
}

if (req.body.location && req.body.location.trim() !== "") {
  user.location = req.body.location;
}

if (req.body.website && req.body.website.trim() !== "") {
  user.website = req.body.website;
}
if (req.body.companyName && req.body.companyName.trim() !== "") {
  user.companyName = req.body.companyName;
}

if (req.body.industry && req.body.industry.trim() !== "") {
  user.industry = req.body.industry;
}

if (req.body.contactEmail && req.body.contactEmail.trim() !== "") {
  user.contactEmail = req.body.contactEmail;
}

if (req.body.companyTags) {
  try {
    user.companyTags = JSON.parse(req.body.companyTags);
  } catch (e) {
    console.log("Company tags parse error");
  }
}
/* =============================
   EXPERIENCE / EDUCATION / SKILLS UPDATE
============================= */

if (req.body.experience) {
  try {
    user.experience = JSON.parse(req.body.experience);
  } catch (e) {
    console.log("Experience parse error");
  }
}

if (req.body.education) {
  try {
    user.education = JSON.parse(req.body.education);
  } catch (e) {
    console.log("Education parse error");
  }
}

if (req.body.skills) {
  try {
    user.skills = JSON.parse(req.body.skills);
  } catch (e) {
    console.log("Skills parse error");
  }
}

      /* =============================
         PROFILE IMAGE UPLOAD
      ============================== */
      if (req.files && req.files.profileImage) {

        const profileFile = req.files.profileImage[0];

        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "aift_profiles",
              resource_type: "auto"
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(profileFile.buffer);
        });

        user.profileImage = uploadResult.secure_url;
      }

/* =============================
   BANNER IMAGE UPLOAD
============================= */
if (req.files && req.files.bannerImage) {

  const bannerFile = req.files.bannerImage[0];

  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "aift_banners",
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    ).end(bannerFile.buffer);
  });

  user.bannerImage = uploadResult.secure_url;
}

/* =============================
   CV UPLOAD
============================= */
if (req.files && req.files.cv) {

  const cvFile = req.files.cv[0];

  const uploadResult = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "aift_cvs",
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    ).end(cvFile.buffer);
  });

  user.cvUrl = uploadResult.secure_url;
}

      await user.save();

      res.json(user);

    } catch (err) {
      console.error("PROFILE UPDATE ERROR:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ======================================================
   FOLLOW / UNFOLLOW USER
====================================================== */
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
// CREATE FOLLOW NOTIFICATION
await require("../models/Notification").create({
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
      followers: targetUser.followers.length
    });

  } catch (err) {
    console.error("FOLLOW ERROR:", err);
    res.status(400).json({ message: "Follow failed" });
  }
});
/* ======================================================
   GET ALL USERS (FOR NETWORK – AUTH ONLY)
====================================================== */
router.get("/network", auth, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user._id }
    }).select("_id name email headline bio role profileImage followers skills department course companyId teamRole isBlockedByEmployer");

    res.json(users);

  } catch (err) {
    console.error("NETWORK USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});
/* ======================================================
   GET PUBLIC PROFILE
====================================================== */
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

/* ======================================================
   ADMIN – UPDATE ROLE / STATUS
====================================================== */
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

/* ======================================================
   ADMIN – CHANGE PASSWORD
====================================================== */
router.patch("/:id/password", adminOnly, async (req, res) => {
  try {

    const { newPassword } = req.body;

    const hashed = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(
      req.params.id,
      { password: hashed }
    );

    res.json({ message: "Password updated successfully" });

  } catch (err) {
    console.error("ADMIN PASSWORD ERROR:", err);
    res.status(400).json({ message: "Failed to update password" });
  }
});

/* ======================================================
   ADMIN – DELETE USER
====================================================== */
router.delete("/:id", adminOnly, async (req, res) => {
  try {

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "User deleted successfully" });

  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(400).json({ message: "Failed to delete user" });
  }
});
/*
================================================
GET /api/users/activity
Employee activity stats
================================================
*/
router.get("/activity", auth, async (req, res) => {

  const Application = require("../models/Application");

  const applications = await Application.find({
    userId: req.user.id
  });

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
      _id: { $ne: req.user.id },
      _id: { $nin: user.following || [] }
    })
    .limit(5)
    .select("name profileImage headline role");

    res.json(suggestions);

  } catch (err) {
    res.status(500).json({ message: "Failed to load suggestions" });
  }
});

module.exports = router;
