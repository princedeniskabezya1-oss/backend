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

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let referredByUser = null;

    if (referralCode) {
      referredByUser = await User.findOne({
        referralCode: String(referralCode).trim()
      });
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: role || "talent",
      referredBy: referredByUser ? referredByUser._id : null
    });

    if (user.role === "agent") {
      user.referralCode = "HF" + user._id.toString().slice(-6).toUpperCase();
      await user.save();
    }

    if (referredByUser) {
      referredByUser.totalReferrals += 1;
      await referredByUser.save();
    }

    res.status(201).json({
      message: "User registered successfully"
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
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

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Account suspended"
      });
    }

    if (user.isBlockedByEmployer === true) {
      return res.status(403).json({
        message: "Your employer has restricted access to this account."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

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
        commissionEarned: user.commissionEarned || 0,
        profileImage: user.profileImage || null,
        companyName: user.companyName || null,
        companyId: user.companyId || null,
        teamRole: user.teamRole || null
      }
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
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
    const user = req.user;

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
      referredBy: user.referredBy || null,
      profileImage: user.profileImage || null,
      companyName: user.companyName || null,
      companyId: user.companyId || null,
      teamRole: user.teamRole || null
    });
  } catch (error) {
    console.error("AUTH ME ERROR:", error);
    res.status(500).json({
      message: error.message
    });
  }
});

/* ============================================
   CREATE FIRST ADMIN - ONE TIME ONLY
============================================ */
router.post("/create-first-admin", async (req, res) => {
  try {
    const { setupKey, name, email, password } = req.body;

    if (!process.env.ADMIN_SETUP_KEY) {
      return res.status(500).json({
        message: "Admin setup key is not configured"
      });
    }

    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({
        message: "Invalid admin setup key"
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        message: "Admin password must be at least 8 characters"
      });
    }

    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      return res.status(403).json({
        message: "Admin already exists"
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: "admin",
      status: "active",
      aiftVerified: true,
      isVerified: true
    });

    res.status(201).json({
      message: "First admin created successfully",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error("CREATE FIRST ADMIN ERROR:", error);
    res.status(500).json({
      message: error.message
    });
  }
});

module.exports = router;
