const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload"); // ✅ REQUIRED

const {
  getEmployerTeam,
  createEmployerTeamMember,
  updateEmployerTeamMember,
  updateEmployerTeamPhoto, // ✅ ADD THIS
  blockEmployerTeamMember,
  unblockEmployerTeamMember,
  deleteEmployerTeamMember // ✅ ADD THIS
} = require("../controllers/employerTeamController");

// =========================
// TEAM ROUTES
// =========================
router.get("/", auth, getEmployerTeam);

router.post("/create", auth, createEmployerTeamMember);

router.patch("/:id", auth, updateEmployerTeamMember);

// ✅ FIX: PROFILE PHOTO
router.patch(
  "/:id/photo",
  auth,
  upload.single("profileImage"),
  updateEmployerTeamPhoto
);

// ✅ FIX: DELETE MEMBER
router.delete("/:id", auth, deleteEmployerTeamMember);

// BLOCK / UNBLOCK
router.patch("/:id/block", auth, blockEmployerTeamMember);
router.patch("/:id/unblock", auth, unblockEmployerTeamMember);

module.exports = router;