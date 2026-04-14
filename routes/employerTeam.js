const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

const {
  getEmployerTeam,
  createEmployerTeamMember,
  updateEmployerTeamMember,
  updateEmployerTeamPhoto,
  blockEmployerTeamMember,
  unblockEmployerTeamMember,
  deleteEmployerTeamMember
} = require("../controllers/employerTeamController");

router.get("/", auth, getEmployerTeam);
router.post("/create", auth, createEmployerTeamMember);
router.patch("/:id", auth, updateEmployerTeamMember);
router.patch("/:id/photo", auth, upload.single("profileImage"), updateEmployerTeamPhoto);
router.patch("/:id/block", auth, blockEmployerTeamMember);
router.patch("/:id/unblock", auth, unblockEmployerTeamMember);
router.delete("/:id", auth, deleteEmployerTeamMember);

module.exports = router;