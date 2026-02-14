const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

/* ============================================
   REGISTER
============================================ */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, referralCode } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Check referral code (if provided)
    let referredByUser = null;

    if (referralCode) {
      referredByUser = await User.findOne({
        referralCode: referralCode
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "talent",
      referredBy: referredByUser ? referredByUser._id : null
    });

    // Auto-generate referral code for agents
    if (user.role === "agent") {
      user.referralCode =
        "HF" + user._id.toString().slice(-6).toUpperCase();
      await user.save();
    }

    res.status(201).json({
      message: "User registered successfully"
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});


/* ============================================
   LOGIN
============================================ */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // Check user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    // Create token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode || null,
        commissionEarned: user.commissionEarned || 0
      }
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});


/* ============================================
   GET CURRENT USER
============================================ */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      referralCode: user.referralCode || null,
      commissionEarned: user.commissionEarned || 0,
      referredBy: user.referredBy || null
    });

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

module.exports = router;
