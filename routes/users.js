const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const adminOnly = require("../middleware/adminOnly");

/*
=========================================
GET /api/users
Admin – get all users
=========================================
*/
router.get("/", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/*
=========================================
POST /api/users
Admin – create user manually
=========================================
*/
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

    res.status(201).json({
      message: "User created successfully"
    });

  } catch (err) {
    res.status(500).json({ message: "Failed to create user" });
  }
});

/*
=========================================
PATCH /api/users/:id
Admin – update role or status
=========================================
*/
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
    res.status(400).json({ message: "Failed to update user" });
  }
});

/*
=========================================
PATCH /api/users/:id/password
Admin – change user password
=========================================
*/
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
    res.status(400).json({ message: "Failed to update password" });
  }
});

/*
=========================================
DELETE /api/users/:id
Admin – delete user
=========================================
*/
router.delete("/:id", adminOnly, async (req, res) => {
  try {

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "User deleted successfully" });

  } catch (err) {
    res.status(400).json({ message: "Failed to delete user" });
  }
});

/*
=========================================
UPDATE PROFILE (Photo + Banner)
=========================================
*/
router.patch(
  "/profile",
  auth,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
  ]),
  async (req, res) => {
    try {

      const updates = {
        name: req.body.name,
        headline: req.body.headline,
        bio: req.body.bio,
        location: req.body.location,
        website: req.body.website
      };

      if (req.files.profileImage) {
        updates.profileImage = req.files.profileImage[0].path;
      }

      if (req.files.bannerImage) {
        updates.bannerImage = req.files.bannerImage[0].path;
      }

      const user = await User.findByIdAndUpdate(
        req.user.id,
        updates,
        { new: true }
      ).select("-password");

      res.json(user);

    } catch (err) {
      res.status(400).json({ message: "Profile update failed" });
    }
  }
);

/*
=========================================
GET PUBLIC PROFILE
=========================================
*/
router.get("/:id/public", async (req, res) => {
  try {

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("followers", "name profileImage")
      .populate("following", "name profileImage");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ message: "Failed to load profile" });
  }
});

/*
=========================================
FOLLOW USER
=========================================
*/
router.post("/:id/follow", auth, async (req, res) => {
  try {

    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: "Cannot follow yourself" });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    const alreadyFollowing = currentUser.following.includes(req.params.id);

    if (alreadyFollowing) {
      currentUser.following.pull(req.params.id);
      userToFollow.followers.pull(req.user.id);
    } else {
      currentUser.following.push(req.params.id);
      userToFollow.followers.push(req.user.id);
    }

    await currentUser.save();
    await userToFollow.save();

    res.json({ message: "Follow updated" });

  } catch (err) {
    res.status(400).json({ message: "Follow failed" });
  }
});

module.exports = router;



