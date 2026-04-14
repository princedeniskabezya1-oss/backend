const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const {
  getEmployerTeam,
  createEmployerTeamMember,
  updateEmployerTeamMember,
  blockEmployerTeamMember,
  unblockEmployerTeamMember
} = require("../controllers/employerTeamController");

router.get("/", auth, getEmployerTeam);
router.post("/create", auth, createEmployerTeamMember);
router.patch("/:id", auth, updateEmployerTeamMember);
router.patch("/:id/block", auth, blockEmployerTeamMember);
router.patch("/:id/unblock", auth, unblockEmployerTeamMember);

module.exports = router;