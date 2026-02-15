const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const auth = require("../middleware/auth");
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

module.exports = router;
