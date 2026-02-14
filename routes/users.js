const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");

/*
  GET /api/users/referred
  Agent: see all users referred by them
*/
router.get("/referred", auth, async (req, res) => {
  try {

    // Only agent can access
    if (req.user.role !== "agent") {
      return res.status(403).json({
        message: "Access denied. Agents only."
      });
    }

    const referredUsers = await User.find({
      referredBy: req.user.id
    }).select("-password"); // hide password

    res.json(referredUsers);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error"
    });
  }
});

module.exports = router;

